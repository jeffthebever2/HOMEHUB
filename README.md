# HomeHub

HomeHub is a mounted household dashboard and kiosk app for one shared home surface.

It has four experience layers:

- `Home`: the summary dashboard
- `Domain pages`: deeper Weather, Alerts, Household, Media, Photos, and Settings views
- `Admin`: protected diagnostics, mock scenarios, and maintenance actions
- `Standby`: a photo-first ambient mode with a shared alert override

## Architecture

HomeHub ships with `6 business domains`, `1 internal integration`, and `2 aggregate read models`.

- `Environment`: weather + alerts
- `Household`: chores + treat tracker
- `Media`: music + radio state
- `Photos`: slideshow source selection and queue
- `Settings`: configuration + integration state
- `Admin`: diagnostics and guarded operations
- `Agenda`: internal calendar helper only
- `Dashboard`: aggregate read model for Home
- `Standby`: lightweight aggregate read model for kiosk mode

## Deployed API Surface

HomeHub is intentionally capped at `8` serverless endpoints to stay well inside the Vercel Hobby limit of `12`.

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/dashboard` | `GET` | Home summary aggregate |
| `/api/environment` | `GET` | Weather + alerts |
| `/api/household` | `GET, POST` | Chores + treat tracker |
| `/api/media` | `GET, POST` | Music + radio state |
| `/api/photos` | `GET` | Photo queue and source fallback |
| `/api/settings` | `GET, POST` | Config + integration state |
| `/api/standby` | `GET` | Lightweight kiosk payload |
| `/api/admin` | `GET, POST` | Admin diagnostics and actions |

Do not add route-per-card, route-per-provider, or mock-only endpoints.

## Frontend Structure

The frontend stays intentionally simple:

- HTML shell in [`public/index.html`](./public/index.html)
- shared runtime in [`public/assets/core`](./public/assets/core)
- shared UI system in [`public/assets/ui`](./public/assets/ui)
- domain page modules in [`public/assets/domains`](./public/assets/domains)

The UI is built from one shell, one token system, one status language, and one page-template vocabulary.

## Repo Layout

```text
api/                  deployed API routes
docs/                 architecture, contracts, operations, and contributor docs
lib/server/           shared backend services, config, integrations, cache helpers
public/               shell HTML, static assets, fallback photos
scripts/              repo guardrails and verification helpers
```

## Local Development

1. Confirm the browser-safe Supabase values in `public/config.js`.
2. Copy `.env.example` to `.env` and fill in the server variables you need for your setup.
3. Run `npm run verify`.
4. Run `npm run dev` to start `vercel dev` from the repo root.
5. Sign in with Google through Supabase.

Recommended preflight checks:

```bash
npm run verify
```

If you have a local dev server running, you can also run:

```bash
HOMEHUB_BASE_URL=http://localhost:3000 npm run smoke
```

## Vercel Deployment

Deploy this repo from the repository root. Do not point Vercel at `public/`.

### Project Settings

- Framework Preset: `Other`
- Root Directory: repo root
- Build Command: leave blank
- Output Directory: leave blank in the dashboard; `vercel.json` pins it to `public`
- Install Command: default is fine
- Node.js: any supported Vercel Node runtime that satisfies `package.json` (`>=20`)

### Browser-Safe Frontend Config

This project is a static frontend plus native `api/*.js` Vercel Functions. The frontend reads its browser-safe Supabase config from `public/config.js`, so confirm these values before deploying:

- `supabaseUrl`
- `supabaseAnonKey`
- `apiBase`

For same-origin Vercel deployment, keep `apiBase` empty.

### Server Environment Variables

Set these in Vercel Project Settings -> Environment Variables.

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Recommended for production:

- `SUPABASE_ANON_KEY`
- `ADMIN_TOKEN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `FIREBASE_DATABASE_URL`

Optional provider and household overrides:

- `GOOGLE_PHOTOS_ALBUM_ID`
- `IMGUR_ALBUM_ID`
- `IMGUR_CLIENT_ID`
- `IMMICH_BASE_URL`
- `IMMICH_ALBUM_ID`
- `IMMICH_SHARED_ALBUM_TOKEN`
- `SPOTIFY_EMBED_URL`
- `HOMEHUB_HOUSEHOLD_NAME`
- `HOMEHUB_LOCATION_NAME`
- `HOMEHUB_LAT`
- `HOMEHUB_LON`
- `HOMEHUB_TZ`
- `HOMEHUB_STANDBY_TIMEOUT_MIN`
- `HOMEHUB_QUIET_HOURS_START`
- `HOMEHUB_QUIET_HOURS_END`
- `HOMEHUB_MINIMAL_NIGHT_MODE`
- `HOMEHUB_FAMILY_MEMBERS`
- `HOMEHUB_TREAT_PET_NAME`
- `HOMEHUB_TREAT_PET_EMOJI`
- `HOMEHUB_TREAT_DAILY_LIMIT`

Local smoke-test only:

- `HOMEHUB_BASE_URL`
- `HOMEHUB_BEARER_TOKEN`
- `HOMEHUB_ADMIN_TOKEN`

The complete variable list lives in `.env.example`.

## Vercel Deployment Checklist

- Deploy from the repo root.
- Keep the Framework Preset set to `Other`.
- Leave the Build Command blank.
- Confirm `public/config.js` points at the correct Supabase project and leaves `apiBase` empty.
- Set the required Vercel environment variables.
- Run `npm run verify` before shipping.
- Optionally run `HOMEHUB_BASE_URL=https://your-deployment-url npm run smoke` after deployment.

## Key Rules

- Settings is the only config source of truth after login.
- Dashboard and Standby reuse shared domain summaries; they do not fetch provider-specific data themselves.
- Admin/test behavior stays isolated behind admin auth and visible `isMock` markers.
- No client-side provider fetches belong in page modules.
- No internal server logic should call another HomeHub API route over HTTP.

## Docs

- [Architecture Overview](./docs/architecture-overview.md)
- [Domains and Data](./docs/domains-and-data.md)
- [Endpoints and Contracts](./docs/endpoints-and-contracts.md)
- [Frontend System](./docs/frontend-system.md)
- [Config and Integrations](./docs/config-and-integrations.md)
- [Admin and Operations](./docs/admin-and-operations.md)
- [Deployment and Hobby Limit](./docs/deployment-and-hobby-limit.md)
- [Testing and Quality](./docs/testing-and-quality.md)
- [Data Migrations](./docs/data-migrations.md)
- [Contributing](./docs/contributing.md)
