import type { Config } from "../config.js";
import { createIntervalsSource } from "./intervals.js";
import { createStravaSource } from "./strava.js";
import type { ActivitySource } from "./types.js";

export function createActivitySources(
  config: Config,
): Record<string, ActivitySource> {
  const sources: Record<string, ActivitySource> = {
    intervals: createIntervalsSource({
      clientId: config.intervalsClientId,
      clientSecret: config.intervalsClientSecret,
    }),
  };
  if (config.stravaClientId && config.stravaClientSecret) {
    sources.strava = createStravaSource({
      clientId: config.stravaClientId,
      clientSecret: config.stravaClientSecret,
    });
  }
  return sources;
}

export function oauthRedirectUri(publicUrl: string, sourceId: string): string {
  return `${publicUrl}/oauth/${sourceId}/callback`;
}
