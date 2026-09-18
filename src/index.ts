import { Events } from "discord.js";
import { createClient } from "./bot/client.js";
import { commands } from "./bot/commands.js";
import { createHandlers } from "./bot/handlers.js";
import { registerCommands } from "./bot/register.js";
import { loadConfig } from "./config.js";
import { startCron } from "./cron.js";
import { openDb } from "./db.js";
import { startHttpServer } from "./http.js";
import { createLlmProvider } from "./llm/create.js";
import { postChannelMessages } from "./posts.js";
import { createActivitySources } from "./sources/create.js";
import { ingestAllSources } from "./sources/ingest.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDb(config.databasePath);
  const llm = createLlmProvider(config);
  const sources = createActivitySources(config);
  const now = new Date();
  db.ensureWeek(now, config.tz);
  db.catchUp({ now, timeZone: config.tz, weeklyTarget: config.weeklyTarget });

  const client = createClient();
  const handlers = createHandlers({ db, config, llm, sources });

  startHttpServer(db, config, sources, {
    onAutoCheckin: async (message) => {
      const channel = await client.channels.fetch(config.channelId);
      if (channel?.isSendable()) {
        await channel.send(message);
      }
    },
  });

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    await registerCommands(config, commands);
    console.log("Slash commands registered");
    startCron(readyClient, db, config, llm, sources);
    console.log(`Cron started (${config.tz})`);
    console.log(
      `LLM: ${llm?.id ?? "none"} · sources: ${Object.keys(sources).join(", ") || "manual only"} · intervals: ${sources.intervals?.auth ?? "off"}${config.intervalsWebhookSecret ? "+webhook" : ""}`,
    );
    try {
      const result = await ingestAllSources(db, sources, {
        now: new Date(),
        timeZone: config.tz,
        lookbackHours: config.stravaLookbackHours,
        weeklyTarget: config.weeklyTarget,
      });
      await postChannelMessages(readyClient, config.channelId, result.notices);
    } catch (error) {
      console.error("[startup] ingest", error);
    }
  });

  client.on(Events.InteractionCreate, (interaction) => {
    void handlers.onInteraction(interaction);
  });
  client.on(Events.MessageReactionAdd, (reaction, user) => {
    void handlers.onReaction(reaction, user);
  });

  const shutdown = async () => {
    db.close();
    client.destroy();
  };
  process.on("SIGINT", () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
  });

  await client.login(config.token);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
