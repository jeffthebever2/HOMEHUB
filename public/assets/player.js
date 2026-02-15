// Shared media player (Radio audio + optional YouTube IFrame player)
// Keeps "Now Playing" consistent across Dashboard + Standby + Music + Radio.

window.Hub = window.Hub || {};

Hub.player = {
  _audio: null,
  _yt: null,
  _ytReady: false,
  _state: {
    type: 'none', // 'none' | 'radio' | 'youtube'
    title: 'Nothing playing',
    subtitle: '',
    playing: false
  },
  _listeners: [],

  init() {
    if (this._audio) return;
    this._audio = new Audio();
    this._audio.preload = 'none';
    this._audio.crossOrigin = 'anonymous';

    this._audio.addEventListener('play', () => {
      if (this._state.type === 'radio') {
        this._state.playing = true;
        this._emit();
      }
    });
    this._audio.addEventListener('pause', () => {
      if (this._state.type === 'radio') {
        this._state.playing = false;
        this._emit();
      }
    });
    this._audio.addEventListener('ended', () => {
      if (this._state.type === 'radio') {
        this._state.playing = false;
        this._emit();
      }
    });
    this._audio.addEventListener('error', () => {
      console.warn('[Player] audio error');
      if (this._state.type === 'radio') {
        this._state.playing = false;
        this._emit();
      }
    });

    // MediaSession (nice for Pi/tablet lock screens)
    try {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => this.play());
        navigator.mediaSession.setActionHandler('pause', () => this.pause());
        navigator.mediaSession.setActionHandler('stop', () => this.stop());
      }
    } catch (_) {}
  },

  onUpdate(fn) {
    this._listeners.push(fn);
  },

  _emit() {
    try {
      this._syncMediaSession();
    } catch (_) {}
    this._listeners.forEach(fn => {
      try { fn(this._state); } catch (_) {}
    });

    // Update built-in widgets if present
    this._renderDashboard();
    this._renderStandby();
    this._renderMusicInfo();
    this._renderRadioInfo();
  },

  _syncMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const title = this._state.title || 'Now Playing';
    const artist = this._state.subtitle || (this._state.type === 'radio' ? 'Radio' : 'YouTube');
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist
    });
  },

  getState() {
    return { ...this._state };
  },

  // ---- RADIO ----
  async playRadio(station) {
    this.init();
    if (!station || !station.url) return;

    // Stop YouTube if it's active
    if (this._state.type === 'youtube') {
      try { this.pauseYouTube(); } catch (_) {}
    }

    this._state.type = 'radio';
    this._state.title = station.name || 'Radio';
    this._state.subtitle = station.tagline || '';
    this._state.playing = false;
    this._emit();

    try {
      this._audio.src = station.url;
      this._audio.currentTime = 0;
      await this._audio.play();
      this._state.playing = true;
      this._emit();
    } catch (e) {
      console.warn('[Player] radio play blocked or failed:', e?.message);
      this._state.playing = false;
      this._emit();
    }
  },

  pauseRadio() {
    if (!this._audio) return;
    try { this._audio.pause(); } catch (_) {}
  },

  async resumeRadio() {
    if (!this._audio) return;
    try { await this._audio.play(); } catch (_) {}
  },

  stopRadio() {
    if (!this._audio) return;
    try {
      this._audio.pause();
      this._audio.removeAttribute('src');
      this._audio.load();
    } catch (_) {}
    this._state.playing = false;
    this._emit();
  },

  // ---- YOUTUBE ----
  setYouTubePlayer(player) {
    this._yt = player;
    this._ytReady = true;
  },

  _updateFromYouTube() {
    try {
      const data = this._yt?.getVideoData?.() || {};
      const title = data.title || 'YouTube';
      this._state.type = 'youtube';
      this._state.title = title;
      this._state.subtitle = 'YouTube';
      const ps = this._yt?.getPlayerState?.();
      // 1 playing, 2 paused
      this._state.playing = ps === 1;
    } catch (_) {}
    this._emit();
  },

  playYouTube() {
    if (!this._ytReady) return;
    try { this._yt.playVideo(); } catch (_) {}
    this._updateFromYouTube();
  },

  pauseYouTube() {
    if (!this._ytReady) return;
    try { this._yt.pauseVideo(); } catch (_) {}
    this._updateFromYouTube();
  },

  stopYouTube() {
    if (!this._ytReady) return;
    try { this._yt.stopVideo(); } catch (_) {}
    this._updateFromYouTube();
  },

  // ---- unified controls ----
  async play() {
    if (this._state.type === 'radio') return this.resumeRadio();
    if (this._state.type === 'youtube') return this.playYouTube();
  },

  pause() {
    if (this._state.type === 'radio') return this.pauseRadio();
    if (this._state.type === 'youtube') return this.pauseYouTube();
  },

  stop() {
    if (this._state.type === 'radio') return this.stopRadio();
    if (this._state.type === 'youtube') return this.stopYouTube();
    this._state = { type: 'none', title: 'Nothing playing', subtitle: '', playing: false };
    this._emit();
  },

  toggle() {
    if (!this._state.playing) return this.play();
    return this.pause();
  },

  // ---- Widgets ----
  renderDashboardWidget() {
    this._renderDashboard();
  },

  renderStandbyWidget() {
    this._renderStandby();
  },

  _renderDashboard() {
    const el = document.getElementById('nowPlayingWidget');
    if (!el) return;
    const s = this._state;
    const icon = s.type === 'radio' ? '📻' : (s.type === 'youtube' ? '🎵' : '—');
    el.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-wide text-gray-400">Source</p>
          <p class="text-sm font-semibold mt-1">${icon} ${Hub.utils ? Hub.utils.esc(s.type) : s.type}</p>
          <p class="text-xl font-bold mt-2 truncate">${Hub.utils ? Hub.utils.esc(s.title) : s.title}</p>
          <p class="text-sm text-gray-400 mt-1 truncate">${Hub.utils ? Hub.utils.esc(s.subtitle || (s.playing ? 'Playing' : 'Paused')) : (s.subtitle || '')}</p>
        </div>
        <div class="flex flex-col gap-2 flex-shrink-0">
          <button class="btn btn-primary text-sm py-2 px-4" onclick="Hub.player.toggle()">${s.playing ? '⏸ Pause' : '▶️ Play'}</button>
          <button class="btn btn-secondary text-sm py-2 px-4" onclick="Hub.player.stop()">⏹ Stop</button>
        </div>
      </div>
    `;
  },

  _renderStandby() {
    const el = document.getElementById('standbyNowPlaying');
    if (!el) return;
    const s = this._state;
    el.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs text-gray-400">Now playing</p>
          <p class="text-sm font-semibold truncate">${Hub.utils ? Hub.utils.esc(s.title) : s.title}</p>
          <p class="text-xs text-gray-500 truncate">${Hub.utils ? Hub.utils.esc(s.subtitle || s.type) : (s.subtitle || s.type)}</p>
        </div>
        <button class="btn btn-secondary text-xs py-2 px-3" onclick="Hub.player.toggle()">${s.playing ? '⏸' : '▶️'}</button>
      </div>
    `;
  },

  _renderMusicInfo() {
    const el = document.getElementById('musicInfo');
    if (!el) return;
    const s = this._state;
    el.innerHTML = `
      <p class="text-sm"><span class="hh-muted">Title:</span> ${Hub.utils ? Hub.utils.esc(s.title) : s.title}</p>
      <p class="text-sm mt-2"><span class="hh-muted">Source:</span> ${Hub.utils ? Hub.utils.esc(s.type) : s.type}</p>
      <p class="text-sm mt-2"><span class="hh-muted">Status:</span> ${s.playing ? 'Playing' : 'Paused'}</p>
    `;
  },

  _renderRadioInfo() {
    const statusEl = document.getElementById('radioStatus');
    const npEl = document.getElementById('radioNowPlaying');
    if (!statusEl && !npEl) return;
    const s = this._state;
    if (statusEl) statusEl.textContent = s.type === 'radio' ? (s.playing ? 'Playing' : 'Paused') : 'Idle';
    if (npEl) npEl.textContent = s.type === 'radio' ? `${s.title}${s.subtitle ? ' — ' + s.subtitle : ''}` : 'Nothing playing';
  }
};
