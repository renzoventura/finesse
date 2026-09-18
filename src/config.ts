import { config as loadEnv } from "dotenv";
import { DEFAULT_TZ, DEFAULT_WEEKLY_TARGET } from "./streaks.js";

export type Config = {
  token: string;
  clientId: string;
  guildId: string;
  channelId: string;
  tz: string;
  databasePath: string;
  weeklyTarget: number;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env ${name}. Copy .env.example to .env.`);
  }
  return value;
}

export function loadConfig(): Config {
  loadEnv();
  const weeklyTarget = Number(
    process.env.WEEKLY_TARGET ?? DEFAULT_WEEKLY_TARGET,
  );
  if (!Number.isInteger(weeklyTarget) || weeklyTarget < 1) {
    throw new Error("WEEKLY_TARGET must be a positive integer");
  }
  return {
    token: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    guildId: required("DISCORD_GUILD_ID"),
    channelId: required("CHANNEL_ID"),
    tz: process.env.TZ?.trim() || DEFAULT_TZ,
    databasePath: process.env.DATABASE_PATH?.trim() || "./data/finesse.sqlite",
    weeklyTarget,
  };
}
