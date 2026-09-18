import type { Config } from "../config.js";
import { createIntervalsSource } from "./intervals.js";
import type { ActivitySource } from "./types.js";

export function createActivitySources(
  config: Config,
): Record<string, ActivitySource> {
  return {
    intervals: createIntervalsSource({
      clientId: config.intervalsClientId,
      clientSecret: config.intervalsClientSecret,
    }),
  };
}

export function oauthRedirectUri(publicUrl: string, sourceId: string): string {
  return `${publicUrl}/oauth/${sourceId}/callback`;
}
