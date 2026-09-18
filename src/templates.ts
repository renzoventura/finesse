import type { StatusPerson } from "./db.js";
import { formatShortDate, sundayOf } from "./streaks.js";

export function sundaySummary(input: {
  weekStart: string;
  groupStreak: number;
  weeklyTarget: number;
  people: StatusPerson[];
}): string {
  const header = `**Week of ${formatShortDate(input.weekStart)} – ${formatShortDate(sundayOf(input.weekStart))}**`;
  if (input.people.length === 0) {
    return `${header}\n\nNobody has joined the crew yet. Use \`/join\` or \`/done\` to get in.\n\n🔥 Group streak: ${input.groupStreak}`;
  }
  const lines = input.people.map((person) => {
    const mark = person.hit ? "✅" : "❌";
    return `• **${person.name}** — ${person.checkins}/${input.weeklyTarget} ${mark} (streak ${person.currentStreak})`;
  });
  const weeks = input.groupStreak === 1 ? "week" : "weeks";
  return `${header}\n\n${lines.join("\n")}\n\n🔥 Group streak: ${input.groupStreak} ${weeks}`;
}

export function fallBehindNudge(input: {
  weeklyTarget: number;
  people: Array<{ discordId: string; checkins: number }>;
}): string | null {
  if (input.people.length === 0) {
    return null;
  }
  const first = input.people[0];
  if (input.people.length === 1 && first) {
    return `👀 <@${first.discordId}> is behind this week (${first.checkins}/${input.weeklyTarget}). Crew, go check on them.`;
  }
  const lines = input.people.map(
    (person) =>
      `• <@${person.discordId}> (${person.checkins}/${input.weeklyTarget})`,
  );
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
    ? `You: **${input.you.checkins}/${input.weeklyTarget}** · personal streak **${input.you.currentStreak}**\n`
    : "You are not in the crew yet. `/join` or `/done` to opt in.\n";
  const crew =
    input.people.length === 0
      ? "No one has joined yet."
      : input.people
          .map(
            (person) =>
              `• ${person.name} — ${person.checkins}/${input.weeklyTarget}`,
          )
          .join("\n");
  return `**This week** (${range})\n${youLine}Group streak: **${input.groupStreak}**\n\n${crew}`;
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
