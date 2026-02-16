// ============================================================
// assets/music.js — YouTube Music Player
// Lazy-loads iframe when user enters Music page
// Integrates with player.js for Now Playing state
// ============================================================

window.Hub = window.Hub || {};

Hub.music = {
  iframeLoaded: false,
  youtubePlayer: null,

  /** Initialize music page */
  init() {
    console.log('[Music] Initializing...');
    
    // Listen for player pause/resume/stop events from player.js
    window.addEventListener('player:pause-youtube', () => this.pause());
    window.addEventListener('player:resume-youtube', () => this.resume());
    window.addEventListener('player:stop-youtube', () => this.stop());
    
    console.log('[Music] Ready');
  },

  /** Handle page enter - lazy load iframe */
  onEnter() {
    console.log('[Music] Page entered');
    
    if (!this.iframeLoaded) {
      this.loadPlayer();
    }
  },

  /** Load YouTube Music player */
  loadPlayer() {
    const container = document.getElementById('musicPlayerContainer');
    if (!container) return;

    const config = window.HOME_HUB_CONFIG?.music || {};
    const usePlaylist = config.usePlaylistFallback || false;

    container.innerHTML = '<div class="text-center py-8 text-gray-400">Loading player...</div>';

    if (usePlaylist && config.youtubePlaylistId) {
      // Use YouTube playlist embed (more reliable)
      this.loadYouTubePlaylist(container, config.youtubePlaylistId);
    } else {
      // Try YouTube Music first
      this.loadYouTubeMusic(container, config);
    }

    this.iframeLoaded = true;
  },

  /** Load YouTube Music iframe */
  loadYouTubeMusic(container, config) {
    const iframe = document.createElement('iframe');
    iframe.src = config.youtubeMusic || 'https://music.youtube.com';
    iframe.style.cssText = 'width: 100%; height: 600px; border: 0; border-radius: 0.5rem;';
    iframe.allow = 'autoplay; encrypted-media';
    iframe.sandbox = 'allow-same-origin allow-scripts allow-popups allow-forms';
    
    iframe.onload = () => {
      console.log('[Music] YouTube Music loaded');
      Hub.player.playYouTube('YouTube Music');
    };

    iframe.onerror = () => {
      console.error('[Music] YouTube Music failed to load');
      // Fallback to playlist
      if (config.youtubePlaylistId) {
        container.innerHTML = `
          <div class="card text-center mb-4 bg-yellow-900/20 border border-yellow-500/50">
            <p class="text-yellow-400">YouTube Music blocked. Using playlist fallback...</p>
          </div>
        `;
        this.loadYouTubePlaylist(container, config.youtubePlaylistId);
      } else {
        container.innerHTML = `
          <div class="card text-center bg-red-900/20 border border-red-500/50">
            <p class="text-red-400">YouTube Music is blocked in iframe mode.</p>
            <p class="text-sm text-gray-400 mt-2">Set a playlist ID in config.js for fallback</p>
          </div>
        `;
      }
    };

    container.innerHTML = '';
    container.appendChild(iframe);
  },

  /** Load YouTube playlist embed */
  loadYouTubePlaylist(container, playlistId) {
    const embedUrl = `https://www.youtube.com/embed?listType=playlist&list=${playlistId}&autoplay=1`;
    
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.style.cssText = 'width: 100%; height: 600px; border: 0; border-radius: 0.5rem;';
    iframe.allow = 'autoplay; encrypted-media';
    
    iframe.onload = () => {
      console.log('[Music] YouTube playlist loaded');
      Hub.player.playYouTube('YouTube Playlist');
    };

    container.innerHTML = '';
    container.appendChild(iframe);
  },

  /** Render Bluetooth pairing instructions */
  renderBluetoothHelp() {
    const container = document.getElementById('bluetoothHelp');
    if (!container) return;

    const hasBluetooth = 'bluetooth' in navigator;

    container.innerHTML = `
      <div class="card">
        <h3 class="font-bold text-lg mb-4">🔊 Connect Bluetooth Speakers</h3>
        
        ${hasBluetooth ? `
          <div class="mb-4 p-3 bg-blue-900/20 border border-blue-500/50 rounded">
            <p class="text-sm text-blue-300">
              <strong>Note:</strong> Web Bluetooth API is available, but audio routing 
              is controlled by your operating system. Use the OS settings below.
            </p>
          </div>
        ` : ''}

        <div class="space-y-4">
          <div>
            <h4 class="font-semibold mb-2">For Raspberry Pi OS:</h4>
            <ol class="text-sm text-gray-300 space-y-1 ml-4 list-decimal">
              <li>Click Bluetooth icon in top-right menu bar</li>
              <li>Select "Turn On Bluetooth" if needed</li>
              <li>Put speakers in pairing mode</li>
              <li>Click "Add Device" and select your speakers</li>
              <li>Right-click connected device → "Audio Sink" to route audio</li>
            </ol>
          </div>

          <div>
            <h4 class="font-semibold mb-2">For Windows/macOS:</h4>
            <ol class="text-sm text-gray-300 space-y-1 ml-4 list-decimal">
              <li>Open Bluetooth settings</li>
              <li>Put speakers in pairing mode</li>
              <li>Connect to speakers</li>
              <li>Set as audio output device</li>
            </ol>
          </div>

          ${hasBluetooth ? `
            <button onclick="Hub.music.testBluetooth()" class="btn btn-secondary w-full mt-4">
              🔍 Scan for BLE Devices (experimental)
            </button>
          ` : ''}
        </div>
      </div>
    `;
  },

  /** Test Web Bluetooth API (experimental) */
  async testBluetooth() {
    try {
      console.log('[Music] Testing Web Bluetooth...');
      
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service']
      });
      
      console.log('[Music] Found device:', device.name);
      Hub.ui?.toast?.(`Found: ${device.name}`, 'success');
      
    } catch (err) {
      console.error('[Music] Bluetooth error:', err);
      Hub.ui?.toast?.('Bluetooth scan failed: ' + err.message, 'error');
    }
  },

  /** Pause YouTube playback (if possible) */
  pause() {
    // YouTube iframe API would be needed for full control
    console.log('[Music] Pause requested (manual control needed)');
  },

  /** Resume YouTube playback */
  resume() {
    console.log('[Music] Resume requested (manual control needed)');
  },

  /** Stop YouTube playback */
  stop() {
    // Could reload iframe to stop, but that's heavy
    console.log('[Music] Stop requested (manual control needed)');
  },

  /** Handle page leave */
  onLeave() {
    console.log('[Music] Page left');
    // Keep playing in background (don't unload iframe)
  }
};
