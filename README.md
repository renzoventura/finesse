# Finesse

A Discord bot that keeps a training crew honest. Log a session with `/done` or ✅, keep a shared streak alive, and get nudged to check on anyone who falls behind.

v0 is the core loop only: counters, streaks, a Sunday summary, and a mid-week nudge. No AI, no Strava.

Product: [docs/prd.md](docs/prd.md). How it is built: [docs/architecture.md](docs/architecture.md).

## You set this up

The repo is the bot. Discord and hosting accounts have to come from you.

### 1. Node.js

LTS 22.12+ (24 is fine). `node -v`. This repo has `.nvmrc`; if you use nvm: `nvm use`.

### 2. Discord application

1. [Discord Developer Portal](https://discord.com/developers/applications) → New Application → **Finesse**.
2. Bot → Add Bot → Reset Token → `DISCORD_TOKEN`.
3. General Information → Application ID → `DISCORD_CLIENT_ID`.
4. Privileged Gateway Intents: leave them **off**.
5. OAuth2 → URL Generator:
   - Scopes: `bot`, `applications.commands`
   - Permissions: View Channel, Send Messages, Read Message History, Add Reactions, Use Application Commands
6. Open the generated URL, invite the bot into the crew server.

Invite URL if you prefer to paste `CLIENT_ID` yourself:

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=2147546320&scope=bot%20applications.commands
```

### 3. Server IDs

Discord Settings → Advanced → Developer Mode. Then copy IDs:

| Copy from | Env |
|---|---|
| Server (right-click the server name) | `DISCORD_GUILD_ID` |
| The one crew channel | `CHANNEL_ID` |

Use an existing channel or create one (e.g. `#finesse`). Check-ins, nudges, and the Sunday summary all live there.

### 4. Env file

```bash
cp .env.example .env
```

Paste the token and IDs. Never commit `.env`.

### 5. Run locally

```bash
pnpm install
pnpm test
pnpm dev
```

In the crew channel: `/join`, `/done chest day`, or react ✅ on a message. `/status` anywhere in the server.

Cron does not fire if this laptop sleeps. Use Railway for the real crew.

### 6. Railway (always-on)

1. New project from [github.com/renzoventura/finesse](https://github.com/renzoventura/finesse).
2. Set the same env vars as `.env`.
3. Attach a volume, mount path `/data`.
4. Set `DATABASE_PATH=/data/finesse.sqlite`.
5. One replica only.

Without the volume, every deploy wipes streaks. The Dockerfile is there so `better-sqlite3` builds on Linux.

## Commands

- `/join` — opt into the weekly crew
- `/done [note]` — log today (in the crew channel)
- `/status` — this week and streaks

✅ on a message in the crew channel logs a check-in for whoever reacted.

## Schedule (`Australia/Sydney` unless `TZ` is set)

- Thu 19:00 — check on anyone with 0 this week
- Sat 19:00 — check on anyone with fewer than 2
- Sun 20:00 — weekly summary
- Mon 00:00 — streak roll

Post immediately (needs a running bot, or `--dry` to print only):

```bash
pnpm post:summary
pnpm post:nudge
pnpm post:nudge -- --below 1
```

## Scripts

```bash
pnpm test      # streak and db tests
pnpm lint      # Biome
pnpm build     # dist/ for Docker
```
