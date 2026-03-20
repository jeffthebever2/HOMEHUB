# 🏠 HomeHub

A family kiosk dashboard deployed on Vercel. Displays weather, chores, calendar, grocery list, dog tracker, photos, and radio — all behind a Supabase-backed login.

---

## Quick start

```bash
npm install
vercel dev          # local dev at http://localhost:3000
vercel --prod       # deploy
```

---

## Environment variables (set in Vercel Dashboard → Settings → Environment Variables)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Used by cron jobs and the manual chore reset endpoint |
| `HOMEHUB_TZ` | ✅ | Timezone for cron (e.g. `America/New_York`) |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | Cloudflare account ID — Dashboard → Workers & Pages → Account ID |
| `CLOUDFLARE_AI_TOKEN` | ✅ | Cloudflare API token with "Workers AI" permission |
| `TOMORROW_KEY` | optional | Tomorrow.io API key (Tier-2 weather enrichment) |
| `VISUAL_CROSSING_KEY` | optional | Visual Crossing key (Tier-2 weather enrichment) |

Weather core (Open-Meteo, Weather.gov, RainViewer) is **free with no API key**.

> **Google Photos removed (March 2025):** Google shut down the Library API's
> read/browse access for normal user albums on March 31, 2025. The
> `photoslibrary.readonly` scope and `albums.list` / `mediaItems.search`
> endpoints return 403 for existing user libraries. HomeHub now uses
> **Imgur** (public album, zero config) and **Immich** (local NAS) for
> photo slideshows. Set your preferred source in Settings → Photos.
> The `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, and `GOOGLE_AI_KEY`
> variables are no longer needed and can be removed from Vercel.

---

## Frontend config

Edit `public/config.js` before deploying:

```js
window.HOME_HUB_CONFIG = {
  householdDisplayName: 'Your Family',
  familyMembers: ['...'],
  supabaseUrl:     'https://xxx.supabase.co',
  supabaseAnonKey: 'eyJ...',
  defaultLocation: { name: 'Your City', lat: 00.0, lon: -00.0 },
  // Firebase is for the dog treat tracker — update if you use your own project
  firebase: { ... }
};
```

---

## Database setup

See **`database-setup.md`** for full schema + Supabase SQL to run.

Individual migration files (run in order if starting fresh):

1. `migration-add-chore-columns.sql`
2. `migration-add-grocery-requested-by.sql`
3. `migration-add-household-last-chore-reset.sql`
4. `migration-site-control.sql`
5. `supabase-migration-photo-provider.sql`

---

## Architecture

```
Vercel (static + serverless)
├── public/           ← SPA (vanilla JS, Tailwind CDN)
│   ├── index.html
│   ├── config.js     ← edit before deploy
│   └── assets/       ← one JS module per feature
└── api/              ← Vercel serverless functions
    ├── weather-aggregate.js   ← tiered weather fetch
    ├── weather-alerts.js
    ├── weather-ai.js
    ├── health.js
    ├── google-photos.js
    ├── immich-album.js
    ├── supabase-check.js
    ├── cron-chores-reset.js   ← Vercel Cron, fires 04:00+05:00 UTC
    └── chores-reset-my-household.js
```

---

## Weather stack

**Tier 1 — always fetched (free, no key needed)**
- Open-Meteo — current, hourly, daily, 15-min forecast
- Weather.gov — NWS text forecasts + active alerts
- RainViewer — animated radar

**Tier 2 — only if API key is set**
- Tomorrow.io
- Visual Crossing

---

## Cron job

`/api/cron-chores-reset` fires at `0 4,5 * * *` UTC.
This covers both Eastern Standard Time (UTC-5 → 11 PM ET fires at 4 AM UTC) and
Eastern Daylight Time (UTC-4 → midnight ET fires at 4 AM UTC). The handler is
idempotent — it stamps `last_chore_reset_date` per household so only one of the
two runs does real work each day.

---

## Admin panel

Access by clicking the HomeHub title 7 times. See `docs/admin-panel.md` for full feature docs.

