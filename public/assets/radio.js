// ============================================================
// public/assets/radio.js — Live Radio Streaming
// Fixed:
//  - Uses Hub.player single audio instance
//  - Shows accurate status labels from player state
//  - Bluetooth button built into render() — works or explains why not
// ============================================================
window.Hub = window.Hub || {};

Hub.radio = {
  currentStation: null,
  _btDevice:      null,

  init() {
    console.log('[Radio] Initializing...');
    this.render();
    console.log('[Radio] Ready');
  },

  render() {
    const container = document.getElementById('radioStationList');
    if (!container) return;

    const stations = window.HOME_HUB_CONFIG?.radio?.stations || [];

    let stationsHTML = '';
    if (!stations.length) {
      stationsHTML = `
        <div class="card">
          <div class="text-center text-gray-400 py-8">
            <p class="text-4xl mb-3">📻</p>
            <p class="font-semibold">No radio stations configured</p>
            <p class="text-sm mt-2 text-gray-500">Add stations to <code>config.js → radio.stations</code></p>
          </div>
        </div>`;
    } else {
      stationsHTML = stations.map((station, index) => {
        const isActive = this.currentStation === index;
        const isPlaying = isActive && Hub.player.state.isPlaying;
        const statusText = isActive ? Hub.player._statusLabel() : '';
        return `
          <div class="card cursor-pointer transition-all hover:bg-gray-700 ${isActive ? 'ring-2 ring-blue-500' : ''}"
               onclick="Hub.radio.playStation(${index})">
            <div class="flex items-center gap-4">
              <div class="text-4xl">${station.logo || '📻'}</div>
              <div class="flex-1 min-w-0">
                <h3 class="font-bold text-lg">${Hub.utils.esc(station.name)}</h3>
                ${station.websiteUrl
                  ? `<a href="${Hub.utils.esc(station.websiteUrl)}" target="_blank"
                        onclick="event.stopPropagation()"
                        class="text-blue-400 hover:text-blue-300 text-sm">Visit website →</a>`
                  : ''}
              </div>
              <div class="text-right min-w-[90px]">
                ${isPlaying
                  ? `<span class="text-green-400 font-semibold block">▶ Playing</span>
                     <span class="text-xs text-yellow-400">${Hub.utils.esc(statusText)}</span>`
                  : isActive
                    ? `<span class="text-xs text-yellow-400 block">${Hub.utils.esc(statusText)}</span>`
                    : '<span class="text-gray-400 text-sm">Tap to play</span>'}
              </div>
            </div>
          </div>`;
      }).join('');
    }

    // Bluetooth section
    const savedDevice = localStorage.getItem('hub_bt_device_radio');
    const btLabel     = savedDevice ? `Connected: ${savedDevice}` : 'No device connected';
    const btBtnLabel  = savedDevice ? 'Disconnect' : 'Connect Bluetooth';
    const btSection   = `
      <div class="card mt-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🔵</span>
            <div>
              <h3 class="font-semibold">Bluetooth Audio</h3>
              <p id="radioBtStatus" class="text-sm text-gray-400">${Hub.utils.esc(btLabel)}</p>
            </div>
          </div>
          <button id="btnRadioBluetooth" onclick="Hub.radio.handleBluetooth()"
                  class="btn btn-secondary">${btBtnLabel}</button>
        </div>
      </div>`;

    container.innerHTML = stationsHTML + btSection;
  },

  async handleBluetooth() {
    const btn      = document.getElementById('btnRadioBluetooth');
    const statusEl = document.getElementById('radioBtStatus');

    // Disconnect flow
    if (localStorage.getItem('hub_bt_device_radio') && this._btDevice) {
      try { if (this._btDevice.gatt?.connected) this._btDevice.gatt.disconnect(); } catch (_) {}
      this._btDevice = null;
      localStorage.removeItem('hub_bt_device_radio');
      if (statusEl) statusEl.textContent = 'Disconnected';
      if (btn) btn.textContent = 'Connect Bluetooth';
      Hub.ui?.toast?.('Bluetooth disconnected', 'info');
      return;
    }

    // Guards
    if (!window.isSecureContext) {
      if (statusEl) statusEl.textContent = 'Requires HTTPS';
      Hub.ui?.toast?.('Bluetooth requires a secure (HTTPS) connection', 'error');
      return;
    }
    if (!navigator.bluetooth) {
      if (statusEl) statusEl.textContent = 'Not supported — use Chrome on Desktop/Android';
      Hub.ui?.toast?.('Web Bluetooth is not supported in this browser', 'error');
      return;
    }

    // Connect flow
    if (btn) { btn.disabled = true; btn.textContent = 'Scanning…'; }
    if (statusEl) statusEl.textContent = 'Opening device picker…';

    try {
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      this._btDevice = device;
      const name = device.name || device.id || 'Unknown Device';
      localStorage.setItem('hub_bt_device_radio', name);
      if (statusEl) statusEl.textContent = `Connected: ${name}`;
      if (btn) { btn.disabled = false; btn.textContent = 'Disconnect'; }
      Hub.ui?.toast?.(`Bluetooth connected: ${name}`, 'success');

      device.addEventListener('gattserverdisconnected', () => {
        localStorage.removeItem('hub_bt_device_radio');
        this._btDevice = null;
        const s = document.getElementById('radioBtStatus');
        const b = document.getElementById('btnRadioBluetooth');
        if (s) s.textContent = 'Disconnected';
        if (b) { b.disabled = false; b.textContent = 'Connect Bluetooth'; }
        Hub.ui?.toast?.('Bluetooth device disconnected', 'info');
      });
    } catch (err) {
      if (err.name === 'NotFoundError') {
        if (statusEl) statusEl.textContent = localStorage.getItem('hub_bt_device_radio') || 'No device connected';
      } else {
        console.error('[Radio] Bluetooth error:', err);
        if (statusEl) statusEl.textContent = `Error: ${err.message}`;
        Hub.ui?.toast?.(`Bluetooth: ${err.message}`, 'error');
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Connect Bluetooth'; }
    }
  },

  playStation(index) {
    const stations = window.HOME_HUB_CONFIG?.radio?.stations || [];
    const station  = stations[index];
    if (!station) { console.error('[Radio] Invalid station index:', index); return; }

    console.log('[Radio] Playing:', station.name);
    this.currentStation = index;
    Hub.player.playRadio(station.name, station.streamUrl);
    this.render();
  },

  stop() {
    Hub.player.stop();
    this.currentStation = null;
    this.render();
  },

  onEnter() {
    console.log('[Radio] Page entered');
    this.render();
  },

  onLeave() {
    console.log('[Radio] Page left — playback continues in background');
  }
};
