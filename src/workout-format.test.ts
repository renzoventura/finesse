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

  it("lists Garmin FIT lap intensity as warmup / workout / recovery / cooldown", () => {
    const km = (
      seconds: number,
      hr: number,
      fitLapIntensity: string,
      type = "WORK",
    ) => ({
      type,
      movingTimeSec: seconds,
      distanceMeters: 1000,
      averageHeartrate: hr,
      fitLapIntensity,
    });
    const text = formatWorkoutDetail({
      type: "Run",
      name: "Melbourne - Lily long run",
      distanceMeters: 15012,
      movingTimeSec: 4984,
      averageHeartrate: 169,
      maxHeartrate: 187,
      intervals: [
        km(324, 146, "warmup"),
        km(352, 148, "warmup"),
        km(324, 165, "active"),
        km(328, 174, "active"),
        km(324, 176, "active"),
        km(326, 177, "active"),
        km(323, 179, "active"),
        km(376, 166, "recovery", "RECOVERY"),
        km(334, 164, "active"),
        km(320, 176, "active"),
        km(325, 178, "active"),
        km(325, 178, "active"),
        km(325, 179, "active"),
        km(359, 158, "cooldown"),
        km(344, 172, "cooldown"),
        {
          type: "WORK",
          movingTimeSec: 3,
          distanceMeters: 5,
          averageHeartrate: 175,
          fitLapIntensity: "cooldown",
        },
      ],
    });
    expect(text).toContain("Warm-up\n1 · 5m 24s · 1.0 km · 5:24/km · 146 bpm");
    expect(text).toContain("2 · 5m 52s · 1.0 km · 5:52/km · 148 bpm");
    expect(text).toContain("Workout\n3 · 5m 24s · 1.0 km · 5:24/km · 165 bpm");
    expect(text).toContain("Recovery\n8 · 6m 16s · 1.0 km · 6:16/km · 166 bpm");
    expect(text).toContain("Workout\n9 · 5m 34s · 1.0 km · 5:34/km · 164 bpm");
    expect(text).toContain(
      "Cool-down\n14 · 5m 59s · 1.0 km · 5:59/km · 158 bpm",
    );
    expect(text).toContain("15 · 5m 44s · 1.0 km · 5:44/km · 172 bpm");
    expect(text).not.toContain("16 ·");
  });

  it("falls back to Intervals WORK/RECOVERY laps when there is no FIT intensity", () => {
    const text = formatWorkoutDetail({
      type: "Run",
      distanceMeters: 5000,
      movingTimeSec: 1500,
      intervals: [
        {
          type: "WORK",
          movingTimeSec: 300,
          distanceMeters: 1000,
          averageHeartrate: 150,
        },
        {
          type: "WORK",
          movingTimeSec: 300,
          distanceMeters: 1000,
          averageHeartrate: 152,
        },
        {
          type: "RECOVERY",
          movingTimeSec: 360,
          distanceMeters: 1000,
          averageHeartrate: 140,
        },
        {
          type: "WORK",
          movingTimeSec: 300,
          distanceMeters: 1000,
          averageHeartrate: 155,
        },
      ],
    });
    expect(text).toContain("Workout\n1 · 5m · 1.0 km");
    expect(text).toContain("Recovery\n3 · 6m · 1.0 km");
    expect(text).toContain("Workout\n4 · 5m · 1.0 km");
    expect(text).not.toContain("Warm-up");
    expect(text).not.toContain("Cool-down");
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
