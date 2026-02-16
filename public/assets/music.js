// ============================================================
// music.js — Simple Spotify Player
// ============================================================

window.Hub = window.Hub || {};

Hub.music = {
  iframeLoaded: false,

  init() {
    console.log('[Music] Initializing...');
    console.log('[Music] Ready');
  },

  onEnter() {
    console.log('[Music] Page entered');
    if (!this.iframeLoaded) {
      this.loadSpotify();
    }
  },

  /** Load Spotify Web Player */
  loadSpotify() {
    const container = document.getElementById('musicPlayerContainer');
    if (!container) return;

    const spotifyUrl = window.HOME_HUB_CONFIG?.music?.spotifyUrl || 
                       'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M';

    container.innerHTML = `
      <iframe src="${spotifyUrl}" 
              style="width: 100%; height: 600px; border: 0; border-radius: 0.5rem;"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"></iframe>
    `;

    this.iframeLoaded = true;
    Hub.player?.playYouTube?.('Spotify');
  },

  renderBluetoothHelp() {
    const container = document.getElementById('bluetoothHelp');
    if (!container) return;

    container.innerHTML = `
      <div class="card">
        <h3 class="font-bold text-lg mb-4">🔊 Connect Bluetooth Speakers</h3>
        <div class="space-y-4">
          <div>
            <h4 class="font-semibold mb-2">For Raspberry Pi:</h4>
            <ol class="text-sm text-gray-300 space-y-1 ml-4 list-decimal">
              <li>Click Bluetooth icon in menu bar</li>
              <li>Put speakers in pairing mode</li>
              <li>Click "Add Device"</li>
              <li>Right-click device → "Audio Sink"</li>
            </ol>
          </div>
          <div>
            <h4 class="font-semibold mb-2">For Windows/Mac:</h4>
            <ol class="text-sm text-gray-300 space-y-1 ml-4 list-decimal">
              <li>Open Bluetooth settings</li>
              <li>Pair speakers</li>
              <li>Set as audio output</li>
            </ol>
          </div>
        </div>
      </div>
    `;
  },

  pause() { console.log('[Music] Pause'); },
  resume() { console.log('[Music] Resume'); },
  stop() { console.log('[Music] Stop'); },
  onLeave() { console.log('[Music] Page left'); }
};
