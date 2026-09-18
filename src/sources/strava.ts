import { toLocalDate } from "../streaks.js";
import { formatWorkoutLabel } from "../templates.js";
import type { ActivitySource, PulledSession, SourceTokens } from "./types.js";

type StravaConfig = {
  clientId: string;
  clientSecret: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number };
};

type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date_local: string;
  distance?: number;
  moving_time?: number;
};

export function createStravaSource(config: StravaConfig): ActivitySource {
  return {
    id: "strava",
    auth: "oauth",
    authorizeUrl(state, redirectUri) {
      const params = new URLSearchParams({
        client_id: config.clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        approval_prompt: "auto",
        scope: "read,activity:read_all",
        state,
      });
      return `https://www.strava.com/oauth/authorize?${params.toString()}`;
    },
    async exchangeCode(code, redirectUri) {
      const token = await tokenRequest({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      });
      if (!token.athlete?.id) {
        throw new Error("Strava token response missing athlete id");
      }
      return toTokens(token, String(token.athlete.id));
    },
    async refresh(account) {
      const token = await tokenRequest({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: account.refreshToken,
      });
      return {
        ...account,
        ...toTokens(token, account.externalId),
        source: "strava",
      };
    },
    async pull(account, window, timeZone) {
      const after = Math.floor(window.after.getTime() / 1000);
      const response = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
        { headers: { Authorization: `Bearer ${account.accessToken}` } },
      );
      if (!response.ok) {
        throw new Error(`Strava activities ${response.status}`);
      }
      const activities = (await response.json()) as StravaActivity[];
      const sessions: PulledSession[] = [];
      const seen = new Set<string>();
      for (const activity of activities) {
        const date = activityDate(activity.start_date_local, timeZone);
        const session: PulledSession = {
          date,
          note: formatWorkoutLabel({
            type: activity.sport_type || activity.type,
            name: activity.name,
            distanceMeters: activity.distance,
            movingTimeSec: activity.moving_time,
          }).slice(0, 180),
          externalId: String(activity.id),
        };
        if (seen.has(session.externalId)) {
          continue;
        }
        seen.add(session.externalId);
        sessions.push(session);
      }
      return sessions;
    },
  };
}

function activityDate(startDateLocal: string, timeZone: string): string {
  const trimmed = startDateLocal.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return toLocalDate(new Date(startDateLocal), timeZone);
}

function toTokens(token: TokenResponse, externalId: string): SourceTokens {
  return {
    externalId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at,
  };
}

async function tokenRequest(
  body: Record<string, string>,
): Promise<TokenResponse> {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Strava token ${response.status}`);
  }
  return (await response.json()) as TokenResponse;
}
