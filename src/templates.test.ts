import { describe, expect, it } from "vitest";
import type { StatusPerson } from "./db.js";
import {
  autoCheckinNotice,
  connectNudgeChannel,
  fallBehindNudge,
  formatWorkoutLabel,
  onboardWelcomeChannel,
  sundaySummary,
} from "./templates.js";

function person(
  overrides: Partial<StatusPerson> & Pick<StatusPerson, "discordId" | "name">,
): StatusPerson {
  return {
    currentStreak: 0,
    checkins: 0,
    weeklyTarget: 3,
    hit: false,
    level: null,
    goal: null,
    sources: [],
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
