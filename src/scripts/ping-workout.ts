import { REST, Routes } from "discord.js";
import { config as loadEnv } from "dotenv";
import {
  hydrateIntervalsActivity,
  type IntervalsActivity,
  sessionFromIntervalsActivity,
} from "../sources/intervals.js";
import type { SourceAccount } from "../sources/types.js";
import { autoCheckinNotice } from "../templates.js";
import { flagValue, isDryRun } from "./boot.js";

const DEFAULT_ACTIVITY = "i194972070";
const DEFAULT_TZ = "Australia/Sydney";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function intervalsAccount(apiKey: string): SourceAccount {
  return {
    discordId: "",
    name: "",
    source: "intervals",
    externalId: "0",
    accessToken: apiKey,
    refreshToken: "api_key",
    expiresAt: 0,
  };
}

async function resolveChannelId(
  rest: REST,
  preferred?: string,
): Promise<string> {
  if (preferred) {
    return preferred;
  }
  const guilds = (await rest.get(Routes.userGuilds())) as Array<{ id: string }>;
  const textTypes = new Set([0, 5]);
  for (const guild of guilds) {
    const channels = (await rest.get(Routes.guildChannels(guild.id))) as Array<{
      id: string;
      name?: string;
      type: number;
    }>;
    const named = channels.find(
      (channel) =>
        textTypes.has(channel.type) &&
        /finesse|workout|training/i.test(channel.name ?? ""),
    );
    if (named) {
      return named.id;
    }
    const first = channels.find((channel) => textTypes.has(channel.type));
    if (first) {
      return first.id;
    }
  }
  throw new Error("No Discord text channel found. Set CHANNEL_ID.");
}

async function recentWeekLine(
  rest: REST,
  channelId: string,
): Promise<{ checkins: number; weeklyTarget: number } | null> {
  const messages = (await rest.get(Routes.channelMessages(channelId), {
    query: new URLSearchParams({ limit: "30" }),
  })) as Array<{ content?: string }>;
  for (const message of messages) {
    const match = message.content?.match(/\*\*(\d+)\/(\d+)\*\* this week/);
    if (match?.[1] && match[2]) {
      return {
        checkins: Number(match[1]),
        weeklyTarget: Number(match[2]),
      };
    }
  }
  return null;
}

async function mentionId(
  rest: REST,
  channelId: string,
  override?: string,
): Promise<string> {
  if (override) {
    return override;
  }
  const fromEnv = process.env.DISCORD_USER_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const messages = (await rest.get(Routes.channelMessages(channelId), {
    query: new URLSearchParams({ limit: "30" }),
  })) as Array<{ content?: string }>;
  for (const message of messages) {
    const match = message.content?.match(/^<@(\d+)> just worked out:/);
    if (match?.[1]) {
      return match[1];
    }
  }
  throw new Error("Set DISCORD_USER_ID or pass --discord-id");
}

async function main(): Promise<void> {
  loadEnv();
  const activityId = flagValue("--id") ?? process.argv[2] ?? DEFAULT_ACTIVITY;
  const token = requiredEnv("DISCORD_TOKEN");
  const apiKey = requiredEnv("INTERVALS_API_KEY");
  const rest = new REST({ version: "10" }).setToken(token);
  const channelId = await resolveChannelId(
    rest,
    flagValue("--channel") ?? process.env.CHANNEL_ID?.trim(),
  );
  const discordId = await mentionId(rest, channelId, flagValue("--discord-id"));
  const week = await recentWeekLine(rest, channelId);

  const listed: IntervalsActivity = { id: activityId };
  const activity = await hydrateIntervalsActivity(
    fetch,
    intervalsAccount(apiKey),
    listed,
  );
  const session = sessionFromIntervalsActivity(
    activity,
    process.env.TZ?.trim() || DEFAULT_TZ,
  );
  if (!session) {
    throw new Error(`Could not format Intervals activity ${activityId}`);
  }

  const notice = [
    "🔁 Re-ping (format check, not a new check-in)",
    autoCheckinNotice({
      discordId,
      note: session.note,
      detail: session.detail,
      checkins: week?.checkins ?? 1,
      weeklyTarget: week?.weeklyTarget ?? 3,
    }),
  ].join("\n");

  console.log(notice);
  console.log(`channel ${channelId} activity ${activityId}`);
  if (isDryRun()) {
    return;
  }
  await rest.post(Routes.channelMessages(channelId), {
    body: { content: notice },
  });
  console.log("Posted.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
