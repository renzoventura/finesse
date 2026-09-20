import { describe, expect, it } from "vitest";
import type { CheckinRow, StatusPerson } from "./db.js";
import {
  autoCheckinNotice,
  connectNudgeChannel,
  fallBehindNudge,
  formatWorkoutLabel,
  onboardWelcomeChannel,
  type SaturdayPerson,
  saturdayUpdate,
  sundaySummary,
} from "./templates.js";

function person(
  overrides: Partial<SaturdayPerson> & Pick<StatusPerson, "discordId" | "name">,
): SaturdayPerson {
  return {
    currentStreak: 0,
    checkins: 0,
    weeklyTarget: 3,
    hit: false,
    level: null,
    goal: null,
    sources: [],
    sessions: [] as CheckinRow[],
    ...overrides,
  };
}

describe("templates", () => {
  it("formats a Sunday summary", () => {
    const text = sundaySummary({
      weekStart: "2026-09-14",
      groupStreak: 2,
      people: [
        person({
          discordId: "1",
          name: "Renzo",
          currentStreak: 4,
          checkins: 3,
          hit: true,
        }),
        person({
          discordId: "2",
          name: "Saish",
          currentStreak: 0,
          checkins: 1,
          hit: false,
        }),
      ],
    });
    expect(text).toContain("Renzo");
    expect(text).toContain("3/3");
    expect(text).toContain("Saish");
    expect(text).toContain("Group streak: 2 weeks");
  });

  it("returns null when nobody is behind", () => {
    expect(fallBehindNudge({ weeklyTarget: 3, people: [] })).toBeNull();
  });

  it("mentions a single person", () => {
    const text = fallBehindNudge({
      weeklyTarget: 3,
      people: [{ discordId: "99", checkins: 0 }],
    });
    expect(text).toContain("<@99>");
    expect(text).toContain("0/3");
  });

  it("pings the whole crew on Saturday, including people on pace", () => {
    const text = saturdayUpdate({
      weekStart: "2026-09-14",
      groupStreak: 0,
      today: "2026-09-19",
      people: [
        person({
          discordId: "saish",
          name: "sishydishy",
          checkins: 2,
          weeklyTarget: 3,
          sessions: [
            {
              date: "2026-09-18",
              note: "HighIntensityIntervalTraining — HIIT · 20 min",
              source: "intervals",
            },
            { date: "2026-09-19", note: null, source: "manual" },
          ],
        }),
        person({
          discordId: "renzo",
          name: "dual_lasagna",
          checkins: 1,
          weeklyTarget: 3,
          sessions: [{ date: "2026-09-18", note: null, source: "manual" }],
        }),
      ],
    });
    expect(text).toContain("<@saish>");
    expect(text).toContain("<@renzo>");
    expect(text).toContain("2/3");
    expect(text).toContain("needs 1 more · 2 days left");
    expect(text).toContain("HIIT · 20 min");
    expect(text).toContain("logged");
    expect(text).toContain("1/3");
    expect(text).toContain("needs 2 more · 2 days left");
  });

  it("skips Saturday when nobody has joined", () => {
    expect(
      saturdayUpdate({
        weekStart: "2026-09-14",
        groupStreak: 0,
        today: "2026-09-19",
        people: [],
      }),
    ).toBeNull();
  });

  it("announces an auto check-in with a mention", () => {
    const text = autoCheckinNotice({
      discordId: "u1",
      note: "Run — Easy · 5.2 km · 32 min",
      checkins: 2,
      weeklyTarget: 3,
    });
    expect(text).toBe(
      "<@u1> just worked out: **Run — Easy · 5.2 km · 32 min**\n**2/3** this week",
    );
  });

  it("formats workout details with distance and time", () => {
    expect(
      formatWorkoutLabel({
        type: "Run",
        name: "Easy",
        distanceMeters: 5234,
        movingTimeSec: 1920,
      }),
    ).toBe("Run — Easy · 5.2 km · 32 min");
  });

  it("welcomes a new member with Intervals steps", () => {
    const text = onboardWelcomeChannel("u1");
    expect(text).toContain("<@u1>");
    expect(text).toContain("intervals.icu/signup");
    expect(text).toContain("Link Intervals.icu");
  });

  it("mentions unlinked members in the daily connect nudge", () => {
    expect(connectNudgeChannel([])).toBeNull();
    expect(connectNudgeChannel(["a", "b"])).toContain("<@a>");
    expect(connectNudgeChannel(["a", "b"])).toContain("<@b>");
  });
});
