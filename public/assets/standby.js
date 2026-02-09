// ============================================================
// assets/standby.js — Standby / Ambient Mode
// ============================================================
window.Hub = window.Hub || {};

Hub.standby = {
  _clockInterval: null,
  _photoInterval: null,
  _weatherInterval: null,

  /** Start standby mode */
  start() {
    this._updateClock();
    this._clockInterval = setInterval(() => this._updateClock(), 1000);

    // Weather mini-view
    this._loadWeather();
    this._weatherInterval = setInterval(() => this._loadWeather(), 300000); // every 5 min

    // Photo slideshow
    Hub.immich.loadStandbyPhotos();
    this._photoInterval = setInterval(() => Hub.immich.loadStandbyPhotos(), 15000);

    // Wake on interaction
    const wake = (e) => {
      // Don't exit if clicking inside standby controls
      this.stop();
      Hub.router.go('dashboard');
    };
    Hub.utils.$('standbyContent').onclick = wake;
  },

  /** Stop standby mode */
  stop() {
    clearInterval(this._clockInterval);
    clearInterval(this._photoInterval);
    clearInterval(this._weatherInterval);
    this._clockInterval = null;
  },

  /** Update clock display */
  _updateClock() {
    const now = new Date();
    const clockEl = Hub.utils.$('standbyClock');
    const dateEl = Hub.utils.$('standbyDate');
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  },

  /** Load weather for standby mini-view */
  async _loadWeather() {
    const el = Hub.utils.$('standbyWeather');
    if (!el) return;
    try {
      const agg = await Hub.weather.fetchAggregate();
      const ai = await Hub.ai.getSummary(agg);
      if (ai) {
        el.innerHTML = `
          <p class="text-lg font-medium mb-1">${Hub.utils.esc(ai.headline)}</p>
          <p class="text-gray-400 text-sm">${ai.today?.high_f ?? '--'}° / ${ai.today?.low_f ?? '--'}°</p>
          ${ai.hazards?.length ? `<p class="text-yellow-400 text-sm mt-1">⚠️ ${Hub.utils.esc(ai.hazards[0])}</p>` : ''}
        `;

        // Alert handling in standby
        if (ai.alerts?.active) {
          Hub.ui.showBanner(ai.alerts.banner_text, ai.alerts.severity);
          const shouldPopup = ai.actions?.some(a => a.type === 'show_popup');
          if (shouldPopup) Hub.ui.showAlertPopup(ai.alerts);
        }
      }
    } catch (e) {
      el.innerHTML = '<p class="text-gray-500 text-sm">Weather unavailable</p>';
    }
  }
};
