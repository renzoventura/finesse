import { timingSafeEqual } from "node:crypto";
import type { FinesseDb } from "../db.js";
import { toLocalDate } from "../streaks.js";
import { applyPulledWorkout } from "./ingest.js";
import {
  canonicalAthleteId,
  hydrateIntervalsActivity,
  type IntervalsActivity,
  sessionFromIntervalsActivity,
} from "./intervals.js";
import type { SourceAccount } from "./types.js";

const ACTIVITY_EVENTS = new Set(["ACTIVITY_UPLOADED", "ACTIVITY_ANALYZED"]);

export type IntervalsWebhookEvent = {
  athlete_id?: string | number;
  type?: string;
  activity?: IntervalsActivity;
};

export type IntervalsWebhookBody = {
  secret?: string;
  events?: IntervalsWebhookEvent[];
};

export type WebhookApplyResult = {
  ok: boolean;
  unauthorized: boolean;
  created: number;
  notices: string[];
};

export function webhookSecretsMatch(
  expected: string,
  received: string | undefined,
): boolean {
  if (!received) {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function matchIntervalsAccount(
  accounts: SourceAccount[],
  athleteId: string,
): SourceAccount | undefined {
  const want = canonicalAthleteId(athleteId);
  return accounts.find(
    (account) => canonicalAthleteId(account.externalId) === want,
  );
}

export async function applyIntervalsWebhook(
  db: FinesseDb,
  body: IntervalsWebhookBody,
  opts: {
    expectedSecret: string;
    now: Date;
    timeZone: string;
    weeklyTarget: number;
    fetch?: typeof fetch;
  },
): Promise<WebhookApplyResult> {
  if (!webhookSecretsMatch(opts.expectedSecret, body.secret)) {
    return { ok: false, unauthorized: true, created: 0, notices: [] };
  }

  const accounts = db.listSourceAccounts("intervals");
  const today = toLocalDate(opts.now, opts.timeZone);
  const events = Array.isArray(body.events) ? body.events : [];
  let created = 0;
  const notices: string[] = [];

  for (const event of events) {
    if (!event.type || !ACTIVITY_EVENTS.has(event.type)) {
      continue;
    }
    if (event.athlete_id === undefined || event.athlete_id === null) {
      continue;
    }
    const account = matchIntervalsAccount(accounts, String(event.athlete_id));
    if (!account) {
      continue;
    }
    const activity = event.activity
      ? opts.fetch
        ? await hydrateIntervalsActivity(opts.fetch, account, event.activity)
        : event.activity
      : null;
    const session = activity
      ? sessionFromIntervalsActivity(activity, opts.timeZone)
      : null;
    if (!session) {
      continue;
    }
    const applied = applyPulledWorkout(db, {
      discordId: account.discordId,
      name: account.name,
      source: "intervals",
      session,
      now: opts.now,
      timeZone: opts.timeZone,
      weeklyTarget: opts.weeklyTarget,
      today,
    });
    if (applied.checkinCreated) {
      created += 1;
    }
    if (applied.notice) {
      notices.push(applied.notice);
    }
  }

  return { ok: true, unauthorized: false, created, notices };
}
