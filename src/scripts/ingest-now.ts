import { REST, Routes } from "discord.js";
import { createActivitySources } from "../sources/create.js";
import { ingestAllSources } from "../sources/ingest.js";
import { bootDb, isDryRun } from "./boot.js";

async function main(): Promise<void> {
  const { config, db } = bootDb();
  const sources = createActivitySources(config);
  const result = await ingestAllSources(db, sources, {
    now: new Date(),
    timeZone: config.tz,
    lookbackHours: config.lookbackHours,
    weeklyTarget: config.weeklyTarget,
  });
  console.log(
    `${result.notices.length} new workout(s), ${result.created} new day(s) from ${result.users} account(s)`,
  );
  for (const notice of result.notices) {
    console.log(notice);
  }
  if (result.notices.length === 0) {
    console.log(
      "Nothing new. If you just finished, wait for Intervals.icu to show the activity, then run again.",
    );
    db.close();
    return;
  }
  if (isDryRun()) {
    db.close();
    return;
  }
  const rest = new REST({ version: "10" }).setToken(config.token);
  for (const content of result.notices) {
    await rest.post(Routes.channelMessages(config.channelId), {
      body: { content },
    });
  }
  console.log(`Posted to channel ${config.channelId}`);
  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
