const VERSION = 'homehub-v6';
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;

const STATIC_URLS = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/fallback/photos/family-1.svg',
  '/fallback/photos/family-2.svg',
  '/fallback/photos/family-3.svg',
];

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function isBypassedRequest(url) {
  return url.pathname.startsWith('/api/')
    || url.hostname.includes('supabase.co')
    || url.hostname.includes('googleapis.com')
    || url.hostname.includes('photoslibrary')
    || url.hostname.includes('openmeteo')
    || url.hostname.includes('weather.gov');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

function isShellAsset(url) {
  return url.pathname === '/'
    || url.pathname === '/index.html'
    || url.pathname === '/config.js'
    || url.pathname.startsWith('/assets/core/')
    || url.pathname.startsWith('/assets/ui/')
    || url.pathname === '/manifest.webmanifest';
}

function isImageAsset(request, url) {
  return request.destination === 'image'
    || url.pathname.startsWith('/fallback/photos/')
    || url.pathname.startsWith('/icons/');
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => Promise.allSettled(
        STATIC_URLS.map((url) => cache.add(url))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => ![SHELL_CACHE, STATIC_CACHE].includes(key))
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('Network request failed');
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isBypassedRequest(url)) return;
  if (!isSameOrigin(url)) return;

  if (isNavigationRequest(request) || isShellAsset(url)) {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return cache.match('/index.html') || cache.match('/') || Response.error();
      })
    );
    return;
  }

  if (isImageAsset(request, url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
});
