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

## Supabase setup

HomeHub uses two different Supabase credential surfaces:

- `public/config.js` is browser-visible and must only contain browser-safe values.
- `.env` locally and Vercel Project Settings -> Environment Variables hold server-only secrets.

### `public/config.js`

Paste these browser-safe values into [`public/config.js`](./public/config.js):

- `supabaseUrl`
- `supabaseAnonKey`
- `apiBase`

For same-origin local dev and Vercel deployments, keep `apiBase` as an empty string.

Safe for browser use:

- `supabaseUrl`
- `supabaseAnonKey`

Never put this in `public/config.js`:

- `SUPABASE_SERVICE_ROLE_KEY`

### Local `.env`

Copy [`.env.example`](./.env.example) to `.env` and set:

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional but supported:

- `SUPABASE_ANON_KEY`
- `ADMIN_TOKEN`
- provider-specific integration variables from `.env.example`

`SUPABASE_URL` in `.env` should match `supabaseUrl` in `public/config.js`.

### Vercel environment variables

Set these in Vercel Project Settings -> Environment Variables:

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `SUPABASE_ANON_KEY`
- `ADMIN_TOKEN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `FIREBASE_DATABASE_URL`
- any provider or household overrides from `.env.example`

### Startup steps

1. Copy `.env.example` to `.env`.
2. Paste your Supabase project URL into `.env` as `SUPABASE_URL`.
3. Paste your Supabase service role key into `.env` as `SUPABASE_SERVICE_ROLE_KEY`.
4. Open [`public/config.js`](./public/config.js) and paste the same project URL into `supabaseUrl`.
5. Paste your Supabase anon/public key into `public/config.js` as `supabaseAnonKey`.
6. Run `npm run verify`.
7. Run `npm run dev`.

### Deploy steps

1. Deploy the repo root to Vercel with Framework Preset set to `Other`.
2. Keep `public/config.js` checked in or updated with the production `supabaseUrl` and `supabaseAnonKey`.
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel Project Settings -> Environment Variables.
4. Add any optional integration env vars needed for your deployment.
5. Deploy.
6. Run `HOMEHUB_BASE_URL=https://your-deployment-url npm run smoke` after deploy if you want a live contract check.

## Local Development

1. Complete the steps in [Supabase setup](#supabase-setup).
2. Run `npm run verify`.
3. Run `npm run dev` to start `vercel dev` from the repo root.
4. Sign in with Google through Supabase.

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
- Output Directory: leave blank
- Install Command: default is fine
- Node.js: any supported Vercel Node runtime that satisfies `package.json` (`>=20`)

### Browser-Safe Frontend Config

This project is a static frontend plus native `api/*.js` Vercel Functions. The frontend reads its browser-safe Supabase config from `public/config.js`, so confirm these values before deploying:

- `supabaseUrl`
- `supabaseAnonKey`
- `apiBase`

For same-origin Vercel deployment, keep `apiBase` empty.

`SUPABASE_SERVICE_ROLE_KEY` must never go in `public/config.js`.

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
