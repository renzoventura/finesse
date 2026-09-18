import { type Client, Events } from "discord.js";
import { createClient } from "../bot/client.js";
import { type Config, loadConfig } from "../config.js";
import { type FinesseDb, openDb } from "../db.js";

export function isDryRun(argv = process.argv): boolean {
  return argv.includes("--dry");
}

export function flagValue(
  flag: string,
  argv = process.argv,
): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

export function bootDb(): { config: Config; db: FinesseDb } {
  const config = loadConfig();
  const db = openDb(config.databasePath);
  db.ensureWeek(new Date(), config.tz);
  return { config, db };
}

export async function bootBot(): Promise<{
  client: Client;
  db: FinesseDb;
  config: Config;
  shutdown: () => Promise<void>;
}> {
  const { config, db } = bootDb();
  const client = createClient();
  const ready = new Promise<void>((resolve) => {
    client.once(Events.ClientReady, () => resolve());
  });
  await client.login(config.token);
  await ready;
  return {
    client,
    db,
    config,
    shutdown: async () => {
      db.close();
      client.destroy();
    },
  };
}
