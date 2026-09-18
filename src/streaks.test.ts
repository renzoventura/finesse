import { describe, expect, it } from "vitest";
import {
  addDays,
  closedWeekStarts,
  defaultNudgeBelow,
  mondayOf,
  rollWeek,
  toLocalDate,
  weekdayMon0,
} from "./streaks.js";

describe("toLocalDate", () => {
  it("uses the timezone, not UTC", () => {
    // 2026-09-18 00:30 UTC is still 2026-09-18 10:30 in Sydney
    const morningUtc = new Date("2026-09-18T00:30:00.000Z");
    expect(toLocalDate(morningUtc, "Australia/Sydney")).toBe("2026-09-18");
    expect(toLocalDate(morningUtc, "UTC")).toBe("2026-09-18");

    // 2026-09-18 14:30 UTC is 2026-09-19 00:30 in Sydney
    const lateUtc = new Date("2026-09-18T14:30:00.000Z");
    expect(toLocalDate(lateUtc, "Australia/Sydney")).toBe("2026-09-19");
    expect(toLocalDate(lateUtc, "UTC")).toBe("2026-09-18");
  });
});

describe("mondayOf", () => {
  it("returns the same day on Monday", () => {
    expect(mondayOf("2026-09-14")).toBe("2026-09-14");
  });

  it("walks back from midweek and Sunday", () => {
    expect(mondayOf("2026-09-16")).toBe("2026-09-14");
    expect(mondayOf("2026-09-20")).toBe("2026-09-14");
  });
});

describe("closedWeekStarts", () => {
  it("does nothing during the current week", () => {
    expect(closedWeekStarts("2026-09-14", "2026-09-18")).toEqual([]);
    expect(closedWeekStarts("2026-09-14", "2026-09-20")).toEqual([]);
  });

  it("closes the week on the following Monday", () => {
    expect(closedWeekStarts("2026-09-07", "2026-09-14")).toEqual([
      "2026-09-07",
    ]);
  });

  it("closes multiple missed weeks", () => {
    expect(closedWeekStarts("2026-08-31", "2026-09-14")).toEqual([
      "2026-08-31",
      "2026-09-07",
    ]);
  });
});

describe("rollWeek", () => {
  it("increments everyone and the group when all hit", () => {
    const rolled = rollWeek({
      weekStart: "2026-09-07",
      groupStreak: 2,
      weeklyTarget: 3,
      users: [
        { discordId: "1", currentStreak: 4, checkins: 3 },
        { discordId: "2", currentStreak: 0, checkins: 5 },
      ],
    });
    expect(rolled.nextWeekStart).toBe("2026-09-14");
    expect(rolled.groupStreak).toBe(3);
    expect(rolled.users.map((user) => user.currentStreak)).toEqual([5, 1]);
  });

  it("resets the group and anyone who missed", () => {
    const rolled = rollWeek({
      weekStart: "2026-09-07",
      groupStreak: 4,
      weeklyTarget: 3,
      users: [
        { discordId: "1", currentStreak: 4, checkins: 3 },
        { discordId: "2", currentStreak: 2, checkins: 2 },
      ],
    });
    expect(rolled.groupStreak).toBe(0);
    expect(rolled.users).toEqual([
      { discordId: "1", currentStreak: 5, hit: true },
      { discordId: "2", currentStreak: 0, hit: false },
    ]);
  });

  it("resets the group when nobody is opted in", () => {
    const rolled = rollWeek({
      weekStart: "2026-09-07",
      groupStreak: 3,
      weeklyTarget: 3,
      users: [],
    });
    expect(rolled.groupStreak).toBe(0);
    expect(rolled.nextWeekStart).toBe(addDays("2026-09-07", 7));
  });
});

describe("defaultNudgeBelow", () => {
  it("uses 1 before Saturday and 2 from Saturday", () => {
    expect(weekdayMon0("2026-09-17")).toBe(3); // Thursday
    expect(defaultNudgeBelow("2026-09-17")).toBe(1);
    expect(defaultNudgeBelow("2026-09-19")).toBe(2);
    expect(defaultNudgeBelow("2026-09-20")).toBe(2);
  });
});
