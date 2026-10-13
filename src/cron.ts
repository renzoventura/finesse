import type { Client } from "discord.js";
import { schedule } from "node-cron";
import type { Config } from "./config.js";
import type { FinesseDb } from "./db.js";
import type { LlmProvider } from "./llm/types.js";
import {
  postChannelMessages,
  postConnectReminders,
  postDailyUpdate,
  postStreakRestored,
  postSundaySummary,
} from "./posts.js";
import { ingestAllSources } from "./sources/ingest.js";
import type { ActivitySource } from "./sources/types.js";

export function startCron(
  client: Client,
  db: FinesseDb,
  config: Config,
  llm: LlmProvider | null,
  sources: Record<string, ActivitySource>,
): void {
  const timezone = config.tz;
  const wrap = (label: string, fn: () => Promise<void>) => () => {
    fn().catch((error: unknown) => {
      console.error(`[cron] ${label}`, error);
    });
  };

  schedule(
    "0 0 * * 1",
    wrap("monday-reset", async () => {
      const repair = db.catchUp({
        now: new Date(),
        timeZone: config.tz,
        weeklyTarget: config.weeklyTarget,
        graceHours: config.lookbackHours,
      });
      if (repair.restored) {
        await postStreakRestored(client, db, config);
        console.log("[streak] late sync restored the streak; status posted");
      }
      console.log("[cron] monday reset applied");
    }),
    { timezone },
  );

  schedule(
    "*/15 * * * *",
    wrap("source-ingest", async () => {
      const now = new Date();
      const result = await ingestAllSources(db, sources, {
        now,
        timeZone: config.tz,
        lookbackHours: config.lookbackHours,
        weeklyTarget: config.weeklyTarget,
      });
      await postChannelMessages(client, config.channelId, result.notices);
      const repair = db.catchUp({
        now,
        timeZone: config.tz,
        weeklyTarget: config.weeklyTarget,
        graceHours: config.lookbackHours,
      });
      if (repair.restored) {
        await postStreakRestored(client, db, config, now);
        console.log("[streak] late sync restored the streak; status posted");
      }
    }),
    { timezone },
  );

  schedule(
    "0 19 * * 1-6",
    wrap("daily-board", async () => {
      const text = await postDailyUpdate(client, db, config);
      console.log(
        text ? "[cron] daily board posted" : "[cron] daily board skipped",
      );
    }),
    { timezone },
  );

  schedule(
    "0 19 * * 0",
    wrap("sunday-recap", async () => {
      await postSundaySummary(client, db, config, llm);
      console.log("[cron] sunday recap posted");
    }),
    { timezone },
  );

  schedule(
    "0 10 * * *",
    wrap("connect-nudge", async () => {
      const n = await postConnectReminders(client, db, config);
      console.log(
        n
          ? `[cron] connect nudge sent to ${n} member(s)`
          : "[cron] connect nudge skipped",
      );
    }),
    { timezone },
  );
}
