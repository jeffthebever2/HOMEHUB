// ============================================================
// assets/app.js — Main application init & orchestration (v3)
//
// - Handles ALL auth events (SIGNED_IN, INITIAL_SESSION, etc.)
// - _loggedIn guard prevents duplicate execution
// - #letmein bypass for testing
// - 3s getSession fallback + 8s hard fallback
// ============================================================
window.Hub = window.Hub || {};

Hub.state = {
  user: null,
  household_id: null,
  userRole: null,
  settings: {}
};

Hub.app = {
  _idleTimer: null,
  _loggedIn: false,
  _authHandled: false,
  _loginInProgress: false,

  async init() {
    console.log('[App] init()');
    this._bindUI();
    Hub.router.init();
    Hub.treats.init();

    // ── TEST BYPASS: visit /#letmein ──
    if (window.location.hash === '#letmein') {
      console.log('[Auth] ⚠ BYPASS MODE');
      this._loggedIn = true;
      this._authHandled = true;
      Hub.state.user = { id: 'test', email: 'bypass@test' };
      Hub.state.household_id = 'd49c4c5b-1ffd-42db-9b3e-bec70545bf87';
      Hub.state.userRole = 'admin';
      Hub.state.settings = {};
      document.getElementById('loadingScreen').style.display = 'none';
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('dashboardPage').classList.add('active');
      console.log('[Auth] ⚠ Dashboard forced via bypass');
      return;
    }

    // ── Auth listener ──
    // ONLY act on INITIAL_SESSION (fires AFTER pkce code exchange)
    // Skip SIGNED_IN — it fires DURING exchange when JWT isn't ready
    Hub.auth.onAuthChange(async (event, session) => {
      console.log('[Auth] Event:', event, session?.user?.email || 'no-user');

      if (event === 'SIGNED_OUT') {
        // Don't sign out if we're in the middle of logging in
        if (this._loginInProgress) {
          console.warn('[Auth] SIGNED_OUT event during login - ignoring');
          return;
        }
        this._loggedIn = false;
        this._authHandled = true;
        this._loginInProgress = false;
        Hub.state.user = null;
        Hub.router.showScreen('login');
        return;
      }

      // Skip SIGNED_IN — wait for INITIAL_SESSION
      if (event === 'SIGNED_IN') {
        console.log('[Auth] Ignoring SIGNED_IN (waiting for INITIAL_SESSION)');
        return;
      }

      if ((event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session?.user) {
        // Don't handle if already logged in or login in progress
        if (this._loggedIn) {
          console.log('[Auth] Already logged in, ignoring event');
          return;
        }
        this._authHandled = true;
        await this._onLogin(session.user);
        return;
      }

      if (event === 'INITIAL_SESSION' && !session) {
        this._authHandled = true;
        console.log('[Auth] INITIAL_SESSION: no user → login');
        Hub.router.showScreen('login');
      }
    });

    // Fallback 1: 3s — try getSession manually
    setTimeout(async () => {
      if (this._loggedIn || this._authHandled || this._loginInProgress) {
        console.log('[Auth] 3s fallback skipped (already handled)');
        return;
      }
      console.log('[Auth] 3s fallback — getSession()');
      try {
        const session = await Hub.auth.getSession();
        console.log('[Auth] 3s fallback session:', session?.user?.email || 'none');
        if (session?.user && !this._loggedIn && !this._loginInProgress) {
          await this._onLogin(session.user);
        } else if (!this._loggedIn && !this._loginInProgress) {
          Hub.router.showScreen('login');
        }
      } catch (e) {
        console.error('[Auth] 3s fallback error:', e);
        if (!this._loggedIn && !this._loginInProgress) Hub.router.showScreen('login');
      }
    }, 3000);

    // Fallback 2: 8s — absolute safety net
    setTimeout(() => {
      if (!this._loggedIn && !this._loginInProgress) {
        const el = document.getElementById('loadingScreen');
        if (el && el.style.display !== 'none') {
          console.warn('[Auth] 8s HARD fallback → login');
          Hub.router.showScreen('login');
        }
      }
    }, 8000);

    this._startIdleTimer();
  },

  async _onLogin(user) {
    // Prevent concurrent login attempts
    if (this._loginInProgress) {
      console.log('[Auth] Login already in progress, skip');
      return;
    }

    if (this._loggedIn) {
      console.log('[Auth] Already logged in, skip');
      return;
    }

    this._loginInProgress = true;

    try {
      console.log('[Auth] _onLogin:', user.email);
      const allowed = await Hub.auth.checkAccess(user);
      console.log('[Auth] checkAccess →', allowed);

      // Double check still not logged in (race condition protection)
      if (this._loggedIn) {
        this._loginInProgress = false;
        return;
      }

      if (!allowed) {
        console.warn('[Auth] DENIED:', user.email);
        this._loginInProgress = false;
        Hub.utils.$('deniedEmail').textContent = user.email;
        Hub.router.showScreen('accessDenied');
        return;
      }

      // Set logged in BEFORE showing app to prevent race conditions
      this._loggedIn = true;
      Hub.state.user = user;

      try {
        const s = await Hub.db.loadSettings(user.id);
        Hub.state.settings = s || {};
      } catch (e) {
        console.warn('[Auth] Settings fail:', e.message);
        Hub.state.settings = {};
      }

      console.log('[Auth] ✓ Showing app');
      this._showApp();
      this._loginInProgress = false;
    } catch (e) {
      console.error('[Auth] _onLogin error:', e);
      this._loginInProgress = false;
      this._loggedIn = false;
      
      // Show user-friendly error message
      const loadingEl = document.getElementById('loadingScreen');
      if (loadingEl) {
        loadingEl.innerHTML = `
          <div class="text-center max-w-md mx-auto px-4">
            <div class="text-6xl mb-4">⚠️</div>
            <h2 class="text-2xl font-bold mb-4">Authentication Error</h2>
            <p class="text-gray-400 mb-4">${Hub.utils.esc(e.message || 'An error occurred during login')}</p>
            <button onclick="location.reload()" class="btn btn-primary">Try Again</button>
            <button onclick="Hub.auth.signOut()" class="btn btn-secondary mt-2">Sign Out</button>
          </div>
        `;
      } else {
        // Fallback if loading screen not available
        Hub.router.showScreen('login');
      }
    }
  },

  _showApp() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    const hash = window.location.hash.replace('#/', '').replace('#', '');
    const page = Hub.router.VALID_PAGES.includes(hash) ? hash : 'dashboard';
    const el = Hub.utils.$(page + 'Page');
    if (el) el.classList.add('active');
    else document.getElementById('dashboardPage').classList.add('active');

    Hub.router.current = page;
    console.log('[Auth] Page:', page);
    this.onPageEnter(page);
  },

  onPageEnter(page) {
    this._resetIdleTimer();
    switch (page) {
      case 'dashboard': this._loadDashboard(); break;
      case 'weather':   this._loadWeatherPage(); break;
      case 'chores':    Hub.chores.load(); break;
      case 'treats':    Hub.treats.loadDogs(); break;
      case 'standby':   Hub.standby.start(); break;
      case 'settings':  this._loadSettingsForm(); break;
      case 'status':    this._loadStatusPage(); break;
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
        if (aiSummary.actions?.some(a => a.type === 'show_popup')) Hub.ui.showAlertPopup(aiSummary.alerts);
      } else { Hub.ui.hideBanner(); }
    } catch (e) { console.error('Dashboard weather error:', e); }
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
        const svc = svcData[c.key]; const ok = svc?.status === 'ok'; const cls = ok ? 'green' : 'red';
        return `<div class="card flex items-center justify-between"><div class="flex items-center gap-3"><span class="status-dot ${cls}"></span><span class="font-medium">${Hub.utils.esc(c.name)}</span></div><div class="text-right"><span class="text-sm ${ok ? 'text-green-400' : 'text-red-400'}">${ok ? 'OK' : svc?.error || 'Error'}</span>${svc?.latency_ms ? `<span class="text-xs text-gray-500 ml-2">${svc.latency_ms}ms</span>` : ''}</div></div>`;
      }).join('') + '</div>' + `<p class="text-xs text-gray-500 mt-4">Last checked: ${new Date().toLocaleTimeString()}</p>`;
    } catch (e) { el.innerHTML = '<div class="card"><p class="text-red-400">Unable to reach health endpoint</p></div>'; }
  },

  _loadSettingsForm() {
    const s = Hub.state.settings || {}; const cfg = window.HOME_HUB_CONFIG || {};
    Hub.utils.$('settingLocationName').value = s.location_name || cfg.defaultLocation?.name || '';
    Hub.utils.$('settingLat').value          = s.location_lat  || cfg.defaultLocation?.lat || '';
    Hub.utils.$('settingLon').value          = s.location_lon  || cfg.defaultLocation?.lon || '';
    Hub.utils.$('settingImmichUrl').value    = s.immich_base_url || cfg.immichBaseUrl || '';
    Hub.utils.$('settingImmichKey').value    = s.immich_api_key  || cfg.immichSharedAlbumKeyOrToken || '';
    Hub.utils.$('settingImmichAlbum').value  = s.immich_album_id || '';
    Hub.utils.$('settingIdleTimeout').value  = s.standby_timeout_min || 10;
    Hub.utils.$('settingQuietStart').value   = s.quiet_hours_start || '22:00';
    Hub.utils.$('settingQuietEnd').value     = s.quiet_hours_end   || '07:00';
    Hub.utils.$('settingCalendarUrl').value  = s.calendar_url || '';
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
      Hub.state.settings = saved; Hub.weather._cache = null; Hub.ai._cache = null;
      Hub.ui.toast('Settings saved!'); Hub.router.go('dashboard');
    } catch (e) { Hub.ui.toast('Save failed: ' + e.message, 'error'); }
  },

  _useCurrentLocation() {
    navigator.geolocation.getCurrentPosition(
      pos => { Hub.utils.$('settingLat').value = pos.coords.latitude.toFixed(6); Hub.utils.$('settingLon').value = pos.coords.longitude.toFixed(6); Hub.ui.toast('Location updated'); },
      () => Hub.ui.toast('Location access denied', 'error')
    );
  },

  _bindUI() {
    Hub.utils.$('btnGoogleLogin')?.addEventListener('click', () => Hub.auth.signInGoogle());
    Hub.utils.$('btnCheckSupabase')?.addEventListener('click', () => Hub.debug.checkSupabase());
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
      if (Hub.router.current !== 'standby' && Hub.state.user) Hub.router.go('standby');
    }, timeout);
  }
};

window.addEventListener('DOMContentLoaded', () => Hub.app.init());
