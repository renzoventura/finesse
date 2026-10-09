import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatWorkoutDetail,
  formatWorkoutLabel,
  sportLabel,
} from "./workout-format.js";

describe("sportLabel", () => {
  it("shortens Intervals sport types", () => {
    expect(sportLabel("HighIntensityIntervalTraining")).toBe("HIIT");
    expect(sportLabel("WeightTraining")).toBe("Gym");
    expect(sportLabel("StairStepper")).toBe("Stairs");
    expect(sportLabel("TrailRun")).toBe("Trail run");
  });
});

describe("formatWorkoutLabel", () => {
  it("formats a run with distance and time", () => {
    expect(
      formatWorkoutLabel({
        type: "Run",
        name: "Easy",
        distanceMeters: 5234,
        movingTimeSec: 1920,
      }),
    ).toBe("Run — Easy · 5.2 km · 32m");
  });

  it("drops Garmin's generic sport name when it matches the type", () => {
    expect(
      formatWorkoutLabel({
        type: "HighIntensityIntervalTraining",
        name: "HIIT",
        movingTimeSec: 3689,
      }),
    ).toBe("HIIT · 1h 1m 29s");
    expect(
      formatWorkoutLabel({
        type: "Run",
        name: "Running",
        movingTimeSec: 1920,
      }),
    ).toBe("Run · 32m");
    expect(
      formatWorkoutLabel({
        type: "WeightTraining",
        name: "Gym",
      }),
    ).toBe("Gym");
  });
});

describe("formatDuration", () => {
  it("keeps seconds instead of rounding to minutes", () => {
    expect(formatDuration(330)).toBe("5m 30s");
    expect(formatDuration(300)).toBe("5m");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(4980)).toBe("1h 23m");
    expect(formatDuration(4992)).toBe("1h 23m 12s");
  });
});

