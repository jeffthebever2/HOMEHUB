// ============================================================
// public/sw.js — HomeHub Service Worker
// Strategy:
//   - App shell (HTML, CSS, JS, fonts): cache-first with background revalidation
//   - /api/* and CDN fetches: network-first (no caching)
//   - Images: cache-first with 7-day TTL
// ============================================================

const CACHE_NAME  = 'homehub-v1';
const CACHE_SHELL = 'homehub-shell-v1';

// Static app-shell assets to pre-cache on install
const SHELL_URLS = [
  '/',
  '/index.html',
  '/config.js',
  '/assets/utils.js',
  '/assets/supabase.js',
  '/assets/router.js',
  '/assets/ui.js',
  '/assets/app.js',
  '/assets/weather.js',
  '/assets/ai.js',
  '/assets/calendar.js',
  '/assets/chores.js',
  '/assets/treats.js',
  '/assets/control.js',
  '/assets/grocery.js',
  '/assets/standby.js',
  '/assets/immich.js',
  '/assets/googlePhotos.js',
  '/assets/photos.js',
  '/assets/player.js',
  '/assets/radio.js',
  '/assets/music.js',
  '/assets/standby.js',
];

// ── Install: pre-cache app shell ─────────────────────────
self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_SHELL).then(cache =>
      // Use individual try/catch so one bad URL doesn't break the whole install
      Promise.allSettled(SHELL_URLS.map(url =>
        cache.add(url).catch(e => console.warn('[SW] Pre-cache skip:', url, e.message))
      ))
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ──────────────────────────
self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_SHELL && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: route strategy ─────────────────────────────────
self.addEventListener('fetch', (evt) => {
  const { request } = evt;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin API/auth requests
  if (request.method !== 'GET') return;

  // Network-only: API calls, Supabase auth, external APIs
  const isApi = url.pathname.startsWith('/api/')
             || url.hostname.includes('supabase.co')
             || url.hostname.includes('googleapis.com')
             || url.hostname.includes('photoslibrary')
             || url.hostname.includes('openmeteo')
             || url.hostname.includes('weather.gov');

  if (isApi) {
    // Let the network handle it — don't cache
    return;
  }

  // Cache-first for same-origin static assets
  if (url.origin === location.origin) {
    evt.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_SHELL).then(c => c.put(request, clone));
          }
          return resp;
        }).catch(() => cached); // offline fallback

        return cached || networkFetch;
      })
    );
    return;
  }

  // CDN assets (Twemoji, Leaflet, etc.) — cache-first, no background update
  const isCdn = url.hostname.includes('cdnjs') || url.hostname.includes('cdn.jsdelivr');
  if (isCdn) {
    evt.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return resp;
      }))
    );
  }
  // All other cross-origin: pass through
});
