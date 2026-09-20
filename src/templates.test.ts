import { describe, expect, it } from "vitest";
import type { CheckinRow, StatusPerson } from "./db.js";
import {
  autoCheckinNotice,
  type CrewBoardPerson,
  connectNudgeChannel,
  dailyUpdate,
  fallBehindNudge,
  formatWorkoutLabel,
  mergeWeekSessions,
  onboardWelcomeChannel,
  sundaySummary,
} from "./templates.js";

function person(
  overrides: Partial<CrewBoardPerson> &
    Pick<StatusPerson, "discordId" | "name">,
): CrewBoardPerson {
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
  it("formats a Sunday recap with leaders by workout kind", () => {
    const text = sundaySummary({
      weekStart: "2026-09-14",
      groupStreak: 2,
      people: [
        person({
          discordId: "renzo",
          name: "Renzo",
          currentStreak: 4,
          checkins: 3,
          hit: true,
          sessions: [
            {
              date: "2026-09-15",
              note: "Run — Easy · 5.2 km",
              source: "intervals",
            },
            {
              date: "2026-09-16",
              note: "Ride — Cycling",
              source: "intervals",
            },
            { date: "2026-09-18", note: "run", source: "manual" },
          ],
        }),
        person({
          discordId: "saish",
          name: "Saish",
          currentStreak: 0,
          checkins: 1,
          hit: false,
          sessions: [
            {
              date: "2026-09-18",
              note: "HighIntensityIntervalTraining — HIIT · 20 min",
              source: "intervals",
            },
          ],
        }),
      ],
    });
    expect(text).toContain("Week recap");
    expect(text).toContain("<@renzo>");
    expect(text).toContain("<@saish>");
    expect(text).toContain("3/3");
    expect(text).toContain("Most sessions: <@renzo> (3)");
    expect(text).toContain("Run: <@renzo> (2)");
    expect(text).toContain("Cycle: <@renzo> (1)");
    expect(text).toContain("HIIT: <@saish> (1)");
    expect(text).toContain("**1/2** hit their target");
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

  it("pings the whole crew on the daily board", () => {
    const text = dailyUpdate({
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
    expect(text).toContain("**Daily**");
    expect(text).toContain("<@saish>");
    expect(text).toContain("<@renzo>");
    expect(text).toContain("2/3");
    expect(text).toContain("needs 1 more · 2 days left");
    expect(text).toContain("HIIT · 20 min");
    expect(text).toContain("logged");
  });

  it("skips daily when nobody has joined", () => {
    expect(
      dailyUpdate({
        weekStart: "2026-09-14",
        groupStreak: 0,
        today: "2026-09-19",
        people: [],
      }),
    ).toBeNull();
  });

  it("keeps extra Intervals sessions on a day that already has a check-in", () => {
    const merged = mergeWeekSessions(
      [
        {
          date: "2026-09-18",
          note: "HighIntensityIntervalTraining — HIIT · 20 min",
          source: "intervals",
        },
      ],
      [
        {
          date: "2026-09-18",
          note: "HighIntensityIntervalTraining — HIIT · 20 min",
          source: "intervals",
        },
        { date: "2026-09-18", note: "Run — Easy", source: "intervals" },
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged.map((row) => row.note).join(" ")).toContain("Run");
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

  it("adds interval structure under the workout title", () => {
    const text = autoCheckinNotice({
      discordId: "u1",
      note: "Run — Threshold · 8.2 km · 48 min",
      detail:
        "Warm-up · 10 min\n4× (4 min work · 2 min easy)\nCool-down · 8 min",
      checkins: 1,
      weeklyTarget: 3,
    });
    expect(text).toContain(
      "just worked out: **Run — Threshold · 8.2 km · 48 min**",
    );
    expect(text).toContain("4× (4 min work · 2 min easy)");
    expect(text).toContain("**1/3** this week");
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
