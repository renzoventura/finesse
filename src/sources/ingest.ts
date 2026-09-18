import type { FinesseDb } from "../db.js";
import { toLocalDate } from "../streaks.js";
import { autoCheckinNotice } from "../templates.js";
import type { ActivitySource, PulledSession } from "./types.js";

export type IngestOpts = {
  now: Date;
  timeZone: string;
  lookbackHours: number;
  weeklyTarget: number;
};

export type IngestResult = {
  created: number;
  users: number;
  notices: string[];
};

export function applyPulledWorkout(
  db: FinesseDb,
  input: {
    discordId: string;
    name: string;
    source: string;
    session: PulledSession;
    now: Date;
    timeZone: string;
    weeklyTarget: number;
    today: string;
  },
): { checkinCreated: boolean; notice: string | null } {
  if (input.session.date > input.today) {
    return { checkinCreated: false, notice: null };
  }
  const claimed = input.session.externalId
    ? db.claimSourceWorkout({
        source: input.source,
        externalId: input.session.externalId,
        userId: input.discordId,
        date: input.session.date,
        note: input.session.note,
      })
    : false;
  const result = db.recordCheckin(
    input.discordId,
    input.name,
    input.session.note,
    {
      now: input.now,
      timeZone: input.timeZone,
      source: input.source,
      date: input.session.date,
    },
  );
  const isNewWorkout = input.session.externalId ? claimed : result.created;
  if (!isNewWorkout) {
    return { checkinCreated: result.created, notice: null };
  }
  const profile = db.getUser(input.discordId);
  return {
    checkinCreated: result.created,
    notice: autoCheckinNotice({
      discordId: input.discordId,
      note: input.session.note,
      checkins: result.checkinsThisWeek,
      weeklyTarget: profile?.weeklyTarget ?? input.weeklyTarget,
    }),
  };
}

export async function ingestSource(
  db: FinesseDb,
  source: ActivitySource,
  opts: IngestOpts,
): Promise<IngestResult> {
  const accounts = db.listSourceAccounts(source.id);
  const today = toLocalDate(opts.now, opts.timeZone);
  const after = new Date(
    opts.now.getTime() - opts.lookbackHours * 60 * 60 * 1000,
  );
  let created = 0;
  const notices: string[] = [];

  for (let account of accounts) {
    if (
      account.expiresAt > 0 &&
      account.expiresAt * 1000 < Date.now() + 5 * 60 * 1000
    ) {
      account = await source.refresh(account);
      db.upsertSourceAccount(account);
    }

    try {
      const sessions = await source.pull(account, { after }, opts.timeZone);
      for (const session of sessions) {
        const applied = applyPulledWorkout(db, {
          discordId: account.discordId,
          name: account.name,
          source: source.id,
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
    } catch (error) {
      console.error(`[ingest] ${source.id} ${account.discordId}`, error);
    }
  }

  return { created, users: accounts.length, notices };
}

export async function ingestAllSources(
  db: FinesseDb,
  sources: Record<string, ActivitySource>,
  opts: IngestOpts,
): Promise<IngestResult> {
  let created = 0;
  let users = 0;
  const notices: string[] = [];
  for (const source of Object.values(sources)) {
    const result = await ingestSource(db, source, opts);
    created += result.created;
    users += result.users;
    notices.push(...result.notices);
    console.log(
      `[ingest] ${source.id}: ${result.notices.length} new workout(s), ${result.created} new day(s) from ${result.users} accounts`,
    );
  }
  return { created, users, notices };
}
