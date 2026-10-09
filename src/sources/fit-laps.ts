import { gunzipSync } from "node:zlib";
import { Decoder, Stream } from "@garmin/fitsdk";

export type FitLap = {
  fitLapIntensity: string;
  movingTimeSec: number | null;
  distanceMeters: number | null;
  averageHeartrate: number | null;
};

export function decodeFitLaps(bytes: Uint8Array): FitLap[] {
  try {
    const fit = unzipIfNeeded(bytes);
    const stream = Stream.fromBuffer(fit);
    const decoder = new Decoder(stream);
    if (!decoder.isFIT()) {
      return [];
    }
    const { messages } = decoder.read();
    const laps = messages.lapMesgs ?? [];
    return laps.flatMap((lap) => {
      const fitLapIntensity = normalizeIntensity(lap.intensity);
      if (!fitLapIntensity) {
        return [];
      }
      return [
        {
          fitLapIntensity,
          movingTimeSec: asNumber(lap.totalTimerTime),
          distanceMeters: asNumber(lap.totalDistance),
          averageHeartrate: asNumber(lap.avgHeartRate),
        },
      ];
    });
  } catch {
    return [];
  }
}

function unzipIfNeeded(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return gunzipSync(bytes);
  }
  return bytes;
}

function normalizeIntensity(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim().toLowerCase();
  }
  return null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
