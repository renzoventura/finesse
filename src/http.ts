import { timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Config } from "./config.js";
import type { FinesseDb } from "./db.js";
import { oauthRedirectUri } from "./sources/create.js";
import { ingestSource } from "./sources/ingest.js";
import { intervalsAuthHeader } from "./sources/intervals.js";
import {
  applyIntervalsWebhook,
  type IntervalsWebhookBody,
} from "./sources/intervals-webhook.js";
import type { ActivitySource, SourceAccount } from "./sources/types.js";
import { addDays, mondayOf, toLocalDate } from "./streaks.js";

export type HttpHooks = {
  onAutoCheckin?: (message: string) => Promise<void>;
};

export function startHttpServer(
  db: FinesseDb,
  config: Config,
  sources: Record<string, ActivitySource>,
  hooks: HttpHooks = {},
): void {
  const app = new Hono();

  app.get("/health", (c) => c.text("ok"));

  app.get("/internal/member-workouts", async (c) => {
    if (!bearerMatches(config.token, c.req.header("authorization"))) {
      return c.text("unauthorized", 401);
    }
    const query = (c.req.query("q") ?? "").trim().toLowerCase();
    const oldest = c.req.query("oldest") ?? "2026-10-07";
    const newest = c.req.query("newest") ?? toLocalDate(new Date(), config.tz);
    const accounts = db.listSourceAccounts("intervals");
    const matched = accounts.filter((account) => {
      if (!query) {
        return true;
      }
      return (
        account.discordId.includes(query) ||
        account.name.toLowerCase().includes(query) ||
        account.externalId.toLowerCase().includes(query)
      );
    });
    const weekStart = mondayOf(toLocalDate(new Date(), config.tz));
    const claimed = [
      ...db.weekWorkouts(addDays(weekStart, -7)),
      ...db.weekWorkouts(weekStart),
    ];
    const members = [];
    for (const account of matched) {
      try {
        const activities = await listIntervalsActivities(
          account,
          oldest,
          newest,
        );
        members.push({
          discordId: account.discordId,
          name: account.name,
          athleteId: account.externalId,
          claimed: claimed
            .filter((row) => row.userId === account.discordId)
            .map((row) => ({ date: row.date, note: row.note })),
          activities,
        });
      } catch (error) {
        members.push({
          discordId: account.discordId,
          name: account.name,
          athleteId: account.externalId,
          error: error instanceof Error ? error.message : "intervals failed",
        });
      }
    }
    return c.json({ oldest, newest, members });
  });

  app.get("/webhooks/intervals", (c) => {
    if (!config.intervalsWebhookSecret) {
      return c.text("Intervals webhooks are not configured.", 404);
    }
    return c.text("ok");
  });

  app.post("/webhooks/intervals", async (c) => {
    if (!config.intervalsWebhookSecret) {
      return c.text("Intervals webhooks are not configured.", 404);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.text("invalid json", 400);
    }
    const result = await applyIntervalsWebhook(
      db,
      body as IntervalsWebhookBody,
      {
        expectedSecret: config.intervalsWebhookSecret,
        now: new Date(),
        timeZone: config.tz,
        weeklyTarget: config.weeklyTarget,
        fetch: globalThis.fetch,
      },
    );
    if (result.unauthorized) {
      return c.text("unauthorized", 401);
    }
    if (hooks.onAutoCheckin) {
      for (const notice of result.notices) {
        await hooks.onAutoCheckin(notice).catch((error: unknown) => {
          console.error("[webhook] notify", error);
        });
      }
    }
    console.log(
      `[webhook] intervals: ${result.notices.length} new workout(s), ${result.created} new day(s)`,
    );
    return c.text("ok", 200);
  });

  app.get("/oauth/:source/callback", async (c) => {
    const sourceId = c.req.param("source");
    const source = sources[sourceId];
    if (source?.auth !== "oauth" || !config.publicUrl) {
      return c.text("That data source is not configured.", 404);
    }
    const err = c.req.query("error");
    if (err) {
      return c.text(`Connect cancelled (${err}). You can close this tab.`, 400);
    }
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) {
      return c.text("Missing OAuth code or state.", 400);
    }
    const pending = db.takeOauthState(state);
    if (!pending || pending.source !== sourceId) {
      return c.text(
        "This connect link expired. Run /connect in Discord again.",
        400,
      );
    }
    try {
      const tokens = await source.exchangeCode(
        code,
        oauthRedirectUri(config.publicUrl, sourceId),
      );
      const user = db.getUser(pending.discordId);
      db.join(pending.discordId, user?.name ?? pending.discordId);
      db.upsertSourceAccount({
        discordId: pending.discordId,
        name: user?.name ?? pending.discordId,
        source: sourceId,
        ...tokens,
      });
      try {
        const ingest = await ingestSource(db, source, {
          now: new Date(),
          timeZone: config.tz,
          lookbackHours: config.lookbackHours,
          weeklyTarget: config.weeklyTarget,
        });
        if (hooks.onAutoCheckin) {
          for (const notice of ingest.notices) {
            await hooks.onAutoCheckin(notice).catch((error: unknown) => {
              console.error("[oauth] notify", error);
            });
          }
        }
      } catch (error) {
        console.error("[oauth] ingest", sourceId, error);
      }
      return c.text(
        `Connected ${sourceId}. You can close this tab and go back to Discord.`,
      );
    } catch (error) {
      console.error("[oauth]", sourceId, error);
      return c.text("Could not finish connecting. Try /connect again.", 500);
    }
  });

  serve({ fetch: app.fetch, port: config.port });
  console.log(`HTTP listening on :${config.port}`);
}

function bearerMatches(expected: string, header: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) {
    return false;
  }
  const got = Buffer.from(header.slice(7));
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}

async function listIntervalsActivities(
  account: SourceAccount,
  oldest: string,
  newest: string,
): Promise<
  Array<{
    id: string;
    type: string | null;
    name: string | null;
    start: string | null;
    movingTimeSec: number | null;
    distanceMeters: number | null;
  }>
> {
  const params = new URLSearchParams({ oldest, newest });
  const response = await fetch(
    `https://intervals.icu/api/v1/athlete/0/activities?${params}`,
    { headers: { Authorization: intervalsAuthHeader(account) } },
  );
  if (!response.ok) {
    throw new Error(`Intervals.icu activities ${response.status}`);
  }
  const activities = (await response.json()) as Array<{
    id?: string | number;
    type?: string;
    name?: string;
    start_date_local?: string;
    moving_time?: number;
    distance?: number;
    icu_distance?: number;
  }>;
  if (!Array.isArray(activities)) {
    return [];
  }
  return activities.map((activity) => ({
    id: activity.id === undefined ? "" : String(activity.id),
    type: activity.type ?? null,
    name: activity.name ?? null,
    start: activity.start_date_local ?? null,
    movingTimeSec: activity.moving_time ?? null,
    distanceMeters: activity.distance ?? activity.icu_distance ?? null,
  }));
}
