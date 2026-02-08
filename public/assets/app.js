// ============================================================
// assets/app.js — Main application init & orchestration
// ============================================================
window.Hub = window.Hub || {};

// Global state
Hub.state = {
  user: null,
  household_id: null,
  userRole: null,
  settings: {}
};

Hub.app = {
  _idleTimer: null,

  /** Main init — called on DOMContentLoaded */
  async init() {
    // Wire up buttons
    this._bindUI();

    // Init router
    Hub.router.init();

    // Init Firebase
    Hub.treats.init();

    let authResolved = false;

    // Register auth listener — catches OAuth redirect callback
    try {
      Hub.auth.onAuthChange(async (event, session) => {
        try {
          console.log('[Auth]', event, session?.user?.email || 'no user');
          if (session?.user) {
            authResolved = true;
            await this._onLogin(session.user);
          } else if (event === 'SIGNED_OUT') {
            Hub.state.user = null;
            Hub.router.showScreen('login');
          }
        } catch (e) {
          console.error('[Auth] onAuthChange handler error:', e);
          if (!authResolved) Hub.router.showScreen('login');
        }
      });
    } catch (e) {
      console.error('[Auth] Failed to register auth listener:', e);
    }

    // Fallback: if onAuthStateChange didn't fire, try getSession manually
    setTimeout(async () => {
      if (!authResolved && !Hub.state.user) {
        console.log('[Auth] Timeout — trying getSession fallback');
        try {
          const session = await Hub.auth.getSession();
          if (session?.user) {
            authResolved = true;
            await this._onLogin(session.user);
          } else {
            console.log('[Auth] No session found, showing login');
            Hub.router.showScreen('login');
          }
        } catch (e) {
          console.error('[Auth] getSession fallback error:', e);
          Hub.router.showScreen('login');
        }
      }
    }, 1500);

    // Idle timer for standby
    this._startIdleTimer();
  },

  /** Handle successful login */
  _loginInProgress: false,
  async _onLogin(user) {
    // Prevent double execution from SIGNED_IN + INITIAL_SESSION
    if (this._loginInProgress) {
      console.log('[Auth] Login already in progress, skipping duplicate');
      return;
    }
    this._loginInProgress = true;

    try {
      const allowed = await Hub.auth.checkAccess(user);
      if (!allowed) {
        Hub.utils.$('deniedEmail').textContent = user.email;
        Hub.router.showScreen('accessDenied');
        this._loginInProgress = false;
        return;
      }

      Hub.state.user = user;

      // Load user settings (don't let this block login)
      try {
        const settings = await Hub.db.loadSettings(user.id);
        Hub.state.settings = settings || {};
      } catch (e) {
        console.warn('[Auth] Failed to load settings, using defaults:', e);
        Hub.state.settings = {};
      }

      // Navigate to current hash or dashboard
      console.log('[Auth] Login complete, showing app');
      Hub.utils.$('loadingScreen').style.display = 'none';
      Hub.utils.$('loginScreen')?.classList.remove('active');
      Hub.utils.$('accessDeniedScreen')?.classList.remove('active');
      const hash = window.location.hash.replace('#/', '') || 'dashboard';
      Hub.router._activate(hash);
    } catch (e) {
      console.error('[Auth] _onLogin error:', e);
      Hub.router.showScreen('login');
    }
    this._loginInProgress = false;
  },

  /** Called by router whenever a page is entered */
  onPageEnter(page) {
    this._resetIdleTimer();
    switch (page) {
      case 'dashboard':
        this._loadDashboard();
        break;
      case 'weather':
        this._loadWeatherPage();
        break;
      case 'chores':
        Hub.chores.load();
        break;
      case 'treats':
        Hub.treats.loadDogs();
        break;
      case 'standby':
        Hub.standby.start();
        break;
      case 'settings':
        this._loadSettingsForm();
        break;
      case 'status':
        this._loadStatusPage();
        break;
    }
  },

  /** Load dashboard */
  async _loadDashboard() {
    Hub.ui.updateDashboardDate();
    Hub.chores.loadDashboard();
    this._loadDashboardWeather();
  },

  /** Load dashboard weather */
  async _loadDashboardWeather() {
    try {
      const agg = await Hub.weather.fetchAggregate();
      const aiSummary = await Hub.ai.getSummary(agg);
      const normalized = Hub.weather.normalize(agg);
      Hub.weather.renderDashboard(aiSummary, normalized);

      // Handle alerts
      if (aiSummary?.alerts?.active) {
        Hub.ui.showBanner(aiSummary.alerts.banner_text, aiSummary.alerts.severity);
        const shouldPopup = aiSummary.actions?.some(a => a.type === 'show_popup');
        if (shouldPopup) Hub.ui.showAlertPopup(aiSummary.alerts);
      } else {
        Hub.ui.hideBanner();
      }
    } catch (e) {
      console.error('Dashboard weather error:', e);
    }
  },

  /** Load full weather page */
  async _loadWeatherPage() {
    try {
      const agg = await Hub.weather.fetchAggregate();
      const aiSummary = await Hub.ai.getSummary(agg);
      Hub.weather.renderWeatherPage(aiSummary, agg);
    } catch (e) {
      Hub.utils.$('weatherContent').innerHTML = '<p class="text-yellow-400">Error loading weather data.</p>';
    }
  },

  /** Load status page */
  async _loadStatusPage() {
    const el = Hub.utils.$('statusContent');
    if (!el) return;
    el.innerHTML = '<p class="text-gray-400">Checking services…</p>';

    const base = Hub.utils.apiBase();
    const checks = [
      { name: 'Supabase', key: 'supabase' },
      { name: 'Weather Aggregate', key: 'weather' },
      { name: 'AI Summary', key: 'ai' },
      { name: 'Immich Album', key: 'immich' }
    ];

    try {
      const resp = await fetch(`${base}/api/health`);
      const data = resp.ok ? await resp.json() : {};

      const svcData = data.services || data;
      el.innerHTML = '<div class="space-y-4">' + checks.map(c => {
        const svc = svcData[c.key];
        const ok = svc?.status === 'ok';
        const cls = ok ? 'green' : 'red';
        return `<div class="card flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="status-dot ${cls}"></span>
            <span class="font-medium">${Hub.utils.esc(c.name)}</span>
          </div>
          <div class="text-right">
            <span class="text-sm ${ok ? 'text-green-400' : 'text-red-400'}">${ok ? 'OK' : svc?.error || 'Error'}</span>
            ${svc?.latency_ms ? `<span class="text-xs text-gray-500 ml-2">${svc.latency_ms}ms</span>` : ''}
          </div>
        </div>`;
      }).join('') + '</div>' +
      `<p class="text-xs text-gray-500 mt-4">Last checked: ${new Date().toLocaleTimeString()}</p>`;
    } catch (e) {
      el.innerHTML = '<div class="card"><p class="text-red-400">Unable to reach health endpoint</p></div>';
    }
  },

  /** Load settings form from state */
  _loadSettingsForm() {
    const s = Hub.state.settings || {};
    const cfg = window.HOME_HUB_CONFIG || {};
    Hub.utils.$('settingLocationName').value = s.location_name || cfg.defaultLocation?.name || '';
    Hub.utils.$('settingLat').value = s.location_lat || cfg.defaultLocation?.lat || '';
    Hub.utils.$('settingLon').value = s.location_lon || cfg.defaultLocation?.lon || '';
    Hub.utils.$('settingImmichUrl').value = s.immich_base_url || cfg.immichBaseUrl || '';
    Hub.utils.$('settingImmichKey').value = s.immich_api_key || cfg.immichSharedAlbumKeyOrToken || '';
    Hub.utils.$('settingImmichAlbum').value = s.immich_album_id || '';
    Hub.utils.$('settingIdleTimeout').value = s.standby_timeout_min || 10;
    Hub.utils.$('settingQuietStart').value = s.quiet_hours_start || '22:00';
    Hub.utils.$('settingQuietEnd').value = s.quiet_hours_end || '07:00';
    Hub.utils.$('settingCalendarUrl').value = s.calendar_url || '';
  },

  /** Save settings to Supabase */
  async _saveSettings() {
    if (!Hub.state.user || !Hub.state.household_id) return;
    const payload = {
      location_name: Hub.utils.$('settingLocationName').value.trim(),
      location_lat: parseFloat(Hub.utils.$('settingLat').value) || 40.029059,
      location_lon: parseFloat(Hub.utils.$('settingLon').value) || -82.863462,
      standby_timeout_min: parseInt(Hub.utils.$('settingIdleTimeout').value) || 10,
      quiet_hours_start: Hub.utils.$('settingQuietStart').value || '22:00',
      quiet_hours_end: Hub.utils.$('settingQuietEnd').value || '07:00',
      immich_base_url: Hub.utils.$('settingImmichUrl').value.trim(),
      immich_api_key: Hub.utils.$('settingImmichKey').value.trim(),
      immich_album_id: Hub.utils.$('settingImmichAlbum').value.trim(),
      calendar_url: Hub.utils.$('settingCalendarUrl').value.trim()
    };

    try {
      const saved = await Hub.db.saveSettings(Hub.state.user.id, Hub.state.household_id, payload);
      Hub.state.settings = saved;
      // Clear weather cache so new location takes effect
      Hub.weather._cache = null;
      Hub.ai._cache = null;
      Hub.ui.toast('Settings saved!');
      Hub.router.go('dashboard');
    } catch (e) {
      Hub.ui.toast('Save failed: ' + e.message, 'error');
    }
  },

  /** Use browser geolocation */
  _useCurrentLocation() {
    navigator.geolocation.getCurrentPosition(
      pos => {
        Hub.utils.$('settingLat').value = pos.coords.latitude.toFixed(6);
        Hub.utils.$('settingLon').value = pos.coords.longitude.toFixed(6);
        Hub.ui.toast('Location updated');
      },
      () => Hub.ui.toast('Location access denied', 'error')
    );
  },

  /** Bind all UI event listeners */
  _bindUI() {
    Hub.utils.$('btnGoogleLogin')?.addEventListener('click', () => Hub.auth.signInGoogle());
    Hub.utils.$('btnSignOut')?.addEventListener('click', () => Hub.auth.signOut());
    Hub.utils.$('btnSignOutDenied')?.addEventListener('click', () => Hub.auth.signOut());
    Hub.utils.$('btnDismissAlert')?.addEventListener('click', () => Hub.ui.dismissAlert());
    Hub.utils.$('btnAddChore')?.addEventListener('click', () => Hub.chores.showAdd());
    Hub.utils.$('btnSaveChore')?.addEventListener('click', () => Hub.chores.add());
    Hub.utils.$('btnAddTreat')?.addEventListener('click', () => Hub.treats.showAddTreat());
    Hub.utils.$('btnSaveTreat')?.addEventListener('click', () => Hub.treats.logTreat());
    Hub.utils.$('btnAddDog')?.addEventListener('click', () => Hub.treats.showAddDog());
    Hub.utils.$('btnSaveDog')?.addEventListener('click', () => Hub.treats.addDog());
    Hub.utils.$('btnSaveSettings')?.addEventListener('click', () => Hub.app._saveSettings());
    Hub.utils.$('btnUseLocation')?.addEventListener('click', () => Hub.app._useCurrentLocation());
    Hub.utils.$('btnRefreshStatus')?.addEventListener('click', () => Hub.app._loadStatusPage());
  },

  /** Idle timer management */
  _startIdleTimer() {
    this._resetIdleTimer();
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, () => this._resetIdleTimer())
    );
  },

  _resetIdleTimer() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    const timeout = ((Hub.state.settings?.standby_timeout_min) || 10) * 60 * 1000;
    this._idleTimer = setTimeout(() => {
      if (Hub.router.current !== 'standby' && Hub.state.user) {
        Hub.router.go('standby');
      }
    }, timeout);
  }
};

// Boot
window.addEventListener('DOMContentLoaded', () => Hub.app.init());
