import { fetchJson } from '../../fetch.js';
import { readSnapshot, writeSnapshot } from '../../cache/snapshots.js';

let cachedGoogleToken = null;
let cachedGoogleTokenExpiry = 0;

const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID || '546c25a59c58ad7';

function fallbackPhotos() {
  return [
    '/fallback/photos/family-1.svg',
    '/fallback/photos/family-2.svg',
    '/fallback/photos/family-3.svg',
  ];
}

async function getGoogleAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google Photos env vars missing');
  }
  if (cachedGoogleToken && Date.now() < cachedGoogleTokenExpiry - 120000) {
    return cachedGoogleToken;
  }
  const response = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  }, 8000);
  if (!response.ok) {
    throw new Error('Google Photos token refresh failed');
  }
  cachedGoogleToken = response.data.access_token;
  cachedGoogleTokenExpiry = Date.now() + ((response.data.expires_in || 3600) * 1000);
  return cachedGoogleToken;
}

async function fetchGooglePhotos(config) {
  const token = await getGoogleAccessToken();
  const albumId = config.photos.googleAlbumId;
  if (!albumId) throw new Error('Google Photos album not configured');
  const response = await fetchJson('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      albumId,
      pageSize: 25,
    }),
  }, 8000);
  if (!response.ok) throw new Error('Google Photos mediaItems search failed');
  return (response.data.mediaItems || [])
    .filter((item) => item.mimeType?.startsWith('image/') && item.baseUrl)
    .map((item) => ({
      id: item.id,
      url: `${item.baseUrl}=w1920-h1080-c`,
      source: 'google_photos',
      credit: item.filename || 'Google Photos',
      orientation: item.mediaMetadata?.width > item.mediaMetadata?.height ? 'landscape' : 'portrait',
    }));
}

async function fetchImmich(config) {
  if (!config.photos.immichBaseUrl || !config.photos.immichAlbumId) {
    throw new Error('Immich not configured');
  }
  const url = `${config.photos.immichBaseUrl.replace(/\/$/, '')}/api/albums/${config.photos.immichAlbumId}`;
  const response = await fetchJson(url, {
    headers: process.env.IMMICH_SHARED_ALBUM_TOKEN
      ? { 'x-api-key': process.env.IMMICH_SHARED_ALBUM_TOKEN }
      : {},
  }, 8000);
  if (!response.ok) throw new Error('Immich album fetch failed');
  return (response.data.assets || [])
    .filter((asset) => asset.type === 'IMAGE')
    .map((asset) => ({
      id: asset.id,
      url: `${config.photos.immichBaseUrl.replace(/\/$/, '')}/api/assets/${asset.id}/thumbnail?size=preview`,
      source: 'immich',
      credit: response.data.albumName || 'Immich',
      orientation: 'landscape',
    }));
}

async function fetchImgur(config) {
  if (!config.photos.imgurAlbumId) throw new Error('Imgur album not configured');
  const response = await fetchJson(`https://api.imgur.com/3/album/${config.photos.imgurAlbumId}`, {
    headers: { Authorization: `Client-ID ${IMGUR_CLIENT_ID}` },
  }, 8000);
  if (!response.ok) throw new Error('Imgur album fetch failed');
  return (response.data?.data?.images || []).map((image) => ({
    id: image.id,
    url: image.link,
    source: 'imgur',
    credit: 'Imgur',
    orientation: image.width > image.height ? 'landscape' : 'portrait',
  }));
}

export async function getPhotosPayload(config, { mockScenario = null } = {}) {
  if (mockScenario === 'PHOTOS_AUTH_EXPIRED') {
    return {
      meta: {
        schemaVersion: 1,
        fetchedAt: new Date().toISOString(),
        stale: false,
        degraded: true,
        isMock: true,
        warnings: ['Using fallback photos because Google Photos auth is expired.'],
      },
      summary: {
        status: 'warning',
        priority: 'attention_needed',
        headline: 'Photo sync needs attention',
        supportingText: 'Displaying built-in fallback photos.',
        badges: ['fallback', 'auth expired'],
        cta: { label: 'Open Settings', route: '#/settings' },
        updatedAt: new Date().toISOString(),
      },
      detail: {
        source: 'local_fallback',
        fallbackInUse: true,
        currentPhoto: { id: 'fallback-1', url: fallbackPhotos()[0], credit: 'HomeHub fallback' },
        queue: fallbackPhotos().map((url, index) => ({ id: `fallback-${index + 1}`, url, credit: 'HomeHub fallback' })),
      },
    };
  }

  const attempts = {
    google_photos: () => fetchGooglePhotos(config),
    immich: () => fetchImmich(config),
    imgur: () => fetchImgur(config),
    local_fallback: async () => fallbackPhotos().map((url, index) => ({
      id: `fallback-${index + 1}`,
      url,
      source: 'local_fallback',
      credit: 'HomeHub fallback',
      orientation: 'landscape',
    })),
  };

  let images = [];
  let source = 'local_fallback';
  const warnings = [];
  for (const provider of config.photos.sourcePriority) {
    const attempt = attempts[provider];
    if (!attempt) continue;
    try {
      images = await attempt();
      if (images.length) {
        source = provider;
        break;
      }
    } catch (error) {
      warnings.push(`${provider} failed: ${error.message}`);
    }
  }

  const snapshotKey = 'photos';
  if (!images.length) {
    const snapshot = readSnapshot(snapshotKey);
    if (snapshot) {
      return {
        ...snapshot,
        meta: {
          ...snapshot.meta,
          stale: true,
          degraded: true,
          warnings: [...snapshot.meta.warnings, ...warnings],
        },
      };
    }
  }

  const payload = {
    meta: {
      schemaVersion: 1,
      fetchedAt: new Date().toISOString(),
      stale: false,
      degraded: warnings.length > 0,
      isMock: false,
      warnings,
    },
    summary: {
      status: 'normal',
      priority: 'normal',
      headline: source === 'google_photos' ? 'Google Photos slideshow ready' : `Using ${source.replace(/_/g, ' ')}`,
      supportingText: `${images.length} photo${images.length === 1 ? '' : 's'} available.`,
      badges: [source.replace(/_/g, ' '), `${images.length} photos`],
      cta: { label: 'Open Photos', route: '#/photos' },
      updatedAt: new Date().toISOString(),
    },
    detail: {
      source,
      fallbackInUse: source !== config.photos.sourcePriority[0],
      currentPhoto: images[0] || null,
      queue: images.slice(0, 10),
    },
  };

  return writeSnapshot(snapshotKey, payload);
}

export async function getPhotosHealth(config) {
  const payload = await getPhotosPayload(config);
  return {
    status: payload.meta.degraded ? 'degraded' : 'healthy',
    source: payload.detail.source,
    warnings: payload.meta.warnings,
    photoCount: payload.detail.queue.length,
  };
}
