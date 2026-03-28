// ============================================================
// public/assets/radio.js — Radio Page UI  (v3 — kiosk-stable)
//
// ARCHITECTURE:
//   This module is a PURE UI CONTROLLER. It does NOT own any Audio
//   objects. All playback goes through Hub.player.playRadio().
//
//   Stations come from config.js + localStorage custom overlay.
//   The station list renders once on page enter; station highlight
//   and now-playing status are synced by Hub.player.updateUI()
//   which calls player._syncRadioPageStatus().
//
// KIOSK BEHAVIOR:
//   - Audio KEEPS PLAYING when navigating away (onLeave does nothing)
//   - Standby mode gets now-playing via Hub.player state
//   - Only explicit Stop button or Hub.player.stop() kills audio
//   - No duplicate Audio instances, no listener leaks
//   - Volume control goes through Hub.player.setVolume()
// ============================================================
window.Hub = window.Hub || {};

Hub.radio = {
  init() {
    // Nothing to init — load deferred to onEnter
  },

  // ── Station data ───────────────────────────────────────────

  _getStations() {
    const configStations = (window.HOME_HUB_CONFIG?.radio?.stations || []).map((s, i) => ({
      id:         `config-${i}`,
      name:       s.name,
      url:        s.streamUrl,
      logo:       s.logo || '📻',
      websiteUrl: s.websiteUrl || '',
      isConfig:   true,  // cannot be deleted
    }));

    try {
      const custom = JSON.parse(localStorage.getItem('hub_radio_custom_stations') || '[]');
      if (custom.length) {
        const customMapped = custom.map((s, i) => ({
          id:       `custom-${i}`,
          name:     s.name,
          url:      s.url,
          logo:     s.logo || '📻',
          isConfig: false,
        }));
        return [...configStations, ...customMapped];
      }
    } catch (_) {}

    return configStations;
  },

  _saveCustomStations(customStations) {
    localStorage.setItem('hub_radio_custom_stations', JSON.stringify(
      customStations.map(s => ({ name: s.name, url: s.url, logo: s.logo || '📻' }))
    ));
  },

  // ── Page lifecycle ─────────────────────────────────────────

  onEnter() {
    this._renderPage();
  },

  onLeave() {
    // INTENTIONALLY EMPTY — audio keeps playing across page navigation.
    // This is critical for kiosk use: user starts radio, navigates to
    // dashboard/weather/standby, and music continues.
  },

  // ── Render ─────────────────────────────────────────────────

  _renderPage() {
    const container = document.getElementById('radioPlayerArea');
    if (!container) return;

    const stations   = this._getStations();
    const currentUrl = Hub.player?.state?.streamUrl || '';
    const isPlaying  = Hub.player?.state?.isPlaying || false;
    const volVal     = Hub.player?.state?.volume ?? 0.8;

    container.innerHTML = `
      <!-- Now playing bar -->
      <div class="card mb-4" style="background:rgba(30,41,59,.8);">
        <div class="flex items-center gap-4">
          <div style="display:flex;align-items:flex-end;gap:3px;height:32px;">
            ${[1,2,3,4,5].map(i =>
              `<div class="radio-viz-bar" style="width:5px;background:#3b82f6;border-radius:2px;height:6px;
               animation:vizBar .${4+i}s ${i*.1}s ease-in-out infinite alternate;opacity:0.3;"></div>`
            ).join('')}
          </div>
          <div class="flex-1 min-w-0">
            <p id="radioStationName" class="font-semibold truncate text-gray-400">No station selected</p>
            <p id="radioStatus" class="text-xs text-gray-500 mt-0.5">Tap a station to play</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-gray-500 text-sm">🔊</span>
            <input id="radioVolume" type="range" min="0" max="100" step="1" value="${Math.round(volVal * 100)}"
              style="width:80px;accent-color:#3b82f6;"
              oninput="Hub.player.setVolume(this.value / 100)">
            <button id="radioStopBtn" onclick="Hub.player.stop(); Hub.radio._renderPage();"
              class="btn btn-secondary text-sm px-4" style="display:${currentUrl ? '' : 'none'};">⏹ Stop</button>
          </div>
        </div>
      </div>

      <!-- Station categories -->
      ${this._renderStationGroups(stations, currentUrl)}

      <!-- Add custom station form (hidden) -->
      <div id="radioAddForm" class="card mb-4" style="display:none;">
        <h3 class="font-semibold mb-3">Add Custom Station</h3>
        <div class="space-y-3">
          <div>
            <label class="text-sm text-gray-400 block mb-1">Station Name</label>
            <input id="radioFormName" type="text" class="input w-full" placeholder="My Favorite Station">
          </div>
          <div>
            <label class="text-sm text-gray-400 block mb-1">Stream URL (direct audio URL)</label>
            <input id="radioFormUrl" type="url" class="input w-full" placeholder="https://stream.example.com/station.mp3">
          </div>
          <div class="flex gap-2">
            <button onclick="Hub.radio._saveForm()" class="btn btn-primary flex-1">Save</button>
            <button onclick="Hub.radio._hideAddForm()" class="btn btn-secondary px-4">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Bluetooth -->
      <div class="card">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-2xl">🔵</span>
            <div>
              <h3 class="font-semibold">Bluetooth Audio</h3>
              <p id="radioBtStatus" class="text-sm text-gray-400">No device connected</p>
            </div>
          </div>
          <button id="btnRadioBluetooth" onclick="Hub.radio.handleBluetooth()"
                  class="btn btn-secondary">Connect Bluetooth</button>
        </div>
      </div>
    `;

    // Sync now-playing bar with current player state
    Hub.player?._syncRadioPageStatus?.();
    this._restoreBtLabel();
  },

  _renderStationGroups(stations, currentUrl) {
    // Group stations by source region using name heuristics
    const groups = {
      'Lima / St. Marys': [],
      'Columbus':         [],
      'National':         [],
      'Custom':           [],
    };

    stations.forEach((s, globalIdx) => {
      s._globalIdx = globalIdx; // track index for _play()
      if (!s.isConfig) {
        groups['Custom'].push(s);
      } else if (s.name.includes('Lima') || s.name.includes('WIMA')) {
        groups['Lima / St. Marys'].push(s);
      } else if (s.name.includes('Columbus') || s.name.includes('WOSU') || s.name.includes('WNCI') || s.name.includes('WCOL') || s.name.includes('Sunny 95') || s.name.includes('QFM') || s.name.includes('Blitz') || s.name.includes('CD 92') || s.name.includes('106.7')) {
        groups['Columbus'].push(s);
      } else {
        groups['National'].push(s);
      }
    });

    let html = '';
    for (const [groupName, list] of Object.entries(groups)) {
      if (list.length === 0) continue;

      const isCustom = groupName === 'Custom';
      html += `
        <div class="card mb-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-lg">${Hub.utils.esc(groupName)}</h3>
            ${isCustom ? `<button onclick="Hub.radio._showAddForm()" class="btn btn-secondary text-sm px-3">+ Add</button>` : ''}
          </div>
          <div class="space-y-1">
            ${list.map(s => this._stationRowHTML(s, currentUrl)).join('')}
          </div>
        </div>
      `;
    }

    // If no custom stations, still show the "add" card
    if (groups['Custom'].length === 0) {
      html += `
        <div class="card mb-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-semibold text-lg">Custom Stations</h3>
            <button onclick="Hub.radio._showAddForm()" class="btn btn-secondary text-sm px-3">+ Add</button>
          </div>
          <p class="text-gray-500 text-sm">Add your own stream URLs</p>
        </div>
      `;
    }

    return html;
  },

  _stationRowHTML(station, currentUrl) {
    const active = station.url === currentUrl;
    const logo   = active ? '🔊' : (station.logo || '📻');
    const idx    = station._globalIdx;

    return `
      <div class="flex items-center gap-2 p-2.5 rounded-lg transition-colors
           ${active ? 'bg-blue-900/40 border border-blue-700/50' : 'hover:bg-white/5'}"
           style="cursor:pointer;"
           data-station-url="${Hub.utils.esc(station.url)}"
           onclick="Hub.radio._play(${idx})">
        <span style="font-size:1.2rem;flex-shrink:0;width:28px;text-align:center;">${logo}</span>
        <span class="flex-1 text-sm font-medium truncate ${active ? 'text-blue-300' : ''}">${Hub.utils.esc(station.name)}</span>
        ${!station.isConfig ? `
          <button onclick="event.stopPropagation();Hub.radio._deleteStation(${idx})"
            class="text-gray-600 hover:text-red-400 text-xs px-2 py-1"
            style="background:none;border:none;cursor:pointer;" title="Remove">✕</button>
        ` : ''}
      </div>`;
  },

  // ── Playback (delegates to Hub.player) ─────────────────────

  _play(index) {
    const stations = this._getStations();
    const station  = stations[index];
    if (!station) return;

    // If already playing this station, do nothing
    if (Hub.player?.state?.streamUrl === station.url && Hub.player?.state?.isPlaying) {
      return;
    }

    // Delegate to player — player handles all audio lifecycle
    Hub.player.playRadio(station.name, station.url);

    // Refresh station list to highlight the new active row
    // Use rAF to let player.updateUI() run first
    requestAnimationFrame(() => this._renderPage());
  },

  // ── Custom station management ──────────────────────────────

  _showAddForm() {
    const form = document.getElementById('radioAddForm');
    if (!form) return;
    document.getElementById('radioFormName').value = '';
    document.getElementById('radioFormUrl').value  = '';
    form.style.display = '';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  _hideAddForm() {
    const form = document.getElementById('radioAddForm');
    if (form) form.style.display = 'none';
  },

  _saveForm() {
    const name = document.getElementById('radioFormName')?.value.trim();
    const url  = document.getElementById('radioFormUrl')?.value.trim();
    if (!name || !url) { Hub.ui?.toast?.('Name and URL are required', 'error'); return; }
    if (!url.startsWith('http')) { Hub.ui?.toast?.('URL must start with http:// or https://', 'error'); return; }

    try {
      const custom = JSON.parse(localStorage.getItem('hub_radio_custom_stations') || '[]');
      // Prevent duplicates
      if (custom.some(s => s.url === url)) {
        Hub.ui?.toast?.('This URL is already saved', 'error');
        return;
      }
      custom.push({ name, url, logo: '📻' });
      localStorage.setItem('hub_radio_custom_stations', JSON.stringify(custom));
      this._hideAddForm();
      this._renderPage();
      Hub.ui?.toast?.(`Station added: ${name}`, 'success');
    } catch (e) {
      Hub.ui?.toast?.('Failed to save station', 'error');
    }
  },

  _deleteStation(globalIndex) {
    const stations = this._getStations();
    const station  = stations[globalIndex];
    if (!station || station.isConfig) return; // can't delete config stations

    // If currently playing this station, stop first
    if (Hub.player?.state?.streamUrl === station.url) {
      Hub.player.stop();
    }

    try {
      const custom = JSON.parse(localStorage.getItem('hub_radio_custom_stations') || '[]');
      const filtered = custom.filter(s => s.url !== station.url);
      localStorage.setItem('hub_radio_custom_stations', JSON.stringify(filtered));
      this._renderPage();
      Hub.ui?.toast?.(`Removed: ${station.name}`, 'success');
    } catch (_) {}
  },

  // ── Bluetooth (unchanged) ─────────────────────────────────

  _btDevice: null,

  _restoreBtLabel() {
    const saved    = localStorage.getItem('hub_bt_device_radio');
    const statusEl = document.getElementById('radioBtStatus');
    const btn      = document.getElementById('btnRadioBluetooth');
    if (saved && statusEl) statusEl.textContent = `Connected: ${saved}`;
    if (saved && btn)      btn.textContent = 'Disconnect';
  },

  async handleBluetooth() {
    const btn      = document.getElementById('btnRadioBluetooth');
    const statusEl = document.getElementById('radioBtStatus');

    if (localStorage.getItem('hub_bt_device_radio') && this._btDevice) {
      try { if (this._btDevice.gatt?.connected) this._btDevice.gatt.disconnect(); } catch (_) {}
      this._btDevice = null;
      localStorage.removeItem('hub_bt_device_radio');
      if (statusEl) statusEl.textContent = 'Disconnected';
      if (btn)      btn.textContent = 'Connect Bluetooth';
      Hub.ui?.toast?.('Bluetooth disconnected', 'info');
      return;
    }

    if (!window.isSecureContext) {
      Hub.ui?.toast?.('Bluetooth requires HTTPS', 'error');
      return;
    }
    if (!navigator.bluetooth) {
      if (statusEl) statusEl.textContent = 'Not supported — use Chrome on Desktop/Android';
      Hub.ui?.toast?.('Web Bluetooth not supported', 'error');
      return;
    }

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
      });
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        Hub.ui?.toast?.(`Bluetooth: ${err.message}`, 'error');
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Connect Bluetooth'; }
    }
  }
};
