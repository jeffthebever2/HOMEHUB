// ============================================================
// assets/player.js — Unified Player State Manager
// Manages Now Playing state for Music & Radio
// Shows status on Dashboard and Standby pages
// ============================================================

window.Hub = window.Hub || {};

Hub.player = {
  // Player state
  state: {
    currentSource: null,      // 'radio' | 'youtube' | null
    title: '',                // Station name or song title
    isPlaying: false,         // Playing status
    startedAt: null,          // Timestamp when started
    volume: 0.7               // Volume level (0-1)
  },

  // Audio element for radio (single instance)
  radioAudio: null,

  /** Initialize player */
  init() {
    console.log('[Player] Initializing...');
    
    // Create radio audio element
    this.radioAudio = new Audio();
    this.radioAudio.volume = this.state.volume;
    
    // Listen for audio events
    this.radioAudio.addEventListener('play', () => {
      this.state.isPlaying = true;
      this.updateUI();
    });
    
    this.radioAudio.addEventListener('pause', () => {
      this.state.isPlaying = false;
      this.updateUI();
    });
    
    this.radioAudio.addEventListener('ended', () => {
      this.state.isPlaying = false;
      this.updateUI();
    });

    this.radioAudio.addEventListener('error', (e) => {
      console.error('[Player] Audio error:', e);
      Hub.ui?.toast?.('Playback error. Try another station.', 'error');
      this.state.isPlaying = false;
      this.updateUI();
    });

    // Update Media Session API (for lockscreen controls)
    this.setupMediaSession();

    console.log('[Player] Ready');
  },

  /** Play radio station */
  playRadio(stationName, streamUrl) {
    console.log('[Player] Play radio:', stationName);
    
    // Stop any current playback
    this.stop();
    
    // Set new state
    this.state.currentSource = 'radio';
    this.state.title = stationName;
    this.state.startedAt = Date.now();
    
    // Load and play
    this.radioAudio.src = streamUrl;
    this.radioAudio.play().catch(err => {
      console.error('[Player] Play failed:', err);
      Hub.ui?.toast?.('Failed to play station', 'error');
      this.state.isPlaying = false;
    });
    
    this.updateMediaSession();
    this.updateUI();
  },

  /** Play YouTube Music (called from music.js) */
  playYouTube(title = 'YouTube Music') {
    console.log('[Player] Play YouTube:', title);
    
    // Stop radio if playing
    if (this.state.currentSource === 'radio') {
      this.radioAudio.pause();
    }
    
    this.state.currentSource = 'youtube';
    this.state.title = title;
    this.state.isPlaying = true;
    this.state.startedAt = Date.now();
    
    this.updateMediaSession();
    this.updateUI();
  },

  /** Pause current playback */
  pause() {
    console.log('[Player] Pause');
    
    if (this.state.currentSource === 'radio') {
      this.radioAudio.pause();
    } else if (this.state.currentSource === 'youtube') {
      // Signal to music.js to pause YouTube
      window.dispatchEvent(new CustomEvent('player:pause-youtube'));
    }
    
    this.state.isPlaying = false;
    this.updateUI();
  },

  /** Resume playback */
  resume() {
    console.log('[Player] Resume');
    
    if (this.state.currentSource === 'radio') {
      this.radioAudio.play();
    } else if (this.state.currentSource === 'youtube') {
      // Signal to music.js to resume YouTube
      window.dispatchEvent(new CustomEvent('player:resume-youtube'));
    }
    
    this.state.isPlaying = true;
    this.updateUI();
  },

  /** Stop all playback */
  stop() {
    console.log('[Player] Stop');
    
    if (this.state.currentSource === 'radio') {
      this.radioAudio.pause();
      this.radioAudio.src = '';
    } else if (this.state.currentSource === 'youtube') {
      window.dispatchEvent(new CustomEvent('player:stop-youtube'));
    }
    
    this.state.currentSource = null;
    this.state.title = '';
    this.state.isPlaying = false;
    this.state.startedAt = null;
    
    this.updateMediaSession();
    this.updateUI();
  },

  /** Set volume (0-1) */
  setVolume(level) {
    this.state.volume = Math.max(0, Math.min(1, level));
    if (this.radioAudio) {
      this.radioAudio.volume = this.state.volume;
    }
    // YouTube volume would be controlled separately if needed
  },

  /** Setup Media Session API for lockscreen controls */
  setupMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.resume());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('stop', () => this.stop());
  },

  /** Update Media Session metadata */
  updateMediaSession() {
    if (!('mediaSession' in navigator)) return;

    if (this.state.currentSource) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.state.title,
        artist: this.state.currentSource === 'radio' ? 'Live Radio' : 'YouTube Music',
        artwork: [
          { src: '/favicon.png', sizes: '96x96', type: 'image/png' }
        ]
      });
    } else {
      navigator.mediaSession.metadata = null;
    }
  },

  /** Update all player UI widgets */
  updateUI() {
    // Update dashboard widget
    const dashWidget = document.getElementById('nowPlayingWidget');
    if (dashWidget) {
      this.renderWidget(dashWidget);
    }

    // Update standby widget
    const standbyWidget = document.getElementById('standbyNowPlaying');
    if (standbyWidget) {
      this.renderWidget(standbyWidget);
    }
  },

  /** Render player widget */
  renderWidget(container) {
    if (!this.state.currentSource) {
      container.innerHTML = `
        <div class="text-center text-gray-500 py-4">
          <div class="text-3xl mb-2">🎵</div>
          <p class="text-sm">Nothing playing</p>
        </div>
      `;
      return;
    }

    const icon = this.state.currentSource === 'radio' ? '📻' : '🎵';
    const sourceLabel = this.state.currentSource === 'radio' ? 'Radio' : 'Music';
    
    container.innerHTML = `
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="text-3xl">${icon}</div>
          <div class="flex-1 min-w-0">
            <p class="text-xs text-gray-400 uppercase tracking-wide">${sourceLabel}</p>
            <p class="font-semibold truncate">${this.state.title}</p>
            <p class="text-xs ${this.state.isPlaying ? 'text-green-400' : 'text-gray-400'}">
              ${this.state.isPlaying ? '▶ Playing' : '⏸ Paused'}
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          ${this.state.isPlaying 
            ? '<button onclick="Hub.player.pause()" class="btn btn-secondary p-2">⏸</button>'
            : '<button onclick="Hub.player.resume()" class="btn btn-primary p-2">▶</button>'
          }
          <button onclick="Hub.player.stop()" class="btn btn-secondary p-2">⏹</button>
        </div>
      </div>
    `;
  },

  /** Get formatted playback duration */
  getPlaybackDuration() {
    if (!this.state.startedAt) return '0:00';
    
    const elapsed = Math.floor((Date.now() - this.state.startedAt) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
};
