import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "./db.js";

const TZ = "Australia/Sydney";
const TARGET = 3;

/** Monday 7 Sep 2026 12:00 Sydney = 02:00 UTC */
const MON_SEP_7 = new Date("2026-09-07T02:00:00.000Z");
/** Monday 14 Sep 2026 00:00 Sydney = 2026-09-13 14:00 UTC */
const MON_SEP_14 = new Date("2026-09-13T14:00:00.000Z");
/** Wednesday 16 Sep 2026 12:00 Sydney */
const WED_SEP_16 = new Date("2026-09-16T02:00:00.000Z");

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), "finesse-"));
  const db = openDb(join(dir, "test.sqlite"));
  db.ensureWeek(MON_SEP_7, TZ);
  return db;
}

describe("check-ins", () => {
  it("counts one session per local day and updates the note", () => {
    const db = tempDb();
    const first = db.recordCheckin("u1", "Renzo", "chest", {
      now: MON_SEP_7,
      timeZone: TZ,
    });
    const second = db.recordCheckin("u1", "Renzo", "chest + arms", {
      now: new Date(MON_SEP_7.getTime() + 60 * 60 * 1000),
      timeZone: TZ,
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.checkinsThisWeek).toBe(1);
    expect(second.checkinsThisWeek).toBe(1);

    const nextDay = db.recordCheckin("u1", "Renzo", "legs", {
      now: new Date("2026-09-08T02:00:00.000Z"),
      timeZone: TZ,
    });
    expect(nextDay.created).toBe(true);
    expect(nextDay.checkinsThisWeek).toBe(2);
    db.close();
  });

  it("opts the user in on first /done", () => {
    const db = tempDb();
    db.recordCheckin("u1", "Renzo", null, { now: MON_SEP_7, timeZone: TZ });
    const status = db.status({
      now: WED_SEP_16,
      timeZone: TZ,
      weeklyTarget: TARGET,
    });
    expect(status.people).toHaveLength(1);
    expect(status.people[0]?.name).toBe("Renzo");
    db.close();
  });
});

describe("monday catch-up", () => {
  it("increments streaks when everyone hit 3", () => {
    const db = tempDb();
    for (const id of ["u1", "u2"]) {
      db.join(id, id);
      for (let day = 0; day < 3; day += 1) {
        db.recordCheckin(id, id, null, {
          now: new Date(
            `2026-09-${String(7 + day).padStart(2, "0")}T02:00:00.000Z`,
          ),
          timeZone: TZ,
        });
      }
    }

    db.catchUp({ now: MON_SEP_14, timeZone: TZ, weeklyTarget: TARGET });
    const status = db.status({
      now: MON_SEP_14,
      timeZone: TZ,
      weeklyTarget: TARGET,
    });
    expect(status.weekStart).toBe("2026-09-14");
    expect(status.groupStreak).toBe(1);
    expect(status.people.every((person) => person.currentStreak === 1)).toBe(
      true,
    );
    expect(status.people.every((person) => person.checkins === 0)).toBe(true);
    db.close();
  });

  it("resets the group if anyone missed", () => {
    const db = tempDb();
    db.join("u1", "Renzo");
    db.join("u2", "Saish");
    for (let day = 0; day < 3; day += 1) {
      db.recordCheckin("u1", "Renzo", null, {
        now: new Date(
          `2026-09-${String(7 + day).padStart(2, "0")}T02:00:00.000Z`,
        ),
        timeZone: TZ,
      });
    }
    db.recordCheckin("u2", "Saish", null, { now: MON_SEP_7, timeZone: TZ });

    db.catchUp({ now: MON_SEP_14, timeZone: TZ, weeklyTarget: TARGET });
    const status = db.status({
      now: MON_SEP_14,
      timeZone: TZ,
      weeklyTarget: TARGET,
    });
    expect(status.groupStreak).toBe(0);
    expect(status.people.find((p) => p.discordId === "u1")?.currentStreak).toBe(
      1,
    );
    expect(status.people.find((p) => p.discordId === "u2")?.currentStreak).toBe(
      0,
    );
    db.close();
  });

  it("rolls two missed Mondays", () => {
    const db = tempDb();
    db.join("u1", "Renzo");
    for (let day = 0; day < 3; day += 1) {
      db.recordCheckin("u1", "Renzo", null, {
        now: new Date(
          `2026-09-${String(7 + day).padStart(2, "0")}T02:00:00.000Z`,
        ),
        timeZone: TZ,
      });
    }

    const monSep21 = new Date("2026-09-20T14:00:00.000Z");
    db.catchUp({ now: monSep21, timeZone: TZ, weeklyTarget: TARGET });
    const status = db.status({
      now: monSep21,
      timeZone: TZ,
      weeklyTarget: TARGET,
    });
    expect(status.weekStart).toBe("2026-09-21");
    // Hit week of Sep 7, missed week of Sep 14 → streak 0, group 0
    expect(status.people[0]?.currentStreak).toBe(0);
    expect(status.groupStreak).toBe(0);
    db.close();
  });

  it("ignores lurkers who never joined", () => {
    const db = tempDb();
    db.join("u1", "Renzo");
    for (let day = 0; day < 3; day += 1) {
      db.recordCheckin("u1", "Renzo", null, {
        now: new Date(
          `2026-09-${String(7 + day).padStart(2, "0")}T02:00:00.000Z`,
        ),
        timeZone: TZ,
      });
    }
    db.catchUp({ now: MON_SEP_14, timeZone: TZ, weeklyTarget: TARGET });
    const status = db.status({
      now: MON_SEP_14,
      timeZone: TZ,
      weeklyTarget: TARGET,
    });
    expect(status.people).toHaveLength(1);
    expect(status.groupStreak).toBe(1);
    db.close();
  });
});
