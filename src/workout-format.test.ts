import { describe, expect, it } from "vitest";
import {
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
    ).toBe("Run — Easy · 5.2 km · 32 min");
  });

  it("drops Garmin's generic sport name when it matches the type", () => {
    expect(
      formatWorkoutLabel({
        type: "HighIntensityIntervalTraining",
        name: "HIIT",
        movingTimeSec: 3689,
      }),
    ).toBe("HIIT · 1h 1m");
    expect(
      formatWorkoutLabel({
        type: "Run",
        name: "Running",
        movingTimeSec: 1920,
      }),
    ).toBe("Run · 32 min");
    expect(
      formatWorkoutLabel({
        type: "WeightTraining",
        name: "Gym",
      }),
    ).toBe("Gym");
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
    expect(text).toContain("Warm-up · 10 min · 1.6 km");
    expect(text).toContain("3× (4 min work · 2 min easy)");
    expect(text).toContain("Cool-down · 8 min · 1.3 km");
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
        "Warm-up · 20 min",
        "Work · 31 min",
        "Cool-down · 10 min",
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
    expect(text).toContain("Warm-up · 15 min · 55%ftp");
    expect(text).toContain("4× (8 min hard @ 280 W · 4 min easy @ 140 W)");
    expect(text).toContain("Cool-down · 10 min · 50%ftp");
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

  it("returns null when Intervals has nothing extra", () => {
    expect(
      formatWorkoutDetail({
        type: "Workout",
        name: "Workout",
      }),
    ).toBeNull();
  });
});
