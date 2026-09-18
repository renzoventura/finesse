# Crew setup — link your watch so Discord pings when you train

You do **not** run the bot. About 10 minutes. Garmin, Apple Watch, Amazfit, and Strava all go through [Intervals.icu](https://intervals.icu/) first. Finesse only talks to Intervals.

Never paste your API key in the Discord channel. `/join`, `/connect`, or the **Link Intervals.icu** button opens a private popup.

## Paste this in Discord

```
Crew setup (auto check-in)

1. Make a free Intervals.icu account: https://intervals.icu/signup
2. Connect your watch at https://intervals.icu/settings
   • Garmin → Garmin Connect, tick download activities
   • Amazfit → Amazfit / Zepp, tick download workouts (same Zepp account as the phone app)
   • Strava (or Apple Watch via Strava) → Strava, tick download activities
   • Apple Watch without Strava → HealthFit app → Intervals.icu, auto-upload workouts
3. Confirm a recent session is on your Intervals calendar
4. Settings → Developer Settings → copy API key
5. In this channel: `/join` or `/connect`, or tap **Link Intervals.icu** — paste the key in the popup (not in chat)
6. Next workout should ping here within ~15 minutes. If it never syncs: /done
```

## Step by step

### 1. Account

Open [intervals.icu/signup](https://intervals.icu/signup). Email is fine. You can also start with Garmin or Strava during signup — then still do step 2 so downloads are on.

### 2. Connect the watch (pick yours)

Open [Settings → Connections](https://intervals.icu/settings).

**Garmin**  
Garmin Connect box → authorize → tick **download activities** (and wellness if you want). You should see **Disconnect** plus recent workouts on the calendar, not wellness-only.

**Amazfit**  
Amazfit / Zepp box → authorize with the **same** Zepp login as the phone app (Apple-login vs email often looks like two accounts). Tick **download workouts**. Sync the watch in Zepp first.

**Strava**  
Strava box → authorize → tick **download activities**. Use this if Strava is where the workouts already live (including Apple Watch → Strava). If Garmin is already connected as the original source, turn **off** Strava activity download so you do not get duplicates.

**Apple Watch**  
Intervals has no native Apple Watch login.

- Easiest if you already post to Strava: Apple Watch → Strava → Intervals Strava box (above).
- Direct: buy [HealthFit](https://apps.apple.com/us/app/healthfit/id1202650514), grant Health, pick Intervals.icu, turn on automatic workout upload.

If nothing ever appears on the Intervals calendar, Discord cannot see it. Use `/done` for that session.

### 3. Copy the API key

[Settings → Developer Settings](https://intervals.icu/settings). Copy **API key**. This is a password. Do not screenshot it into the crew chat.

### 4. Discord

In the crew channel:

1. `/join` if you have not already
2. `/connect`
3. Paste the key in the **popup**, submit

Finesse will pull recent Intervals activities and ping the channel for ones it has not posted yet. After that, new sessions show up within about 15 minutes (faster later if Intervals webhooks are on for Garmin).

### 5. Check it worked

- Intervals calendar has the workout
- Crew channel got a ping like: `just worked out: **Run — Easy · 5.2 km · 32 min**` then `**1/3** this week`

Same activity will not ping twice. A second session the same day still pings; it does not become 2/3 until a new calendar day.

Indoor / forgot the watch / sync never arrived: `/done` in the crew channel, or react ✅.

## Privacy

The bot stores your Intervals athlete id and API key on the host so it can read whether you trained. It does not post the key. Disconnect by regenerating the key in Intervals Developer Settings and ignoring `/connect`, or ask whoever runs the bot to unlink you.
