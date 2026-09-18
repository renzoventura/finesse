import type { Client } from "discord.js";
import { schedule } from "node-cron";
import type { Config } from "./config.js";
import type { FinesseDb } from "./db.js";
import { postFallBehindNudge, postSundaySummary } from "./posts.js";

export function startCron(client: Client, db: FinesseDb, config: Config): void {
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
    "0 20 * * 0",
    wrap("sunday-summary", async () => {
      await postSundaySummary(client, db, config);
      console.log("[cron] sunday summary posted");
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
      const text = await postFallBehindNudge(client, db, config, 2);
      console.log(
        text ? "[cron] saturday nudge posted" : "[cron] saturday nudge skipped",
      );
    }),
    { timezone },
  );
}
