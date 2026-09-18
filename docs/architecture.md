# Finesse architecture

v0 is one always-on Node process: Discord gateway + in-process cron + one SQLite file.

## Stack by version

- **v0:** TypeScript, Node.js LTS, discord.js v14, better-sqlite3, node-cron, pnpm, tsx, Biome.
- **v1:** Hono (or similar) for Strava OAuth redirect; Strava REST; refresh tokens in SQLite.
- **v2:** `@google/genai`, Gemini Flash-Lite.
- **v3:** same AI Studio key for image gen.
- **v4:** provider-gated wearable APIs; not designed yet.

No Drizzle in v0. Three tables, prepared statements. Hono is not needed until OAuth.

## v0 process

```
Member  -- /done or ✅ -->  SQLite
node-cron  -- Monday reset -->  SQLite
node-cron  -- Sun summary, Thu/Sat nudge -->  one crew channel
```

Slash commands are registered per guild (`DISCORD_GUILD_ID`) so they appear immediately.

Intents: `Guilds`, `GuildMessages`, `GuildMessageReactions`. Partials: `Message`, `Channel`, `Reaction`, `User` (uncached ✅). No privileged intents.

## Data model

**users**

- `discord_id` text primary key
- `name` text (last seen display name)
- `current_streak` integer
- `opted_in` integer (1 after `/join` or first check-in)

**checkins**

- `id` integer primary key
- `user_id` text references users
- `ts` text ISO timestamp
- `checkin_date` text `YYYY-MM-DD` in `TZ`
- `note` text nullable
- unique `(user_id, checkin_date)`

**group_state** (singleton `id = 1`)

- `group_streak` integer
- `week_start` text Monday `YYYY-MM-DD`

Calendar math uses the local date string, not UTC midnight. Week window is `week_start` inclusive to `week_start + 7 days` exclusive.

## Streak roll

On Monday (and on boot if `week_start + 7 days <= today`):

1. For each opted-in user, count check-ins in the closed week.
2. Streak becomes `current + 1` if count ≥ 3, else `0`.
3. Group streak becomes `group + 1` if every opted-in user hit 3, else `0`.
4. `week_start` advances seven days. Repeat if the bot missed multiple Mondays.

If nobody is opted in, group streak is `0`.

## Hosting

SQLite must sit on a persistent volume. Railway’s container disk is wiped on deploy.

- Local: `DATABASE_PATH=./data/finesse.sqlite`
- Railway: volume mount `/data`, `DATABASE_PATH=/data/finesse.sqlite`, **one replica**
- Image: `Dockerfile` compiles `better-sqlite3` on Linux (do not copy macOS `node_modules`)

Cron only runs while the process is up. A sleeping laptop will miss Sunday.

## Env

See `.env.example`. One `CHANNEL_ID` for check-ins, nudges, and the Sunday post. `TZ` defaults to `Australia/Sydney`. `WEEKLY_TARGET` defaults to 3.

## v1+ appendix

**Strava (chosen for v1).** One OAuth integration covers Garmin, Apple Watch (Strava app), and Amazfit outdoor via Zepp. Daily poll at end of day with ≥24h lookback. Manual `/done` remains the fallback (Amazfit indoor, forgotten watches). New Strava apps start in single-athlete mode; confirm 2026 API subscription rules.

**Not used.** Strava MCP (read-only chat, not detection). Official Garmin Health API (partner-gated; revisit in v4). Unofficial Garmin scrapers (passwords, broke under bot-blocking). HealthKit (needs an iOS app). Amazfit has no developer API. Paid aggregators (Terra, ROOK, Vital, Spike) are company-priced. Open Wearables still needs underlying provider approvals.

**v2.** Personal coaching stays in DMs so individual context never hits the group channel. Weekly report can keep the v0 template as a fallback if Gemini is down.
