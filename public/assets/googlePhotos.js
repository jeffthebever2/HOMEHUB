// ============================================================
// assets/googlePhotos.js — Google Photos Integration
// Uses Supabase OAuth provider_token (same pattern as calendar.js)
// No API key needed — token comes from Google OAuth via Supabase
// ============================================================
window.Hub = window.Hub || {};

Hub.googlePhotos = {
  _albumCache: null,
  _mediaCache: {},

  // ── Token helpers (mirrors calendar.js) ──────────────────
  async _getProviderToken() {
    try {
      const { data: { session } } = await Hub.sb.auth.getSession();
      if (session?.provider_token) return session.provider_token;
      if (Hub.auth?.ensureFreshSession) await Hub.auth.ensureFreshSession('gphotos-token');
      const { data: { session: s2 } } = await Hub.sb.auth.getSession();
      return s2?.provider_token || null;
    } catch (e) {
      console.warn('[GPhotos] Provider token lookup failed:', e.message);
      return null;
    }
  },

  async _fetch(url, body, retry = true) {
    let token = await this._getProviderToken();
    if (!token) return { error: 'Not authenticated — sign out and back in to grant Photos access.' };

    const opts = {
      method:  body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);

    let resp = await fetch(url, opts);

    if (resp.status === 401 && retry) {
      console.warn('[GPhotos] 401 — refreshing token');
      try { await Hub.auth?.ensureFreshSession?.('gphotos-401'); } catch (e) {}
      token = await this._getProviderToken();
      if (!token) return { error: '401 and could not refresh token' };
      opts.headers.Authorization = `Bearer ${token}`;
      resp = await fetch(url, opts);
    }

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return { error: `HTTP ${resp.status}: ${txt.slice(0, 200)}` };
    }
    return resp.json();
  },

  // ── Albums ────────────────────────────────────────────────
  /** Returns [{id, title, mediaItemsCount, coverPhotoBaseUrl}] */
  async listAlbums() {
    if (this._albumCache) return this._albumCache;

    const results = [];
    let pageToken = null;

    for (let page = 0; page < 10; page++) {
      const url = 'https://photoslibrary.googleapis.com/v1/albums?pageSize=50'
                + (pageToken ? `&pageToken=${pageToken}` : '');
      const data = await this._fetch(url);
      if (data.error) return { error: data.error };
      if (data.albums) results.push(...data.albums);
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    this._albumCache = results.map(a => ({
      id:               a.id,
      title:            a.title || 'Untitled',
      mediaItemsCount:  a.mediaItemsCount,
      coverPhotoBaseUrl: a.coverPhotoBaseUrl || null
    }));
    return this._albumCache;
  },

  // ── Media items ───────────────────────────────────────────
  /** Returns array of image URLs for the album (=d parameter for hi-res) */
  async getAlbumImageUrls(albumId, maxItems = 200) {
    if (this._mediaCache[albumId]) return this._mediaCache[albumId];

    const urls = [];
    let pageToken = null;

    for (let page = 0; page < 10 && urls.length < maxItems; page++) {
      const body = { albumId, pageSize: Math.min(100, maxItems - urls.length) };
      if (pageToken) body.pageToken = pageToken;

      const data = await this._fetch(
        'https://photoslibrary.googleapis.com/v1/mediaItems:search', body
      );

      if (data.error) {
        console.warn('[GPhotos] mediaItems error:', data.error);
        break;
      }

      if (data.mediaItems) {
        for (const item of data.mediaItems) {
          if (item.mimeType?.startsWith('image/') && item.baseUrl) {
            // =d gives full download; =w1920-h1080 gives scaled version
            urls.push(item.baseUrl + '=w1920-h1080');
          }
        }
      }

      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    if (urls.length > 0) this._mediaCache[albumId] = urls;
    return urls;
  },

  clearCache() {
    this._albumCache = null;
    this._mediaCache = {};
  }
};
