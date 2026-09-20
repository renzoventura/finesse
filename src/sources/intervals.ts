import { toLocalDate } from "../streaks.js";
import {
  formatWorkoutDetail,
  formatWorkoutLabel,
  type WorkoutDetails,
  type WorkoutInterval,
  type WorkoutStep,
} from "../workout-format.js";
import type {
  ActivitySource,
  PulledSession,
  SourceAccount,
  SourceTokens,
} from "./types.js";

export type IntervalsActivity = {
  id?: string | number;
  name?: string;
  type?: string;
  description?: string;
  start_date_local?: string;
  distance?: number;
  icu_distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed?: number;
  average_cadence?: number;
  average_watts?: number;
  icu_average_watts?: number;
  icu_weighted_avg_watts?: number;
  weighted_average_watts?: number;
  calories?: number;
  icu_training_load?: number;
  icu_intensity?: number;
  icu_warmup_time?: number;
  icu_cooldown_time?: number;
  interval_summary?: string[];
  icu_intervals?: IntervalsInterval[];
  workout_doc?: { steps?: WorkoutStep[] };
};

export type IntervalsInterval = {
  type?: string;
  label?: string;
  moving_time?: number;
  elapsed_time?: number;
  distance?: number;
  average_watts?: number;
  average_heartrate?: number;
  average_speed?: number;
  intensity?: number;
};

type IntervalsAthlete = {
  id?: string | number;
};

type IntervalsTokenResponse = {
  access_token?: string;
  athlete?: { id?: string | number };
};

export type IntervalsOptions = {
  clientId?: string | null;
  clientSecret?: string | null;
  fetch?: typeof fetch;
};

const NEVER_EXPIRES = 0;
const AUTHORIZE = "https://intervals.icu/oauth/authorize";
const TOKEN = "https://intervals.icu/api/oauth/token";
const ATHLETE = "https://intervals.icu/api/v1/athlete/0";

export function createIntervalsSource(
  opts: IntervalsOptions = {},
): ActivitySource {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const clientId = opts.clientId?.trim() || null;
  const clientSecret = opts.clientSecret?.trim() || null;
  if (clientId && clientSecret) {
    return createOauthSource(fetchFn, clientId, clientSecret);
  }
  return createApiKeySource(fetchFn);
}

function createApiKeySource(fetchFn: typeof fetch): ActivitySource {
  return {
    id: "intervals",
    auth: "api_key",
    async verifyApiKey(apiKey) {
      const key = apiKey.trim();
      const response = await fetchFn(ATHLETE, {
        headers: { Authorization: basicAuth(key) },
      });
      if (response.status === 401 || response.status === 403) {
        throw new Error("Intervals.icu rejected that API key");
      }
      if (!response.ok) {
        throw new Error(`Intervals.icu athlete ${response.status}`);
      }
      const athlete = (await response.json()) as IntervalsAthlete;
      return {
        externalId: athleteId(athlete.id),
        accessToken: key,
        refreshToken: "api_key",
        expiresAt: NEVER_EXPIRES,
      };
    },
    async refresh(account: SourceAccount) {
      return account;
    },
    pull: (account, window, timeZone) =>
      pullActivities(fetchFn, account, window, timeZone),
  };
}

function createOauthSource(
  fetchFn: typeof fetch,
  clientId: string,
  clientSecret: string,
): ActivitySource {
  return {
    id: "intervals",
    auth: "oauth",
    authorizeUrl(state, redirectUri) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "ACTIVITY:READ",
        state,
      });
      return `${AUTHORIZE}?${params.toString()}`;
    },
    async exchangeCode(code, _redirectUri) {
      const response = await fetchFn(TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });
      if (!response.ok) {
        throw new Error(`Intervals.icu token ${response.status}`);
      }
      const token = (await response.json()) as IntervalsTokenResponse;
      if (!token.access_token || token.athlete?.id === undefined) {
        throw new Error("Intervals.icu token response missing athlete");
      }
      return {
        externalId: athleteId(token.athlete.id),
        accessToken: token.access_token,
        refreshToken: "oauth",
        expiresAt: NEVER_EXPIRES,
      } satisfies SourceTokens;
    },
    async refresh(account: SourceAccount) {
      return account;
    },
    pull: (account, window, timeZone) =>
      pullActivities(fetchFn, account, window, timeZone),
  };
}

