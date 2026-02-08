# 🏠 Home Hub

Family command center dashboard deployed on **Vercel** with serverless API functions.

## Features

- **Weather Dashboard** — 6 APIs aggregated (Open-Meteo, Weather.gov, Weatherbit, Tomorrow.io, Visual Crossing, Pirate Weather) + RainViewer radar
- **AI Weather Interpreter** — GenAI summarizes multi-source data into a structured briefing
- **Weather Alerts** — NWS alerts with banner + popup notifications (quiet hours support)
- **Dog Treat Tracker** — Firebase RTDB calorie tracker with real-time sync
- **Chores** — Household task management via Supabase
- **Standby Mode** — Ambient display with clock, weather, and Immich photo collage
- **System Status** — Health check page for all backend services

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Static HTML + vanilla JS (SPA with hash routing) |
| Backend | Vercel Serverless Functions (`/api/*`) |
| Auth | Supabase Auth (Google OAuth) |
| Database | Supabase PostgreSQL with Row Level Security |
| Dog Data | Firebase Realtime Database |
| AI | GenAI Chat Completion API (MaaS_4.1) |

## Project Structure

```
/
├── public/              Static frontend (served by Vercel)
│   ├── index.html       Main SPA shell
│   ├── config.js        Client-side config (Supabase URL, Firebase, etc.)
│   └── assets/          JS modules
│       ├── app.js       Main orchestration
│       ├── router.js    SPA router (hash + pathname)
│       ├── supabase.js  Auth & DB helpers
│       ├── weather.js   Weather display
│       ├── ai.js        AI summary frontend
│       ├── treats.js    Dog treat tracker (Firebase)
│       ├── chores.js    Chores (Supabase)
│       ├── standby.js   Standby/ambient mode
│       ├── immich.js    Photo integration
│       ├── ui.js        Modals, toasts, alerts
│       └── utils.js     Shared utilities
├── api/                 Vercel Serverless Functions
│   ├── health.js        GET  /api/health
│   ├── weather-aggregate.js  GET  /api/weather-aggregate?lat=&lon=
│   ├── weather-alerts.js     GET  /api/weather-alerts?lat=&lon=
│   ├── weather-ai.js         POST /api/weather-ai
│   └── immich-album.js       GET  /api/immich-album
├── vercel.json          SPA routing + CORS headers
├── database-setup.sql   Supabase schema + RLS policies
├── SETUP.txt            Deployment instructions
└── README.md            This file
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Service health check |
| GET | `/api/weather-aggregate?lat=&lon=` | Multi-source weather data |
| GET | `/api/weather-alerts?lat=&lon=` | NWS active alerts |
| POST | `/api/weather-ai` | AI weather interpretation |
| GET | `/api/immich-album` | Immich photo URLs |

## Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

**Required:**
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anon/public key

**Weather (optional, adds more data sources):**
- `WEATHERBIT_KEY`
- `TOMORROW_KEY`
- `VISUAL_CROSSING_KEY`
- `PIRATE_WEATHER_KEY`

**Immich (optional):**
- `IMMICH_BASE_URL`
- `IMMICH_SHARED_ALBUM_TOKEN`
- `IMMICH_ALBUM_ID`

## Quick Start

1. Push this repo to GitHub
2. Import into Vercel (Framework: Other, Output: `public`)
3. Add environment variables
4. Set up Supabase (run `database-setup.sql`, enable Google auth)
5. Visit your Vercel URL and sign in

See `SETUP.txt` for detailed instructions.
