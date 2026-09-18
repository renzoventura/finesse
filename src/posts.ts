import type { Client } from "discord.js";
import type { Config } from "./config.js";
import type { FinesseDb } from "./db.js";
import {
  clipDiscord,
  weeklyReportSystemPrompt,
  weeklyReportUserPrompt,
} from "./llm/prompts.js";
import type { LlmProvider } from "./llm/types.js";
import { fallBehindNudge, sundaySummary } from "./templates.js";

export async function postSundaySummary(
  client: Client,
  db: FinesseDb,
  config: Config,
  llm: LlmProvider | null,
  now = new Date(),
): Promise<string> {
  const status = db.status({
    now,
    timeZone: config.tz,
    weeklyTarget: config.weeklyTarget,
  });
  const fallback = sundaySummary({
    weekStart: status.weekStart,
    groupStreak: status.groupStreak,
    people: status.people,
  });
  let text = fallback;
  if (llm && status.people.length > 0) {
    try {
      text = clipDiscord(
        await llm.complete({
          system: weeklyReportSystemPrompt(),
          user: weeklyReportUserPrompt({
            weekStart: status.weekStart,
            groupStreak: status.groupStreak,
            people: status.people,
          }),
        }),
      );
    } catch (error) {
      console.error("[llm] weekly summary failed, using template", error);
      text = fallback;
    }
  }
  await send(client, config.channelId, text);
  return text;
}

export async function postFallBehindNudge(
  client: Client,
  db: FinesseDb,
  config: Config,
  below: number,
  now = new Date(),
): Promise<string | null> {
  const status = db.status({
    now,
    timeZone: config.tz,
    weeklyTarget: config.weeklyTarget,
  });
  const people = status.people.filter((person) => person.checkins < below);
  const text = fallBehindNudge({
    weeklyTarget: config.weeklyTarget,
    people,
  });
  if (!text) {
    return null;
  }
  await send(client, config.channelId, text);
  return text;
}

export function renderSundaySummary(
  db: FinesseDb,
  config: Config,
  now = new Date(),
): string {
  const status = db.status({
    now,
    timeZone: config.tz,
    weeklyTarget: config.weeklyTarget,
  });
  return sundaySummary({
    weekStart: status.weekStart,
    groupStreak: status.groupStreak,
    people: status.people,
  });
}

export function renderFallBehindNudge(
  db: FinesseDb,
  config: Config,
  below: number,
  now = new Date(),
): string | null {
  const status = db.status({
    now,
    timeZone: config.tz,
    weeklyTarget: config.weeklyTarget,
  });
  const people = status.people.filter((person) => person.checkins < below);
  return fallBehindNudge({ weeklyTarget: config.weeklyTarget, people });
}

export async function postChannelMessages(
  client: Client,
  channelId: string,
  messages: string[],
): Promise<void> {
  for (const text of messages) {
    await send(client, channelId, text);
  }
}

async function send(
  client: Client,
  channelId: string,
  text: string,
): Promise<void> {
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased() || !channel.isSendable() || channel.isDMBased()) {
    throw new Error(`Channel ${channelId} is not a guild text channel`);
  }
  await channel.send(text);
}
