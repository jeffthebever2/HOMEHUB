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
