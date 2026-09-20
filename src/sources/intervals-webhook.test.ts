import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../db.js";
import {
  applyIntervalsWebhook,
  matchIntervalsAccount,
  webhookSecretsMatch,
} from "./intervals-webhook.js";

const TZ = "Australia/Sydney";
const NOW = new Date("2026-09-08T02:00:00.000Z");
const SECRET = "test-webhook-secret";

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), "finesse-"));
  const db = openDb(join(dir, "test.sqlite"));
  db.ensureWeek(NOW, TZ);
  db.join("u1", "Renzo");
  db.upsertSourceAccount({
    discordId: "u1",
    name: "Renzo",
    source: "intervals",
    externalId: "i2049151",
    accessToken: "key",
    refreshToken: "api_key",
    expiresAt: 0,
  });
  return db;
}

describe("webhookSecretsMatch", () => {
  it("accepts the exact secret", () => {
    expect(webhookSecretsMatch(SECRET, SECRET)).toBe(true);
    expect(webhookSecretsMatch(SECRET, "nope")).toBe(false);
    expect(webhookSecretsMatch(SECRET, undefined)).toBe(false);
  });
});

describe("matchIntervalsAccount", () => {
  it("matches athlete ids with or without the i prefix", () => {
    const account = {
      discordId: "u1",
      name: "Renzo",
      source: "intervals",
      externalId: "i2049151",
      accessToken: "key",
      refreshToken: "api_key",
      expiresAt: 0,
    };
    expect(matchIntervalsAccount([account], "2049151")?.discordId).toBe("u1");
    expect(matchIntervalsAccount([account], "i2049151")?.discordId).toBe("u1");
    expect(matchIntervalsAccount([account], "9")).toBeUndefined();
  });
});

describe("applyIntervalsWebhook", () => {
  it("rejects a bad secret", async () => {
    const db = tempDb();
    const result = await applyIntervalsWebhook(
      db,
      { secret: "wrong", events: [] },
      { expectedSecret: SECRET, now: NOW, timeZone: TZ, weeklyTarget: 3 },
    );
    expect(result).toMatchObject({ unauthorized: true, created: 0 });
    db.close();
  });

  it("logs a Garmin activity and ignores calendar noise", async () => {
    const db = tempDb();
    const result = await applyIntervalsWebhook(
      db,
      {
        secret: SECRET,
        events: [
          {
            athlete_id: "2049151",
            type: "ACTIVITY_UPLOADED",
            activity: {
              id: "i55751783",
              type: "WeightTraining",
              name: "Gym",
              start_date_local: "2026-09-08T07:35:18",
            },
          },
          {
            athlete_id: "2049151",
            type: "CALENDAR_UPDATED",
            activity: {
              id: "skip",
              start_date_local: "2026-09-08T00:00:00",
            },
          },
        ],
      },
      { expectedSecret: SECRET, now: NOW, timeZone: TZ, weeklyTarget: 3 },
    );
    expect(result.unauthorized).toBe(false);
    expect(result.created).toBe(1);
    expect(result.notices[0]).toContain("<@u1>");
    expect(result.notices[0]).toContain("Gym");
    expect(result.notices[0]).toContain("**1/3** this week");

    const again = await applyIntervalsWebhook(
      db,
      {
        secret: SECRET,
        events: [
          {
            athlete_id: "i2049151",
            type: "ACTIVITY_ANALYZED",
            activity: {
              id: "i55751783",
              type: "WeightTraining",
              name: "Gym",
              start_date_local: "2026-09-08T07:35:18",
            },
          },
        ],
      },
      { expectedSecret: SECRET, now: NOW, timeZone: TZ, weeklyTarget: 3 },
    );
    expect(again.created).toBe(0);
    expect(again.notices).toEqual([]);
    db.close();
  });

  it("still pings when the day is already checked in", async () => {
    const db = tempDb();
    db.recordCheckin("u1", "Renzo", "manual", {
      now: NOW,
      timeZone: TZ,
      source: "manual",
    });
    const result = await applyIntervalsWebhook(
      db,
      {
        secret: SECRET,
        events: [
          {
            athlete_id: "2049151",
            type: "ACTIVITY_UPLOADED",
            activity: {
              id: "i55751799",
              type: "Run",
              name: "Easy",
              distance: 5234,
              moving_time: 1920,
              start_date_local: "2026-09-08T07:35:18",
            },
          },
        ],
      },
      { expectedSecret: SECRET, now: NOW, timeZone: TZ, weeklyTarget: 3 },
    );
    expect(result.created).toBe(0);
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toContain("Run — Easy · 5.2 km · 32 min");
    expect(result.notices[0]).toContain("**1/3** this week");
    db.close();
  });

  it("ignores unknown athletes", async () => {
    const db = tempDb();
    const result = await applyIntervalsWebhook(
      db,
      {
        secret: SECRET,
        events: [
          {
            athlete_id: "999",
            type: "ACTIVITY_UPLOADED",
            activity: {
              id: "i1",
              start_date_local: "2026-09-08T07:00:00",
            },
          },
        ],
      },
      { expectedSecret: SECRET, now: NOW, timeZone: TZ, weeklyTarget: 3 },
    );
    expect(result.created).toBe(0);
    expect(result.unauthorized).toBe(false);
    db.close();
  });

  it("includes warmup and interval steps when Intervals returns them", async () => {
    const db = tempDb();
    const result = await applyIntervalsWebhook(
      db,
      {
        secret: SECRET,
        events: [
          {
            athlete_id: "2049151",
            type: "ACTIVITY_ANALYZED",
            activity: {
              id: "i55751800",
              type: "Run",
              name: "Threshold",
              start_date_local: "2026-09-08T07:00:00",
            },
          },
        ],
      },
      {
        expectedSecret: SECRET,
        now: NOW,
        timeZone: TZ,
        weeklyTarget: 3,
        fetch: async () =>
          new Response(
            JSON.stringify({
              id: "i55751800",
              type: "Run",
              name: "Threshold",
              start_date_local: "2026-09-08T07:00:00",
              distance: 8200,
              moving_time: 2880,
              average_heartrate: 158,
              max_heartrate: 181,
              icu_intervals: [
                { type: "WARMUP", moving_time: 600, distance: 1600 },
                { type: "WORK", moving_time: 240 },
                { type: "RECOVERY", moving_time: 120 },
                { type: "WORK", moving_time: 240 },
                { type: "RECOVERY", moving_time: 120 },
                { type: "COOLDOWN", moving_time: 480, distance: 1300 },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      },
    );
    expect(result.notices[0]).toContain("Run — Threshold · 8.2 km · 48 min");
    expect(result.notices[0]).toContain("Warm-up · 10 min · 1.6 km");
    expect(result.notices[0]).toContain("2× (4 min work · 2 min easy)");
    expect(result.notices[0]).toContain("Cool-down · 8 min · 1.3 km");
    expect(result.notices[0]).toContain("HR 158 (max 181)");
    db.close();
  });
});
