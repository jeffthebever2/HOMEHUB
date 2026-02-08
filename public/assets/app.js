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
  _loggedIn: false,

  /** Main init — called on DOMContentLoaded */
  async init() {
    this._bindUI();
    Hub.router.init();
    Hub.treats.init();

    // Single auth listener — guards with _loggedIn flag
    Hub.auth.onAuthChange(async (event, session) => {
      console.log('[Auth] Event:', event, session?.user?.email || 'no user');
      if (session?.user && !this._loggedIn) {
        await this._onLogin(session.user);
      } else if (event === 'SIGNED_OUT') {
        this._loggedIn = false;
        Hub.state.user = null;
        Hub.router.showScreen('login');
      }
    });

    // Fallback: if nothing happened after 2.5s, try getSession manually
    setTimeout(async () => {
      if (this._loggedIn) return;
      console.log('[Auth] Timeout — trying getSession fallback');
      try {
        const session = await Hub.auth.getSession();
        if (session?.user && !this._loggedIn) {
          await this._onLogin(session.user);
        } else if (!this._loggedIn) {
          console.log('[Auth] No session, showing login');
          Hub.router.showScreen('login');
        }
      } catch (e) {
        console.error('[Auth] Fallback error:', e);
        if (!this._loggedIn) Hub.router.showScreen('login');
      }
    }, 2500);

    this._startIdleTimer();
  },

  /** Handle successful login — runs ONCE */
  async _onLogin(user) {
    if (this._loggedIn) {
      console.log('[Auth] Already logged in, skipping');
      return;
    }

    try {
      console.log('[Auth] Checking access for:', user.email);
      const allowed = await Hub.auth.checkAccess(user);

      // Re-check after await
      if (this._loggedIn) return;

      if (!allowed) {
        console.log('[Auth] Access DENIED for:', user.email);
        Hub.utils.$('deniedEmail').textContent = user.email;
        Hub.router.showScreen('accessDenied');
        return;
      }

      // LOCK immediately
      this._loggedIn = true;
      Hub.state.user = user;
      console.log('[Auth] Access GRANTED — showing dashboard');

      // Load settings (non-blocking failure)
      try {
        const settings = await Hub.db.loadSettings(user.id);
        Hub.state.settings = settings || {};
      } catch (e) {
        console.warn('[Auth] Settings load failed, using defaults');
        Hub.state.settings = {};
      }

      // FORCE show app
      this._showApp();
    } catch (e) {
      console.error('[Auth] _onLogin error:', e);
      if (!this._loggedIn) Hub.router.showScreen('login');
    }
  },

  /** Force the app UI to be visible — bypasses router */
  _showApp() {
    // 1. Kill loading spinner
    const loading = Hub.utils.$('loadingScreen');
    if (loading) loading.style.display = 'none';

    // 2. Remove active from EVERY .page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // 3. Pick the target page
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    const page = Hub.router.VALID_PAGES.includes(hash) ? hash : 'dashboard';

    // 4. Activate it
    const el = Hub.utils.$(page + 'Page');
    if (el) {
      el.classList.add('active');
    } else {
      Hub.utils.$('dashboardPage').classList.add('active');
    }

    Hub.router.current = page;
    console.log('[Auth] Page activated:', page);

    // 5. Run page logic
    this.onPageEnter(page);
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

  async _loadDashboard() {
    Hub.ui.updateDashboardDate();
    Hub.chores.loadDashboard();
    this._loadDashboardWeather();
  },

  async _loadDashboardWeather() {
    try {
      const agg = await Hub.weather.fetchAggregate();
      const aiSummary = await Hub.ai.getSummary(agg);
      const normalized = Hub.weather.normalize(agg);
      Hub.weather.renderDashboard(aiSummary, normalized);

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

  async _loadWeatherPage() {
    try {
      const agg = await Hub.weather.fetchAggregate();
      const aiSummary = await Hub.ai.getSummary(agg);
      Hub.weather.renderWeatherPage(aiSummary, agg);
    } catch (e) {
      Hub.utils.$('weatherContent').innerHTML = '<p class="text-yellow-400">Error loading weather data.</p>';
    }
  },

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
      Hub.weather._cache = null;
      Hub.ai._cache = null;
      Hub.ui.toast('Settings saved!');
      Hub.router.go('dashboard');
    } catch (e) {
      Hub.ui.toast('Save failed: ' + e.message, 'error');
    }
  },

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
