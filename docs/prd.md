# Finesse PRD

An AI fitness accountability bot that lives in the crew’s Discord. People log training where they already talk, keep a shared streak alive, and get asked to check on anyone who drifts.

## Jobs

Everything else serves these two:

1. A group records activities in one place, with as little friction as possible.
2. A community works toward a shared goal. Accountability is visibility, streaks, and light social pressure — not a solo grind.

Core social mechanic: when someone drifts, the bot asks the others to check in on them.

## Principle

Ship one layer at a time. Prove the crew shows up before adding anything clever. Do not build ahead of proof.

## Users

A small closed crew on one Discord server. v0 assumes a handful of people, not a public bot.

## Phases

Each version is shippable on its own.

### v0 — Core loop (now)

Manual check-ins, flat 3x/week, templated Sunday summary, fall-behind nudge. Answers: will the crew actually show up?

In:

- `/join` or first `/done` / ✅ opts a person in (lurkers do not count). `/join` and first check-in walk them through linking Intervals.icu (channel welcome + buttons). Until they link, Finesse keeps prompting (private on `/done` / `/status`, and a 10:00 DM or channel ping). They can snooze two days with **I'll use /done for now**.
- `/done [note]` or ✅ in one crew channel
- Individual and group streaks
- Sunday summary and “check on X” posts in that same channel

Out: avatars, karma, questionnaire, multiple channels.

### v1 — Honest streaks (in)

Daily poll of linked Intervals.icu accounts, plus Intervals webhooks when the OAuth app is approved. Watches (Garmin, Amazfit, Apple Watch, Strava) sync **into Intervals**; Finesse never talks to Strava. New members are not done at `/join` — they get a setup flow (account → watch on Intervals → private API key) until `source_accounts` has a row. A day counts once toward the 3× week target if Intervals has an activity or the person checked in manually. Every newly seen workout still pings the crew channel, with details first and the weekly count after. Intervals API keys work without an app. Instant Garmin/Amazfit pings need an Intervals OAuth app (free, apply at intervals.icu/oauth/apply); Strava-fed activities never fire those webhooks but still show up on the poll.

### v2 — Coach (in)

`/setup` stores level and goal. `/coach` replies ephemerally (only the asker sees it) so individual context never hits the group. Sunday report uses the LLM with the v0 template as fallback. Gemini is the first `LlmProvider`; swap with `LLM_PROVIDER`.

### v3 — Delight (optional)

Karma, generated avatars/logo, pokes, MyPlayer-style rating cards. Add only if the crew asks.

### v4 — Sleep and readiness (gated)

Needs Garmin Health API approval and/or an iOS HealthKit app. Amazfit has no path. Aggregators are too expensive at this size.

## v0 success

- Every opted-in member can log a session in under five seconds.
- The crew can see who is on track without leaving Discord.
- A new member can start Intervals setup from `/join` without pasting a key in chat.
- A missed week resets streaks honestly.
- Sunday and mid-week posts fire without anyone running a command.

## v0 rules (locked)

- Week: Monday 00:00 – Sunday 23:59 in `TZ` (default `Australia/Sydney`).
- Target: 3 check-ins per week, one per local calendar day.
- Repeat `/done` the same day updates the note; it does not double-count.
- Individual streak: consecutive weeks hitting 3.
- Group streak: consecutive weeks every opted-in member hit 3.
- Sunday 22:00: summary of the **current** week (after the 15-minute source pull).
- Monday 00:00: apply streak updates, roll the week. Catch up on boot if the bot was down.
- Thursday 19:00: nudge anyone with **0** this week.
- Saturday 19:00: nudge anyone with **fewer than 2**.
- 10:00: remind opted-in members who still have no Intervals.icu link (DM first; crew channel if DMs are closed). Skip if they snoozed.
- One Discord channel for check-ins, nudges, workout pings, and the Sunday summary.

## Later decisions

- Split channels (check-ins vs general vs weekly-report) if the one room gets noisy.
- Apple Watch without HealthFit or Strava has no Intervals path; `/done` covers it.
- Garmin unofficial APIs and paid aggregators are rejected (credentials, fragility, cost).
