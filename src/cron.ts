import type { Client } from "discord.js";
import { schedule } from "node-cron";
import type { Config } from "./config.js";
import type { FinesseDb } from "./db.js";
import type { LlmProvider } from "./llm/types.js";
import {
  postChannelMessages,
  postConnectReminders,
  postFallBehindNudge,
  postSaturdayUpdate,
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
      db.catchUp({
        now: new Date(),
        timeZone: config.tz,
        weeklyTarget: config.weeklyTarget,
      });
      console.log("[cron] monday reset applied");
    }),
    { timezone },
  );

  schedule(
    "*/15 * * * *",
    wrap("source-ingest", async () => {
      const result = await ingestAllSources(db, sources, {
        now: new Date(),
        timeZone: config.tz,
        lookbackHours: config.lookbackHours,
        weeklyTarget: config.weeklyTarget,
      });
      await postChannelMessages(client, config.channelId, result.notices);
    }),
    { timezone },
  );

  schedule(
    "0 22 * * 0",
    wrap("sunday-summary", async () => {
      await postSundaySummary(client, db, config, llm);
      console.log("[cron] sunday summary posted");
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

  schedule(
    "0 19 * * 4",
    wrap("thursday-nudge", async () => {
      const text = await postFallBehindNudge(client, db, config, 1);
      console.log(
        text ? "[cron] thursday nudge posted" : "[cron] thursday nudge skipped",
      );
    }),
    { timezone },
  );

  schedule(
    "0 19 * * 6",
    wrap("saturday-nudge", async () => {
      const text = await postSaturdayUpdate(client, db, config);
      console.log(
        text
          ? "[cron] saturday update posted"
          : "[cron] saturday update skipped",
      );
    }),
    { timezone },
  );
}
