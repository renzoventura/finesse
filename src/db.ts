import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type SqliteNS from "better-sqlite3";
import {
  addDays,
  closedWeekStarts,
  mondayOf,
  rollWeek,
  toLocalDate,
} from "./streaks.js";

type Sqlite = SqliteNS.Database;

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as new (filename: string) => Sqlite;

type CountRow = { n: number };
type OptedRow = { opted_in: number };

type UserRow = {
  discord_id: string;
  name: string;
  current_streak: number;
  opted_in: number;
};

type GroupState = {
  group_streak: number;
  week_start: string;
};

export type StatusPerson = {
  discordId: string;
  name: string;
  currentStreak: number;
  checkins: number;
  hit: boolean;
};

type WeekStatus = {
  weekStart: string;
  groupStreak: number;
  people: StatusPerson[];
};

type CheckinResult = {
  created: boolean;
  checkinsThisWeek: number;
  weekStart: string;
};

export type FinesseDb = ReturnType<typeof openDb>;

export function openDb(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);

  return {
    close: () => db.close(),
    ensureWeek: (now: Date, timeZone: string) => ensureWeek(db, now, timeZone),
    catchUp: (opts: { now: Date; timeZone: string; weeklyTarget: number }) =>
      catchUp(db, opts),
    join: (discordId: string, name: string) => joinUser(db, discordId, name),
    recordCheckin: (
      discordId: string,
      name: string,
      note: string | null,
      opts: { now: Date; timeZone: string },
    ) => recordCheckin(db, discordId, name, note, opts),
    status: (opts: { now: Date; timeZone: string; weeklyTarget: number }) =>
      weekStatus(db, opts),
  };
}

function migrate(db: Sqlite): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      current_streak INTEGER NOT NULL DEFAULT 0,
      opted_in INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(discord_id),
      ts TEXT NOT NULL,
      checkin_date TEXT NOT NULL,
      note TEXT,
      UNIQUE (user_id, checkin_date)
    );

    CREATE TABLE IF NOT EXISTS group_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      group_streak INTEGER NOT NULL DEFAULT 0,
      week_start TEXT NOT NULL
    );
  `);
}

function ensureWeek(db: Sqlite, now: Date, timeZone: string): void {
  const existing = db
    .prepare("SELECT week_start FROM group_state WHERE id = 1")
    .get() as { week_start: string } | undefined;
  if (existing) {
    return;
  }
  const weekStart = mondayOf(toLocalDate(now, timeZone));
  db.prepare(
    "INSERT INTO group_state (id, group_streak, week_start) VALUES (1, 0, ?)",
  ).run(weekStart);
}

function getGroupState(db: Sqlite): GroupState {
  const row = db
    .prepare("SELECT group_streak, week_start FROM group_state WHERE id = 1")
    .get() as GroupState | undefined;
  if (!row) {
    throw new Error("group_state missing; call ensureWeek first");
  }
  return row;
}

function listOptedIn(db: Sqlite): UserRow[] {
  return db
    .prepare(
      "SELECT discord_id, name, current_streak, opted_in FROM users WHERE opted_in = 1 ORDER BY name COLLATE NOCASE",
    )
    .all() as UserRow[];
}

function countInWeek(db: Sqlite, userId: string, weekStart: string): number {
  const end = addDays(weekStart, 7);
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM checkins WHERE user_id = ? AND checkin_date >= ? AND checkin_date < ?",
    )
    .get(userId, weekStart, end) as CountRow;
  return row.n;
}

function catchUp(
  db: Sqlite,
  opts: { now: Date; timeZone: string; weeklyTarget: number },
): void {
  ensureWeek(db, opts.now, opts.timeZone);
  const today = toLocalDate(opts.now, opts.timeZone);
  const apply = db.transaction(() => {
    const weeks = closedWeekStarts(getGroupState(db).week_start, today);
    for (const weekStart of weeks) {
      const state = getGroupState(db);
      const users = listOptedIn(db);
      const rolled = rollWeek({
        weekStart,
        groupStreak: state.group_streak,
        users: users.map((user) => ({
          discordId: user.discord_id,
          currentStreak: user.current_streak,
          checkins: countInWeek(db, user.discord_id, weekStart),
        })),
        weeklyTarget: opts.weeklyTarget,
      });
      const updateUser = db.prepare(
        "UPDATE users SET current_streak = ? WHERE discord_id = ?",
      );
      for (const user of rolled.users) {
        updateUser.run(user.currentStreak, user.discordId);
      }
      db.prepare(
        "UPDATE group_state SET group_streak = ?, week_start = ? WHERE id = 1",
      ).run(rolled.groupStreak, rolled.nextWeekStart);
    }
  });
  apply();
}

function joinUser(
  db: Sqlite,
  discordId: string,
  name: string,
): { already: boolean } {
  const existing = db
    .prepare("SELECT opted_in FROM users WHERE discord_id = ?")
    .get(discordId) as OptedRow | undefined;
  db.prepare(`
    INSERT INTO users (discord_id, name, current_streak, opted_in)
    VALUES (@discordId, @name, 0, 1)
    ON CONFLICT(discord_id) DO UPDATE SET
      name = excluded.name,
      opted_in = 1
  `).run({ discordId, name });
  return { already: existing?.opted_in === 1 };
}

function recordCheckin(
  db: Sqlite,
  discordId: string,
  name: string,
  note: string | null,
  opts: { now: Date; timeZone: string },
): CheckinResult {
  joinUser(db, discordId, name);
  const state = getGroupState(db);
  const checkinDate = toLocalDate(opts.now, opts.timeZone);
  const existing = db
    .prepare("SELECT id FROM checkins WHERE user_id = ? AND checkin_date = ?")
    .get(discordId, checkinDate) as { id: number } | undefined;

  if (existing) {
    if (note !== null) {
      db.prepare("UPDATE checkins SET note = ?, ts = ? WHERE id = ?").run(
        note,
        opts.now.toISOString(),
        existing.id,
      );
    }
    return {
      created: false,
      checkinsThisWeek: countInWeek(db, discordId, state.week_start),
      weekStart: state.week_start,
    };
  }

  db.prepare(
    "INSERT INTO checkins (user_id, ts, checkin_date, note) VALUES (?, ?, ?, ?)",
  ).run(discordId, opts.now.toISOString(), checkinDate, note);

  return {
    created: true,
    checkinsThisWeek: countInWeek(db, discordId, state.week_start),
    weekStart: state.week_start,
  };
}

function toPerson(
  db: Sqlite,
  user: UserRow,
  weekStart: string,
  weeklyTarget: number,
): StatusPerson {
  const checkins = countInWeek(db, user.discord_id, weekStart);
  return {
    discordId: user.discord_id,
    name: user.name,
    currentStreak: user.current_streak,
    checkins,
    hit: checkins >= weeklyTarget,
  };
}

function weekStatus(
  db: Sqlite,
  opts: { now: Date; timeZone: string; weeklyTarget: number },
): WeekStatus {
  ensureWeek(db, opts.now, opts.timeZone);
  const state = getGroupState(db);
  return {
    weekStart: state.week_start,
    groupStreak: state.group_streak,
    people: listOptedIn(db).map((user) =>
      toPerson(db, user, state.week_start, opts.weeklyTarget),
    ),
  };
}
