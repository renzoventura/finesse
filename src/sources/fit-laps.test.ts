import { Encoder } from "@garmin/fitsdk";
import { describe, expect, it } from "vitest";
import { decodeFitLaps } from "./fit-laps.js";

function fitWithLaps(
  intensities: Array<{ intensity: string; seconds: number }>,
): Uint8Array {
  const encoder = new Encoder();
  encoder.writeMesg({
    mesgNum: 0,
    type: "activity",
    manufacturer: "development",
  });
  for (const lap of intensities) {
    encoder.writeMesg({
      mesgNum: 19,
      intensity: lap.intensity,
      totalTimerTime: lap.seconds,
      totalDistance: 1000,
      avgHeartRate: 150,
    });
  }
  return encoder.close();
}

describe("decodeFitLaps", () => {
  it("reads Garmin lap intensity, time, and distance from a FIT file", () => {
    const bytes = fitWithLaps([
      { intensity: "warmup", seconds: 300 },
      { intensity: "active", seconds: 400 },
      { intensity: "recovery", seconds: 200 },
      { intensity: "active", seconds: 400 },
      { intensity: "cooldown", seconds: 300 },
    ]);
    expect(decodeFitLaps(bytes).map((lap) => lap.fitLapIntensity)).toEqual([
      "warmup",
      "active",
      "recovery",
      "active",
      "cooldown",
    ]);
    expect(decodeFitLaps(bytes)[0]).toMatchObject({
      movingTimeSec: 300,
      distanceMeters: 1000,
      averageHeartrate: 150,
    });
  });

  it("returns nothing for Apple/Amazfit files that are not FIT", () => {
    expect(decodeFitLaps(new TextEncoder().encode("<gpx></gpx>"))).toEqual([]);
  });
});
