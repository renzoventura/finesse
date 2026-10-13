/** Calendar dates are YYYY-MM-DD in the configured timezone, not UTC instants. */

export const DEFAULT_TZ = "Australia/Sydney";
export const DEFAULT_WEEKLY_TARGET = 3;

export function toLocalDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Failed to format local date");
  }
  return `${year}-${month}-${day}`;
}

function parseLocalDate(localDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) {
    throw new Error(`Invalid date ${localDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(utcMidnight: Date): string {
  return utcMidnight.toISOString().slice(0, 10);
}

export function addDays(localDate: string, days: number): string {
  const utc = parseLocalDate(localDate);
  utc.setUTCDate(utc.getUTCDate() + days);
  return toIsoDate(utc);
}

export function mondayOf(localDate: string): string {
  const utc = parseLocalDate(localDate);
  const day = utc.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + offset);
  return toIsoDate(utc);
}

export function sundayOf(weekStart: string): string {
  return addDays(weekStart, 6);
}

export function formatShortDate(localDate: string): string {
  const utc = parseLocalDate(localDate);
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(utc);
}

export function localHour(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const raw = parts.find((part) => part.type === "hour")?.value;
  if (raw === undefined) {
    throw new Error("Failed to format local hour");
  }
  const hour = Number(raw);
  if (!Number.isInteger(hour)) {
    throw new Error("Failed to format local hour");
  }
  return hour % 24;
}

function daysBetween(start: string, end: string): number {
  const ms = parseLocalDate(end).getTime() - parseLocalDate(start).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * A week closes `graceHours` after the next Monday 00:00 local.
 * graceHours 0 keeps the old Monday-midnight roll. The default lookback
 * (36) leaves Sunday open through Tuesday 12:00 so a late watch sync still counts.
 */
export function closedWeekStarts(
  weekStart: string,
  todayLocal: string,
  graceHours = 0,
  hourLocal = 0,
): string[] {
  const closed: string[] = [];
  let current = weekStart;
  for (let i = 0; i < 520; i += 1) {
    const nextMonday = addDays(current, 7);
    if (todayLocal < nextMonday) {
      break;
    }
    const elapsed = daysBetween(nextMonday, todayLocal) * 24 + hourLocal;
    if (elapsed < graceHours) {
      break;
    }
    closed.push(current);
    current = nextMonday;
  }
  return closed;
}

export type UserRollInput = {
  discordId: string;
  currentStreak: number;
  checkins: number;
  weeklyTarget: number;
};

export type WeekRoll = {
  nextWeekStart: string;
  groupStreak: number;
  users: Array<{ discordId: string; currentStreak: number; hit: boolean }>;
};

export function rollWeek(input: {
  weekStart: string;
  groupStreak: number;
  users: UserRollInput[];
}): WeekRoll {
  const users = input.users.map((user) => {
    const hit = user.checkins >= user.weeklyTarget;
    return {
      discordId: user.discordId,
      currentStreak: hit ? user.currentStreak + 1 : 0,
      hit,
    };
  });
  const allHit = users.length > 0 && users.every((user) => user.hit);
  return {
    nextWeekStart: addDays(input.weekStart, 7),
    groupStreak: allHit ? input.groupStreak + 1 : 0,
    users,
  };
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayMon0(localDate: string): number {
  const utc = parseLocalDate(localDate);
  return (utc.getUTCDay() + 6) % 7;
}

/** Thursday-style (below 1) before Saturday; Saturday-style (below 2) from Sat onward. */
export function defaultNudgeBelow(localDate: string): number {
  return weekdayMon0(localDate) >= 5 ? 2 : 1;
}
