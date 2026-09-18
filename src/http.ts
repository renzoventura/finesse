import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Config } from "./config.js";
import type { FinesseDb } from "./db.js";
import { oauthRedirectUri } from "./sources/create.js";
import { ingestSource } from "./sources/ingest.js";
import {
  applyIntervalsWebhook,
  type IntervalsWebhookBody,
} from "./sources/intervals-webhook.js";
import type { ActivitySource } from "./sources/types.js";

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
    const result = applyIntervalsWebhook(db, body as IntervalsWebhookBody, {
      expectedSecret: config.intervalsWebhookSecret,
      now: new Date(),
      timeZone: config.tz,
      weeklyTarget: config.weeklyTarget,
    });
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
