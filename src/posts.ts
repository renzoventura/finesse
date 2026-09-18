import type { Client } from "discord.js";
import type { Config } from "./config.js";
import type { FinesseDb } from "./db.js";
import { fallBehindNudge, sundaySummary } from "./templates.js";

export async function postSundaySummary(
  client: Client,
  db: FinesseDb,
  config: Config,
  now = new Date(),
): Promise<string> {
  const status = db.status({
    now,
    timeZone: config.tz,
    weeklyTarget: config.weeklyTarget,
  });
  const text = sundaySummary({
    weekStart: status.weekStart,
    groupStreak: status.groupStreak,
    weeklyTarget: config.weeklyTarget,
    people: status.people,
  });
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
    weeklyTarget: config.weeklyTarget,
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
