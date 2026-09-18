import { describe, expect, it } from "vitest";
import {
  basicAuth,
  createIntervalsSource,
  intervalsAuthHeader,
} from "./intervals.js";

const TZ = "Australia/Sydney";
const KEY = "test-intervals-key";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createIntervalsSource", () => {
  it("stores the API key after athlete/0 succeeds", async () => {
    const source = createIntervalsSource({
      fetch: async (input) => {
        expect(String(input)).toBe("https://intervals.icu/api/v1/athlete/0");
        return jsonResponse(200, { id: "i2049151", name: "Renzo" });
      },
    });
    if (source.auth !== "api_key") {
      throw new Error("expected api_key source");
    }
    await expect(source.verifyApiKey(`  ${KEY}  `)).resolves.toEqual({
      externalId: "i2049151",
      accessToken: KEY,
      refreshToken: "api_key",
      expiresAt: 0,
    });
  });

  it("rejects a bad key", async () => {
    const source = createIntervalsSource({
      fetch: async () => jsonResponse(401, { error: "unauthorized" }),
    });
    if (source.auth !== "api_key") {
      throw new Error("expected api_key source");
    }
    await expect(source.verifyApiKey(KEY)).rejects.toThrow(/rejected/);
  });

  it("pulls every activity, including two on the same day", async () => {
    const source = createIntervalsSource({
      fetch: async (input) => {
        const url = new URL(String(input));
        expect(url.searchParams.get("oldest")).toBe("2026-09-07");
        return jsonResponse(200, [
          {
            id: "i1",
            type: "WeightTraining",
            name: "Gym",
            start_date_local: "2026-09-07T18:00:00",
          },
          {
            id: "i2",
            type: "Run",
            name: "Easy",
            start_date_local: "2026-09-07T07:00:00",
          },
          {
            id: "i3",
            type: "Ride",
            name: "Commute",
            start_date_local: "2026-09-08T06:30:00",
          },
        ]);
      },
    });
    const sessions = await source.pull(
      {
        discordId: "u1",
        name: "Renzo",
        source: "intervals",
        externalId: "i2049151",
        accessToken: KEY,
        refreshToken: "api_key",
        expiresAt: 0,
      },
      { after: new Date("2026-09-06T16:00:00.000Z") },
      TZ,
    );
    expect(sessions).toEqual([
      {
        date: "2026-09-07",
        note: "WeightTraining — Gym",
        externalId: "i1",
      },
      {
        date: "2026-09-07",
        note: "Run — Easy",
        externalId: "i2",
      },
      {
        date: "2026-09-08",
        note: "Ride — Commute",
        externalId: "i3",
      },
    ]);
  });

  it("uses OAuth when client id and secret are set", async () => {
    const source = createIntervalsSource({
      clientId: "cid",
      clientSecret: "csecret",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://intervals.icu/api/oauth/token");
        expect(init?.method).toBe("POST");
        const body = String(init?.body);
        expect(body).toContain("client_id=cid");
        expect(body).toContain("code=auth-code");
        return jsonResponse(200, {
          access_token: "bearer-token",
          athlete: { id: 2049151, name: "Renzo" },
        });
      },
    });
    if (source.auth !== "oauth") {
      throw new Error("expected oauth source");
    }
    expect(
      source.authorizeUrl("st", "https://bot.example/oauth/intervals/callback"),
    ).toContain("client_id=cid");
    expect(
      source.authorizeUrl("st", "https://bot.example/oauth/intervals/callback"),
    ).toContain("scope=ACTIVITY%3AREAD");
    await expect(
      source.exchangeCode(
        "auth-code",
        "https://bot.example/oauth/intervals/callback",
      ),
    ).resolves.toEqual({
      externalId: "2049151",
      accessToken: "bearer-token",
      refreshToken: "oauth",
      expiresAt: 0,
    });
  });
});

describe("intervalsAuthHeader", () => {
  it("uses Basic for API keys and Bearer for OAuth", () => {
    expect(
      intervalsAuthHeader({
        discordId: "u1",
        name: "Renzo",
        source: "intervals",
        externalId: "1",
        accessToken: "k",
        refreshToken: "api_key",
        expiresAt: 0,
      }),
    ).toBe(basicAuth("k"));
    expect(
      intervalsAuthHeader({
        discordId: "u1",
        name: "Renzo",
        source: "intervals",
        externalId: "1",
        accessToken: "tok",
        refreshToken: "oauth",
        expiresAt: 0,
      }),
    ).toBe("Bearer tok");
  });
});
