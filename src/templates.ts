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
    : input.you
      ? "Intervals is not linked — tap **Link Intervals.icu** or `/connect` so workouts auto-post.\n"
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

export function onboardWelcomeChannel(discordId: string): string {
  return [
    `**Welcome <@${discordId}>.** You're in the crew.`,
    "",
    "Workouts ping this channel on their own once [Intervals.icu](https://intervals.icu/) can see your watch (Garmin, Amazfit, Apple Watch, or Strava).",
    "",
    "**Once:**",
    "1. Free account → https://intervals.icu/signup",
    "2. Settings → connect your watch",
    "3. Settings → Developer Settings → copy the API key",
    "4. Tap **Link Intervals.icu** — paste in the popup, never in chat",
    "",
    "`/done` still counts until that's done.",
  ].join("\n");
}

export function onboardPrivate(input: {
  already: boolean;
  weeklyTarget: number;
  channelId: string;
  postedInChannel: boolean;
}): string {
  const header = input.already
    ? "You're in the crew — Intervals.icu is still not linked, so watches won't auto-post."
    : `You're in. Target is **${input.weeklyTarget}** sessions this week.`;
  const posted = input.postedInChannel
    ? `I posted the steps in <#${input.channelId}> too.\n\n`
    : "";
  return [
    header,
    "",
    `${posted}**Link Intervals.icu (about 5 minutes):**`,
    "1. https://intervals.icu/signup",
    "2. Connect your watch under Settings",
    "3. Copy the API key from Settings → Developer Settings",
    "4. Tap **Link Intervals.icu** below — the key stays private",
    "",
    `Garmin, Amazfit, Strava, and Apple Watch all go through Intervals. Indoor / missed sync: \`/done\` in <#${input.channelId}>.`,
  ].join("\n");
}

export function onboardWatchSteps(): string {
  return [
    "**Connect the watch on Intervals, not in Discord.**",
    "",
    "• **Garmin** — [Settings](https://intervals.icu/settings) → Garmin Connect → tick download activities. Calendar should show workouts, not just wellness.",
    "• **Amazfit** — Amazfit / Zepp box → same Zepp login as the phone app → tick download workouts. Sync in Zepp first.",
    "• **Strava** — Strava box → tick download activities. If Garmin is already the source, turn Strava download **off** (duplicates).",
    "• **Apple Watch** — no native login. Apple → Strava → Intervals, or [HealthFit](https://apps.apple.com/us/app/healthfit/id1202650514) → Intervals, auto-upload workouts.",
    "",
    "When a session is on the Intervals calendar, tap **Link Intervals.icu** and paste the API key. Never drop the key in the channel.",
  ].join("\n");
}

export function onboardLaterReply(): string {
  return "All good. `/done` and ✅ still count. I'll remind you in a couple of days to link Intervals so the crew sees sessions automatically.";
}

export function onboardAlreadyLinked(): string {
  return "Intervals.icu is already linked. New sessions ping the crew channel within about 15 minutes. Missed sync: `/done`.";
}

export function onboardDoneHint(): string {
  return "Logged. Link **Intervals.icu** so the next one posts itself (Garmin / Amazfit / Apple / Strava). Tap below — the API key stays private.";
}

export function onboardLinkHint(): string {
  return "Link **Intervals.icu** so workouts post themselves. Tap below — the API key stays private.";
}

export function connectNudgeDm(): string {
  return [
    "Finesse still doesn't have your Intervals.icu key, so workouts won't show up in the crew channel on their own.",
    "",
    "Account → connect watch → copy API key (Settings → Developer) → tap **Link Intervals.icu**. Don't paste the key in the server.",
  ].join("\n");
}

export function connectNudgeChannel(discordIds: string[]): string | null {
  if (discordIds.length === 0) {
    return null;
  }
  const mentions = discordIds.map((id) => `<@${id}>`).join(" ");
  return [
    `${mentions} — still need **Intervals.icu** so sessions auto-post here.`,
    "",
    "Tap **Link Intervals.icu** (API key stays in the popup). Watch setup is the other button. `/done` works in the meantime.",
  ].join("\n");
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
