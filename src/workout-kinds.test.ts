import { describe, expect, it } from "vitest";
import { workoutKind } from "./workout-kinds.js";

describe("workoutKind", () => {
  it("maps Intervals labels and /done notes", () => {
    expect(workoutKind("HighIntensityIntervalTraining — HIIT · 20 min")).toBe(
      "HIIT",
    );
    expect(workoutKind("Run — Easy · 5.2 km · 32 min")).toBe("Run");
    expect(workoutKind("Ride — Cycling")).toBe("Cycle");
    expect(workoutKind("Hike — Trail")).toBe("Hike");
    expect(workoutKind("WeightTraining — Gym")).toBe("Gym");
    expect(workoutKind("Workout")).toBe("Gym");
    expect(workoutKind("yoga")).toBe("Yoga");
    expect(workoutKind(null, "manual")).toBe("Other");
  });
});
