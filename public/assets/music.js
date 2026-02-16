// Music page (YouTube IFrame API lazy-loaded)
window.Hub = window.Hub || {};

Hub.music = {
  _apiLoaded: false,
  _player: null,
  _initDone: false,

  load() {
    // Called on page enter
    if (this._initDone) {
      if (Hub.player && typeof Hub.player.renderDashboardWidget === 'function') Hub.player.renderDashboardWidget();
      return;
    }
    this._initDone = true;

    // Hook buttons
    const btnPP = document.getElementById('btnYtPlayPause');
    const btnStop = document.getElementById('btnYtStop');
    const btnPrev = document.getElementById('btnYtPrev');
    const btnNext = document.getElementById('btnYtNext');

    if (btnPP) btnPP.onclick = () => Hub.player.toggle();
    if (btnStop) btnStop.onclick = () => Hub.player.stopYouTube();
    if (btnPrev) btnPrev.onclick = () => { try { this._player?.previousVideo?.(); } catch (_) {} if (Hub.player && typeof Hub.player._updateFromYouTube === 'function') Hub.player._updateFromYouTube(); };
    if (btnNext) btnNext.onclick = () => { try { this._player?.nextVideo?.(); } catch (_) {} if (Hub.player && typeof Hub.player._updateFromYouTube === 'function') Hub.player._updateFromYouTube(); };

    // If config doesn't have playlist/video, show iframe fallback
    const cfg = (window.HOME_HUB_CONFIG && window.HOME_HUB_CONFIG.youtubeMusic) ? window.HOME_HUB_CONFIG.youtubeMusic : null;
    const hasYT = !!(cfg && ((cfg.mode === 'playlist' && cfg.playlistId) || (cfg.mode === 'video' && cfg.videoId)));

    if (!hasYT) {
      this._showFallbackIframe();
      return;
    }

    this._ensureYouTubeAPI().then(() => this._createPlayer()).catch(() => this._showFallbackIframe());
  },

  _showFallbackIframe() {
    const yt = document.getElementById('ytPlayer');
    const fb = document.getElementById('ytFallback');
    const frame = document.getElementById('ytFallbackFrame');
    if (yt) yt.style.display = 'none';
    if (fb) fb.classList.remove('hidden');
    const url = window.HOME_HUB_CONFIG?.youtubeMusic?.musicIframeUrl || 'https://music.youtube.com/';
    if (frame) frame.src = url;
  },

  _ensureYouTubeAPI() {
    if (this._apiLoaded) return Promise.resolve();
    this._apiLoaded = true;

    return new Promise((resolve, reject) => {
      // Already present?
      if (window.YT && window.YT.Player) return resolve();

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('YT API load failed'));

      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try { if (typeof prev === 'function') prev(); } catch (_) {}
        resolve();
      };

      document.head.appendChild(script);
    });
  },

  _createPlayer() {
    const cfg = window.HOME_HUB_CONFIG?.youtubeMusic || {};
    const playerVars = {
      rel: 0,
      modestbranding: 1
    };

    // Playlist mode is the most reliable
    if (cfg.mode === 'playlist' && cfg.playlistId) {
      playerVars.listType = 'playlist';
      playerVars.list = cfg.playlistId;
    }

    const videoId = cfg.mode === 'video' ? (cfg.videoId || '') : '';

    this._player = new YT.Player('ytPlayer', {
      width: '100%',
      height: '100%',
      videoId: videoId,
      playerVars,
      events: {
        onReady: () => {
          Hub.player.init();
          Hub.player.setYouTubePlayer(this._player);
          Hub.player._updateFromYouTube();
        },
        onStateChange: () => {
          Hub.player._updateFromYouTube();
        },
        onError: () => {
          console.warn('[Music] YouTube error — switching to iframe fallback');
          this._showFallbackIframe();
        }
      }
    });
  }
};
