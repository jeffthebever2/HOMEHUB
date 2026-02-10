// ============================================================
// assets/app.js — Main application init & orchestration (v4)
//
// Fixes in v4:
//   - Removed #letmein test bypass (security)
//   - Removed hardcoded household_id fallback (security)
//   - Removed Immich integration
//   - Cleaned up redundant display:none/block overrides
// ============================================================
window.Hub = window.Hub || {};

Hub.state = {
  user: null,
  user_id: null,
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

    // ── Auth listener ──
    Hub.auth.onAuthChange(async (event, session) => {
      console.log('[Auth] Event:', event, session?.user?.email || 'no-user');

      if (this._loggedIn && event !== 'SIGNED_OUT') return;

      if (event === 'SIGNED_OUT') {
        if (this._loginInProgress) return;
        this._loggedIn = false;
        this._authHandled = true;
        this._loginInProgress = false;
        Hub.state.user = null;
        Hub.state.user_id = null;
        Hub.router.showScreen('login');
        return;
      }

      if (event === 'SIGNED_IN') return; // Wait for INITIAL_SESSION

      if ((event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session?.user) {
        if (this._loggedIn) return;
        this._authHandled = true;
        await this._onLogin(session.user);
        return;
      }

      if (event === 'INITIAL_SESSION' && !session) {
        this._authHandled = true;
        Hub.router.showScreen('login');
      }
    });

    // Fallback 1: 3s — try getSession manually
    setTimeout(async () => {
      if (this._loggedIn || this._authHandled || this._loginInProgress) return;
      console.log('[Auth] 3s fallback — getSession()');
      try {
        const session = await Hub.auth.getSession();
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
      if (this._loggedIn) return;
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
    if (this._loginInProgress || this._loggedIn) return;
    this._loginInProgress = true;

    try {
      console.log('[Auth] _onLogin:', user.email);
      const allowed = await Hub.auth.checkAccess(user);

      if (this._loggedIn) { this._loginInProgress = false; return; }

      if (!allowed) {
        this._loginInProgress = false;
        Hub.utils.$('deniedEmail').textContent = user.email;
        Hub.router.showScreen('accessDenied');
        return;
      }

      // Verify household_id was set by checkAccess
      if (!Hub.state.household_id) {
        console.error('[Auth] No household_id found for user');
        this._loginInProgress = false;
        Hub.router.showScreen('noHousehold');
        return;
      }

      this._loggedIn = true;
      Hub.state.user = user;
      Hub.state.user_id = user.id;

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
      Hub.router.showScreen('login');
    }
  },

  _showApp() {
    // Hide loading screen
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.style.display = 'none';

    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Clear OAuth code from URL
    if (window.location.search.includes('code=')) {
      const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    const hash = window.location.hash.replace('#/', '').replace('#', '');
    const page = Hub.router.VALID_PAGES.includes(hash) ? hash : 'dashboard';
    const el = Hub.utils.$(page + 'Page');
    
    if (el) {
      el.classList.add('active');
    } else {
      document.getElementById('dashboardPage').classList.add('active');
    }

    Hub.router.current = page;
    this.onPageEnter(page);
  },

  onPageEnter(page) {
    this._resetIdleTimer();
    if (page !== 'weather' && Hub.weather) Hub.weather.stopRadarAnimation();
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
    Hub.ui.updateDashboardGreeting();
    
    if (Hub.chores?.renderDashboard) {
      Hub.chores.renderDashboard().catch(e => console.warn('[Dashboard] Chores error:', e));
    }
    
    this._loadDashboardWeather();
    
    if (Hub.calendar?.renderDashboard) {
      Hub.calendar.renderDashboard().catch(e => console.warn('[Dashboard] Calendar error:', e));
    }
    
    if (Hub.treats?.renderDashboardWidget) {
      Hub.treats.renderDashboardWidget().catch(e => console.warn('[Dashboard] Dog status error:', e));
    }
  },

  async _loadDashboardWeather() {
    try {
      await Hub.weather.renderDashboard();
      const alerts = await Hub.weather.fetchAlerts();
      if (alerts.length > 0) {
        const alert = alerts[0];
        Hub.ui.showBanner(alert.headline || 'Weather Alert', alert.severity || 'warning');
      } else {
        Hub.ui.hideBanner();
      }
    } catch (e) {
      console.error('[Dashboard] Weather error:', e);
    }
  },

  async _loadWeatherPage() {
    try {
      await Hub.weather.renderWeatherPage();
    } catch (e) {
      console.error('[Weather] Page error:', e);
      const el = Hub.utils.$('weatherContent');
      if (el) el.innerHTML = '<p class="text-yellow-400">Error loading weather data.</p>';
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
      { name: 'AI Summary', key: 'ai' }
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
      }).join('') + '</div>' + `<p class="text-xs text-gray-500 mt-4">Last checked: ${new Date().toLocaleTimeString()}</p>`;
    } catch (e) {
      el.innerHTML = '<div class="card"><p class="text-red-400">Unable to reach health endpoint</p></div>';
    }
  },

  _loadSettingsForm() {
    const s = Hub.state.settings || {};
    const cfg = window.HOME_HUB_CONFIG || {};
    Hub.utils.$('settingLocationName').value = s.location_name || cfg.defaultLocation?.name || '';
    Hub.utils.$('settingLat').value          = s.location_lat  || cfg.defaultLocation?.lat || '';
    Hub.utils.$('settingLon').value          = s.location_lon  || cfg.defaultLocation?.lon || '';
    Hub.utils.$('settingIdleTimeout').value  = s.standby_timeout_min || 10;
    Hub.utils.$('settingQuietStart').value   = s.quiet_hours_start || '22:00';
    Hub.utils.$('settingQuietEnd').value     = s.quiet_hours_end   || '07:00';
    
    this._loadCalendarSelection();
  },

  async _loadCalendarSelection() {
    const container = Hub.utils.$('calendarCheckboxes');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-400 text-sm">Click "Load My Calendars" to select which calendars to display</p>';
  },

  async _fetchAndDisplayCalendars() {
    const container = Hub.utils.$('calendarCheckboxes');
    const btn = Hub.utils.$('btnLoadCalendars');
    if (!container) return;

    btn.disabled = true;
    btn.textContent = 'Loading...';
    container.innerHTML = '<p class="text-gray-400 text-sm animate-pulse">Fetching your calendars...</p>';

    const calendars = await Hub.calendar.getCalendarList();
    btn.disabled = false;
    btn.textContent = 'Reload Calendars';

    if (calendars.error) {
      container.innerHTML = `
        <div class="text-red-400 text-sm">
          <p class="font-semibold mb-2">⚠️ Error loading calendars</p>
          <p class="text-xs mb-3">${Hub.utils.esc(calendars.error)}</p>
          <button onclick="Hub.auth.signOut()" class="btn btn-secondary text-xs mt-2">Sign Out & Reconnect</button>
        </div>
      `;
      Hub.ui.toast('Failed to load calendars', 'error');
      return;
    }

    if (!calendars || calendars.length === 0) {
      container.innerHTML = `
        <div class="text-gray-400 text-sm">
          <p class="mb-2">No calendars found</p>
          <button onclick="Hub.auth.signOut()" class="btn btn-secondary text-xs mt-2">Sign Out & Reconnect</button>
        </div>
      `;
      return;
    }

    const savedCalendars = Hub.state?.settings?.selected_calendars || ['primary'];
    
    container.innerHTML = calendars.map(cal => {
      const isChecked = savedCalendars.includes(cal.id);
      const colorStyle = cal.backgroundColor ? `background-color: ${cal.backgroundColor}` : 'background-color: #3b82f6';
      
      return `
        <label class="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
          <input type="checkbox" class="calendar-checkbox w-4 h-4" data-calendar-id="${Hub.utils.esc(cal.id)}" ${isChecked ? 'checked' : ''}>
          <div class="w-3 h-3 rounded-full flex-shrink-0" style="${colorStyle}"></div>
          <div class="flex-1 min-w-0">
            <p class="font-medium text-sm truncate">${Hub.utils.esc(cal.summary || 'Untitled')}</p>
            ${cal.description ? `<p class="text-xs text-gray-400 truncate">${Hub.utils.esc(cal.description)}</p>` : ''}
          </div>
        </label>
      `;
    }).join('');

    Hub.ui.toast(`Loaded ${calendars.length} calendars!`, 'success');
  },

  async _saveSettings() {
    if (!Hub.state.user || !Hub.state.household_id) return;
    
    const selectedCalendars = [];
    document.querySelectorAll('.calendar-checkbox:checked').forEach(cb => {
      selectedCalendars.push(cb.dataset.calendarId);
    });
    
    const payload = {
      location_name: Hub.utils.$('settingLocationName').value.trim(),
      location_lat: parseFloat(Hub.utils.$('settingLat').value) || 40.029059,
      location_lon: parseFloat(Hub.utils.$('settingLon').value) || -82.863462,
      standby_timeout_min: parseInt(Hub.utils.$('settingIdleTimeout').value) || 10,
      quiet_hours_start: Hub.utils.$('settingQuietStart').value || '22:00',
      quiet_hours_end: Hub.utils.$('settingQuietEnd').value || '07:00',
      selected_calendars: selectedCalendars.length > 0 ? selectedCalendars : ['primary']
    };
    try {
      const saved = await Hub.db.saveSettings(Hub.state.user.id, Hub.state.household_id, payload);
      Hub.state.settings = saved;
      
      if (selectedCalendars.length > 0) {
        localStorage.setItem('selected_calendars', JSON.stringify(selectedCalendars));
      }
      
      Hub.weather._cache = null; 
      Hub.ai._cache = null;
      Hub.calendar._cache = null;
      
      Hub.ui.toast('Settings saved!', 'success'); 
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
    Hub.utils.$('btnCheckSupabase')?.addEventListener('click', () => Hub.debug.checkSupabase());
    Hub.utils.$('btnSignOut')?.addEventListener('click', () => Hub.auth.signOut());
    Hub.utils.$('btnSignOutDenied')?.addEventListener('click', () => Hub.auth.signOut());
    Hub.utils.$('btnSignOutNoHousehold')?.addEventListener('click', () => Hub.auth.signOut());
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
    Hub.utils.$('btnLoadCalendars')?.addEventListener('click', () => Hub.app._fetchAndDisplayCalendars());
  },

  _startIdleTimer() {
    this._resetIdleTimer();
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, () => this._resetIdleTimer(), { passive: true })
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
