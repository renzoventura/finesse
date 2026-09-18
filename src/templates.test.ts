import { describe, expect, it } from "vitest";
import { fallBehindNudge, sundaySummary } from "./templates.js";

describe("templates", () => {
  it("formats a Sunday summary", () => {
    const text = sundaySummary({
      weekStart: "2026-09-14",
      groupStreak: 2,
      weeklyTarget: 3,
      people: [
        {
          discordId: "1",
          name: "Renzo",
          currentStreak: 4,
          checkins: 3,
          hit: true,
        },
        {
          discordId: "2",
          name: "Saish",
          currentStreak: 0,
          checkins: 1,
          hit: false,
        },
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
});
