import { gunzipSync } from "node:zlib";
import { Decoder, Stream } from "@garmin/fitsdk";

export function decodeFitLapIntensities(bytes: Uint8Array): string[] {
  try {
    const fit = unzipIfNeeded(bytes);
    const stream = Stream.fromBuffer(fit);
    const decoder = new Decoder(stream);
    if (!decoder.isFIT()) {
      return [];
    }
    const { messages } = decoder.read();
    const laps = messages.lapMesgs ?? [];
    return laps
      .map((lap) => normalizeIntensity(lap.intensity))
      .filter((value): value is string => Boolean(value));
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
