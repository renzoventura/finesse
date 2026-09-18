import type { StatusPerson } from "./db.js";
import { formatShortDate, sundayOf } from "./streaks.js";

function targetOf(person: { weeklyTarget?: number }, fallback: number): number {
  return person.weeklyTarget ?? fallback;
}

export function sundaySummary(input: {
  weekStart: string;
  groupStreak: number;
  people: StatusPerson[];
}): string {
  const header = `**Week of ${formatShortDate(input.weekStart)} – ${formatShortDate(sundayOf(input.weekStart))}**`;
  if (input.people.length === 0) {
    return `${header}\n\nNobody has joined the crew yet. Use \`/join\` or \`/done\` to get in.\n\n🔥 Group streak: ${input.groupStreak}`;
  }
  const lines = input.people.map((person) => {
    const mark = person.hit ? "✅" : "❌";
    return `• **${person.name}** — ${person.checkins}/${person.weeklyTarget} ${mark} (streak ${person.currentStreak})`;
  });
  const weeks = input.groupStreak === 1 ? "week" : "weeks";
  return `${header}\n\n${lines.join("\n")}\n\n🔥 Group streak: ${input.groupStreak} ${weeks}`;
}

export function fallBehindNudge(input: {
  weeklyTarget: number;
  people: Array<{ discordId: string; checkins: number; weeklyTarget?: number }>;
}): string | null {
  if (input.people.length === 0) {
    return null;
  }
  const first = input.people[0];
  if (input.people.length === 1 && first) {
    const target = targetOf(first, input.weeklyTarget);
    return `👀 <@${first.discordId}> is behind this week (${first.checkins}/${target}). Crew, go check on them.`;
  }
  const lines = input.people.map((person) => {
    const target = targetOf(person, input.weeklyTarget);
    return `• <@${person.discordId}> (${person.checkins}/${target})`;
  });
  return `👀 Crew, check on the people drifting this week:\n${lines.join("\n")}`;
}

export function statusMessage(input: {
  weekStart: string;
  groupStreak: number;
  weeklyTarget: number;
  you?: StatusPerson;
  people: StatusPerson[];
}): string {
  const range = `${formatShortDate(input.weekStart)} – ${formatShortDate(sundayOf(input.weekStart))}`;
  const youLine = input.you
    ? `You: **${input.you.checkins}/${input.you.weeklyTarget}** · personal streak **${input.you.currentStreak}**\n`
    : "You are not in the crew yet. `/join` or `/done` to opt in.\n";
  const linked = input.you?.sources.length
    ? `Sources: ${input.you.sources.join(", ")}\n`
    : "";
  const crew =
    input.people.length === 0
      ? "No one has joined yet."
      : input.people
          .map(
            (person) =>
              `• ${person.name} — ${person.checkins}/${person.weeklyTarget}`,
          )
          .join("\n");
  return `**This week** (${range})\n${youLine}${linked}Group streak: **${input.groupStreak}**\n\n${crew}`;
}

export function doneReply(input: {
  created: boolean;
  note: string | null;
  checkins: number;
  weeklyTarget: number;
}): string {
  const note = input.note ? ` (${input.note})` : "";
  if (input.created) {
    return `Logged${note} — **${input.checkins}/${input.weeklyTarget}** this week.`;
  }
  return `Already counted today${note ? ` — note updated${note}` : ""}. Still **${input.checkins}/${input.weeklyTarget}** this week.`;
}

export function joinReply(
  already: boolean,
  channelId: string,
  weeklyTarget: number,
): string {
  if (already) {
    return `You're already in the crew. Log a session with \`/done\` or ✅ in <#${channelId}>.`;
  }
  return `You're in. Target is ${weeklyTarget} sessions this week. Log with \`/done\` or ✅ in <#${channelId}>.`;
}

export function autoCheckinNotice(input: {
  discordId: string;
  note: string | null;
  checkins: number;
  weeklyTarget: number;
}): string {
  const details = input.note?.trim() || "a workout";
  return `<@${input.discordId}> just worked out: **${details}**\n**${input.checkins}/${input.weeklyTarget}** this week`;
}

export function formatWorkoutLabel(input: {
  type?: string | null;
  name?: string | null;
  distanceMeters?: number | null;
  movingTimeSec?: number | null;
}): string {
  const name = input.name?.trim() || "";
  const type = input.type?.trim() || "";
  const head =
    name && type && name.toLowerCase() !== type.toLowerCase()
      ? `${type} — ${name}`
      : name || type || "Workout";
  const extra: string[] = [];
  if (input.distanceMeters && input.distanceMeters >= 100) {
    extra.push(`${(input.distanceMeters / 1000).toFixed(1)} km`);
  }
  if (input.movingTimeSec && input.movingTimeSec >= 30) {
    extra.push(formatDuration(input.movingTimeSec));
  }
  return extra.length ? `${head} · ${extra.join(" · ")}` : head;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function setupReply(profile: {
  level: string | null;
  goal: string | null;
  weeklyTarget: number;
}): string {
  return [
    "Saved.",
    `Level: **${profile.level ?? "not set"}**`,
    `Goal: **${profile.goal ?? "not set"}**`,
    `Weekly target: **${profile.weeklyTarget}**`,
    "Ask `/coach` for a session. It stays private (only you see the reply).",
  ].join("\n");
}
