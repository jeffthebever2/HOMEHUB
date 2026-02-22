// ============================================================
// assets/googlePhotos.js — Google Photos Integration
// Uses Supabase OAuth provider_token (same pattern as calendar.js)
// No API key needed — token comes from Google OAuth via Supabase
// ============================================================
window.Hub = window.Hub || {};

Hub.googlePhotos = {
  _albumCache: null,
  _mediaCache: {},

  // Session-scoped flag: set true on 403 so we stop hammering the API.
  // Cleared by clearCache() (called on sign-out) so a reconnect resets it.
  _scopeDenied: false,
  _scopeDeniedBannerShown: false,

  // ── Token helpers ─────────────────────────────────────────
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
    // If we already know scope is missing this session, bail immediately.
    if (this._scopeDenied) return { error: 'photos_scope_denied' };

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

      if (resp.status === 403) {
        // Latch: stop all future Photos API calls this session.
        this._scopeDenied = true;
        console.warn('[GPhotos] 403 — Photos scope denied. Latching _scopeDenied.');
        this._showScopeDeniedUI();
        return { error: 'photos_scope_denied' };
      }

      if (resp.status === 401) {
        return { error: `401 Unauthorized — session expired. Sign out and back in. Detail: ${txt.slice(0, 150)}` };
      }
      return { error: `HTTP ${resp.status}: ${txt.slice(0, 200)}` };
    }
    return resp.json();
  },

  // ── 403 reconnect UI ─────────────────────────────────────
  _showScopeDeniedUI() {
    if (this._scopeDeniedBannerShown) return;
    this._scopeDeniedBannerShown = true;
    if (document.getElementById('gphotos-scope-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'gphotos-scope-banner';
    banner.style.cssText = [
      'position:fixed','bottom:1rem','left:50%','transform:translateX(-50%)',
      'z-index:9999','background:#1e3a8a','border:1px solid #3b82f6',
      'color:#fff','padding:.75rem 1.25rem','border-radius:.5rem',
      'max-width:38rem','width:calc(100% - 2rem)','font-size:.875rem',
      'box-shadow:0 10px 30px rgba(0,0,0,.5)','display:flex',
      'align-items:flex-start','gap:.75rem'
    ].join(';');

    banner.innerHTML = `
      <span style="font-size:1.25rem;flex-shrink:0">📷</span>
      <div style="flex:1">
        <strong>Google Photos access not granted</strong><br>
        Your current sign-in is missing the Photos permission.
        <ol style="margin:.35rem 0 .5rem 1.1rem;padding:0">
          <li>Click <strong>Reconnect Google</strong> to sign out and re-grant all permissions.</li>
          <li>If still broken, revoke app access at
            <a href="https://myaccount.google.com/permissions" target="_blank"
               style="color:#93c5fd;text-decoration:underline">myaccount.google.com/permissions</a>
            then reconnect.
          </li>
        </ol>
        <button id="gphotos-reconnect-btn"
          style="background:#2563eb;border:none;color:#fff;padding:.35rem .85rem;border-radius:.35rem;cursor:pointer;font-size:.875rem">
          Reconnect Google
        </button>
        <button id="gphotos-dismiss-btn"
          style="background:transparent;border:1px solid #4b5563;color:#9ca3af;padding:.35rem .85rem;border-radius:.35rem;cursor:pointer;font-size:.875rem;margin-left:.5rem">
          Dismiss
        </button>
      </div>`;

    document.body.appendChild(banner);
    document.getElementById('gphotos-reconnect-btn')
      ?.addEventListener('click', () => { banner.remove(); Hub.googlePhotos.reconnectGoogle(); });
    document.getElementById('gphotos-dismiss-btn')
      ?.addEventListener('click', () => banner.remove());
  },

  /** Called by the banner and can also be wired to a settings "Reconnect Google" button. */
  async reconnectGoogle() {
    console.log('[GPhotos] reconnectGoogle — sign out → sign in with consent');
    try {
      await Hub.auth.signOut();
      await new Promise(r => setTimeout(r, 200));
      await Hub.auth.signInGoogle();
    } catch (e) {
      console.error('[GPhotos] reconnectGoogle error:', e.message);
    }
  },

  // ── Albums ────────────────────────────────────────────────
  async listAlbums() {
    if (this._scopeDenied) return { error: 'photos_scope_denied' };
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
  async getAlbumImageUrls(albumId, maxItems = 200) {
    if (this._scopeDenied) return [];
    if (this._mediaCache[albumId]) return this._mediaCache[albumId];

    const urls = [];
    let pageToken = null;

    for (let page = 0; page < 10 && urls.length < maxItems; page++) {
      const body = { albumId, pageSize: Math.min(100, maxItems - urls.length) };
      if (pageToken) body.pageToken = pageToken;

      const data = await this._fetch(
        'https://photoslibrary.googleapis.com/v1/mediaItems:search', body
      );

      if (data.error) { console.warn('[GPhotos] mediaItems error:', data.error); break; }

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
    // Reset scope denial so a fresh sign-in can try again
    this._scopeDenied = false;
    this._scopeDeniedBannerShown = false;
  }
};