describe("formatWorkoutDetail", () => {
  it("adds pace, HR, and elevation for a run", () => {
    expect(
      formatWorkoutDetail({
        type: "Run",
        name: "Easy",
        distanceMeters: 5234,
        movingTimeSec: 1920,
        averageHeartrate: 148,
        maxHeartrate: 167,
        elevationGainM: 42,
        calories: 412,
        trainingLoad: 48,
      }),
    ).toBe("Pace 6:07/km · HR 148 (max 167) · Elev 42 m · Load 48 · 412 kcal");
  });

  it("shows warmup, grouped intervals, and cooldown", () => {
    const text = formatWorkoutDetail({
      type: "Run",
      name: "Threshold",
      distanceMeters: 8200,
      movingTimeSec: 2880,
      intervals: [
        { type: "WARMUP", movingTimeSec: 600, distanceMeters: 1600 },
        { type: "WORK", movingTimeSec: 240, averageHeartrate: 172 },
        { type: "RECOVERY", movingTimeSec: 120 },
        { type: "WORK", movingTimeSec: 240, averageHeartrate: 174 },
        { type: "RECOVERY", movingTimeSec: 120 },
        { type: "WORK", movingTimeSec: 241, averageHeartrate: 171 },
        { type: "RECOVERY", movingTimeSec: 118 },
        { type: "COOLDOWN", movingTimeSec: 480, distanceMeters: 1300 },
      ],
    });
    expect(text).toContain("Warm-up · 1 lap · 10m · 1.6 km");
    expect(text).toContain("3× (4m work · 2m easy)");
    expect(text).toContain("Cool-down · 1 lap · 8m · 1.3 km");
  });

  it("uses warmup and cooldown times when Garmin did not split intervals", () => {
    expect(
      formatWorkoutDetail({
        type: "HighIntensityIntervalTraining",
        name: "HIIT",
        movingTimeSec: 3689,
        averageHeartrate: 96,
        maxHeartrate: 141,
        calories: 230,
        trainingLoad: 12,
        intensity: 34,
        warmupSec: 1200,
        cooldownSec: 600,
        intervals: [
          { type: "RECOVERY", movingTimeSec: 3690, averageHeartrate: 96 },
        ],
      }),
    ).toBe(
      [
        "HR 96 (max 141) · Load 12 · Intensity 34% · 230 kcal",
        "Warm-up · 20m",
        "Work · 31m 29s",
        "Cool-down · 10m",
      ].join("\n"),
    );
  });

  it("formats a ride with power and planned steps", () => {
    const text = formatWorkoutDetail({
      type: "Ride",
      name: "4x8 VO2",
      distanceMeters: 42100,
      movingTimeSec: 5520,
      averageSpeedMps: 7.6,
      averageWatts: 218,
      normalizedWatts: 241,
      averageHeartrate: 152,
      trainingLoad: 98,
      workoutSteps: [
        { text: "Warm-up", duration: 900, power: { value: 55, units: "%ftp" } },
        {
          reps: 4,
          text: "4X",
          steps: [
            { duration: 480, power: { value: 280, units: "W" }, text: "hard" },
            { duration: 240, power: { value: 140, units: "W" }, text: "easy" },
          ],
        },
        {
          text: "Cool-down",
          duration: 600,
          power: { value: 50, units: "%ftp" },
        },
      ],
    });
    expect(text).toContain("27.4 km/h · HR 152 · 218 W · NP 241 · Load 98");
    expect(text).toContain("Warm-up · 15m · 55%ftp");
    expect(text).toContain("4× (8m hard @ 280 W · 4m easy @ 140 W)");
    expect(text).toContain("Cool-down · 10m · 50%ftp");
  });

  it("keeps a unique description and ignores a whole-session interval", () => {
    expect(
      formatWorkoutDetail({
        type: "WeightTraining",
        name: "Gym",
        movingTimeSec: 2400,
        description: "Push: bench, OHP, dips",
        calories: 180,
        intervals: [{ type: "WORK", movingTimeSec: 2400 }],
      }),
    ).toBe("180 kcal\nPush: bench, OHP, dips");
  });

  it("groups kilometre autolaps into warmup and work with real lap times", () => {
    const intervals = [
      {
        type: "WORK",
        movingTimeSec: 360,
        distanceMeters: 1000,
        averageHeartrate: 146,
      },
      {
        type: "WORK",
        movingTimeSec: 348,
        distanceMeters: 1000,
        averageHeartrate: 148,
      },
      {
        type: "WORK",
        movingTimeSec: 330,
        distanceMeters: 1000,
        averageHeartrate: 165,
      },
      {
        type: "WORK",
        movingTimeSec: 320,
        distanceMeters: 1000,
        averageHeartrate: 174,
      },
      {
        type: "WORK",
        movingTimeSec: 318,
        distanceMeters: 1000,
        averageHeartrate: 176,
      },
      {
        type: "WORK",
        movingTimeSec: 315,
        distanceMeters: 1000,
        averageHeartrate: 177,
      },
      {
        type: "WORK",
        movingTimeSec: 312,
        distanceMeters: 1000,
        averageHeartrate: 179,
      },
      {
        type: "RECOVERY",
        movingTimeSec: 360,
        distanceMeters: 1000,
        averageHeartrate: 166,
      },
      {
        type: "WORK",
        movingTimeSec: 348,
        distanceMeters: 1000,
        averageHeartrate: 164,
      },
      {
        type: "WORK",
        movingTimeSec: 325,
        distanceMeters: 1000,
        averageHeartrate: 176,
      },
      {
        type: "WORK",
        movingTimeSec: 322,
        distanceMeters: 1000,
        averageHeartrate: 175,
      },
      {
        type: "WORK",
        movingTimeSec: 328,
        distanceMeters: 1000,
        averageHeartrate: 173,
      },
      {
        type: "WORK",
        movingTimeSec: 330,
        distanceMeters: 1000,
        averageHeartrate: 172,
      },
      {
        type: "WORK",
        movingTimeSec: 332,
        distanceMeters: 1000,
        averageHeartrate: 171,
      },
      {
        type: "WORK",
        movingTimeSec: 332,
        distanceMeters: 1000,
        averageHeartrate: 170,
      },
    ];
    const text = formatWorkoutDetail({
      type: "Run",
      distanceMeters: 15000,
      movingTimeSec: 4980,
      averageHeartrate: 169,
      maxHeartrate: 187,
      elevationGainM: 115,
      averageCadence: 88,
      calories: 1228,
      trainingLoad: 113,
      intensity: 89,
      intervals,
    });
    expect(text).toBe(
      [
        "Pace 5:32/km · HR 169 (max 187) · Elev 115 m · 88 rpm · Load 113 · Intensity 89% · 1228 kcal",
        "Warm-up · 2 laps · 11m 48s · 2.0 km · 5:54/km · 147 bpm",
        "Work · 13 laps · 1h 11m 12s · 13.0 km · 5:29/km · 172 bpm",
      ].join("\n"),
    );
    expect(text).not.toContain("Work · 5m");
  });

  it("groups trailing easy autolaps as cool-down", () => {
    const text = formatWorkoutDetail({
      type: "Run",
      distanceMeters: 6000,
      movingTimeSec: 2100,
      intervals: [
        {
          type: "WORK",
          movingTimeSec: 400,
          distanceMeters: 1000,
          averageHeartrate: 140,
        },
        {
          type: "WORK",
          movingTimeSec: 390,
          distanceMeters: 1000,
          averageHeartrate: 142,
        },
        {
          type: "WORK",
          movingTimeSec: 320,
          distanceMeters: 1000,
          averageHeartrate: 172,
        },
        {
          type: "WORK",
          movingTimeSec: 318,
          distanceMeters: 1000,
          averageHeartrate: 175,
        },
        {
          type: "WORK",
          movingTimeSec: 380,
          distanceMeters: 1000,
          averageHeartrate: 145,
        },
        {
          type: "WORK",
          movingTimeSec: 292,
          distanceMeters: 1000,
          averageHeartrate: 144,
        },
      ],
    });
    expect(text).toContain("Warm-up · 2 laps");
    expect(text).toContain("Work · 2 laps");
    expect(text).toContain("Cool-down · 2 laps · 11m 12s · 2.0 km");
  });

  it("returns null when Intervals has nothing extra", () => {
    expect(
      formatWorkoutDetail({
        type: "Workout",
        name: "Workout",
      }),
    ).toBeNull();
  });
});
