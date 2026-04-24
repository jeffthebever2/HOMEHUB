# Changes — 2026-04-24 Session

## Google "Stay logged in" fix (the original bug)

- **`public/assets/supabase.js`** — bumped to v8 (`google-token-stale-fix`).
  - `onAuthChange` now caches `provider_token` only on `SIGNED_IN` events
    (previously re-cached on every `INITIAL_SESSION` and `TOKEN_REFRESHED`,
    which meant the stale Google access token got a fresh 55-min TTL every
    time Supabase auto-refreshed its JWT, starving `/api/token-refresh` of
    ever running).
  - `getGoogleAccessToken` reordered: server-side `/api/token-refresh` is
    now the primary path; `session.provider_token` is a short-TTL fallback
    only for first-hour-after-OAuth when the refresh_token hasn't been
    persisted to DB yet.

- **`public/assets/calendar.js`** — updated stale comment about the token
  fallback order (code unchanged).

Root cause: Supabase persists `session.provider_token` in localStorage
indefinitely and never refreshes it against Google. It's only trustworthy
right after a `SIGNED_IN` event. The kiosk was serving day-stale tokens.

## Supabase hardening

- **`migration-security-and-perf-hardening.sql`** — new file. Consolidated,
  idempotent migration that:
  - rewrites all 24 RLS policies to wrap `auth.jwt()`/`auth.uid()` in
    `(SELECT ...)` so Postgres evaluates them once per query instead of
    once per row (fixes 26 `auth_rls_initplan` advisor warnings),
  - adds 10 covering btree indexes for every foreign key the advisor
    flagged as unindexed,
  - adds `idx_household_members_email` since every RLS subquery filters
    by email alone,
  - drops redundant `idx_user_settings_user_id` (duplicated the UNIQUE
    constraint's btree).

Already applied to the live DB via Supabase MCP (migrations
`security_and_perf_hardening_v1` and `security_and_perf_hardening_v2_initplan`).
Checked into the repo for reproducibility on restore/fresh-deploy.

Remaining advisor notice: `auth_leaked_password_protection` is disabled
(configuration-only toggle in Dashboard → Auth → Providers). Not applicable
while HomeHub uses Google OAuth exclusively; enable for defense-in-depth.

## Cloudflare R2 photo worker wiring

- **`public/config.js`** — `cloudflare.workerUrl` changed from the bogus
  `https://<account>.r2.cloudflarestorage.com` (which is the S3-compatible
  endpoint — requires AWS SigV4 signatures, not callable from a browser)
  to `https://homehub-media.jeffthebever200.workers.dev`.
- **`cloudflare/wrangler.toml`** — `bucket_name` corrected from
  `homehub-media` to `homehub`; `ALLOWED_ORIGIN` trailing slash removed
  (CORS string-matches exactly; browsers never send a trailing slash in
  the Origin header).

Worker deploy (must be done once from `/cloudflare`):
1. `npx wrangler login`
2. `npx wrangler secret put UPLOAD_TOKEN`
3. `npx wrangler deploy`

## Slideshow: adaptive framing + smoother transitions

- **`public/index.html`** — `.slideshow-layer` rebuilt. Each layer is now
  a container div with two child images:
  - `.slideshow-bg` — blurred (40px), darkened, scaled copy of the photo
    as the ambient backdrop. Fills any aspect ratio.
  - `.slideshow-fg` — full photo at `object-fit: contain`, never cropped.

  Vertical phone photos, panoramas, and square crops now all look
  intentional on a 16:9 kiosk instead of letterboxed against a black
  void. Transition duration bumped 900ms → 1200ms with
  `cubic-bezier(0.4, 0, 0.2, 1)` for smoother perceived motion.

- **`public/assets/immich.js`** — `_ss.crossfade` rewritten:
  - Fixed backwards z-index (incoming layer is now on top of outgoing
    during the fade; the old order caused a compound-opacity dip at
    the 50% mark where photos visibly darkened mid-transition).
  - Double `requestAnimationFrame` replaces `setTimeout(30)` before the
    fade begins — guarantees the browser has painted the new image
    srcs before the CSS transition kicks off.
  - Real `transitionend` event replaces `setTimeout(fadeMs + 50)` for
    fade-complete detection; kept a timeout fallback for backgrounded-
    tab edge cases.
  - Preloader now calls `Image.decode()` when available to move decode
    off the main thread.
  - New `_applyImage(layer, url)` helper sets the src on both bg and
    fg child imgs in one call.

- **`public/assets/photos.js`** — `startStandbySlideshow` initial-image
  setup updated for the new layer structure (uses `_applyImage` instead
  of setting `layerA.src`, since layerA is now a div, not an img).

## CodeQL security alerts — all 7 fixed

### `public/assets/utils.js` — Alert #4 (Prototype-polluting function, Medium)

`merge()` previously copied every key from source objects, including
`__proto__`, `constructor`, and `prototype`. A JSON payload like
`{"__proto__":{"polluted":true}}` coming from Supabase, YouTube, or any
untrusted source would silently set properties on `Object.prototype`,
affecting every object in the runtime. Fix: reject those three keys and
only iterate own-properties.

Verified against live attack payloads:
- `{"__proto__":{"polluted":true}}` → blocked
- `{"constructor":{"prototype":{"polluted":true}}}` → blocked
- Normal deep merge still works.

### `public/sw.js` — Alerts #3, #6, #7, #8 (Incomplete URL substring sanitization, High)

Service worker used `url.hostname.includes('googleapis.com')`-style checks
in four places, which wrongly matched:
- `googleapis.com.evil.com` (attacker-controlled domain)
- `fakegoogleapis.com` (typosquat)
- `cdn.jsdelivr.net.attacker.io` (suffix attack)

Matters especially for the CDN branch (line 110), where a rogue match
would get the attacker's response cached by the service worker, survive
page reloads, and execute as a trusted `<script>` origin.

Fix: added `hostMatches(hostname, domain)` helper that returns true only
for exact hostname match or proper subdomain
(`hostname === domain || hostname.endsWith('.' + domain)`). Replaced all
7 substring checks across the fetch handler. Bumped SW cache version
v8 → v9 so kiosks pull the new worker on next reload.

Verified: 5 legitimate hostnames still match; 5 attack variants correctly
rejected.

### `public/assets/music.js` — Alerts #9, #10 (Incomplete string escaping, High)

`_trackRowHTML` was building `onclick="Hub.music.play('id','title','artist',...)"`
by string concatenation, hand-rolling an apostrophe-escape. Broken by:
- backslash characters
- newlines / carriage returns
- any escape sequence the JS parser interprets (`\b`, `\u…`, etc.)

A malicious YouTube title of the right shape could break out of the JS
string context and execute arbitrary code from the kiosk's origin.

Fix: switched to data-attribute + event-delegation pattern. Row renders
`data-track-id / -title / -artist / -thumb / -duration` (all HTML-escaped
via existing `esc()`), and each button's `onclick` calls a new
`_actionFromDataset(el, action)` helper that walks up to the row, reads
the dataset, and dispatches to the original `play / toggleFavorite /
addToQueue` methods. No change to public API.

Collateral fix: `_highlightActive()` updated from the old `[data-music-id]`
query selector to `[data-track-id]` so row highlighting keeps working.

Verified: three classic XSS payloads in track metadata
(`' onmouseover=alert(1) x='`, `</script><script>alert(1)</script>`,
attribute-break via `"onerror="`) all render inert inside escaped
attribute values.

## Photo sources hardcoded + mixed (Cloudflare R2 + Imgur in parallel)

Previously the slideshow used a provider-picker pattern: one provider was
"preferred," the rest were fallbacks, and everything was configurable in
the Settings UI. That broke in three ways:
  1. The `photoAlbum: 'homehub'` config pointed at a non-existent
     `albums/homehub/` R2 prefix, so the Cloudflare source always returned
     empty and silently fell through to Imgur alone.
  2. The Cloudflare section of Settings showed a permanent orange warning
     "set up Worker URL in config.js first" even after the Worker was
     deployed and working.
  3. Only one source was ever actually used — there was no way to mix R2
     and Imgur photos into one pool.

### Fixes

- **`public/assets/photos.js`** — rewrote `getImages()` to fire Cloudflare
  and Imgur in parallel with `Promise.allSettled`, merge both result sets,
  dedupe, and shuffle. If one source fails the other still fills the pool;
  if both fail, placeholders keep the slideshow alive. Removed
  `_loadProvider`, `_buildChain`, `_fetchImmich`, and `_getImgurAlbumId` —
  no more provider selection state. Diagnostics function updated to the
  new two-source model.

- **`public/config.js`** —
  - `cloudflare.photoAlbum` changed from `'homehub'` (→ non-existent
    `albums/homehub/` prefix) to `'Photos/'`, matching the actual folder
    in the `homehub` bucket.
  - New `imgur.albumId` entry so the Imgur source is configured in the
    same place as Cloudflare, not hidden in asset internals.

- **`cloudflare/src/routes/photos.js`** — Worker now treats any
  `photoAlbum` value ending in `/` as a literal R2 key prefix. So
  `'Photos/'` matches `Photos/IMG_0001.jpg` directly instead of being
  wrapped into `albums/Photos/`. Also filters zero-byte folder markers
  and non-image keys out of the listing response, so the 0-byte `Photos/`
  placeholder object doesn't get served as a broken photo.

- **`public/index.html`** — ripped out the entire provider-picker UI
  (four selector cards, three provider-specific form panels, the
  "set in config.js" warning, all associated inputs) and replaced it
  with a one-card info panel explaining the two hardcoded sources and
  a Test Slideshow button.

- **`public/assets/app.js`** — removed the code that populated/saved the
  deleted form fields. `_selectPhotoProvider` and `_updatePhotoProviderUI`
  are now no-ops kept only to prevent any stray inline `onclick` reference
  from crashing. `_saveSettings` no longer tries to read Immich URL/key
  or provider selection from the DOM; those columns get preserved from
  existing state so old rows aren't overwritten with null.

- **`public/sw.js`** — cache version bumped v9 → v10 so kiosks pull the
  new photos.js immediately instead of serving the old provider-chain
  build from cache.

### Result

Open HomeHub → no config prompts, no settings to fiddle with. Photos from
your R2 `Photos/` folder and your Imgur album are shuffled into one pool
and rotated together. To add or remove photos, just upload to R2 or edit
the Imgur album — no UI step.
