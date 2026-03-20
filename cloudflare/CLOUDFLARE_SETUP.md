# HomeHub — Cloudflare Infrastructure Setup

This guide provisions the full Cloudflare stack for HomeHub:

| Service | Purpose |
|---------|---------|
| **R2** | Photo/media object storage (standby slideshow) |
| **D1** | Photo metadata, event logs, play history |
| **KV** | Cache, feature flags, last-known-good state |
| **Workers** | Upload/list/serve photo API |
| **Queues** | Background jobs (thumbnails, cache purge) |
| **Cron Triggers** | Daily maintenance, hourly flag refresh |
| **WAF + Turnstile** | Upload form protection, rate limiting |

---

## Prerequisites

1. Cloudflare account (free tier is enough to start)
2. Node.js 18+
3. Wrangler CLI: `npm install -g wrangler`
4. Authenticated: `npx wrangler login`

---

## Step 1 — Create R2 Bucket

```bash
npx wrangler r2 bucket create homehub-media
# Optional: create a dev bucket
npx wrangler r2 bucket create homehub-media-dev
```

If you want a public URL for photos (so the browser can load images directly):

```bash
npx wrangler r2 bucket create homehub-media
# In Cloudflare Dashboard → R2 → homehub-media → Settings → Public Access → Enable
# Note the public URL: https://pub-<hash>.r2.dev
```

> If R2 bucket is **private** (default), photos are served through the Worker at `/media/photos/<key>`.
> If R2 bucket is **public**, you can reference photos directly by URL — faster, cheaper.

---

## Step 2 — Create D1 Database

```bash
npx wrangler d1 create homehub
# Copy the database_id from the output — you'll need it for wrangler.toml
```

Apply migrations:

```bash
npx wrangler d1 migrations apply homehub
```

List databases to verify:

```bash
npx wrangler d1 list
```

---

## Step 3 — Create KV Namespaces

```bash
# Main cache namespace
npx wrangler kv namespace create CACHE
# Copy the id from output → paste into wrangler.toml [[kv_namespaces]] id for CACHE binding

# Feature flags namespace
npx wrangler kv namespace create FLAGS
# Copy the id → paste into wrangler.toml [[kv_namespaces]] id for FLAGS binding
```

---

## Step 4 — Create Queue

```bash
npx wrangler queues create homehub-jobs
# Dead-letter queue for failed jobs
npx wrangler queues create homehub-jobs-dlq
```

---

## Step 5 — Update wrangler.toml

Open `cloudflare/wrangler.toml` and fill in the IDs you collected:

```toml
[[d1_databases]]
database_id = "PASTE_D1_ID_HERE"

[[kv_namespaces]]          # CACHE binding
id = "PASTE_CACHE_KV_ID_HERE"

[[kv_namespaces]]          # FLAGS binding
id = "PASTE_FLAGS_KV_ID_HERE"

[vars]
ALLOWED_ORIGIN = "https://your-vercel-app.vercel.app"
```

---

## Step 6 — Set Secrets

Secrets are **never** in wrangler.toml or source code. Set them with:

```bash
# Required: token to authorize uploads (generate any strong random string)
npx wrangler secret put UPLOAD_TOKEN
# Paste a strong random value, e.g.: openssl rand -hex 32

# Optional: Cloudflare Turnstile secret key (for upload form protection)
npx wrangler secret put TURNSTILE_SECRET
# Get from: Cloudflare Dashboard → Turnstile → Your Site → Secret Key
```

---

## Step 7 — Deploy the Worker

```bash
cd cloudflare
npm install
npx wrangler deploy
```

The Worker will deploy to:
`https://homehub-media.<your-subdomain>.workers.dev`

Test it:
```bash
curl https://homehub-media.<subdomain>.workers.dev/health
```

---

## Step 8 — Configure Turnstile (WAF Protection)

1. Go to Cloudflare Dashboard → **Turnstile** → **Add Site**
2. Set the hostname to your Vercel domain (e.g. `homehub.vercel.app`)
3. Copy the **Site Key** (public) and **Secret Key** (private)
4. Site Key goes in `public/config.js` → `cloudflare.turnstileSiteKey`
5. Secret Key: `npx wrangler secret put TURNSTILE_SECRET`

Turnstile is used to protect the `/media/upload` endpoint from bots.
The upload form renders a Turnstile widget and passes its token in the `CF-Turnstile-Token` header.

---

## Step 9 — Set Up WAF Rules (optional)

In Cloudflare Dashboard → **Security** → **WAF** → **Custom Rules**:

```
# Block requests without the upload token on upload endpoint
(http.request.uri.path eq "/media/upload" and not http.request.headers["x-upload-token"][0] eq "$UPLOAD_TOKEN")
→ Action: Block
```

For general protection, the free WAF managed ruleset is sufficient.

---

## Step 10 — Update HomeHub config.js

```js
cloudflare: {
  workerUrl:        'https://homehub-media.<subdomain>.workers.dev',
  photoAlbum:       'default',      // R2 album prefix
  turnstileSiteKey: 'YOUR_SITE_KEY', // from Turnstile dashboard
},
```

Then in **Settings → Photos**, select **Cloudflare** as your photo source.

---

## Step 11 — Upload Photos

Using wrangler (bulk upload):

```bash
# Upload a directory of photos
for f in ~/Photos/*.jpg; do
  npx wrangler r2 object put "homehub-media/photos/$(basename $f)" --file "$f"
done
```

Using the Worker API (single upload from curl):

```bash
curl -X POST https://homehub-media.<subdomain>.workers.dev/media/upload \
  -H "X-Upload-Token: YOUR_UPLOAD_TOKEN" \
  -H "Content-Type: image/jpeg" \
  -H "X-Filename: photo.jpg" \
  --data-binary @photo.jpg
```

---

## Environment Variable Summary

### Vercel env vars (for existing API endpoints)

| Variable | Purpose |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Used if Workers AI is re-enabled |
| `CLOUDFLARE_AI_TOKEN` | Used if Workers AI is re-enabled |

### Worker secrets (via `wrangler secret put`)

| Secret | Purpose |
|---|---|
| `UPLOAD_TOKEN` | Authorizes photo uploads |
| `TURNSTILE_SECRET` | Validates Turnstile challenge tokens |

### Worker vars (in wrangler.toml `[vars]`)

| Var | Purpose | Default |
|---|---|---|
| `ALLOWED_ORIGIN` | CORS origin for your app | `*` |
| `MAX_UPLOAD_MB` | Max upload size | `25` |
| `PHOTO_CACHE_TTL` | Seconds to cache photo list in KV | `3600` |
| `ENVIRONMENT` | `production` or `dev` | `production` |

---

## Architecture Diagram

```
Browser (HomeHub Pi)
    │
    ├── Vercel (API functions)          ← weather, chores, push, auth
    │
    ├── Supabase                        ← auth, chores, grocery, settings
    │
    └── Cloudflare Worker               ← photos, cache, logs
          ├── R2 ──────────────────────── photo/media storage
          ├── D1 ──────────────────────── metadata + logs + history
          ├── KV (CACHE) ──────────────── photo list cache + state
          ├── KV (FLAGS) ──────────────── feature flags
          ├── Queue ───────────────────── thumbnail jobs, cache purge
          └── Cron ────────────────────── daily sync, hourly flag refresh
```

---

## Dev / Local Testing

```bash
cd cloudflare
npx wrangler dev --local
# Worker runs at http://localhost:8787
# Uses local R2/D1/KV miniflare emulation
```

Set `cloudflare.workerUrl = 'http://localhost:8787'` in `config.js` while developing.
