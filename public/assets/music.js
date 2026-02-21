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
    // Web Bluetooth API is not supported in Firefox — show OS instructions instead.
    // No error toasts, no API calls.
    container.innerHTML = `
      <div class="card">
        <h3 class="font-bold text-lg mb-3" style="display:flex;align-items:center;gap:.5rem;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;vertical-align:-3px;" aria-hidden="true"><path d="M9 3L9 21M4.5 6.75L19.5 17.25M19.5 6.75L4.5 17.25"/></svg>
          Connect Bluetooth Speakers
        </h3>
        <p class="text-sm text-gray-400 mb-4">Pair via your operating system — no browser extension needed.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="bg-gray-800 rounded-lg p-4">
            <h4 class="font-semibold mb-2 text-sm text-blue-400">Raspberry Pi</h4>
            <ol class="text-sm text-gray-300 space-y-1 ml-4 list-decimal">
              <li>Click Bluetooth icon in the menu bar</li>
              <li>Put speakers in pairing mode</li>
              <li>Click "Add Device" and select your speaker</li>
              <li>Right-click the paired device → "Audio Sink"</li>
            </ol>
          </div>
          <div class="bg-gray-800 rounded-lg p-4">
            <h4 class="font-semibold mb-2 text-sm text-blue-400">Windows / macOS</h4>
            <ol class="text-sm text-gray-300 space-y-1 ml-4 list-decimal">
              <li>Open system Bluetooth settings</li>
              <li>Pair your speakers from there</li>
              <li>Set as default audio output</li>
              <li>Reload this page — audio will use paired device</li>
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
