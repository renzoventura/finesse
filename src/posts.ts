import type { Client, MessageCreateOptions } from "discord.js";
import { CONNECT_NUDGE_GAP_MS, onboardButtons } from "./bot/onboard.js";
import type { Config } from "./config.js";
import type { FinesseDb } from "./db.js";
import {
  clipDiscord,
  weeklyReportSystemPrompt,
  weeklyReportUserPrompt,
} from "./llm/prompts.js";
import type { LlmProvider } from "./llm/types.js";
import { toLocalDate } from "./streaks.js";
import {
  connectNudgeChannel,
  connectNudgeDm,
  dailyUpdate,
  fallBehindNudge,
  mergeWeekSessions,
  sundaySummary,
} from "./templates.js";

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
  const fallback = renderSundaySummary(db, config, now);
  let text = fallback;
  if (llm && status.people.length > 0) {
    try {
      text = clipDiscord(
        await llm.complete({
          system: weeklyReportSystemPrompt(),
          user: weeklyReportUserPrompt(fallback),
        }),
      );
    } catch (error) {
      console.error("[llm] weekly summary failed, using template", error);
      text = fallback;
    }
  }
  await send(client, config.channelId, { content: clipDiscord(text) });
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
  await send(client, config.channelId, { content: text });
  return text;
}

export async function postDailyUpdate(
  client: Client,
  db: FinesseDb,
  config: Config,
  now = new Date(),
): Promise<string | null> {
  const text = renderDailyUpdate(db, config, now);
  if (!text) {
    return null;
  }
  await send(client, config.channelId, { content: text });
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
    people: crewBoardPeople(db, status),
  });
}

export function renderDailyUpdate(
  db: FinesseDb,
  config: Config,
  now = new Date(),
): string | null {
  const status = db.status({
    now,
    timeZone: config.tz,
    weeklyTarget: config.weeklyTarget,
  });
  return dailyUpdate({
    weekStart: status.weekStart,
    groupStreak: status.groupStreak,
    today: toLocalDate(now, config.tz),
    people: crewBoardPeople(db, status),
  });
}

function crewBoardPeople(
  db: FinesseDb,
  status: ReturnType<FinesseDb["status"]>,
) {
  const workouts = db.weekWorkouts(status.weekStart);
  return status.people.map((person) => ({
    ...person,
    sessions: mergeWeekSessions(
      db.weekCheckins(person.discordId, status.weekStart),
      workouts
        .filter((row) => row.userId === person.discordId)
        .map((row) => ({
          date: row.date,
          note: row.note,
          source: row.source,
        })),
    ),
  }));
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
    await send(client, channelId, { content: text });
  }
}

export async function postConnectReminders(
  client: Client,
  db: FinesseDb,
  config: Config,
  now = new Date(),
): Promise<number> {
  const due = db.listUnconnectedForNudge(now, CONNECT_NUDGE_GAP_MS);
  if (due.length === 0) {
    return 0;
  }
  const channelIds: string[] = [];
  const buttons = [onboardButtons()];
  for (const person of due) {
    try {
      const user = await client.users.fetch(person.discordId);
      await user.send({ content: connectNudgeDm(), components: buttons });
      db.markConnectNudge(person.discordId, now);
    } catch {
      channelIds.push(person.discordId);
    }
  }
  const channelText = connectNudgeChannel(channelIds);
  if (channelText) {
    await send(client, config.channelId, {
      content: channelText,
      components: buttons,
    });
    for (const discordId of channelIds) {
      db.markConnectNudge(discordId, now);
    }
  }
  return due.length;
}

export async function postOnboardWelcome(
  client: Client,
  channelId: string,
  content: string,
): Promise<void> {
  await send(client, channelId, {
    content,
    components: [onboardButtons()],
  });
}

async function send(
  client: Client,
  channelId: string,
  payload: MessageCreateOptions,
): Promise<void> {
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased() || !channel.isSendable() || channel.isDMBased()) {
    throw new Error(`Channel ${channelId} is not a guild text channel`);
  }
  await channel.send(payload);
}
