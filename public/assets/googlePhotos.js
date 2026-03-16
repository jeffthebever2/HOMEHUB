// ============================================================
// assets/googlePhotos.js — Google Photos client (server-proxied)
//
// All actual Google Photos API calls happen server-side via
// /api/google-photos.js using a refresh token. This client just
// fetches from that endpoint. No tokens/secrets in browser.
//
// Also supports legacy provider_token path as fallback for
// album browsing in Settings (if server env vars not configured).
// ============================================================
window.Hub = window.Hub || {};

Hub.googlePhotos = {
  _albumCache: null,
  _mediaCache: {},

  // ── Server-side: fetch images via /api/google-photos ───────
  async getServerImages(albumId, pageSize) {
    const base = Hub.utils?.apiBase?.() || '';
    let url = `${base}/api/google-photos?action=images&pageSize=${pageSize || 50}`;
    if (albumId) url += `&albumId=${encodeURIComponent(albumId)}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (e) {
      console.warn('[GPhotos] Server fetch failed:', e.message);
      return { provider: 'google_photos', images: [], degraded: true, error: e.message };
    }
  },

  async getServerAlbums() {
    const base = Hub.utils?.apiBase?.() || '';
    try {
      const resp = await fetch(`${base}/api/google-photos?action=albums`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (e) {
      console.warn('[GPhotos] Server albums fetch failed:', e.message);
      return { albums: [], degraded: true, error: e.message };
    }
  },

  // ── Legacy provider_token path (for Settings album picker) ─
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

  async _fetchWithToken(url, body, retry) {
    let token = await this._getProviderToken();
    if (!token) return { error: 'Not authenticated — sign out and back in to grant Photos access.' };

    const opts = {
      method:  body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);

    let resp = await fetch(url, opts);

    if (resp.status === 401 && retry !== false) {
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

  // ── Albums (used by Settings UI) ───────────────────────────
  async listAlbums() {
    // Try server-side first (uses refresh token — more reliable)
    const serverData = await this.getServerAlbums();
    if (serverData.albums?.length) {
      this._albumCache = serverData.albums;
      return serverData.albums;
    }

    // Fall back to provider_token for album browsing
    if (this._albumCache) return this._albumCache;

    const results = [];
    let pageToken = null;
    for (let page = 0; page < 10; page++) {
      const url = 'https://photoslibrary.googleapis.com/v1/albums?pageSize=50'
                + (pageToken ? `&pageToken=${pageToken}` : '');
      const data = await this._fetchWithToken(url);
      if (data.error) return data;
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

  // ── Media items ────────────────────────────────────────────
  // Primary path: server endpoint. Fallback: provider_token.
  async getAlbumImageUrls(albumId, maxItems) {
    if (this._mediaCache[albumId]) return this._mediaCache[albumId];

    // Try server endpoint first
    const serverData = await this.getServerImages(albumId, maxItems || 200);
    if (serverData.images?.length) {
      const urls = serverData.images.map(img => img.url);
      this._mediaCache[albumId] = urls;
      console.log('[GPhotos] Server returned', urls.length, 'images');
      return urls;
    }

    // If server is degraded, log the reason
    if (serverData.degraded) {
      console.warn('[GPhotos] Server degraded:', serverData.error);
    }

    // Fallback: try provider_token (legacy path)
    const urls = [];
    let pageToken = null;
    const max = maxItems || 200;

    for (let page = 0; page < 10 && urls.length < max; page++) {
      const body = { albumId, pageSize: Math.min(100, max - urls.length) };
      if (pageToken) body.pageToken = pageToken;

      const data = await this._fetchWithToken(
        'https://photoslibrary.googleapis.com/v1/mediaItems:search', body
      );

      if (data.error) {
        console.warn('[GPhotos] Provider token fallback error:', data.error);
        return serverData.degraded ? serverData : { error: data.error };
      }

      if (data.mediaItems) {
        for (const item of data.mediaItems) {
          if (item.mimeType?.startsWith('image/') && item.baseUrl) {
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
