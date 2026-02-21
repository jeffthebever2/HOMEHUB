// ============================================================
// public/assets/music.js — Music Page (Spotify embed)
// Fix: Bluetooth uses real Web Bluetooth API with graceful
//      fallback. Music button routes via Hub.router.go('music')
//      (SPA — no page reload).
// ============================================================
window.Hub = window.Hub || {};

Hub.music = {
  iframeLoaded: false,
  _btDevice:    null,

  init() {
    console.log('[Music] Initializing...');
    console.log('[Music] Ready');
  },

  onEnter() {
    console.log('[Music] Page entered');
    if (!this.iframeLoaded) this.loadPlayer();
    this.renderBluetoothHelp();
  },

  loadPlayer() {
    const container = document.getElementById('musicPlayerContainer');
    if (!container) return;

    const spotifyUrl = window.HOME_HUB_CONFIG?.music?.spotifyUrl ||
      'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M';

    container.innerHTML = `
      <iframe
        src="${Hub.utils.esc(spotifyUrl)}"
        style="width:100%;height:600px;border:0;border-radius:.5rem;"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy">
      </iframe>`;

    this.iframeLoaded = true;
    Hub.player?.playYouTube?.('Spotify');
  },

  renderBluetoothHelp() {
    const container = document.getElementById('bluetoothHelp');
    if (!container) return;

    const savedDevice = localStorage.getItem('hub_bt_device_music');
    const btLabel     = savedDevice ? `Connected: ${savedDevice}` : 'No device connected';
    const btBtnLabel  = savedDevice ? 'Disconnect' : 'Connect Bluetooth';

    container.innerHTML = `
      <div class="card">
        <h3 class="font-bold text-lg mb-4">🔵 Bluetooth Audio Output</h3>
        <div class="flex items-center justify-between mb-4">
          <div>
            <p id="musicBtStatus" class="text-gray-300">${Hub.utils.esc(btLabel)}</p>
            <p class="text-xs text-gray-500 mt-1">Web Bluetooth requires Chrome on Desktop or Android</p>
          </div>
          <button id="btnMusicBluetooth" onclick="Hub.music.handleBluetooth()"
                  class="btn btn-secondary">${btBtnLabel}</button>
        </div>
        <div class="border-t border-gray-700 pt-4">
          <h4 class="font-semibold text-sm text-gray-400 mb-2">Manual pairing on Raspberry Pi:</h4>
          <ol class="text-sm text-gray-400 space-y-1 ml-4 list-decimal">
            <li>Put speakers in pairing mode</li>
            <li>Click Bluetooth icon in Pi taskbar → Add Device</li>
            <li>Select your speaker → right-click → Audio Sink</li>
          </ol>
        </div>
      </div>`;
  },

  async handleBluetooth() {
    const btn      = document.getElementById('btnMusicBluetooth');
    const statusEl = document.getElementById('musicBtStatus');

    // Disconnect
    if (localStorage.getItem('hub_bt_device_music') && this._btDevice) {
      try { if (this._btDevice.gatt?.connected) this._btDevice.gatt.disconnect(); } catch (_) {}
      this._btDevice = null;
      localStorage.removeItem('hub_bt_device_music');
      if (statusEl) statusEl.textContent = 'Disconnected';
      if (btn) btn.textContent = 'Connect Bluetooth';
      Hub.ui?.toast?.('Bluetooth disconnected', 'info');
      return;
    }

    if (!window.isSecureContext) {
      if (statusEl) statusEl.textContent = 'Requires HTTPS';
      Hub.ui?.toast?.('Bluetooth requires a secure (HTTPS) connection', 'error');
      return;
    }
    if (!navigator.bluetooth) {
      if (statusEl) statusEl.textContent = 'Not supported — use Chrome on Desktop/Android';
      Hub.ui?.toast?.('Web Bluetooth not supported in this browser', 'error');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Scanning…'; }
    if (statusEl) statusEl.textContent = 'Opening device picker…';

    try {
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      this._btDevice = device;
      const name = device.name || device.id || 'Unknown Device';
      localStorage.setItem('hub_bt_device_music', name);
      if (statusEl) statusEl.textContent = `Connected: ${name}`;
      if (btn) { btn.disabled = false; btn.textContent = 'Disconnect'; }
      Hub.ui?.toast?.(`Bluetooth connected: ${name}`, 'success');

      device.addEventListener('gattserverdisconnected', () => {
        localStorage.removeItem('hub_bt_device_music');
        this._btDevice = null;
        const s = document.getElementById('musicBtStatus');
        const b = document.getElementById('btnMusicBluetooth');
        if (s) s.textContent = 'Disconnected';
        if (b) { b.disabled = false; b.textContent = 'Connect Bluetooth'; }
        Hub.ui?.toast?.('Bluetooth device disconnected', 'info');
      });
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        console.error('[Music] Bluetooth error:', err);
        if (statusEl) statusEl.textContent = `Error: ${err.message}`;
        Hub.ui?.toast?.(`Bluetooth: ${err.message}`, 'error');
      } else {
        if (statusEl) statusEl.textContent = localStorage.getItem('hub_bt_device_music') || 'No device connected';
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Connect Bluetooth'; }
    }
  },

  pause()   { console.log('[Music] Pause');     },
  resume()  { console.log('[Music] Resume');    },
  stop()    { console.log('[Music] Stop');      },
  onLeave() { console.log('[Music] Page left'); }
};
