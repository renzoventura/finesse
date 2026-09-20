import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../db.js";
import { ingestSource } from "./ingest.js";
import type { ActivitySource } from "./types.js";

const TZ = "Australia/Sydney";
const MON_SEP_7 = new Date("2026-09-07T02:00:00.000Z");

function fakeSource(
  sessions: Array<{ date: string; note: string | null }>,
): ActivitySource {
  return {
    id: "fake",
    auth: "oauth",
    authorizeUrl: () => "https://example.test",
    exchangeCode: async () => {
      throw new Error("unused");
    },
    refresh: async (account) => account,
    pull: async () =>
      sessions.map((session, index) => ({
        ...session,
        detail: null,
        externalId: String(index),
      })),
  };
}

describe("ingestSource", () => {
  it("writes one check-in per day and does not double-count with manual", async () => {
    const dir = mkdtempSync(join(tmpdir(), "finesse-"));
    const db = openDb(join(dir, "test.sqlite"));
    db.ensureWeek(MON_SEP_7, TZ);
    db.join("u1", "Renzo");
    db.recordCheckin("u1", "Renzo", "gym", {
      now: MON_SEP_7,
      timeZone: TZ,
      source: "manual",
    });
    db.upsertSourceAccount({
      discordId: "u1",
      name: "Renzo",
      source: "fake",
      externalId: "99",
      accessToken: "a",
      refreshToken: "r",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    const now = new Date("2026-09-08T02:00:00.000Z");
    const source = fakeSource([
      { date: "2026-09-07", note: "Run" },
      { date: "2026-09-08", note: "Ride" },
    ]);
    const opts = { now, timeZone: TZ, lookbackHours: 36, weeklyTarget: 3 };

    const first = await ingestSource(db, source, opts);
    expect(first).toMatchObject({ created: 1 });
    expect(first.notices).toHaveLength(2);
    expect(first.notices[0]).toContain("<@u1>");
    expect(first.notices[0]).toContain("Run");
    expect(first.notices[1]).toContain("Ride");
    expect(await ingestSource(db, source, opts)).toMatchObject({
      created: 0,
      notices: [],
    });

    const status = db.status({
      now,
      timeZone: TZ,
      weeklyTarget: 3,
    });
    expect(status.people[0]?.checkins).toBe(2);
    db.close();
  });

  it("pings every new workout on a day that is already checked in", async () => {
    const dir = mkdtempSync(join(tmpdir(), "finesse-"));
    const db = openDb(join(dir, "test.sqlite"));
    const now = new Date("2026-09-08T02:00:00.000Z");
    db.ensureWeek(now, TZ);
    db.join("u1", "Renzo");
    db.recordCheckin("u1", "Renzo", "manual", {
      now,
      timeZone: TZ,
      source: "manual",
    });
    db.upsertSourceAccount({
      discordId: "u1",
      name: "Renzo",
      source: "fake",
      externalId: "99",
      accessToken: "a",
      refreshToken: "r",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    const source = fakeSource([
      { date: "2026-09-08", note: "Run — Easy · 5.2 km" },
      { date: "2026-09-08", note: "WeightTraining — Gym" },
    ]);
    const first = await ingestSource(db, source, {
      now,
      timeZone: TZ,
      lookbackHours: 36,
      weeklyTarget: 3,
    });
    expect(first.created).toBe(0);
    expect(first.notices).toHaveLength(2);
    expect(first.notices[0]).toContain("Run — Easy · 5.2 km");
    expect(first.notices[0]).toContain("**1/3** this week");
    expect(first.notices[1]).toContain("WeightTraining — Gym");
    expect(
      await ingestSource(db, source, {
        now,
        timeZone: TZ,
        lookbackHours: 36,
        weeklyTarget: 3,
      }),
    ).toMatchObject({ created: 0, notices: [] });
    expect(
      db.status({ now, timeZone: TZ, weeklyTarget: 3 }).people[0]?.checkins,
    ).toBe(1);
    db.close();
  });

  it("does not refresh API-key accounts (expiresAt 0)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "finesse-"));
    const db = openDb(join(dir, "test.sqlite"));
    db.ensureWeek(MON_SEP_7, TZ);
    db.join("u1", "Renzo");
    db.upsertSourceAccount({
      discordId: "u1",
      name: "Renzo",
      source: "fake",
      externalId: "99",
      accessToken: "a",
      refreshToken: "r",
      expiresAt: 0,
    });
    const source: ActivitySource = {
      ...fakeSource([{ date: "2026-09-07", note: "Run" }]),
      refresh: async () => {
        throw new Error("refresh should not run");
      },
    };
    const now = new Date("2026-09-08T02:00:00.000Z");
    expect(
      await ingestSource(db, source, {
        now,
        timeZone: TZ,
        lookbackHours: 36,
        weeklyTarget: 3,
      }),
    ).toMatchObject({ created: 1 });
    db.close();
  });
});
