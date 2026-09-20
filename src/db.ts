import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type SqliteNS from "better-sqlite3";
import type { SourceAccount } from "./sources/types.js";
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
  weekly_min: number;
  base_level: string | null;
  goal: string | null;
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
  weeklyTarget: number;
  hit: boolean;
  level: string | null;
  goal: string | null;
  sources: string[];
};

export type UserProfile = {
  discordId: string;
  name: string;
  currentStreak: number;
  weeklyTarget: number;
  level: string | null;
  goal: string | null;
};

export type CheckinRow = {
  date: string;
  note: string | null;
  source: string;
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

type OauthPending = {
  discordId: string;
  source: string;
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
    getUser: (discordId: string) => getUser(db, discordId),
    updateProfile: (
      discordId: string,
      name: string,
      patch: { level?: string; goal?: string; weeklyTarget?: number },
    ) => updateProfile(db, discordId, name, patch),
    recordCheckin: (
      discordId: string,
      name: string,
      note: string | null,
      opts: {
        now: Date;
        timeZone: string;
        source?: string;
        date?: string;
      },
    ) => recordCheckin(db, discordId, name, note, opts),
    weekCheckins: (discordId: string, weekStart: string) =>
      weekCheckins(db, discordId, weekStart),
    weekWorkouts: (weekStart: string) => weekWorkouts(db, weekStart),
    status: (opts: { now: Date; timeZone: string; weeklyTarget: number }) =>
      weekStatus(db, opts),
    createOauthState: (discordId: string, source: string) =>
      createOauthState(db, discordId, source),
    takeOauthState: (state: string) => takeOauthState(db, state),
    upsertSourceAccount: (account: SourceAccount) =>
      upsertSourceAccount(db, account),
    listSourceAccounts: (source: string) => listSourceAccounts(db, source),
    connectedSources: (discordId: string) => connectedSources(db, discordId),
    needsIntervals: (discordId: string) => needsIntervals(db, discordId),
    isConnectSnoozed: (discordId: string, now: Date) =>
      isConnectSnoozed(db, discordId, now),
    snoozeConnect: (discordId: string, until: Date) =>
      snoozeConnect(db, discordId, until),
    markConnectNudge: (discordId: string, now: Date) =>
      markConnectNudge(db, discordId, now),
    listUnconnectedForNudge: (now: Date, gapMs: number) =>
      listUnconnectedForNudge(db, now, gapMs),
    claimSourceWorkout: (row: {
      source: string;
      externalId: string;
      userId: string;
      date: string;
      note: string | null;
    }) => claimSourceWorkout(db, row),
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

    CREATE TABLE IF NOT EXISTS source_accounts (
      user_id TEXT NOT NULL REFERENCES users(discord_id),
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, source)
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_workouts (
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(discord_id),
      checkin_date TEXT NOT NULL,
      note TEXT,
      seen_at TEXT NOT NULL,
      PRIMARY KEY (source, external_id)
    );
  `);
  ensureColumn(db, "users", "weekly_min", "INTEGER NOT NULL DEFAULT 3");
  ensureColumn(db, "users", "base_level", "TEXT");
  ensureColumn(db, "users", "goal", "TEXT");
  ensureColumn(db, "checkins", "source", "TEXT NOT NULL DEFAULT 'manual'");
  ensureColumn(db, "users", "connect_snooze_until", "TEXT");
  ensureColumn(db, "users", "connect_nudged_at", "TEXT");
}

function ensureColumn(
  db: Sqlite,
  table: string,
  name: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (columns.some((column) => column.name === name)) {
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
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

const USER_SELECT = `discord_id, name, current_streak, opted_in, weekly_min, base_level, goal`;

function listOptedIn(db: Sqlite): UserRow[] {
  return db
    .prepare(
      `SELECT ${USER_SELECT} FROM users WHERE opted_in = 1 ORDER BY name COLLATE NOCASE`,
    )
    .all() as UserRow[];
}

function getUser(db: Sqlite, discordId: string): UserProfile | undefined {
  const row = db
    .prepare(`SELECT ${USER_SELECT} FROM users WHERE discord_id = ?`)
    .get(discordId) as UserRow | undefined;
  if (!row) {
    return undefined;
  }
  return toProfile(row);
}

function toProfile(row: UserRow): UserProfile {
  return {
    discordId: row.discord_id,
    name: row.name,
    currentStreak: row.current_streak,
    weeklyTarget: row.weekly_min,
    level: row.base_level,
    goal: row.goal,
  };
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

function weekCheckins(
  db: Sqlite,
  discordId: string,
  weekStart: string,
): CheckinRow[] {
  const end = addDays(weekStart, 7);
  return db
    .prepare(
      `SELECT checkin_date AS date, note, source
       FROM checkins
       WHERE user_id = ? AND checkin_date >= ? AND checkin_date < ?
       ORDER BY checkin_date`,
    )
    .all(discordId, weekStart, end) as CheckinRow[];
}

export type WeekWorkout = CheckinRow & { userId: string };

function weekWorkouts(db: Sqlite, weekStart: string): WeekWorkout[] {
  const end = addDays(weekStart, 7);
  return db
    .prepare(
      `SELECT user_id AS userId, checkin_date AS date, note, source
       FROM source_workouts
       WHERE checkin_date >= ? AND checkin_date < ?
       ORDER BY checkin_date, seen_at`,
    )
    .all(weekStart, end) as WeekWorkout[];
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
          weeklyTarget: user.weekly_min || opts.weeklyTarget,
        })),
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

function updateProfile(
  db: Sqlite,
  discordId: string,
  name: string,
  patch: { level?: string; goal?: string; weeklyTarget?: number },
): UserProfile {
  joinUser(db, discordId, name);
  if (patch.level !== undefined) {
    db.prepare("UPDATE users SET base_level = ? WHERE discord_id = ?").run(
      patch.level,
      discordId,
    );
  }
  if (patch.goal !== undefined) {
    db.prepare("UPDATE users SET goal = ? WHERE discord_id = ?").run(
      patch.goal,
      discordId,
    );
  }
  if (patch.weeklyTarget !== undefined) {
    db.prepare("UPDATE users SET weekly_min = ? WHERE discord_id = ?").run(
      patch.weeklyTarget,
      discordId,
    );
  }
  const user = getUser(db, discordId);
  if (!user) {
    throw new Error("user missing after profile update");
  }
  return user;
}

function recordCheckin(
  db: Sqlite,
  discordId: string,
  name: string,
  note: string | null,
  opts: {
    now: Date;
    timeZone: string;
    source?: string;
    date?: string;
  },
): CheckinResult {
  joinUser(db, discordId, name);
  const state = getGroupState(db);
  const checkinDate = opts.date ?? toLocalDate(opts.now, opts.timeZone);
  const source = opts.source ?? "manual";
  const existing = db
    .prepare(
      "SELECT id, note FROM checkins WHERE user_id = ? AND checkin_date = ?",
    )
    .get(discordId, checkinDate) as
    | { id: number; note: string | null }
    | undefined;

  if (existing) {
    if (source === "manual" && note !== null) {
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
    "INSERT INTO checkins (user_id, ts, checkin_date, note, source) VALUES (?, ?, ?, ?, ?)",
  ).run(discordId, opts.now.toISOString(), checkinDate, note, source);

  return {
    created: true,
    checkinsThisWeek: countInWeek(db, discordId, state.week_start),
    weekStart: state.week_start,
  };
}

function connectedSources(db: Sqlite, discordId: string): string[] {
  const rows = db
    .prepare(
      "SELECT source FROM source_accounts WHERE user_id = ? ORDER BY source",
    )
    .all(discordId) as Array<{ source: string }>;
  return rows.map((row) => row.source);
}

function needsIntervals(db: Sqlite, discordId: string): boolean {
  const user = db
    .prepare("SELECT opted_in FROM users WHERE discord_id = ?")
    .get(discordId) as OptedRow | undefined;
  if (user?.opted_in !== 1) {
    return false;
  }
  return connectedSources(db, discordId).length === 0;
}

function isConnectSnoozed(db: Sqlite, discordId: string, now: Date): boolean {
  const row = db
    .prepare("SELECT connect_snooze_until FROM users WHERE discord_id = ?")
    .get(discordId) as { connect_snooze_until: string | null } | undefined;
  if (!row?.connect_snooze_until) {
    return false;
  }
  return row.connect_snooze_until > now.toISOString();
}

function snoozeConnect(db: Sqlite, discordId: string, until: Date): void {
  db.prepare(
    "UPDATE users SET connect_snooze_until = ? WHERE discord_id = ?",
  ).run(until.toISOString(), discordId);
}

function markConnectNudge(db: Sqlite, discordId: string, now: Date): void {
  db.prepare("UPDATE users SET connect_nudged_at = ? WHERE discord_id = ?").run(
    now.toISOString(),
    discordId,
  );
}

function listUnconnectedForNudge(
  db: Sqlite,
  now: Date,
  gapMs: number,
): Array<{ discordId: string; name: string }> {
  const nowIso = now.toISOString();
  const nudgedCutoff = new Date(now.getTime() - gapMs).toISOString();
  return db
    .prepare(
      `SELECT u.discord_id AS discordId, u.name AS name
       FROM users u
       WHERE u.opted_in = 1
         AND NOT EXISTS (
           SELECT 1 FROM source_accounts sa WHERE sa.user_id = u.discord_id
         )
         AND (u.connect_snooze_until IS NULL OR u.connect_snooze_until <= ?)
         AND (u.connect_nudged_at IS NULL OR u.connect_nudged_at <= ?)
       ORDER BY u.name COLLATE NOCASE`,
    )
    .all(nowIso, nudgedCutoff) as Array<{ discordId: string; name: string }>;
}

function toPerson(
  db: Sqlite,
  user: UserRow,
  weekStart: string,
  defaultTarget: number,
): StatusPerson {
  const checkins = countInWeek(db, user.discord_id, weekStart);
  const weeklyTarget = user.weekly_min || defaultTarget;
  return {
    discordId: user.discord_id,
    name: user.name,
    currentStreak: user.current_streak,
    checkins,
    weeklyTarget,
    hit: checkins >= weeklyTarget,
    level: user.base_level,
    goal: user.goal,
    sources: connectedSources(db, user.discord_id),
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

function createOauthState(
  db: Sqlite,
  discordId: string,
  source: string,
): string {
  const state = randomBytes(16).toString("hex");
  db.prepare(
    "INSERT INTO oauth_states (state, user_id, source, created_at) VALUES (?, ?, ?, ?)",
  ).run(state, discordId, source, new Date().toISOString());
  return state;
}

function takeOauthState(db: Sqlite, state: string): OauthPending | undefined {
  const row = db
    .prepare(
      "SELECT user_id, source, created_at FROM oauth_states WHERE state = ?",
    )
    .get(state) as
    | { user_id: string; source: string; created_at: string }
    | undefined;
  if (!row) {
    return undefined;
  }
  db.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > 15 * 60 * 1000) {
    return undefined;
  }
  return { discordId: row.user_id, source: row.source };
}

function upsertSourceAccount(db: Sqlite, account: SourceAccount): void {
  db.prepare(`
    INSERT INTO source_accounts (
      user_id, source, external_id, access_token, refresh_token, expires_at
    ) VALUES (
      @discordId, @source, @externalId, @accessToken, @refreshToken, @expiresAt
    )
    ON CONFLICT(user_id, source) DO UPDATE SET
      external_id = excluded.external_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at
  `).run({
    discordId: account.discordId,
    source: account.source,
    externalId: account.externalId,
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    expiresAt: account.expiresAt,
  });
  db.prepare(
    "UPDATE users SET connect_snooze_until = NULL WHERE discord_id = ?",
  ).run(account.discordId);
}

function listSourceAccounts(db: Sqlite, source: string): SourceAccount[] {
  return db
    .prepare(
      `SELECT
         sa.user_id AS discordId,
         u.name AS name,
         sa.source AS source,
         sa.external_id AS externalId,
         sa.access_token AS accessToken,
         sa.refresh_token AS refreshToken,
         sa.expires_at AS expiresAt
       FROM source_accounts sa
       JOIN users u ON u.discord_id = sa.user_id
       WHERE sa.source = ?`,
    )
    .all(source) as SourceAccount[];
}

function claimSourceWorkout(
  db: Sqlite,
  row: {
    source: string;
    externalId: string;
    userId: string;
    date: string;
    note: string | null;
  },
): boolean {
  if (!row.externalId) {
    return false;
  }
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO source_workouts (
         source, external_id, user_id, checkin_date, note, seen_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.source,
      row.externalId,
      row.userId,
      row.date,
      row.note,
      new Date().toISOString(),
    );
  return result.changes === 1;
}
