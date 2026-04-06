// ============================================================
// public/assets/music.js — YouTube Music Integration (v2)
//
// TWO MODES:
//   Bridge (preferred): Chrome extension connects a live YouTube
//     Music tab. HomeHub sees real-time now-playing state and can
//     control playback (play/pause/next/prev). Install the
//     "HomeHub Music Bridge" extension and open music.youtube.com.
//
//   Standalone (fallback): Piped API search + YouTube IFrame
//     player. Works without extension but Piped instances are
//     unreliable and playback is limited.
//
// The mode is auto-detected — bridge takes priority when the
// extension is installed and a YTM tab is connected.
// ============================================================
window.Hub = window.Hub || {};

Hub.music = {
  _searchTimeout: null,
  _queue: [],           // [{videoId, title, artist, thumbnail, duration}]
  _queueIndex: -1,
  _lastQuery: '',

  // ── Bridge state ──────────────────────────────────────────
  _bridgeReady:     false,   // extension content script loaded
  _bridgeConnected: false,   // YTM tab is connected and reporting state
  _bridgeState:     null,    // latest state from YTM tab
  _bridgeTimer:     null,    // UI refresh timer in bridge mode

  // Piped API instances (fallback chain for standalone mode)
  _PIPED_INSTANCES: [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.in.projectsegfau.lt',
  ],
  // Invidious instances (additional fallback for stream URLs)
  _INVIDIOUS_INSTANCES: [
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://invidious.jing.rocks',
  ],
  _pipedIndex: 0,

  _FAVORITES_KEY:  'hub_music_favorites',
  _HISTORY_KEY:    'hub_music_history',
  _MAX_HISTORY:    50,

  init() {
    // Pre-warm YouTube IFrame API (for standalone mode)
    Hub.player?._ensureYTAPI?.();

    // Listen for bridge extension messages
    window.addEventListener('message', (e) => {
      if (e.source !== window) return;
      const msg = e.data;

      if (msg.type === 'HUB_MUSIC_BRIDGE_READY') {
        this._bridgeReady = true;
        console.log('[Music] Bridge extension detected');
        // Re-render if on music page
        if (Hub.router?.current === 'music') this._renderPage();
      }

      if (msg.type === 'HUB_MUSIC_STATE' && msg.state) {
        const wasConnected = this._bridgeConnected;
        this._bridgeState = msg.state;
        this._bridgeConnected = msg.state.connected && !!msg.state.title;

        // If connection status changed, re-render page
        if (wasConnected !== this._bridgeConnected && Hub.router?.current === 'music') {
          this._renderPage();
        }

        // Update now-playing bar on music page
        if (Hub.router?.current === 'music' && this._bridgeConnected) {
          this._updateBridgeNowPlaying();
        }

        // Also update the dashboard widget when bridge is active
        if (this._bridgeConnected) {
          this._syncBridgeToPlayer();
        }
      }
    });
  },

  /** Sync bridge state into Hub.player.state so dashboard/standby widgets work */
  _syncBridgeToPlayer() {
    if (!this._bridgeState || !Hub.player) return;
    const s = this._bridgeState;
    Hub.player.state.currentSource  = s.playing || s.title ? 'music' : Hub.player.state.currentSource;
    Hub.player.state.title          = s.title || Hub.player.state.title;
    Hub.player.state.musicArtist    = s.artist || '';
    Hub.player.state.musicThumbnail = s.thumbnail || '';
    Hub.player.state.musicVideoId   = s.videoId || '';
    Hub.player.state.isPlaying      = s.playing;
    Hub.player.state.startedAt      = s.playing ? (Hub.player.state.startedAt || Date.now()) : null;
    Hub.player.state.radioStatus    = s.playing ? 'playing' : (s.title ? '' : Hub.player.state.radioStatus);
    Hub.player.updateUI?.();
  },

  // ── Bridge commands ───────────────────────────────────────
  _bridgeCmd(cmd, args) {
    window.postMessage({ type: 'HUB_MUSIC_CMD', cmd, args }, '*');
  },

  _openYTM(url) {
    window.postMessage({ type: 'HUB_MUSIC_OPEN_YTM', url: url || null }, '*');
  },

  _searchYTM(query) {
    window.postMessage({ type: 'HUB_MUSIC_SEARCH', query }, '*');
  },

  // ── Page lifecycle ──────────────────────────────────────────

  onEnter() {
    this._renderPage();
  },

  onLeave() {
    // Music keeps playing across pages (like radio)
  },

  // ── Search ──────────────────────────────────────────────────

  async search(query) {
    if (!query?.trim()) return;
    query = query.trim();
    this._lastQuery = query;

    const resultsEl = document.getElementById('musicResults');
    if (resultsEl) resultsEl.innerHTML = '<p class="text-gray-400 text-center py-8">Searching…</p>';

    try {
      const results = await this._pipedSearch(query);
      if (query !== this._lastQuery) return; // stale
      this._renderResults(results);
    } catch (e) {
      console.warn('[Music] Search failed:', e.message);
      if (resultsEl) resultsEl.innerHTML = `<p class="text-red-400 text-center py-8">Search failed — ${Hub.utils.esc(e.message)}</p>`;
    }
  },

  async _pipedSearch(query) {
    // Try each Piped instance until one works
    let lastErr;
    for (let attempt = 0; attempt < this._PIPED_INSTANCES.length; attempt++) {
      const baseUrl = this._PIPED_INSTANCES[(this._pipedIndex + attempt) % this._PIPED_INSTANCES.length];
      try {
        const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        // Remember which instance worked
        this._pipedIndex = (this._pipedIndex + attempt) % this._PIPED_INSTANCES.length;
        return this._parsePipedResults(data);
      } catch (e) {
        lastErr = e;
        // Try a videos filter as fallback
        try {
          const url = `${baseUrl}/search?q=${encodeURIComponent(query + ' music')}&filter=videos`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          this._pipedIndex = (this._pipedIndex + attempt) % this._PIPED_INSTANCES.length;
          return this._parsePipedResults(data);
        } catch (e2) {
          lastErr = e2;
        }
      }
    }
    throw lastErr || new Error('All search instances unavailable');
  },

  _parsePipedResults(data) {
    const items = data.items || data || [];
    return items
      .filter(item => item.url && item.type === 'stream')
      .slice(0, 20)
      .map(item => {
        // Extract videoId from /watch?v=XXX
        const match = item.url?.match(/[?&]v=([^&]+)/) || item.url?.match(/\/watch\/([^?]+)/);
        const videoId = match?.[1] || item.url?.replace('/watch?v=', '') || '';
        return {
          videoId,
          title:     item.title || 'Unknown',
          artist:    item.uploaderName || item.uploader || '',
          thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          duration:  item.duration || 0,  // seconds
        };
      })
      .filter(r => r.videoId);
  },

  // ── Audio stream fetching ────────────────────────────────────

  /** Fetch a direct audio stream URL for a videoId.
   *  Tries Piped /streams/ first, then Invidious /api/v1/videos/.
   *  Returns { url, mimeType, duration } or null. */
  async _getAudioStream(videoId) {
    // 1. Try Piped instances
    for (let i = 0; i < this._PIPED_INSTANCES.length; i++) {
      const base = this._PIPED_INSTANCES[(this._pipedIndex + i) % this._PIPED_INSTANCES.length];
      try {
        const resp = await fetch(`${base}/streams/${videoId}`, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) continue;
        const data = await resp.json();
        // Pick best audio stream (prefer opus/webm, highest bitrate)
        const streams = (data.audioStreams || [])
          .filter(s => s.url && s.mimeType?.startsWith('audio/'))
          .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        if (streams.length > 0) {
          this._pipedIndex = (this._pipedIndex + i) % this._PIPED_INSTANCES.length;
          return { url: streams[0].url, mimeType: streams[0].mimeType, duration: data.duration || 0 };
        }
      } catch (_) {}
    }

    // 2. Try Invidious instances
    for (const base of this._INVIDIOUS_INSTANCES) {
      try {
        const resp = await fetch(`${base}/api/v1/videos/${videoId}`, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) continue;
        const data = await resp.json();
        const streams = (data.adaptiveFormats || [])
          .filter(s => s.type?.startsWith('audio/') && s.url)
          .sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
        if (streams.length > 0) {
          return { url: streams[0].url, mimeType: streams[0].type, duration: data.lengthSeconds || 0 };
        }
      } catch (_) {}
    }

    return null;
  },

  // ── Playback ────────────────────────────────────────────────

  async play(videoId, title, artist, thumbnail, duration) {
    if (!videoId) return;

    const track = { videoId, title, artist, thumbnail, duration };

    // Add to history
    this._addToHistory(track);

    // Update queue position if this track is in the queue
    const qIdx = this._queue.findIndex(t => t.videoId === videoId);
    if (qIdx >= 0) {
      this._queueIndex = qIdx;
    } else {
      // Not in queue — insert after current position
      this._queueIndex++;
      this._queue.splice(this._queueIndex, 0, track);
    }

    // Show "loading" state immediately
    Hub.player.playMusicStream(null, title, artist, thumbnail, duration);

    // Re-render if on music page
    if (Hub.router?.current === 'music') {
      this._updateNowPlayingBar();
      this._highlightActive();
    }

    // Fetch direct audio stream URL
    try {
      const stream = await this._getAudioStream(videoId);
      if (!stream?.url) {
        // Fallback to YouTube IFrame player if stream fetch fails
        console.warn('[Music] No audio stream found, falling back to YT IFrame');
        Hub.player.playMusic(videoId, title, artist, thumbnail);
        return;
      }
      // Play the audio stream natively
      Hub.player.playMusicStream(stream.url, title, artist, thumbnail, stream.duration || duration);
    } catch (e) {
      console.warn('[Music] Stream fetch error, falling back to YT IFrame:', e.message);
      Hub.player.playMusic(videoId, title, artist, thumbnail);
    }
  },

  playNext() {
    if (this._queueIndex < this._queue.length - 1) {
      this._queueIndex++;
      const t = this._queue[this._queueIndex];
      this.play(t.videoId, t.title, t.artist, t.thumbnail, t.duration);
    }
  },

  playPrev() {
    if (this._queueIndex > 0) {
      this._queueIndex--;
      const t = this._queue[this._queueIndex];
      this.play(t.videoId, t.title, t.artist, t.thumbnail, t.duration);
    }
  },

  /** Called by player.js when a music track ends */
  onTrackEnd() {
    // Auto-play next in queue
    if (this._queueIndex < this._queue.length - 1) {
      this.playNext();
    } else {
      this._queueIndex = -1;
      Hub.player.stop();
    }
  },

  // ── Queue management ────────────────────────────────────────

  addToQueue(videoId, title, artist, thumbnail, duration) {
    const track = { videoId, title, artist, thumbnail, duration };
    // Prevent duplicates
    if (!this._queue.some(t => t.videoId === videoId)) {
      this._queue.push(track);
      Hub.ui?.toast?.(`Queued: ${title}`, 'success');
    }
  },

  clearQueue() {
    this._queue = [];
    this._queueIndex = -1;
    if (Hub.router?.current === 'music') this._renderQueueSection();
  },

  // ── Favorites ───────────────────────────────────────────────

  _getFavorites() {
    try { return JSON.parse(localStorage.getItem(this._FAVORITES_KEY) || '[]'); }
    catch { return []; }
  },

  _saveFavorites(favs) {
    try { localStorage.setItem(this._FAVORITES_KEY, JSON.stringify(favs)); }
    catch {}
  },

  toggleFavorite(videoId, title, artist, thumbnail, duration) {
    const favs = this._getFavorites();
    const idx = favs.findIndex(f => f.videoId === videoId);
    if (idx >= 0) {
      favs.splice(idx, 1);
      Hub.ui?.toast?.('Removed from favorites', 'info');
    } else {
      favs.unshift({ videoId, title, artist, thumbnail, duration, addedAt: Date.now() });
      Hub.ui?.toast?.('Added to favorites', 'success');
    }
    this._saveFavorites(favs);
    // Re-render if on music page
    if (Hub.router?.current === 'music') {
      this._renderFavoritesSection();
      this._highlightActive();
    }
  },

  isFavorite(videoId) {
    return this._getFavorites().some(f => f.videoId === videoId);
  },

  // ── History ─────────────────────────────────────────────────

  _getHistory() {
    try { return JSON.parse(localStorage.getItem(this._HISTORY_KEY) || '[]'); }
    catch { return []; }
  },

  _addToHistory(track) {
    const history = this._getHistory().filter(h => h.videoId !== track.videoId);
    history.unshift({ ...track, playedAt: Date.now() });
    if (history.length > this._MAX_HISTORY) history.length = this._MAX_HISTORY;
    try { localStorage.setItem(this._HISTORY_KEY, JSON.stringify(history)); }
    catch {}
  },

  // ── Play All helpers ────────────────────────────────────────

  playAllFavorites() {
    const favs = this._getFavorites();
    if (!favs.length) return;
    this._queue = [...favs];
    this._queueIndex = 0;
    const t = this._queue[0];
    this.play(t.videoId, t.title, t.artist, t.thumbnail, t.duration);
  },

  playAllResults() {
    if (!this._currentResults?.length) return;
    this._queue = [...this._currentResults];
    this._queueIndex = 0;
    const t = this._queue[0];
    this.play(t.videoId, t.title, t.artist, t.thumbnail, t.duration);
  },

  _currentResults: [],

  // ── Render ──────────────────────────────────────────────────

  _renderPage() {
    const container = document.getElementById('musicPlayerArea');
    if (!container) return;

    const favs    = this._getFavorites();
    const history = this._getHistory();
    const bridgeActive = this._bridgeReady && this._bridgeConnected;

    // ── Bridge status banner ────────────────────────────────
    const bridgeBanner = this._bridgeReady ? `
      <div class="card mb-4" style="background:${this._bridgeConnected
        ? 'rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2)'
        : 'rgba(234,179,8,.1);border:1px solid rgba(234,179,8,.2)'};">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span style="font-size:1.1rem;">${this._bridgeConnected ? '🔗' : '🔌'}</span>
            <div>
              <p class="text-sm font-medium">${this._bridgeConnected
                ? 'Connected to YouTube Music'
                : 'Extension ready — no YouTube Music tab'}</p>
              <p class="text-xs text-gray-400">${this._bridgeConnected
                ? 'Controlling playback from this dashboard'
                : 'Open YouTube Music to connect'}</p>
            </div>
          </div>
          <button onclick="Hub.music._openYTM()" class="btn btn-secondary text-sm px-3">
            ${this._bridgeConnected ? 'Switch to YTM' : 'Open YTM'}
          </button>
        </div>
      </div>` : '';

    // ── Now playing bar (bridge or standalone) ──────────────
    const nowPlayingHTML = bridgeActive
      ? this._bridgeNowPlayingHTML()
      : this._nowPlayingHTML();

    container.innerHTML = `
      ${bridgeBanner}

      <!-- Now playing bar -->
      <div id="musicNowPlaying" class="card mb-4" style="background:rgba(30,41,59,.8);">
        ${nowPlayingHTML}
      </div>

      <!-- Search -->
      <div class="card mb-4">
        <div class="flex gap-2">
          <input id="musicSearchInput" type="text" class="input flex-1"
            placeholder="Search YouTube Music…"
            value="${Hub.utils.esc(this._lastQuery)}"
            onkeydown="if(event.key==='Enter')Hub.music._doSearch()">
          <button onclick="Hub.music._doSearch()" class="btn btn-primary px-5">Search</button>
          ${this._bridgeReady ? `
            <button onclick="Hub.music._doSearchYTM()" class="btn btn-secondary px-3" title="Search in YouTube Music tab">
              ↗
            </button>` : ''}
        </div>
      </div>

      <!-- Search results -->
      <div id="musicResults"></div>

      <!-- Queue (if populated) -->
      <div id="musicQueueSection">
        ${this._queue.length > 0 ? this._queueHTML() : ''}
      </div>

      <!-- Favorites -->
      <div id="musicFavoritesSection">
        ${favs.length > 0 ? this._favoritesHTML(favs) : `
          <div class="card mb-4">
            <h3 class="font-semibold text-lg mb-2">❤️ Favorites</h3>
            <p class="text-gray-500 text-sm">Tap the heart on any song to save it here</p>
          </div>
        `}
      </div>

      <!-- Recently Played -->
      ${history.length > 0 ? `
        <div id="musicHistorySection" class="card mb-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-lg">🕐 Recently Played</h3>
            <button onclick="localStorage.removeItem('${this._HISTORY_KEY}');Hub.music._renderPage()"
              class="text-xs text-gray-500 hover:text-gray-300">Clear</button>
          </div>
          <div class="space-y-1">${history.slice(0, 10).map(t => this._trackRowHTML(t, 'history')).join('')}</div>
        </div>
      ` : ''}

      <!-- YouTube player container (hidden, managed by player.js) -->
      <div id="musicYTContainer" style="position:fixed;bottom:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;"></div>
    `;

    // Focus search if empty
    if (!this._lastQuery) {
      setTimeout(() => document.getElementById('musicSearchInput')?.focus(), 100);
    }
  },

  _doSearchYTM() {
    const input = document.getElementById('musicSearchInput');
    if (input?.value?.trim()) this._searchYTM(input.value.trim());
  },

  // ── Bridge now-playing bar ─────────────────────────────────

  _bridgeNowPlayingHTML() {
    const s = this._bridgeState;
    if (!s || !s.title) {
      return `
        <div class="flex items-center gap-4">
          <div style="width:48px;height:48px;border-radius:.5rem;background:#1a2535;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">🎵</div>
          <div class="flex-1">
            <p class="font-semibold text-gray-400">Waiting for playback…</p>
            <p class="text-xs text-gray-500">Play something in YouTube Music</p>
          </div>
        </div>`;
    }

    const progress = s.duration > 0 ? (s.currentTime / s.duration * 100) : 0;
    const cur = this._fmtDuration(Math.floor(s.currentTime));
    const dur = this._fmtDuration(Math.floor(s.duration));

    return `
      <div class="flex items-center gap-4 mb-3">
        ${s.thumbnail ? `
          <img src="${Hub.utils.esc(s.thumbnail)}" alt=""
            style="width:56px;height:56px;border-radius:.5rem;object-fit:cover;flex-shrink:0;background:#1a2535;"
            onerror="this.style.display='none'">` : `
          <div style="width:56px;height:56px;border-radius:.5rem;background:#1a2535;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">🎵</div>`}
        <div class="flex-1 min-w-0">
          <p class="font-semibold truncate text-white">${Hub.utils.esc(s.title)}</p>
          <p class="text-xs text-gray-400 truncate">${Hub.utils.esc(s.artist)}${s.album ? ' · ' + Hub.utils.esc(s.album) : ''}</p>
        </div>
      </div>
      <!-- Progress bar -->
      <div class="flex items-center gap-2 mb-3">
        <span class="text-xs text-gray-500 tabular-nums">${cur}</span>
        <div class="flex-1 h-1 rounded bg-gray-700 overflow-hidden">
          <div style="width:${progress.toFixed(1)}%;height:100%;background:#8b5cf6;border-radius:9999px;transition:width .8s linear;"></div>
        </div>
        <span class="text-xs text-gray-500 tabular-nums">${dur}</span>
      </div>
      <!-- Controls -->
      <div class="flex items-center justify-center gap-2">
        <button onclick="Hub.music._bridgeCmd('prev')" class="p-2 rounded-lg hover:bg-white/10 transition-colors"
          style="background:none;border:none;cursor:pointer;font-size:1rem;">⏮</button>
        <button onclick="Hub.music._bridgeCmd('togglePlay')"
          class="p-2 rounded-lg hover:bg-white/10 transition-colors"
          style="background:none;border:none;cursor:pointer;font-size:1.3rem;">${s.playing ? '⏸' : '▶️'}</button>
        <button onclick="Hub.music._bridgeCmd('next')" class="p-2 rounded-lg hover:bg-white/10 transition-colors"
          style="background:none;border:none;cursor:pointer;font-size:1rem;">⏭</button>
        <button onclick="Hub.music._bridgeCmd('like')" class="p-2 rounded-lg hover:bg-white/10 transition-colors"
          style="background:none;border:none;cursor:pointer;font-size:1rem;" title="Like">❤️</button>
      </div>`;
  },

  _updateBridgeNowPlaying() {
    const el = document.getElementById('musicNowPlaying');
    if (el && this._bridgeConnected) {
      el.innerHTML = this._bridgeNowPlayingHTML();
    }
  },

  _doSearch() {
    const input = document.getElementById('musicSearchInput');
    if (input?.value?.trim()) this.search(input.value);
  },

  _renderResults(results) {
    this._currentResults = results;
    const el = document.getElementById('musicResults');
    if (!el) return;

    if (!results.length) {
      el.innerHTML = '<p class="text-gray-400 text-center py-8">No results found</p>';
      return;
    }

    el.innerHTML = `
      <div class="card mb-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-lg">🔍 Results</h3>
          <button onclick="Hub.music.playAllResults()" class="btn btn-secondary text-sm px-3">▶ Play All</button>
        </div>
        <div class="space-y-1">${results.map(t => this._trackRowHTML(t, 'result')).join('')}</div>
      </div>
    `;
    this._highlightActive();
  },

  _renderFavoritesSection() {
    const el = document.getElementById('musicFavoritesSection');
    if (!el) return;
    const favs = this._getFavorites();
    el.innerHTML = favs.length > 0 ? this._favoritesHTML(favs) : `
      <div class="card mb-4">
        <h3 class="font-semibold text-lg mb-2">❤️ Favorites</h3>
        <p class="text-gray-500 text-sm">Tap the heart on any song to save it here</p>
      </div>`;
    this._highlightActive();
  },

  _renderQueueSection() {
    const el = document.getElementById('musicQueueSection');
    if (!el) return;
    el.innerHTML = this._queue.length > 0 ? this._queueHTML() : '';
  },

  _favoritesHTML(favs) {
    return `
      <div class="card mb-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-lg">❤️ Favorites</h3>
          <button onclick="Hub.music.playAllFavorites()" class="btn btn-secondary text-sm px-3">▶ Play All</button>
        </div>
        <div class="space-y-1">${favs.map(t => this._trackRowHTML(t, 'fav')).join('')}</div>
      </div>`;
  },

  _queueHTML() {
    return `
      <div class="card mb-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-lg">📋 Queue <span class="text-gray-500 text-sm font-normal">(${this._queue.length})</span></h3>
          <button onclick="Hub.music.clearQueue();Hub.music._renderQueueSection()" class="text-xs text-gray-500 hover:text-gray-300">Clear</button>
        </div>
        <div class="space-y-1">${this._queue.map((t, i) => this._trackRowHTML(t, 'queue', i)).join('')}</div>
      </div>`;
  },

  _trackRowHTML(track, context, queueIdx) {
    const v  = Hub.utils.esc;
    const id = track.videoId;
    const isFav = this.isFavorite(id);
    const isActive = Hub.player?.state?.currentSource === 'music' && Hub.player?.state?.musicVideoId === id;
    const dur = track.duration ? this._fmtDuration(track.duration) : '';

    // Build escaped JSON for onclick — avoid nested quote issues
    const playArgs = `'${v(id)}','${v(track.title).replace(/'/g, "\\'")}','${v(track.artist).replace(/'/g, "\\'")}','${v(track.thumbnail)}',${track.duration || 0}`;
    const favArgs = playArgs;

    return `
      <div class="flex items-center gap-2 p-2 rounded-lg transition-colors
           ${isActive ? 'bg-purple-900/40 border border-purple-700/50' : 'hover:bg-white/5'}"
           data-music-id="${v(id)}" style="cursor:pointer;"
           onclick="Hub.music.play(${playArgs})">
        <img src="${v(track.thumbnail)}" alt="" loading="lazy"
          style="width:44px;height:44px;border-radius:.375rem;object-fit:cover;flex-shrink:0;background:#1a2535;"
          onerror="this.style.display='none'">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate ${isActive ? 'text-purple-300' : ''}">${v(track.title)}</p>
          <p class="text-xs text-gray-500 truncate">${v(track.artist)}${dur ? ' · ' + dur : ''}</p>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button onclick="event.stopPropagation();Hub.music.toggleFavorite(${favArgs})"
            class="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            style="background:none;border:none;cursor:pointer;font-size:1rem;line-height:1;"
            title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">${isFav ? '❤️' : '🤍'}</button>
          <button onclick="event.stopPropagation();Hub.music.addToQueue(${playArgs})"
            class="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            style="background:none;border:none;cursor:pointer;font-size:.85rem;line-height:1;"
            title="Add to queue">➕</button>
        </div>
      </div>`;
  },

  _nowPlayingHTML() {
    const p = Hub.player?.state;
    if (!p || p.currentSource !== 'music') {
      return `
        <div class="flex items-center gap-4">
          <div style="width:48px;height:48px;border-radius:.5rem;background:#1a2535;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">🎵</div>
          <div class="flex-1">
            <p class="font-semibold text-gray-400">No music playing</p>
            <p class="text-xs text-gray-500">Search for a song or pick a favorite</p>
          </div>
        </div>`;
    }

    const hasPrev = this._queueIndex > 0;
    const hasNext = this._queueIndex < this._queue.length - 1;
    const isLoading = p.radioStatus === 'connecting' || p.radioStatus === 'buffering';
    const statusText = isLoading ? (p.radioStatus === 'connecting' ? 'Loading stream…' : 'Buffering…') : '';

    return `
      <div class="flex items-center gap-4 mb-2">
        <img src="${Hub.utils.esc(p.musicThumbnail || '')}" alt=""
          style="width:56px;height:56px;border-radius:.5rem;object-fit:cover;flex-shrink:0;background:#1a2535;"
          onerror="this.src='/icons/icon-192.png'">
        <div class="flex-1 min-w-0">
          <p class="font-semibold truncate text-white">${Hub.utils.esc(p.title)}</p>
          <p class="text-xs text-gray-400 truncate">${Hub.utils.esc(p.musicArtist || '')}</p>
          ${statusText ? `<p class="text-xs text-yellow-400 mt-0.5">${statusText}</p>` : ''}
        </div>
      </div>
      <!-- Progress bar -->
      <div class="flex items-center gap-2 mb-3">
        <span id="musicTimeCurrent" class="text-xs text-gray-500 tabular-nums">0:00</span>
        <div class="flex-1 h-1 rounded bg-gray-700 overflow-hidden">
          <div id="musicProgressFill" style="width:0%;height:100%;background:#8b5cf6;border-radius:9999px;transition:width .8s linear;"></div>
        </div>
        <span id="musicTimeDuration" class="text-xs text-gray-500 tabular-nums">${p.musicDuration ? this._fmtDuration(p.musicDuration) : '—'}</span>
      </div>
      <!-- Controls -->
      <div class="flex items-center justify-center gap-2">
        <button onclick="Hub.music.playPrev()" class="p-2 rounded-lg hover:bg-white/10 transition-colors"
          style="background:none;border:none;cursor:pointer;font-size:1rem;opacity:${hasPrev ? 1 : 0.3};" ${hasPrev ? '' : 'disabled'}>⏮</button>
        <button onclick="Hub.player.${p.isPlaying ? 'pause' : 'resume'}()"
          class="p-2 rounded-lg hover:bg-white/10 transition-colors"
          style="background:none;border:none;cursor:pointer;font-size:1.3rem;">${isLoading ? '⏳' : p.isPlaying ? '⏸' : '▶️'}</button>
        <button onclick="Hub.music.playNext()" class="p-2 rounded-lg hover:bg-white/10 transition-colors"
          style="background:none;border:none;cursor:pointer;font-size:1rem;opacity:${hasNext ? 1 : 0.3};" ${hasNext ? '' : 'disabled'}>⏭</button>
        <button onclick="Hub.player.stop()" class="p-2 rounded-lg hover:bg-white/10 transition-colors"
          style="background:none;border:none;cursor:pointer;font-size:1rem;">⏹</button>
      </div>`;
  },

  _updateNowPlayingBar() {
    const el = document.getElementById('musicNowPlaying');
    if (el) el.innerHTML = (this._bridgeReady && this._bridgeConnected)
      ? this._bridgeNowPlayingHTML()
      : this._nowPlayingHTML();
  },

  /** Called by player.js on audio timeupdate — updates the progress bar */
  _updateProgress(currentTime, duration) {
    if (Hub.router?.current !== 'music') return;
    const bar = document.getElementById('musicProgressFill');
    const curEl = document.getElementById('musicTimeCurrent');
    const durEl = document.getElementById('musicTimeDuration');
    if (bar && duration > 0) {
      bar.style.width = (currentTime / duration * 100).toFixed(1) + '%';
    }
    if (curEl) curEl.textContent = this._fmtDuration(Math.floor(currentTime));
    if (durEl) durEl.textContent = this._fmtDuration(Math.floor(duration));
  },

  _highlightActive() {
    const activeId = Hub.player?.state?.musicVideoId;
    document.querySelectorAll('[data-music-id]').forEach(row => {
      const isActive = row.dataset.musicId === activeId;
      row.classList.toggle('bg-purple-900/40', isActive);
      row.classList.toggle('border', isActive);
      row.classList.toggle('border-purple-700/50', isActive);
    });
  },

  _fmtDuration(seconds) {
    if (!seconds || seconds <= 0) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  },
};
