// ============================================================
// public/assets/radio.js — Radio page
// TuneIn iframe was removed (CSP frame-ancestors blocks it).
// Now uses native <audio> with direct stream URLs + localStorage presets.
// ============================================================
window.Hub = window.Hub || {};

Hub.radio = {
  _audio:    null,   // single HTMLAudioElement
  _current:  null,   // { name, url }

  // Default preset stations (used if nothing saved in localStorage)
  _DEFAULT_STATIONS: [
    { name: 'WNYC 93.9 FM (NPR New York)',     url: 'https://fm939.wnyc.org/wnycfm.aac' },
    { name: 'KEXP 90.3 FM (Seattle)',           url: 'https://live-aacplus-64.kexp.org/kexp64.aac' },
    { name: 'BBC Radio 1',                      url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_one' },
    { name: 'BBC World Service',                url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service' },
    { name: 'Jazz FM (UK)',                     url: 'https://edge-audio-03-gos2.sharp-stream.com/jazzfm.mp3' },
    { name: 'SomaFM Groove Salad',              url: 'https://ice1.somafm.com/groovesalad-128-aac' },
    { name: 'SomaFM Space Station Soma',        url: 'https://ice1.somafm.com/spacestation-128-aac' },
  ],

  init() {
    console.log('[Radio] Init');
  },

  // ── Stations in localStorage ──────────────────────────────

  _getStations() {
    try {
      const raw = localStorage.getItem('hub_radio_stations');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return this._DEFAULT_STATIONS.map(s => ({ ...s }));
  },

  _saveStations(stations) {
    localStorage.setItem('hub_radio_stations', JSON.stringify(stations));
  },

  // ── Page enter / leave ────────────────────────────────────

  onEnter() {
    console.log('[Radio] onEnter');
    this._renderPage();
  },

  onLeave() {
    console.log('[Radio] onLeave — stopping audio');
    this._stop();
  },

  // ── Render ────────────────────────────────────────────────

  _renderPage() {
    const container = document.getElementById('radioPlayerArea');
    if (!container) return;

    const stations = this._getStations();
    const currentUrl = this._current?.url || '';

    container.innerHTML = `
      <!-- Now playing bar -->
      <div id="radioNowPlaying" class="card mb-4" style="background:rgba(30,41,59,.8);">
        <div class="flex items-center gap-4">
          <div id="radioVizWrap" style="display:flex;align-items:flex-end;gap:3px;height:32px;">
            ${[1,2,3,4,5].map(i =>
              `<div class="radio-viz-bar" style="width:5px;background:#3b82f6;border-radius:2px;height:6px;
               animation:vizBar .${4+i}s ${i*.1}s ease-in-out infinite alternate;opacity:0.3;"></div>`
            ).join('')}
          </div>
          <div class="flex-1 min-w-0">
            <p id="radioStationName" class="font-semibold truncate text-gray-400">No station selected</p>
            <p id="radioStatus"      class="text-xs text-gray-500 mt-0.5">Tap a station to play</p>
          </div>
          <div class="flex items-center gap-2">
            <input id="radioVolume" type="range" min="0" max="1" step="0.05" value="0.8"
              style="width:80px;accent-color:#3b82f6;" oninput="Hub.radio._setVolume(this.value)">
            <button id="radioStopBtn" onclick="Hub.radio._stop()"
              class="btn btn-secondary text-sm px-4" style="display:none;">⏹ Stop</button>
          </div>
        </div>
      </div>

      <!-- Station list -->
      <div class="card mb-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-lg">Stations</h3>
          <button onclick="Hub.radio._showAddForm()" class="btn btn-secondary text-sm px-3">+ Add</button>
        </div>
        <div id="radioStationList" class="space-y-2">
          ${stations.length === 0
            ? '<p class="text-gray-500 text-sm text-center py-4">No stations yet. Click + Add.</p>'
            : stations.map((s, i) => this._stationRowHTML(s, i, currentUrl)).join('')}
        </div>
      </div>

      <!-- Add/edit form (hidden by default) -->
      <div id="radioAddForm" class="card mb-4" style="display:none;">
        <h3 class="font-semibold mb-3">Add / Edit Station</h3>
        <div class="space-y-3">
          <div>
            <label class="text-sm text-gray-400 block mb-1">Station Name</label>
            <input id="radioFormName" type="text" class="input w-full" placeholder="My Favorite Station">
          </div>
          <div>
            <label class="text-sm text-gray-400 block mb-1">Stream URL</label>
            <input id="radioFormUrl"  type="url"  class="input w-full" placeholder="https://stream.example.com/station.mp3">
          </div>
          <input type="hidden" id="radioFormIndex" value="-1">
          <div class="flex gap-2">
            <button onclick="Hub.radio._saveForm()"   class="btn btn-primary flex-1">Save</button>
            <button onclick="Hub.radio._testStream()" class="btn btn-secondary flex-1">▶ Test</button>
            <button onclick="Hub.radio._hideAddForm()" class="btn btn-secondary px-4">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Bluetooth (kept from before) -->
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

    this._restoreBtLabel();
    this._syncNowPlaying();
  },

  _stationRowHTML(station, index, currentUrl) {
    const active = station.url === currentUrl;
    return `
      <div class="flex items-center gap-2 p-2 rounded-lg transition-colors ${active ? 'bg-blue-900/40 border border-blue-700/50' : 'hover:bg-white/5'}"
           style="cursor:pointer;" onclick="Hub.radio._play(${index})">
        <span style="font-size:1.1rem;flex-shrink:0;">${active ? '🔊' : '📻'}</span>
        <span class="flex-1 text-sm font-medium truncate">${Hub.utils.esc(station.name)}</span>
        <button onclick="event.stopPropagation();Hub.radio._editStation(${index})"
          class="text-gray-500 hover:text-blue-400 text-xs px-2 py-1" style="background:none;border:none;cursor:pointer;">Edit</button>
        <button onclick="event.stopPropagation();Hub.radio._deleteStation(${index})"
          class="text-gray-500 hover:text-red-400 text-xs px-2 py-1" style="background:none;border:none;cursor:pointer;">✕</button>
      </div>`;
  },

  // ── Playback ──────────────────────────────────────────────

  _play(index) {
    const stations = this._getStations();
    const station  = stations[index];
    if (!station) return;

    // Stop existing
    this._stop(false);

    this._current = station;
    this._audio   = new Audio(station.url);
    this._audio.volume = parseFloat(document.getElementById('radioVolume')?.value || 0.8);
    this._audio.preload = 'none';

    this._audio.addEventListener('playing', () => {
      this._setStatus('Playing', 'text-green-400');
      const stopBtn = document.getElementById('radioStopBtn');
      if (stopBtn) stopBtn.style.display = '';
      this._setVizActive(true);
    });
    this._audio.addEventListener('waiting',  () => this._setStatus('Buffering…', 'text-yellow-400'));
    this._audio.addEventListener('stalled',  () => this._setStatus('Stalled…',   'text-yellow-400'));
    this._audio.addEventListener('error',    () => {
      this._setStatus('Error — check stream URL', 'text-red-400');
      this._setVizActive(false);
      Hub.ui?.toast?.(`Cannot play: ${station.name}`, 'error');
    });
    this._audio.addEventListener('ended', () => {
      this._setStatus('Ended', 'text-gray-400');
      this._setVizActive(false);
    });

    this._audio.play().catch(e => {
      this._setStatus(`Playback blocked: ${e.message}`, 'text-red-400');
    });

    this._setStatus('Connecting…', 'text-yellow-400');
    const nameEl = document.getElementById('radioStationName');
    if (nameEl) nameEl.textContent = station.name;

    // Refresh list to highlight current row
    this._renderPage();
  },

  _stop(rerender = true) {
    if (this._audio) {
      this._audio.pause();
      this._audio.src = '';
      this._audio = null;
    }
    this._setVizActive(false);
    this._setStatus('Stopped', 'text-gray-400');
    const stopBtn = document.getElementById('radioStopBtn');
    if (stopBtn) stopBtn.style.display = 'none';
    if (rerender) this._renderPage();
  },

  _setVolume(val) {
    if (this._audio) this._audio.volume = parseFloat(val);
  },

  _setStatus(msg, cls) {
    const el = document.getElementById('radioStatus');
    if (!el) return;
    el.textContent  = msg;
    el.className    = `text-xs mt-0.5 ${cls || 'text-gray-400'}`;
  },

  _setVizActive(on) {
    document.querySelectorAll('.radio-viz-bar').forEach((b, i) => {
      b.style.opacity   = on ? '1'   : '0.3';
      b.style.animation = on
        ? `vizBar .${4+(i+1)}s ${i*.1}s ease-in-out infinite alternate`
        : 'none';
      b.style.height    = on ? '' : '6px';
    });
  },

  _syncNowPlaying() {
    if (!this._current) return;
    const nameEl = document.getElementById('radioStationName');
    if (nameEl) nameEl.textContent = this._current.name;
  },

  // ── Add / edit form ───────────────────────────────────────

  _showAddForm(index = -1) {
    const form = document.getElementById('radioAddForm');
    if (!form) return;
    const stations = this._getStations();
    document.getElementById('radioFormName').value  = index >= 0 ? stations[index].name : '';
    document.getElementById('radioFormUrl').value   = index >= 0 ? stations[index].url  : '';
    document.getElementById('radioFormIndex').value = index;
    form.style.display = '';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  _hideAddForm() {
    const form = document.getElementById('radioAddForm');
    if (form) form.style.display = 'none';
  },

  _saveForm() {
    const name  = document.getElementById('radioFormName')?.value.trim();
    const url   = document.getElementById('radioFormUrl')?.value.trim();
    const index = parseInt(document.getElementById('radioFormIndex')?.value ?? '-1');
    if (!name || !url) { Hub.ui?.toast?.('Name and URL are required', 'error'); return; }

    const stations = this._getStations();
    if (index >= 0 && index < stations.length) {
      stations[index] = { name, url };
    } else {
      stations.push({ name, url });
    }
    this._saveStations(stations);
    this._hideAddForm();
    this._renderPage();
    Hub.ui?.toast?.(`Station saved: ${name}`, 'success');
  },

  _editStation(index) {
    this._showAddForm(index);
  },

  _deleteStation(index) {
    const stations = this._getStations();
    const removed  = stations.splice(index, 1)[0];
    if (this._current?.url === removed?.url) this._stop(false);
    this._saveStations(stations);
    this._renderPage();
    Hub.ui?.toast?.(`Removed: ${removed.name}`, 'info');
  },

  _testStream() {
    const url  = document.getElementById('radioFormUrl')?.value.trim();
    const name = document.getElementById('radioFormName')?.value.trim() || 'Test';
    if (!url) { Hub.ui?.toast?.('Enter a stream URL first', 'error'); return; }

    // Temporarily add and play
    const stations  = this._getStations();
    const tempIndex = stations.length;
    stations.push({ name, url });
    this._saveStations(stations);
    this._play(tempIndex);

    // Remove temp after 10s if still there
    setTimeout(() => {
      const s2 = this._getStations();
      if (s2[tempIndex]?.url === url && s2[tempIndex]?.name === name) {
        // Only remove if user didn't save it properly
      }
    }, 10000);
  },

  // ── Bluetooth (unchanged logic) ───────────────────────────

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
      if (statusEl) statusEl.textContent = 'Requires HTTPS';
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
      if (err.name !== 'NotFoundError') {
        if (statusEl) statusEl.textContent = `Error: ${err.message}`;
        Hub.ui?.toast?.(`Bluetooth: ${err.message}`, 'error');
      } else {
        if (statusEl) statusEl.textContent = localStorage.getItem('hub_bt_device_radio') || 'No device connected';
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Connect Bluetooth'; }
    }
  }
};
