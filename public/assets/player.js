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
          artwork: [{ src: '/favicon.png', sizes: '96x96', type: 'image/png' }]
        })
      : null;
  },

  // ── UI (in-place update — no duplication) ─────────────────

  updateUI() {
    this._renderInPlace('nowPlayingWidget');
    this._renderInPlace('standbyNowPlaying');
  },

  _renderInPlace(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!this.state.currentSource) {
      // Only write if not already in idle state
      if (!container.querySelector('.player-idle')) {
        container.innerHTML = `
          <div class="player-idle text-center text-gray-500 py-4">
            <div class="text-3xl mb-2">🎵</div>
            <p class="text-sm">Nothing playing</p>
          </div>`;
      }
      return;
    }

    const icon        = this.state.currentSource === 'radio' ? '📻' : '🎵';
    const sourceLabel = this.state.currentSource === 'radio' ? 'Radio' : 'Music';
    const statusText  = this._statusLabel();
    const statusClass = this.state.isPlaying              ? 'text-green-400'
                      : this.state.radioStatus === 'failed' ? 'text-red-400'
                      :                                      'text-yellow-400';

    // Update existing widget in-place
    const existing = container.querySelector('.player-widget');
    if (existing) {
      existing.querySelector('.p-icon').textContent  = icon;
      existing.querySelector('.p-source').textContent = sourceLabel;
      existing.querySelector('.p-title').textContent  = this.state.title;
      const statusEl = existing.querySelector('.p-status');
      statusEl.textContent = statusText;
      statusEl.className   = `p-status text-xs ${statusClass}`;
      existing.querySelector('.p-buttons').innerHTML = this._buttonsHTML();
      return;
    }

    // First render
    container.innerHTML = `
      <div class="player-widget flex items-center justify-between gap-4">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="p-icon text-3xl">${icon}</div>
          <div class="flex-1 min-w-0">
            <p class="p-source text-xs text-gray-400 uppercase tracking-wide">${sourceLabel}</p>
            <p class="p-title font-semibold truncate">${Hub.utils.esc(this.state.title)}</p>
            <p class="p-status text-xs ${statusClass}">${statusText}</p>
          </div>
        </div>
        <div class="p-buttons flex gap-2">${this._buttonsHTML()}</div>
      </div>`;
  },

  _statusLabel() {
    const s = this.state.radioStatus;
    if (s === 'connecting')    return '⏳ Connecting…';
    if (s === 'buffering')     return '⏳ Buffering…';
    if (s === 'failed')        return '❌ Failed';
    if (this.state.isPlaying)  return '▶ Playing';
    return '⏸ Paused';
  },

  _buttonsHTML() {
    const play  = `<button onclick="Hub.player.resume()" class="btn btn-primary p-2">▶</button>`;
    const pause = `<button onclick="Hub.player.pause()"  class="btn btn-secondary p-2">⏸</button>`;
    const stop  = `<button onclick="Hub.player.stop()"   class="btn btn-secondary p-2">⏹</button>`;
    return (this.state.isPlaying ? pause : play) + stop;
  },

  getPlaybackDuration() {
    if (!this.state.startedAt) return '0:00';
    const s    = Math.floor((Date.now() - this.state.startedAt) / 1000);
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
};
