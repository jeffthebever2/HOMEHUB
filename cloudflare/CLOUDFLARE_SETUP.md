# HomeHub — Cloudflare R2 Photo Setup

R2 stores your family photos and serves them to the standby slideshow via a Worker.

| Component | Purpose |
|-----------|---------|
| **R2 Bucket** | Stores photo/media files |
| **Worker** | Lists, serves, uploads, and deletes photos via HTTP API |

---

## Prerequisites

```bash
npm install -g wrangler
npx wrangler login
```

---

## Step 1 — Create R2 Bucket

```bash
npx wrangler r2 bucket create homehub-media
```

**Optional — enable public access** (photos load directly from CDN, bypassing the Worker):

Cloudflare Dashboard → R2 → homehub-media → Settings → Public Access → Enable.

> With public access off (default): photos are served through the Worker at `/media/photos/<key>`.  
> With public access on: the Worker is only needed for upload/delete; reads are free CDN.

---

## Step 2 — Update wrangler.toml

Set your bucket name and Vercel domain:

```toml
[[r2_buckets]]
bucket_name = "homehub-media"       # must match Step 1

[vars]
ALLOWED_ORIGIN = "https://your-app.vercel.app"
```

---

## Step 3 — Set Upload Token

```bash
npx wrangler secret put UPLOAD_TOKEN
# Paste any strong random value — e.g.: openssl rand -hex 32
```

This token is required for `POST /media/upload` and `DELETE /media/delete/:key`.

---

## Step 4 — Deploy

```bash
cd cloudflare
npm install
npx wrangler deploy
```

Worker URL: `https://homehub-media.<your-subdomain>.workers.dev`

Test it:
```bash
curl https://homehub-media.<subdomain>.workers.dev/health
# → {"status":"ok","r2":"ok","ts":"..."}
```

---

## Step 5 — Update config.js

```js
cloudflare: {
  workerUrl:  'https://homehub-media.<subdomain>.workers.dev',
  photoAlbum: 'default',   // R2 prefix: photos/ or albums/<name>/
},
```

Then **Settings → Photos → Cloudflare**.

---

## Uploading Photos

**From CLI (bulk):**
```bash
for f in ~/Photos/*.jpg; do
  npx wrangler r2 object put "homehub-media/photos/$(basename $f)" --file "$f"
done
```

**From curl (single):**
```bash
curl -X POST https://homehub-media.<subdomain>.workers.dev/media/upload \
  -H "X-Upload-Token: YOUR_UPLOAD_TOKEN" \
  -H "Content-Type: image/jpeg" \
  -H "X-Filename: photo.jpg" \
  --data-binary @photo.jpg
```

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | R2 reachability check |
| GET | `/media/photos` | — | List photos (`?album=`, `?limit=`, `?cursor=`) |
| GET | `/media/photos/:key` | — | Serve photo bytes |
| POST | `/media/upload` | `X-Upload-Token` | Upload a photo |
| DELETE | `/media/delete/:key` | `X-Upload-Token` | Delete a photo |

---

## Local Dev

```bash
cd cloudflare
npx wrangler dev --local
# Worker at http://localhost:8787 with local R2 emulation
```

Set `cloudflare.workerUrl = 'http://localhost:8787'` in `config.js` while testing.