async function pullActivities(
  fetchFn: typeof fetch,
  account: SourceAccount,
  window: { after: Date },
  timeZone: string,
): Promise<PulledSession[]> {
  const oldest = toLocalDate(window.after, timeZone);
  const newest = toLocalDate(new Date(), timeZone);
  const params = new URLSearchParams({ oldest, newest });
  const response = await fetchFn(
    `https://intervals.icu/api/v1/athlete/0/activities?${params}`,
    { headers: { Authorization: intervalsAuthHeader(account) } },
  );
  if (!response.ok) {
    throw new Error(`Intervals.icu activities ${response.status}`);
  }
  const activities = (await response.json()) as IntervalsActivity[];
  if (!Array.isArray(activities)) {
    throw new Error("Intervals.icu activities: expected an array");
  }
  const sessions: PulledSession[] = [];
  const seen = new Set<string>();
  for (const listed of activities) {
    const activity = await hydrateIntervalsActivity(fetchFn, account, listed);
    const session = sessionFromIntervalsActivity(activity, timeZone);
    if (!session || session.date < oldest) {
      continue;
    }
    const key = session.externalId || `${session.date}:${session.note}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    sessions.push(session);
  }
  return sessions;
}

export function sessionFromIntervalsActivity(
  activity: IntervalsActivity,
  timeZone: string,
): PulledSession | null {
  if (!activity.start_date_local) {
    return null;
  }
  const details = workoutDetailsFromIntervals(activity);
  return {
    date: activityDate(activity.start_date_local, timeZone),
    note: formatWorkoutLabel({
      type: details.type,
      name: details.name,
      distanceMeters: details.distanceMeters,
      movingTimeSec: details.movingTimeSec,
    }).slice(0, 180),
    detail: formatWorkoutDetail(details),
    externalId: activity.id === undefined ? "" : String(activity.id),
  };
}

export async function hydrateIntervalsActivity(
  fetchFn: typeof fetch,
  account: SourceAccount,
  activity: IntervalsActivity,
): Promise<IntervalsActivity> {
  const id = activity.id === undefined ? "" : String(activity.id);
  if (!id) {
    return activity;
  }
  try {
    const response = await fetchFn(
      `https://intervals.icu/api/v1/activity/${encodeURIComponent(id)}?intervals=true`,
      { headers: { Authorization: intervalsAuthHeader(account) } },
    );
    if (!response.ok) {
      return activity;
    }
    const detail = (await response.json()) as IntervalsActivity;
    return mergeActivity(activity, detail);
  } catch {
    return activity;
  }
}

export function workoutDetailsFromIntervals(
  activity: IntervalsActivity,
): WorkoutDetails {
  return {
    type: activity.type,
    name: activity.name,
    description: activity.description,
    distanceMeters: activity.distance ?? activity.icu_distance,
    movingTimeSec: activity.moving_time ?? activity.elapsed_time,
    elevationGainM: activity.total_elevation_gain,
    averageHeartrate: activity.average_heartrate,
    maxHeartrate: activity.max_heartrate,
    averageWatts: activity.icu_average_watts ?? activity.average_watts,
    normalizedWatts:
      activity.icu_weighted_avg_watts ?? activity.weighted_average_watts,
    averageSpeedMps: activity.average_speed,
    averageCadence: activity.average_cadence,
    calories: activity.calories,
    trainingLoad: activity.icu_training_load,
    intensity: activity.icu_intensity,
    warmupSec: activity.icu_warmup_time,
    cooldownSec: activity.icu_cooldown_time,
    intervalSummary: activity.interval_summary,
    intervals: (activity.icu_intervals ?? []).map(intervalFromIntervals),
    workoutSteps: activity.workout_doc?.steps,
  };
}

function intervalFromIntervals(interval: IntervalsInterval): WorkoutInterval {
  return {
    type: interval.type,
    label: interval.label,
    movingTimeSec: interval.moving_time ?? interval.elapsed_time,
    distanceMeters: interval.distance,
    averageHeartrate: interval.average_heartrate,
    averageWatts: interval.average_watts,
    averageSpeedMps: interval.average_speed,
    intensity: interval.intensity,
  };
}

function mergeActivity(
  listed: IntervalsActivity,
  detail: IntervalsActivity,
): IntervalsActivity {
  const merged: IntervalsActivity = { ...listed };
  for (const [key, value] of Object.entries(detail) as Array<
    [keyof IntervalsActivity, IntervalsActivity[keyof IntervalsActivity]]
  >) {
    if (value !== undefined && value !== null && value !== "") {
      merged[key] = value as never;
    }
  }
  return merged;
}

export function intervalsAuthHeader(account: SourceAccount): string {
  if (account.refreshToken === "oauth") {
    return `Bearer ${account.accessToken}`;
  }
  return basicAuth(account.accessToken);
}

export function canonicalAthleteId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("i") || trimmed.startsWith("I")) {
    return trimmed.slice(1);
  }
  return trimmed;
}

export function basicAuth(apiKey: string): string {
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`;
}

function athleteId(id: string | number | undefined): string {
  if (id === undefined || id === null) {
    return "0";
  }
  return String(id);
}

function activityDate(startDateLocal: string, timeZone: string): string {
  const trimmed = startDateLocal.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return toLocalDate(new Date(startDateLocal), timeZone);
}
