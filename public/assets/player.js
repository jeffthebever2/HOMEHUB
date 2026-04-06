// ============================================================
// public/assets/player.js — Unified Audio Engine (v3 — kiosk-stable)
//
// ARCHITECTURE:
//   Hub.player owns the SINGLE Audio element for the entire app.
//   radio.js is purely UI — it calls Hub.player.playRadio() and reads
//   Hub.player.state for display. No other module creates Audio objects.
//
// KIOSK RESILIENCE:
//   - Exponential backoff retry (1s → 2s → 4s → 8s → 16s, max 5 attempts)
//   - Cache-bust on reconnect (appends ?_t= to URL)
//   - Stall detection with separate timer from error retry
//   - Retries reset on every successful 'playing' event
//   - crossOrigin = "anonymous" for CORS-safe streams
//   - Audio persists across page navigation (only stop() kills it)
//
// STATUS FLOW:
//   idle → connecting → buffering → playing ← (stays here)
//                         ↓                      ↓ (stream drops)
//                       failed ← (max retries) ← reconnecting
// ============================================================
window.Hub = window.Hub || {};

Hub.player = {
  // ── Public state (read by radio.js, music.js, standby.js, dashboard) ──
  state: {
    currentSource: null,   // 'radio' | 'music' | null
    title:         '',
    streamUrl:     '',
    isPlaying:     false,
    startedAt:     null,
    volume:        0.8,
    radioStatus:   '',     // '' | 'connecting' | 'buffering' | 'playing' | 'reconnecting' | 'failed'
    retryCount:    0,
    // Music-specific state
    musicVideoId:   '',
    musicArtist:    '',
    musicThumbnail: '',
    musicDuration:  0,
  },

  // ── Private ────────────────────────────────────────────────
  _audio:          null,
  _listeners:      [],    // [[event, handler], ...] for clean removal
  _stallTimer:     null,
  _retryTimer:     null,
  _progressTick:   null,

  // YouTube IFrame player
  _ytPlayer:       null,
  _ytReady:        false,
  _ytAPILoading:   false,
  _ytPendingPlay:  null,  // {videoId, title, artist, thumbnail} — queued if API not ready

  _MAX_RETRIES:    5,
  _BASE_RETRY_MS:  1500,  // first retry after 1.5s, then 3s, 6s, 12s, 24s
  _STALL_TIMEOUT:  8000,  // 8s with no 'playing' event → stalled

  // ── Init (called once from app.js) ──────────────────────────
  init() {
    this._audio          = new Audio();
    this._audio.preload   = 'none';
    this._audio.crossOrigin = 'anonymous';
    this._audio.volume    = this.state.volume;
    this._setupMediaSession();
    this._ensureYTAPI();
    console.log('[Player] Initialized (single audio instance + YouTube IFrame)');
  },

  // ── YouTube IFrame API loader ────────────────────────────────
  _ensureYTAPI() {
    if (this._ytReady || this._ytAPILoading) return;
    if (window.YT?.Player) {
      this._initYTPlayer();
      return;
    }
    this._ytAPILoading = true;

    // YouTube IFrame API callback
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevCallback) prevCallback();
      this._initYTPlayer();
    };

    // Load the API script
    if (!document.getElementById('yt-iframe-api')) {
      const tag    = document.createElement('script');
      tag.id       = 'yt-iframe-api';
      tag.src      = 'https://www.youtube.com/iframe_api';
      tag.onerror  = () => {
        console.warn('[Player] YouTube IFrame API failed to load');
        this._ytAPILoading = false;
      };
      document.head.appendChild(tag);
    }
  },

  _initYTPlayer() {
    this._ytAPILoading = false;
    if (this._ytPlayer) { this._ytReady = true; return; }

    // Ensure container exists
    let container = document.getElementById('ytPlayerContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ytPlayerContainer';
      container.style.cssText = 'position:fixed;bottom:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
      document.body.appendChild(container);
    }

    // Create the inner div for the player
    let inner = document.getElementById('ytPlayerInner');
    if (!inner) {
      inner = document.createElement('div');
      inner.id = 'ytPlayerInner';
      container.appendChild(inner);
    }

    try {
      this._ytPlayer = new YT.Player('ytPlayerInner', {
        height: '1',
        width:  '1',
        playerVars: {
          autoplay:       0,
          controls:       0,
          disablekb:      1,
          fs:             0,
          modestbranding: 1,
          rel:            0,
          playsinline:    1,
          origin:         window.location.origin,
        },
        events: {
          onReady:       () => this._onYTReady(),
          onStateChange: (e) => this._onYTStateChange(e),
          onError:       (e) => this._onYTError(e),
        },
      });
    } catch (e) {
      console.warn('[Player] YouTube player init error:', e.message);
    }
  },

  _onYTReady() {
    this._ytReady = true;
    console.log('[Player] YouTube IFrame player ready');
    // Play pending track if any
    if (this._ytPendingPlay) {
      const p = this._ytPendingPlay;
      this._ytPendingPlay = null;
      this.playMusic(p.videoId, p.title, p.artist, p.thumbnail);
    }
  },

  _onYTStateChange(event) {
    if (this.state.currentSource !== 'music') return;

    const s = event.data;
    if (s === YT.PlayerState.PLAYING) {
      this.state.isPlaying = true;
      this.state.radioStatus = 'playing';
      this.updateUI();
    } else if (s === YT.PlayerState.PAUSED) {
      this.state.isPlaying = false;
      this.updateUI();
    } else if (s === YT.PlayerState.ENDED) {
      this.state.isPlaying = false;
      this.updateUI();
      // Notify music module for auto-next
      Hub.music?.onTrackEnd?.();
    } else if (s === YT.PlayerState.BUFFERING) {
      this.state.radioStatus = 'buffering';
      this.updateUI();
    }
  },

  _onYTError(event) {
    console.warn('[Player] YouTube error code:', event.data);
    // 2=invalid param, 5=HTML5 error, 100=not found, 101/150=not embeddable
    const code = event.data;
    if (code === 100 || code === 101 || code === 150) {
      Hub.ui?.toast?.('This track is unavailable for playback', 'error');
    } else {
      Hub.ui?.toast?.('YouTube playback error', 'error');
    }
    this.state.isPlaying = false;
    this.state.radioStatus = 'failed';
    this.updateUI();
    // Try next track
    setTimeout(() => Hub.music?.onTrackEnd?.(), 1500);
  },

  // ── Play a direct audio stream (music) ───────────────────────
  // Used by music.js when it fetches a direct audio URL from Piped/Invidious.
  // Plays through the native <audio> element (same as radio) but with music
  // metadata and an 'ended' handler for auto-next.
  playMusicStream(streamUrl, title, artist, thumbnail, duration) {
    console.log('[Player] playMusicStream:', title, streamUrl ? '(has URL)' : '(loading)');
    this._stopHard();

    // Stop YT IFrame if it was playing
    if (this._ytPlayer && this._ytReady) {
      try { this._ytPlayer.stopVideo(); } catch (_) {}
    }

    this.state.currentSource  = 'music';
    this.state.title          = title || '';
    this.state.streamUrl      = streamUrl || '';
    this.state.startedAt      = Date.now();
    this.state.isPlaying      = false;
    this.state.radioStatus    = streamUrl ? 'connecting' : 'buffering';
    this.state.retryCount     = 0;
    this.state.musicVideoId   = '';
    this.state.musicArtist    = artist || '';
    this.state.musicThumbnail = thumbnail || '';
    this.state.musicDuration  = duration || 0;

    if (!streamUrl) {
      // No URL yet — music.js is still fetching. Just show loading state.
      this._updateMediaSession();
      this.updateUI();
      return;
    }

    // Play via native audio element
    const audio = this._audio;
    this._removeListeners();
    this._clearTimers();

    const on = (evt, fn) => {
      audio.addEventListener(evt, fn);
      this._listeners.push([evt, fn]);
    };

    on('canplay', () => {
      this._setStatus('buffering');
      audio.play().catch(err => {
        if (err.name === 'NotAllowedError') {
          this._setStatus('failed');
          this._showAutoplayOverlay();
        }
      });
    });

    on('playing', () => {
      this._clearTimers();
      this._setStatus('playing');
      this._startMusicProgress();
    });

    on('waiting', () => {
      if (this.state.radioStatus === 'playing') this._setStatus('buffering');
    });

    on('ended', () => {
      console.log('[Player] Music track ended');
      this.state.isPlaying = false;
      this.state.radioStatus = '';
      this._clearTimers();
      this.updateUI();
      // Auto-next via music module
      Hub.music?.onTrackEnd?.();
    });

    on('error', () => {
      console.warn('[Player] Music stream error');
      this.state.isPlaying = false;
      this.state.radioStatus = 'failed';
      this.updateUI();
      // Try next track after a brief delay
      setTimeout(() => Hub.music?.onTrackEnd?.(), 2000);
    });

    on('timeupdate', () => {
      // Update music page progress if visible
      Hub.music?._updateProgress?.(audio.currentTime, audio.duration);
    });

    audio.src = streamUrl;
    audio.load();

    this._updateMediaSession();
    this.updateUI();
  },

  /** Start progress tick for music (updates dashboard widget) */
  _startMusicProgress() {
    clearInterval(this._progressTick);
    if (this.state.currentSource !== 'music') return;
    this._progressTick = setInterval(() => {
      if (!this.state.isPlaying || this.state.currentSource !== 'music') {
        clearInterval(this._progressTick);
        return;
      }
      this.updateUI();
    }, 5000); // update dashboard widget every 5s
  },

  // ── Play a YouTube Music track (IFrame fallback) ────────────
  playMusic(videoId, title, artist, thumbnail) {
    if (!videoId) return;
    console.log('[Player] playMusic:', title, '—', artist);

    // Stop any radio stream
    this._stopHard();

    this.state.currentSource  = 'music';
    this.state.title          = title || 'Unknown';
    this.state.streamUrl      = '';
    this.state.startedAt      = Date.now();
    this.state.isPlaying      = false;
    this.state.radioStatus    = 'connecting';
    this.state.retryCount     = 0;
    this.state.musicVideoId   = videoId;
    this.state.musicArtist    = artist || '';
    this.state.musicThumbnail = thumbnail || '';

    // Ensure YT API is loaded
    if (!this._ytReady) {
      console.log('[Player] YouTube API not ready — queuing track');
      this._ytPendingPlay = { videoId, title, artist, thumbnail };
      this._ensureYTAPI();
      this.updateUI();
      return;
    }

    try {
      this._ytPlayer.loadVideoById({ videoId, suggestedQuality: 'small' });
    } catch (e) {
      console.warn('[Player] loadVideoById error:', e.message);
      this.state.radioStatus = 'failed';
    }

    this._updateMediaSession();
    this.updateUI();
  },

  // ── Play a radio stream ─────────────────────────────────────
  playRadio(stationName, streamUrl) {
    console.log('[Player] playRadio:', stationName);
    this._stopHard();

    this.state.currentSource = 'radio';
    this.state.title         = stationName;
    this.state.streamUrl     = streamUrl;
    this.state.startedAt     = Date.now();
    this.state.isPlaying     = false;
    this.state.radioStatus   = 'connecting';
    this.state.retryCount    = 0;

    this._startStream(streamUrl);
    this._updateMediaSession();
    this.updateUI();
  },

  // ── Core stream lifecycle ───────────────────────────────────
  _startStream(url) {
    const audio = this._audio;
    this._removeListeners();
    this._clearTimers();

    const on = (evt, fn) => {
      audio.addEventListener(evt, fn);
      this._listeners.push([evt, fn]);
    };

    on('loadstart', () => {
      if (this.state.radioStatus !== 'reconnecting') {
        this._setStatus('connecting');
      }
    });

    on('canplay', () => {
      this._clearStallTimer();
      this._setStatus('buffering');
      audio.play().catch(err => this._onPlayError(err));
    });

    on('playing', () => {
      this._clearTimers();
      // Reset retry counter on every successful play — stream is alive
      this.state.retryCount = 0;
      this._setStatus('playing');
    });

    on('waiting', () => {
      if (this.state.radioStatus === 'playing') {
        this._setStatus('buffering');
      }
      this._startStallTimer();
    });

    on('stalled', () => {
      this._startStallTimer();
    });

    on('pause', () => {
      // Only update UI if WE paused it (not browser garbage collection)
      if (this.state.currentSource === 'radio') this.updateUI();
    });

    on('error', () => this._onStreamError());

    audio.src = url;
    audio.load();
    this._startStallTimer();
  },

  // ── Error handling ──────────────────────────────────────────
  _onPlayError(err) {
    console.warn('[Player] play() rejected:', err.name);
    if (err.name === 'NotAllowedError') {
      this._setStatus('failed');
      this._showAutoplayOverlay();
    } else {
      this._attemptRetry();
    }
  },

  _onStreamError() {
    const code = this._audio?.error?.code ?? '?';
    console.warn('[Player] Stream error, code:', code);
    this._attemptRetry();
  },

  // ── Retry with exponential backoff ──────────────────────────
  _attemptRetry() {
    this._clearTimers();

    if (this.state.retryCount >= this._MAX_RETRIES) {
      console.warn('[Player] Max retries reached — giving up');
      this._setStatus('failed');
      Hub.ui?.toast?.('Station offline — max retries reached', 'error');
      return;
    }

    this.state.retryCount++;
    const delay = this._BASE_RETRY_MS * Math.pow(2, this.state.retryCount - 1);
    console.log(`[Player] Retry ${this.state.retryCount}/${this._MAX_RETRIES} in ${delay}ms`);
    this._setStatus('reconnecting');

    this._retryTimer = setTimeout(() => {
      if (this.state.currentSource !== 'radio') return; // stopped while waiting

      // Cache-bust: append timestamp to URL to bypass browser cache
      const base = this.state.streamUrl.split('?')[0];
      const bustUrl = `${base}?_t=${Date.now()}`;

      this._audio.src = bustUrl;
      this._audio.load();
      this._startStallTimer();
    }, delay);
  },

  // ── Stall detection ─────────────────────────────────────────
  _startStallTimer() {
    this._clearStallTimer();
    this._stallTimer = setTimeout(() => {
      // If we're not playing after STALL_TIMEOUT, try reconnecting
      if (this.state.currentSource === 'radio' && this.state.radioStatus !== 'playing') {
        console.warn('[Player] Stall timeout — attempting reconnect');
        this._attemptRetry();
      }
    }, this._STALL_TIMEOUT);
  },

  _clearStallTimer() {
    if (this._stallTimer) { clearTimeout(this._stallTimer); this._stallTimer = null; }
  },

  _clearTimers() {
    this._clearStallTimer();
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
  },

  // ── Status management ──────────────────────────────────────
  _setStatus(status) {
    this.state.radioStatus = status;
    this.state.isPlaying   = (status === 'playing');
    this.updateUI();
  },

  // ── Listener cleanup ───────────────────────────────────────
  _removeListeners() {
    if (!this._audio) return;
    this._listeners.forEach(([evt, fn]) => this._audio.removeEventListener(evt, fn));
    this._listeners = [];
  },

  // ── Hard stop (kills audio completely) ──────────────────────
  _stopHard() {
    this._clearTimers();
    this._removeListeners();
    if (this._audio) {
      this._audio.pause();
      this._audio.removeAttribute('src');
      try { this._audio.load(); } catch (_) {}
    }
  },

  // ── Public stop ────────────────────────────────────────────
  stop() {
    console.log('[Player] stop()');
    this._stopHard();
    // Stop YouTube player if active
    if (this._ytPlayer && this._ytReady) {
      try { this._ytPlayer.stopVideo(); } catch (_) {}
    }
    this.state.currentSource  = null;
    this.state.title          = '';
    this.state.streamUrl      = '';
    this.state.isPlaying      = false;
    this.state.startedAt      = null;
    this.state.radioStatus    = '';
    this.state.retryCount     = 0;
    this.state.musicVideoId   = '';
    this.state.musicArtist    = '';
    this.state.musicThumbnail = '';
    this.state.musicDuration  = 0;
    this._updateMediaSession();
    this.updateUI();
    // Update music page if visible
    Hub.music?._updateNowPlayingBar?.();
  },

  // ── Pause / Resume ─────────────────────────────────────────
  pause() {
    if (this.state.currentSource === 'radio' || (this.state.currentSource === 'music' && this.state.streamUrl)) {
      // Native audio element (radio or music stream)
      if (this._audio) {
        this._audio.pause();
        if (this.state.currentSource === 'radio') this._clearTimers();
      }
    } else if (this.state.currentSource === 'music' && this._ytPlayer && this._ytReady) {
      // YT IFrame fallback
      try { this._ytPlayer.pauseVideo(); } catch (_) {}
    }
    this.state.isPlaying = false;
    this.updateUI();
  },

  resume() {
    if (this.state.currentSource === 'radio' || (this.state.currentSource === 'music' && this.state.streamUrl)) {
      if (this._audio) {
        this._audio.play().catch(() => this._showAutoplayOverlay());
        if (this.state.currentSource === 'radio') this._startStallTimer();
      }
    } else if (this.state.currentSource === 'music' && this._ytPlayer && this._ytReady) {
      try { this._ytPlayer.playVideo(); } catch (_) {}
    }
    this.state.isPlaying = true;
    this.updateUI();
  },

  // ── Volume ─────────────────────────────────────────────────
  setVolume(level) {
    this.state.volume = Math.max(0, Math.min(1, level));
    if (this._audio) this._audio.volume = this.state.volume;
  },

  // ── Autoplay overlay ───────────────────────────────────────
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
      this._audio.play()
        .then(() => this._setStatus('playing'))
        .catch(() => { this._setStatus('failed'); Hub.ui?.toast?.('Audio failed', 'error'); });
    };
  },

  // ── Media Session API ──────────────────────────────────────
  _setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play',          () => this.resume());
    navigator.mediaSession.setActionHandler('pause',         () => this.pause());
    navigator.mediaSession.setActionHandler('stop',          () => this.stop());
    navigator.mediaSession.setActionHandler('previoustrack', () => Hub.music?.playPrev?.());
    navigator.mediaSession.setActionHandler('nexttrack',     () => Hub.music?.playNext?.());
  },

  _updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    if (!this.state.currentSource) {
      navigator.mediaSession.metadata = null;
      return;
    }
    const isMusic = this.state.currentSource === 'music';
    navigator.mediaSession.metadata = new MediaMetadata({
      title:   this.state.title,
      artist:  isMusic ? this.state.musicArtist : 'Live Radio',
      artwork: [{
        src:   isMusic && this.state.musicThumbnail ? this.state.musicThumbnail : '/icons/icon-192.png',
        sizes: isMusic ? '320x180' : '192x192',
        type:  'image/png',
      }],
    });
  },

  // ── UI update (renders into dashboard + standby) ───────────
  updateUI() {
    this._renderWidget('nowPlayingWidget', false);
    this._renderWidget('standbyNowPlaying', true);
    // Also sync radio page if it's visible
    this._syncRadioPageStatus();
    this._tickProgress();
  },

  /** Sync the radio page's now-playing bar (if visible) with player state */
  _syncRadioPageStatus() {
    const nameEl   = document.getElementById('radioStationName');
    const statusEl = document.getElementById('radioStatus');
    const stopBtn  = document.getElementById('radioStopBtn');

    if (nameEl) {
      nameEl.textContent = this.state.title || 'No station selected';
      nameEl.className   = this.state.currentSource
        ? 'font-semibold truncate text-white'
        : 'font-semibold truncate text-gray-400';
    }
    if (statusEl) {
      statusEl.textContent = this._statusLabel();
      const cls = this.state.isPlaying ? 'text-green-400'
                : this.state.radioStatus === 'failed' ? 'text-red-400'
                : this.state.radioStatus === 'reconnecting' ? 'text-yellow-400'
                : this.state.radioStatus ? 'text-yellow-400'
                : 'text-gray-500';
      statusEl.className = `text-xs mt-0.5 ${cls}`;
    }
    if (stopBtn) {
      stopBtn.style.display = this.state.currentSource ? '' : 'none';
    }

    // Visualizer bars
    const isPlaying = this.state.isPlaying;
    document.querySelectorAll('.radio-viz-bar').forEach((b, i) => {
      b.style.opacity   = isPlaying ? '1'   : '0.3';
      b.style.animation = isPlaying
        ? `vizBar .${4+(i+1)}s ${i*.1}s ease-in-out infinite alternate`
        : 'none';
      b.style.height    = isPlaying ? '' : '6px';
    });

    // Highlight active station row
    document.querySelectorAll('[data-station-url]').forEach(row => {
      const active = row.dataset.stationUrl === this.state.streamUrl;
      row.classList.toggle('bg-blue-900/40', active);
      row.classList.toggle('border', active);
      row.classList.toggle('border-blue-700/50', active);
    });
  },

  _statusLabel() {
    const s = this.state.radioStatus;
    if (s === 'connecting')    return '⏳ Connecting…';
    if (s === 'buffering')     return '⏳ Buffering…';
    if (s === 'reconnecting')  return `🔄 Reconnecting (${this.state.retryCount}/${this._MAX_RETRIES})…`;
    if (s === 'failed')        return '❌ Failed';
    if (this.state.isPlaying)  return '▶ Playing';
    if (this.state.currentSource) return '⏸ Paused';
    return 'Tap a station to play';
  },

  _tickProgress() {
    clearInterval(this._progressTick);
    if (!this.state.isPlaying || this.state.currentSource !== 'radio') return;
    // No-op for radio — there's no progress bar. Kept for future non-radio sources.
  },

  _renderWidget(containerId, isStandby) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!this.state.currentSource) {
      container.innerHTML = isStandby
        ? '<p class="text-gray-400">Nothing playing</p>'
        : `<div class="player-idle flex flex-col items-center justify-center gap-3 py-6 text-gray-500">
             <div style="width:64px;height:64px;border-radius:50%;background:#1e2d3d;display:flex;align-items:center;justify-content:center;font-size:1.8rem;">🎵</div>
             <p class="text-sm">Nothing playing</p>
             <p class="text-xs text-gray-600">Use the Radio or Music page to start playback</p>
           </div>`;
      return;
    }

    const sc = this.state.isPlaying ? 'text-green-400'
             : this.state.radioStatus === 'failed' ? 'text-red-400'
             : 'text-yellow-400';

    if (isStandby) {
      const icon = this.state.currentSource === 'music' ? '🎵' : '📻';
      const sub  = this.state.currentSource === 'music' ? Hub.utils.esc(this.state.musicArtist) : '';
      container.innerHTML = `
        <div class="flex items-center gap-2 leading-tight overflow-hidden">
          <span class="flex-shrink-0">${icon}</span>
          <div class="flex-1 min-w-0">
            <span class="font-semibold truncate block">${Hub.utils.esc(this.state.title)}</span>
            ${sub ? `<span class="text-xs text-gray-400 truncate block">${sub}</span>` : ''}
          </div>
          <span class="${sc} text-xs flex-shrink-0">${this._statusLabel()}</span>
        </div>`;
      return;
    }

    // ── Full dashboard mini-player ──────────────────────────────
    const isMusic = this.state.currentSource === 'music';
    const volPct = Math.round(this.state.volume * 100);
    const vizColor = isMusic ? '#8b5cf6' : '#3b82f6';
    const vizBars = this.state.isPlaying ? `
      <div class="player-viz flex items-end gap-0.5" style="height:18px;">
        ${[1,2,3,4,5].map((_, i) => `
          <div style="width:3px;border-radius:2px;background:${vizColor};
            animation:vizBar ${0.6 + i*0.1}s ease-in-out infinite alternate;
            animation-delay:${i*0.08}s;"></div>`).join('')}
      </div>` : '';

    const duration = this.state.startedAt
      ? this._fmtTime((Date.now() - this.state.startedAt) / 1000)
      : '0:00';

    // Artwork: thumbnail for music, emoji for radio
    const artwork = isMusic && this.state.musicThumbnail
      ? `<img src="${Hub.utils.esc(this.state.musicThumbnail)}" alt=""
           style="width:60px;height:60px;border-radius:.75rem;object-fit:cover;flex-shrink:0;box-shadow:0 4px 16px rgba(0,0,0,.4);"
           onerror="this.style.display='none'">`
      : `<div style="width:60px;height:60px;border-radius:.75rem;background:#1a2535;
           display:flex;align-items:center;justify-content:center;font-size:1.8rem;
           flex-shrink:0;box-shadow:0 4px 16px rgba(0,0,0,.4);">📻</div>`;

    // Music-specific controls (prev/next)
    const musicControls = isMusic ? `
      <button onclick="Hub.music.playPrev()" class="btn btn-secondary p-2.5" style="border-radius:.6rem;">⏮</button>` : '';
    const musicNext = isMusic ? `
      <button onclick="Hub.music.playNext()" class="btn btn-secondary p-2.5" style="border-radius:.6rem;">⏭</button>` : '';

    // Subtitle line
    const subtitle = isMusic ? Hub.utils.esc(this.state.musicArtist) : '';
    const sourceLabel = isMusic ? 'Music' : 'Radio';
    const timeLabel = isMusic ? duration : 'LIVE';

    container.innerHTML = `
      <div class="player-widget" style="user-select:none;">
        <div class="flex items-center gap-4 mb-4">
          ${artwork}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <p class="text-xs text-gray-500 uppercase tracking-wider">${sourceLabel}</p>
              ${vizBars}
            </div>
            <div style="overflow:hidden;white-space:nowrap;">
              <p class="font-bold text-base">${Hub.utils.esc(this.state.title)}</p>
            </div>
            ${subtitle ? `<p class="text-xs text-gray-400 truncate">${subtitle}</p>` : ''}
            <p class="${sc} text-xs mt-0.5">${this._statusLabel()}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 mb-3 text-xs text-gray-500">
          <span>${duration}</span>
          <div class="flex-1 h-1 rounded bg-gray-700"></div>
          <span>${timeLabel}</span>
        </div>
        <div class="flex items-center justify-center gap-3">
          ${musicControls}
          <button onclick="Hub.player.${this.state.isPlaying ? 'pause' : 'resume'}()"
            class="btn btn-primary flex items-center justify-center"
            style="width:48px;height:48px;border-radius:50%;font-size:1.2rem;">
            ${this.state.isPlaying ? '⏸' : '▶'}
          </button>
          ${musicNext}
          <button onclick="Hub.player.stop()" class="btn btn-secondary p-2.5" style="border-radius:.6rem;">⏹</button>
          <div class="flex items-center gap-1.5 ml-2">
            <span class="text-gray-400" style="font-size:.9rem;">${volPct < 10 ? '🔇' : volPct < 50 ? '🔉' : '🔊'}</span>
            <input type="range" min="0" max="100" value="${volPct}"
              style="width:60px;accent-color:#8b5cf6;height:4px;"
              oninput="Hub.player.setVolume(this.value/100)">
          </div>
        </div>
      </div>`;
  },

  _fmtTime(seconds) {
    const s = Math.floor(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },
};
