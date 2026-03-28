// ============================================================
// public/sw.js — HomeHub Service Worker
// Strategy:
//   - App shell (HTML, CSS, JS, fonts): cache-first with background revalidation
//   - /api/* and CDN fetches: network-first (no caching)
//   - Images: cache-first with 7-day TTL
// ============================================================

const CACHE_NAME  = 'homehub-v7';
const CACHE_SHELL = 'homehub-shell-v7';

// Static app-shell assets to pre-cache on install
const SHELL_URLS = [
  '/',
  '/index.html',
  '/config.js',
  '/assets/tailwind.css',
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
  '/assets/icons.js',
  '/assets/notifications.js',
  '/assets/siteControl.js',
  '/manifest.webmanifest',
  '/favicon.svg',
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
             || url.hostname.includes('open-meteo')
             || url.hostname.includes('weather.gov')
             || url.hostname.includes('rainviewer')
             || url.hostname.includes('api.imgur.com');

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

  // CDN assets (Leaflet, etc.) — cache-first, no background update
  const isCdn = url.hostname.includes('cdnjs') || url.hostname.includes('cdn.jsdelivr') || url.hostname.includes('unpkg.com');
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

// ── Push notification handler ─────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch (_) { data = { title: 'HomeHub Alert', body: event.data.text() }; }

  const options = {
    body:    data.body    || '',
    icon:    data.icon    || '/icons/icon-192.png',
    badge:   data.badge   || '/icons/icon-192.png',
    tag:     data.tag     || 'homehub',
    data:    data.data    || {},
    vibrate: [200, 100, 200],
    requireInteraction: (data.data?.severity === 'Extreme' || data.data?.severity === 'Severe'),
  };

  event.waitUntil(self.registration.showNotification(data.title || 'HomeHub', options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(existing.url.split('#')[0] + '#' + url.replace('/', '')); }
      else clients.openWindow(url);
    })
  );
});
