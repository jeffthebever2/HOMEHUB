import { fetchJson } from '../../fetch.js';
import { createMeta } from '../../http.js';
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

function getSourcePriority(config) {
  const configured = Array.isArray(config?.photos?.sourcePriority) ? config.photos.sourcePriority : [];
  const ordered = [...configured, 'google_photos', 'immich', 'imgur', 'local_fallback']
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .filter((entry, index, list) => list.indexOf(entry) === index);
  return ordered.includes('local_fallback') ? ordered : [...ordered, 'local_fallback'];
}

function buildFallbackImages() {
  return fallbackPhotos().map((url, index) => ({
    id: `fallback-${index + 1}`,
    url,
    source: 'local_fallback',
    credit: 'HomeHub fallback',
    orientation: 'landscape',
  }));
}

function buildPhotosPayload(config, {
  images = [],
  source = 'local_fallback',
  warnings = [],
  stale = false,
  degraded = false,
  isMock = false,
} = {}) {
  const queue = images.slice(0, 10);
  const primarySource = getSourcePriority(config)[0] || 'local_fallback';
  const fallbackInUse = source !== primarySource || (source === 'local_fallback' && primarySource !== 'local_fallback');
  return {
    meta: createMeta({
      stale,
      degraded: degraded || warnings.length > 0 || fallbackInUse,
      isMock,
      warnings,
    }),
    summary: {
      status: fallbackInUse ? 'warning' : 'normal',
      priority: fallbackInUse ? 'attention_needed' : 'normal',
      headline: source === 'google_photos' ? 'Google Photos slideshow ready' : `Using ${source.replace(/_/g, ' ')}`,
      supportingText: `${queue.length} photo${queue.length === 1 ? '' : 's'} available.`,
      badges: [source.replace(/_/g, ' '), `${queue.length} photos`],
      cta: { label: 'Open Photos', route: '#/photos' },
      updatedAt: new Date().toISOString(),
    },
    detail: {
      source,
      fallbackInUse,
      currentPhoto: queue[0] || null,
      queue,
    },
  };
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
  cachedGoogleToken = response.data?.access_token;
  cachedGoogleTokenExpiry = Date.now() + ((response.data?.expires_in || 3600) * 1000);
  if (!cachedGoogleToken) {
    throw new Error('Google Photos token refresh returned no access token');
  }
  return cachedGoogleToken;
}

async function fetchGooglePhotos(config) {
  const token = await getGoogleAccessToken();
  const albumId = config?.photos?.googleAlbumId;
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
  return (response.data?.mediaItems || [])
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
  if (!config?.photos?.immichBaseUrl || !config?.photos?.immichAlbumId) {
    throw new Error('Immich not configured');
  }
  const url = `${config.photos.immichBaseUrl.replace(/\/$/, '')}/api/albums/${config.photos.immichAlbumId}`;
  const response = await fetchJson(url, {
    headers: process.env.IMMICH_SHARED_ALBUM_TOKEN
      ? { 'x-api-key': process.env.IMMICH_SHARED_ALBUM_TOKEN }
      : {},
  }, 8000);
  if (!response.ok) throw new Error('Immich album fetch failed');
  return (response.data?.assets || [])
    .filter((asset) => asset.type === 'IMAGE')
    .map((asset) => ({
      id: asset.id,
      url: `${config.photos.immichBaseUrl.replace(/\/$/, '')}/api/assets/${asset.id}/thumbnail?size=preview`,
      source: 'immich',
      credit: response.data?.albumName || 'Immich',
      orientation: 'landscape',
    }));
}

async function fetchImgur(config) {
  if (!config?.photos?.imgurAlbumId) throw new Error('Imgur album not configured');
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
    return buildPhotosPayload(config, {
      images: buildFallbackImages(),
      source: 'local_fallback',
      warnings: ['Using fallback photos because Google Photos auth is expired.'],
      degraded: true,
      isMock: true,
    });
  }

  const attempts = {
    google_photos: () => fetchGooglePhotos(config),
    immich: () => fetchImmich(config),
    imgur: () => fetchImgur(config),
    local_fallback: async () => buildFallbackImages(),
  };

  let images = [];
  let source = 'local_fallback';
  const warnings = [];

  for (const provider of getSourcePriority(config)) {
    const attempt = attempts[provider];
    if (!attempt) continue;
    try {
      images = await attempt();
      if (Array.isArray(images) && images.length) {
        source = provider;
        break;
      }
      warnings.push(`${provider} returned no photos.`);
    } catch (error) {
      warnings.push(`${provider} failed: ${error.message}`);
    }
  }

  const snapshotKey = 'photos';
  const snapshot = readSnapshot(snapshotKey);
  if ((!Array.isArray(images) || !images.length) && snapshot) {
    return {
      ...snapshot,
      meta: createMeta({
        fetchedAt: snapshot.meta?.fetchedAt,
        stale: true,
        degraded: true,
        isMock: snapshot.meta?.isMock,
        warnings: [...(snapshot.meta?.warnings || []), ...warnings],
      }),
    };
  }

  if (!Array.isArray(images) || !images.length) {
    images = buildFallbackImages();
    source = 'local_fallback';
    warnings.push('No remote photo providers returned usable images. Using built-in fallback photos.');
  }

  const payload = buildPhotosPayload(config, {
    images,
    source,
    warnings,
  });

  return writeSnapshot(snapshotKey, payload);
}

export async function getPhotosHealth(config) {
  try {
    const payload = await getPhotosPayload(config);
    return {
      status: payload.meta.degraded ? 'degraded' : 'healthy',
      source: payload.detail.source,
      warnings: payload.meta.warnings,
      photoCount: payload.detail.queue.length,
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'unknown',
      warnings: [error.message || 'Photos health check failed.'],
      photoCount: 0,
    };
  }
}
