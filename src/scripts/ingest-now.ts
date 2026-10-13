import { REST, Routes } from "discord.js";
import { createActivitySources } from "../sources/create.js";
import { ingestAllSources } from "../sources/ingest.js";
import { streakRestoredMessage } from "../templates.js";
import { bootDb, isDryRun } from "./boot.js";

async function main(): Promise<void> {
  const { config, db } = bootDb();
  const now = new Date();
  const sources = createActivitySources(config);
  const result = await ingestAllSources(db, sources, {
    now,
    timeZone: config.tz,
    lookbackHours: config.lookbackHours,
    weeklyTarget: config.weeklyTarget,
  });
  const repair = db.catchUp({
    now,
    timeZone: config.tz,
    weeklyTarget: config.weeklyTarget,
    graceHours: config.lookbackHours,
  });
  console.log(
    `${result.notices.length} new workout(s), ${result.created} new day(s) from ${result.users} account(s)`,
  );
  const messages = [...result.notices];
  if (repair.restored) {
    const status = db.status({
      now,
      timeZone: config.tz,
      weeklyTarget: config.weeklyTarget,
    });
    messages.push(
      streakRestoredMessage({
        groupStreak: status.groupStreak,
        people: status.people.map((person) => ({
          discordId: person.discordId,
          currentStreak: person.currentStreak,
        })),
      }),
    );
  }
  for (const notice of messages) {
    console.log(notice);
  }
  if (messages.length === 0) {
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
  for (const content of messages) {
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
