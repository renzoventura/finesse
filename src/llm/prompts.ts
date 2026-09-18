import type { StatusPerson } from "../db.js";
import { sundaySummary } from "../templates.js";

export function coachSystemPrompt(): string {
  return [
    "You are Finesse, a concise fitness coach for a small training crew.",
    "Give one clear session for today, plus a short why.",
    "Respect their level and goal. If they already trained today, suggest recovery or a light extra, not a second hard day.",
    "No medical advice. No supplements. Keep it under 120 words.",
    "Plain language. Discord markdown is fine.",
  ].join(" ");
}

export function coachUserPrompt(input: {
  name: string;
  question: string;
  level: string | null;
  goal: string | null;
  weeklyTarget: number;
  checkinsThisWeek: number;
  trainedToday: boolean;
  recent: Array<{ date: string; note: string | null; source: string }>;
}): string {
  const recent =
    input.recent.length === 0
      ? "No sessions logged this week."
      : input.recent
          .map(
            (row) =>
              `- ${row.date} (${row.source})${row.note ? `: ${row.note}` : ""}`,
          )
          .join("\n");
  return [
    `Name: ${input.name}`,
    `Level: ${input.level ?? "not set"}`,
    `Goal: ${input.goal ?? "not set"}`,
    `Weekly target: ${input.checkinsThisWeek}/${input.weeklyTarget}`,
    `Already trained today: ${input.trainedToday ? "yes" : "no"}`,
    `This week:\n${recent}`,
    `Question: ${input.question}`,
  ].join("\n");
}

export function weeklyReportSystemPrompt(): string {
  return [
    "Rewrite this Discord weekly training summary with a bit of warmth.",
    "Keep every count, name, and streak number exactly the same.",
    "Add one short encouragement line per person.",
    "Keep Discord markdown. No extra sections. Under 1500 characters.",
  ].join(" ");
}

export function weeklyReportUserPrompt(input: {
  weekStart: string;
  groupStreak: number;
  people: StatusPerson[];
}): string {
  return sundaySummary({
    weekStart: input.weekStart,
    groupStreak: input.groupStreak,
    people: input.people,
  });
}

export function clipDiscord(text: string, max = 1900): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}
