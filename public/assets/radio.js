// Radio page (lightweight audio player + optional iframe)
window.Hub = window.Hub || {};

Hub.radio = {
  _initDone: false,

  load() {
    if (!this._initDone) {
      this._initDone = true;
      this._bindControls();
    }
    this.renderStations();
    this._setupIframe();
    Hub.player?.renderDashboardWidget?.();
  },

  _bindControls() {
    const btnPP = document.getElementById('btnRadioPlayPause');
    const btnStop = document.getElementById('btnRadioStop');
    if (btnPP) btnPP.onclick = () => Hub.player.toggle();
    if (btnStop) btnStop.onclick = () => Hub.player.stop();
  },

  _setupIframe() {
    const url = window.HOME_HUB_CONFIG?.radioIframeUrl || '';
    const wrap = document.getElementById('radioIframeWrap');
    const frame = document.getElementById('radioIframe');
    const no = document.getElementById('radioNoIframe');

    if (url) {
      if (wrap) wrap.classList.remove('hidden');
      if (no) no.classList.add('hidden');
      if (frame) frame.src = url;
    } else {
      if (wrap) wrap.classList.add('hidden');
      if (no) no.classList.remove('hidden');
    }
  },

  renderStations() {
    const el = document.getElementById('radioStations');
    if (!el) return;

    const stations = Array.isArray(window.HOME_HUB_CONFIG?.radioStations) ? window.HOME_HUB_CONFIG.radioStations : [];
    if (!stations.length) {
      el.innerHTML = '<p class="text-gray-400 text-sm">No stations configured yet. Add them in <code>public/config.js</code>.</p>';
      return;
    }

    el.innerHTML = stations.map(s => `
      <button class="w-full text-left p-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
        onclick="Hub.radio.playStation('${Hub.utils ? Hub.utils.escAttr(s.id || s.name) : (s.id || s.name)}')">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="font-semibold truncate">${Hub.utils ? Hub.utils.esc(s.name) : s.name}</p>
            <p class="text-xs text-gray-400 truncate mt-0.5">${Hub.utils ? Hub.utils.esc(s.tagline || '') : (s.tagline || '')}</p>
          </div>
          <span class="text-xs text-gray-400">▶️</span>
        </div>
      </button>
    `).join('');
  },

  playStation(idOrName) {
    const stations = Array.isArray(window.HOME_HUB_CONFIG?.radioStations) ? window.HOME_HUB_CONFIG.radioStations : [];
    const station = stations.find(s => (s.id || s.name) === idOrName) || stations.find(s => s.name === idOrName);
    if (!station) return;
    Hub.player.playRadio(station);
  }
};
