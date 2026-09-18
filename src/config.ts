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
  port: number;
  publicUrl: string | null;
  llmProvider: string;
  geminiApiKey: string | null;
  geminiModel: string;
  stravaClientId: string | null;
  stravaClientSecret: string | null;
  stravaLookbackHours: number;
  intervalsClientId: string | null;
  intervalsClientSecret: string | null;
  intervalsWebhookSecret: string | null;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env ${name}. Copy .env.example to .env.`);
  }
  return value;
}

function optional(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export function loadConfig(): Config {
  loadEnv();
  const weeklyTarget = Number(
    process.env.WEEKLY_TARGET ?? DEFAULT_WEEKLY_TARGET,
  );
  if (!Number.isInteger(weeklyTarget) || weeklyTarget < 1) {
    throw new Error("WEEKLY_TARGET must be a positive integer");
  }
  const port = Number(process.env.PORT ?? "3000");
  const lookback = Number(process.env.STRAVA_LOOKBACK_HOURS ?? "36");
  const geminiApiKey = optional("GEMINI_API_KEY");
  const llmProvider =
    process.env.LLM_PROVIDER?.trim() || (geminiApiKey ? "gemini" : "none");
  return {
    token: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    guildId: required("DISCORD_GUILD_ID"),
    channelId: required("CHANNEL_ID"),
    tz: process.env.TZ?.trim() || DEFAULT_TZ,
    databasePath: process.env.DATABASE_PATH?.trim() || "./data/finesse.sqlite",
    weeklyTarget,
    port: Number.isInteger(port) && port > 0 ? port : 3000,
    publicUrl: optional("PUBLIC_URL")?.replace(/\/$/, "") ?? null,
    llmProvider,
    geminiApiKey,
    geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite",
    stravaClientId: optional("STRAVA_CLIENT_ID"),
    stravaClientSecret: optional("STRAVA_CLIENT_SECRET"),
    stravaLookbackHours:
      Number.isInteger(lookback) && lookback >= 24 ? lookback : 36,
    intervalsClientId: optional("INTERVALS_CLIENT_ID"),
    intervalsClientSecret: optional("INTERVALS_CLIENT_SECRET"),
    intervalsWebhookSecret: optional("INTERVALS_WEBHOOK_SECRET"),
  };
}
