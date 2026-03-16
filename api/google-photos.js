// ============================================================
// /api/google-photos.js — Server-side Google Photos proxy
//
// Uses a long-lived REFRESH TOKEN to obtain access tokens.
// Client never sees credentials — only receives image URLs.
//
// ENV VARS (set in Vercel → Settings → Environment Variables):
//   GOOGLE_CLIENT_ID          — OAuth 2.0 client ID
//   GOOGLE_CLIENT_SECRET      — OAuth 2.0 client secret
//   GOOGLE_REFRESH_TOKEN      — Offline refresh token for the Google account
//   GOOGLE_PHOTOS_ALBUM_ID   — (optional) Preferred album ID
//   GOOGLE_PHOTOS_PAGE_SIZE  — (optional) Number of images, default 50
//   GOOGLE_PHOTOS_FETCH_MODE — (optional) "album" or "library", default auto
//
// Returns:
//   { provider, images[], count, fetchedAt, degraded, error }
// ============================================================

// ── In-memory access token cache (per cold-start instance) ────
let _cachedToken = null;
let _cachedTokenExpiry = 0;

async function getAccessToken(clientId, clientSecret, refreshToken) {
  // Return cached token if still valid (with 2-min buffer)
  if (_cachedToken && Date.now() < _cachedTokenExpiry - 120_000) {
    return _cachedToken;
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token'
    })
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Token exchange failed (HTTP ${resp.status}): ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  _cachedToken = data.access_token;
  // Default expiry is 3600s; cache for reported duration
  _cachedTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return _cachedToken;
}

// ── Fetch images from Google Photos Library API ──────────────
async function fetchAlbumImages(accessToken, albumId, pageSize) {
  const allItems = [];
  let pageToken = null;

  for (let page = 0; page < 5 && allItems.length < pageSize; page++) {
    const body = {
      albumId,
      pageSize: Math.min(100, pageSize - allItems.length)
    };
    if (pageToken) body.pageToken = pageToken;

    const resp = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(`mediaItems:search HTTP ${resp.status}: ${t.slice(0, 300)}`);
    }

    const data = await resp.json();
    if (data.mediaItems) allItems.push(...data.mediaItems);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return allItems;
}

async function fetchLibraryImages(accessToken, pageSize) {
  const allItems = [];
  let pageToken = null;

  for (let page = 0; page < 5 && allItems.length < pageSize; page++) {
    let url = `https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=${Math.min(100, pageSize - allItems.length)}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(`mediaItems GET HTTP ${resp.status}: ${t.slice(0, 300)}`);
    }

    const data = await resp.json();
    if (data.mediaItems) allItems.push(...data.mediaItems);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return allItems;
}

// ── List albums (for settings UI) ─────────────────────────────
async function fetchAlbums(accessToken) {
  const results = [];
  let pageToken = null;

  for (let page = 0; page < 10; page++) {
    let url = 'https://photoslibrary.googleapis.com/v1/albums?pageSize=50';
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(`albums GET HTTP ${resp.status}: ${t.slice(0, 300)}`);
    }

    const data = await resp.json();
    if (data.albums) results.push(...data.albums);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return results.map(a => ({
    id:              a.id,
    title:           a.title || 'Untitled',
    mediaItemsCount: parseInt(a.mediaItemsCount, 10) || 0,
    coverPhotoBaseUrl: a.coverPhotoBaseUrl || null
  }));
}

// ── Normalize media items into clean response ─────────────────
function normalizeItems(items) {
  return items
    .filter(item => item.mimeType?.startsWith('image/') && item.baseUrl)
    .map(item => ({
      url:       item.baseUrl + '=w1600-h900',
      width:     parseInt(item.mediaMetadata?.width, 10) || null,
      height:    parseInt(item.mediaMetadata?.height, 10) || null,
      mimeType:  item.mimeType,
      id:        item.id,
      filename:  item.filename || null,
      createdAt: item.mediaMetadata?.creationTime || null
    }));
}

// ── Main handler ──────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
  const ALBUM_ID      = req.query.albumId || process.env.GOOGLE_PHOTOS_ALBUM_ID || '';
  const PAGE_SIZE     = parseInt(req.query.pageSize || process.env.GOOGLE_PHOTOS_PAGE_SIZE || '50', 10);
  const MODE          = req.query.mode || process.env.GOOGLE_PHOTOS_FETCH_MODE || (ALBUM_ID ? 'album' : 'library');
  const action        = req.query.action || 'images'; // "images" or "albums"

  // ── Degraded mode: env vars not configured ──────────────────
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    const missing = [];
    if (!CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
    if (!CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
    if (!REFRESH_TOKEN) missing.push('GOOGLE_REFRESH_TOKEN');

    console.warn('[GooglePhotos] Missing env vars:', missing.join(', '));

    return res.status(200).json({
      provider:  'google_photos',
      images:    [],
      count:     0,
      fetchedAt: new Date().toISOString(),
      degraded:  true,
      error:     `Missing env vars: ${missing.join(', ')}. Set them in Vercel → Settings → Environment Variables.`
    });
  }

  try {
    const accessToken = await getAccessToken(CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN);

    // ── Albums listing ────────────────────────────────────────
    if (action === 'albums') {
      const albums = await fetchAlbums(accessToken);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
      return res.status(200).json({
        provider: 'google_photos',
        albums,
        count:    albums.length,
        fetchedAt: new Date().toISOString(),
        degraded: false,
        error:    null
      });
    }

    // ── Images fetch ──────────────────────────────────────────
    let rawItems;
    if (MODE === 'album' && ALBUM_ID) {
      rawItems = await fetchAlbumImages(accessToken, ALBUM_ID, PAGE_SIZE);
    } else {
      rawItems = await fetchLibraryImages(accessToken, PAGE_SIZE);
    }

    const images = normalizeItems(rawItems);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      provider:  'google_photos',
      images,
      count:     images.length,
      fetchedAt: new Date().toISOString(),
      degraded:  false,
      error:     null
    });

  } catch (e) {
    console.error('[GooglePhotos] Error:', e.message);

    // Invalidate cached token on auth errors
    if (e.message.includes('401') || e.message.includes('403') || e.message.includes('Token exchange')) {
      _cachedToken = null;
      _cachedTokenExpiry = 0;
    }

    return res.status(200).json({
      provider:  'google_photos',
      images:    [],
      count:     0,
      fetchedAt: new Date().toISOString(),
      degraded:  true,
      error:     e.message
    });
  }
}
