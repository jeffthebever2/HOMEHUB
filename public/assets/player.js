// ============================================================
// public/assets/player.js — Unified Player State + Audio
// Fixed:
//  - Proper radio flow: src → load() → canplay → play()
//  - Stall retry once after 6s
//  - Autoplay restriction overlay
//  - Status labels: Connecting / Buffering / Playing / Failed
//  - Now Playing updates in-place (no DOM duplication)
// ============================================================
window.Hub = window.Hub || {};

Hub.player = {
  state: {
    currentSource: null,   // 'radio' | 'youtube' | null
    title:         '',
    isPlaying:     false,
    startedAt:     null,
    volume:        0.7,
    radioStatus:   ''      // 'connecting' | 'buffering' | 'playing' | 'failed' | ''
  },

  radioAudio:      null,
  _radioListeners: [],
  _stallTimer:     null,
  _retryCount:     0,

  init() {
    console.log('[Player] Initializing...');
    this.radioAudio        = new Audio();
    this.radioAudio.preload = 'none';
    this.radioAudio.volume  = this.state.volume;
    this.setupMediaSession();
    console.log('[Player] Ready');
  },

  // ── Radio ─────────────────────────────────────────────────

  playRadio(stationName, streamUrl) {
    console.log('[Player] playRadio:', stationName);
    this._stopRadioHard();

    this.state.currentSource = 'radio';
    this.state.title         = stationName;
    this.state.startedAt     = Date.now();
    this.state.isPlaying     = false;
    this.state.radioStatus   = 'connecting';
    this._retryCount         = 0;
    this.updateUI();

    this._startStream(streamUrl);
  },

  _startStream(streamUrl) {
    const audio = this.radioAudio;
    this._removeRadioListeners();

    const on = (evt, fn) => { audio.addEventListener(evt, fn); this._radioListeners.push([evt, fn]); };

    on('loadstart', ()  => this._setStatus('connecting'));
    on('canplay',   ()  => {
      this._clearStallTimer();
      this._setStatus('buffering');
      audio.play().catch(err => this._handlePlayError(err, streamUrl));
    });
    on('playing',   ()  => { this._clearStallTimer(); this._setStatus('playing'); });
    on('waiting',   ()  => { this._setStatus('buffering'); this._startStallTimer(streamUrl); });
    on('stalled',   ()  => { this._setStatus('buffering'); this._startStallTimer(streamUrl); });
    on('pause',     ()  => { if (this.state.currentSource === 'radio') this.updateUI(); });
    on('error',     ()  => this._handleStreamError(streamUrl));

    audio.src = streamUrl;
    audio.load();
  },

  _handlePlayError(err, streamUrl) {
    console.warn('[Player] play() rejected:', err.name, err.message);
    if (err.name === 'NotAllowedError') {
      this._setStatus('failed');
      this._showAutoplayOverlay();
    } else {
      this._setStatus('failed');
      Hub.ui?.toast?.('Playback failed — check station URL', 'error');
    }
  },

  _handleStreamError(streamUrl) {
    const code = this.radioAudio.error?.code ?? '?';
    console.error('[Player] Audio error code:', code);

    if (this._retryCount < 1) {
      this._retryCount++;
      console.log('[Player] Retrying stream (attempt', this._retryCount, ')');
      this._setStatus('connecting');
      setTimeout(() => {
        if (this.state.currentSource === 'radio') {
          this.radioAudio.load();
          this.radioAudio.play().catch(err => this._handlePlayError(err, streamUrl));
        }
      }, 1500);
    } else {
      this._setStatus('failed');
      Hub.ui?.toast?.('Station offline or blocked', 'error');
    }
  },

  _startStallTimer(streamUrl) {
    this._clearStallTimer();
    this._stallTimer = setTimeout(() => {
      if (this.state.radioStatus !== 'playing' && this._retryCount < 1) {
        console.log('[Player] Stall timeout — retrying');
        this._retryCount++;
        this._setStatus('connecting');
        this.radioAudio.load();
        this.radioAudio.play().catch(err => this._handlePlayError(err, streamUrl));
      }
    }, 6000);
  },

  _clearStallTimer() {
    if (this._stallTimer) { clearTimeout(this._stallTimer); this._stallTimer = null; }
  },

  _setStatus(status) {
    this.state.radioStatus = status;
    this.state.isPlaying   = status === 'playing';
    this.updateUI();
  },

  _removeRadioListeners() {
    this._radioListeners.forEach(([e, fn]) => this.radioAudio.removeEventListener(e, fn));
    this._radioListeners = [];
  },

  _stopRadioHard() {
    this._clearStallTimer();
    this._removeRadioListeners();
    this.radioAudio.pause();
    this.radioAudio.src = '';
    try { this.radioAudio.load(); } catch (_) {}
  },

  _showAutoplayOverlay() {
    document.getElementById('autoplayOverlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'autoplayOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.innerHTML = `
      <div style="background:#1E2738;border-radius:1rem;padding:2rem;max-width:400px;width:90%;text-align:center;border:1px solid rgba(255,255,255,.1);">
        <div style="font-size:3rem;margin-bottom:1rem;">📻</div>
        <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:.5rem;">Tap to Start Audio</h2>
        <p style="color:#9ca3af;font-size:.875rem;margin-bottom:1.5rem;">Your browser requires a tap to begin audio playback.</p>
        <button id="autoplayTapBtn" style="background:#3b82f6;color:#fff;border:none;border-radius:.5rem;padding:.75rem 2rem;font-size:1rem;font-weight:600;cursor:pointer;width:100%;">
          ▶ Play ${Hub.utils.esc(this.state.title)}
        </button>
        <br><br>
        <button onclick="document.getElementById('autoplayOverlay').remove()"
          style="background:transparent;color:#6b7280;border:none;cursor:pointer;font-size:.85rem;">Cancel</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('autoplayTapBtn').onclick = () => {
      overlay.remove();
      this.radioAudio.play()
        .then(() => this._setStatus('playing'))
        .catch(() => { this._setStatus('failed'); Hub.ui?.toast?.('Audio failed', 'error'); });
    };
  },

  // ── YouTube / Spotify ──────────────────────────────────────

  playYouTube(title = 'YouTube Music') {
    if (this.state.currentSource === 'radio') this._stopRadioHard();
    this.state.currentSource = 'youtube';
    this.state.title         = title;
    this.state.isPlaying     = true;
    this.state.startedAt     = Date.now();
    this.state.radioStatus   = '';
    this.updateMediaSession();
    this.updateUI();
  },

  pause() {
    if (this.state.currentSource === 'radio')   this.radioAudio.pause();
    if (this.state.currentSource === 'youtube') window.dispatchEvent(new CustomEvent('player:pause-youtube'));
    this.state.isPlaying = false;
    this.updateUI();
  },

  resume() {
    if (this.state.currentSource === 'radio')
      this.radioAudio.play().catch(() => this._showAutoplayOverlay());
    if (this.state.currentSource === 'youtube')
      window.dispatchEvent(new CustomEvent('player:resume-youtube'));
    this.state.isPlaying = true;
    this.updateUI();
  },

  stop() {
    this._stopRadioHard();
    if (this.state.currentSource === 'youtube')
      window.dispatchEvent(new CustomEvent('player:stop-youtube'));
    this.state.currentSource = null;
    this.state.title         = '';
    this.state.isPlaying     = false;
    this.state.startedAt     = null;
    this.state.radioStatus   = '';
    this.updateMediaSession();
    this.updateUI();
  },

  setVolume(level) {
    this.state.volume = Math.max(0, Math.min(1, level));
    if (this.radioAudio) this.radioAudio.volume = this.state.volume;
  },

  // ── Media Session ──────────────────────────────────────────

  setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play',  () => this.resume());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('stop',  () => this.stop());
  },

  updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = this.state.currentSource
      ? new MediaMetadata({
          title:   this.state.title,
          artist:  this.state.currentSource === 'radio' ? 'Live Radio' : 'Music',
          artwork: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
        })
      : null;
  },

  // ── UI ─────────────────────────────────────────────────────

  updateUI() {
    this._renderInPlace('nowPlayingWidget');
    this._renderInPlace('standbyNowPlaying');
    this._tickProgress();
  },

  // Live progress ticker for the scrubber
  _tickProgress() {
    clearInterval(this._progressTick);
    if (!this.state.isPlaying || this.state.currentSource === 'radio') return;
    this._progressTick = setInterval(() => {
      const bar = document.getElementById('playerScrubber');
      const cur = document.getElementById('playerCurrentTime');
      if (!bar || !this.state.startedAt) return;
      const elapsed = (Date.now() - this.state.startedAt) / 1000;
      bar.value = Math.min(elapsed, bar.max || elapsed);
      if (cur) cur.textContent = this._fmtTime(elapsed);
    }, 500);
  },

  _renderInPlace(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const isStandby = containerId === 'standbyNowPlaying';

    // ── Standby: single compact row ───────────────────────────
    if (isStandby) {
      if (!this.state.currentSource) {
        container.innerHTML = '<p class="text-gray-400">Nothing playing</p>';
        return;
      }
      const icon = this.state.currentSource === 'radio' ? '📻' : '🎵';
      const sc   = this.state.isPlaying ? 'text-green-400' : this.state.radioStatus === 'failed' ? 'text-red-400' : 'text-yellow-400';
      container.innerHTML = `
        <div class="flex items-center gap-2 leading-tight overflow-hidden">
          <span class="flex-shrink-0">${icon}</span>
          <span class="font-semibold truncate flex-1">${Hub.utils.esc(this.state.title)}</span>
          <span class="${sc} text-xs flex-shrink-0">${this._statusLabel()}</span>
        </div>`;
      return;
    }

    // ── Full mini-player ──────────────────────────────────────
    if (!this.state.currentSource) {
      container.innerHTML = `
        <div class="player-idle flex flex-col items-center justify-center gap-3 py-6 text-gray-500">
          <div style="width:64px;height:64px;border-radius:50%;background:#1e2d3d;display:flex;align-items:center;justify-content:center;font-size:1.8rem;">🎵</div>
          <p class="text-sm">Nothing playing</p>
          <p class="text-xs text-gray-600">Use the Radio page to start playback</p>
        </div>`;
      return;
    }

    const isPlaying  = this.state.isPlaying;
    const isRadio    = this.state.currentSource === 'radio';
    const sc         = isPlaying ? 'text-green-400' : this.state.radioStatus === 'failed' ? 'text-red-400' : 'text-yellow-400';
    const artBg      = isRadio ? '#1a2535' : '#0f1b2d';
    const artIcon    = isRadio ? '📻' : '🎵';
    const volPct     = Math.round(this.state.volume * 100);

    // Visualizer bars (only when playing)
    const vizBars = isPlaying ? `
      <div class="player-viz flex items-end gap-0.5" style="height:18px;">
        ${[1,2,3,4,5].map((_, i) => `
          <div style="width:3px;border-radius:2px;background:#3b82f6;
            animation:vizBar ${0.6 + i*0.1}s ease-in-out infinite alternate;
            animation-delay:${i*0.08}s;"></div>`).join('')}
      </div>` : '';

    container.innerHTML = `
      <div class="player-widget" style="user-select:none;">

        <!-- Art + Info row -->
        <div class="flex items-center gap-4 mb-4">
          <!-- Album art / station art -->
          <div style="width:60px;height:60px;border-radius:.75rem;background:${artBg};
            display:flex;align-items:center;justify-content:center;font-size:1.8rem;
            flex-shrink:0;box-shadow:0 4px 16px rgba(0,0,0,.4);">
            ${artIcon}
          </div>
          <!-- Title + status -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <p class="p-source text-xs text-gray-500 uppercase tracking-wider">${isRadio ? 'Radio' : 'Music'}</p>
              ${vizBars}
            </div>
            <!-- Marquee for long titles -->
            <div style="overflow:hidden;white-space:nowrap;position:relative;">
              <p class="p-title font-bold text-base" style="${this.state.title.length > 28 ? 'display:inline-block;animation:marquee 10s linear infinite;padding-right:2rem;' : ''}">${Hub.utils.esc(this.state.title)}</p>
            </div>
            <p class="p-status ${sc} text-xs mt-0.5">${this._statusLabel()}</p>
          </div>
        </div>

        <!-- Progress scrubber (radio = fake, just shows time) -->
        <div class="flex items-center gap-2 mb-3 text-xs text-gray-500">
          <span id="playerCurrentTime">${this.getPlaybackDuration()}</span>
          <input id="playerScrubber" type="range" min="0" max="${isRadio ? 0 : 300}" value="0"
            class="flex-1" style="accent-color:#3b82f6;height:4px;cursor:${isRadio ? 'default' : 'pointer'};"
            ${isRadio ? 'disabled' : `oninput="Hub.player._seekTo(this.value)"`}>
          <span>${isRadio ? 'LIVE' : '—:——'}</span>
        </div>

        <!-- Transport controls -->
        <div class="flex items-center justify-between gap-2">
          <!-- Prev (stub) -->
          <button onclick="Hub.player.prev?.()" title="Previous"
            class="btn btn-secondary p-2.5 text-lg" style="border-radius:.6rem;">⏮</button>

          <!-- Play / Pause morph button -->
          <button id="playerPlayPause"
            onclick="Hub.player.${isPlaying ? 'pause' : 'resume'}()"
            class="btn btn-primary flex items-center justify-center"
            style="width:52px;height:52px;border-radius:50%;font-size:1.25rem;flex-shrink:0;
              box-shadow:0 4px 16px rgba(59,130,246,.4);transition:transform .1s,box-shadow .2s;"
            onmousedown="this.style.transform='scale(.92)'" onmouseup="this.style.transform=''">
            ${isPlaying
              ? `<svg width="18" height="18" viewBox="0 0 18 18"><rect x="2" y="2" width="5" height="14" rx="1.5" fill="white"/><rect x="11" y="2" width="5" height="14" rx="1.5" fill="white"/></svg>`
              : `<svg width="18" height="18" viewBox="0 0 18 18"><polygon points="3,2 16,9 3,16" fill="white"/></svg>`}
          </button>

          <!-- Next (stub) -->
          <button onclick="Hub.player.next?.()" title="Next"
            class="btn btn-secondary p-2.5 text-lg" style="border-radius:.6rem;">⏭</button>

          <!-- Stop -->
          <button onclick="Hub.player.stop()" title="Stop"
            class="btn btn-secondary p-2.5" style="border-radius:.6rem;font-size:.9rem;">⏹</button>

          <!-- Volume -->
          <div class="flex items-center gap-1.5 ml-1">
            <span class="text-gray-400" style="font-size:.9rem;">${volPct < 10 ? '🔇' : volPct < 50 ? '🔉' : '🔊'}</span>
            <input type="range" min="0" max="100" value="${volPct}"
              style="width:64px;accent-color:#8b5cf6;height:4px;cursor:pointer;"
              oninput="Hub.player.setVolume(this.value/100)">
          </div>
        </div>

      </div>`;
  },

  _statusLabel() {
    const s = this.state.radioStatus;
    if (s === 'connecting')    return '⏳ Connecting…';
    if (s === 'buffering')     return '⏳ Buffering…';
    if (s === 'failed')        return '❌ Failed — tap to retry';
    if (this.state.isPlaying)  return '▶ Playing';
    return '⏸ Paused';
  },

  setVolume(v) {
    this.state.volume = Math.max(0, Math.min(1, v));
    if (this.radioAudio) this.radioAudio.volume = this.state.volume;
    // Update volume icon without full re-render
    const pct = Math.round(this.state.volume * 100);
    const icon = document.querySelector('#nowPlayingWidget .player-widget span[data-vol]');
    if (icon) icon.textContent = pct < 10 ? '🔇' : pct < 50 ? '🔉' : '🔊';
  },

  _seekTo(seconds) {
    // For browser audio sources; radio doesn't support seeking
    if (this.radioAudio && this.state.currentSource !== 'radio') {
      this.radioAudio.currentTime = seconds;
    }
  },

  _fmtTime(seconds) {
    const s = Math.floor(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },

  prev() { Hub.ui?.toast?.('Previous track — connect a music service for full control', 'info'); },
  next() { Hub.ui?.toast?.('Next track — connect a music service for full control', 'info'); },

  getPlaybackDuration() {
    if (!this.state.startedAt) return '0:00';
    return this._fmtTime((Date.now() - this.state.startedAt) / 1000);
  }
};
