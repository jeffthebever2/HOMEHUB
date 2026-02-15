// ============================================================
// assets/app.js — Main application init & orchestration (v4)
//
// - Handles ALL auth events (SIGNED_IN, INITIAL_SESSION, etc.)
// - _loggedIn guard prevents duplicate execution
// - #letmein bypass for testing (dev only)
// - 3s getSession fallback + 8s hard fallback
// - Race condition protection
// - Performance optimizations
// ============================================================
window.Hub = window.Hub || {};

// Configuration constants
const APP_CONFIG = {
  VERSION: '2.0.1',
  SECRET_CLICK_COUNT: 7,
  SECRET_KEY_TIMEOUT_MS: 1500,
  AUTH_FALLBACK_TIMEOUT_MS: 3000,
  AUTH_HARD_FALLBACK_MS: 8000,
  IDLE_DEBOUNCE_MS: 100
};

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
    Hub.player?.init?.();
    Hub.radio?.init?.();
    Hub.music?.init?.();
    Hub.control?.init?.();

    // ── TEST BYPASS: visit /#letmein (DEV ONLY) ──
    if (window.location.hash === '#letmein') {
      // Only allow in development/preview environments
      const isDev = window.location.hostname === 'localhost' || 
                    window.location.hostname.includes('preview') ||
                    window.location.hostname.includes('127.0.0.1') ||
                    window.location.hostname.includes('.vercel.app');
      
      if (!isDev) {
        console.warn('[Auth] ⚠️ Bypass attempt in PRODUCTION - BLOCKED');
        alert('Debug mode is disabled in production');
        window.location.hash = '';
        return;
      }
      
      console.log('[Auth] ⚠️ BYPASS MODE (dev only)');
      this._loggedIn = true;
      this._authHandled = true;
      Hub.state.user = { id: 'test', email: 'bypass@test' };
      Hub.state.household_id = 'd49c4c5b-1ffd-42db-9b3e-bec70545bf87';
      Hub.state.userRole = 'admin';
      Hub.state.settings = {};
      document.getElementById('loadingScreen').style.display = 'none';
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('dashboardPage').classList.add('active');
      console.log('[Auth] ⚠️ Dashboard forced via bypass');
      return;
    }

    // ── Auth listener ──
    // ONLY act on INITIAL_SESSION (fires AFTER pkce code exchange)
    // Skip SIGNED_IN — it fires DURING exchange when JWT isn't ready
    Hub.auth.onAuthChange(async (event, session) => {
      console.log('[Auth] Event:', event, session?.user?.email || 'no-user', 'loggedIn:', this._loggedIn);

      // CRITICAL: If already logged in, ignore all events except SIGNED_OUT
      if (this._loggedIn && event !== 'SIGNED_OUT') {
        console.log('[Auth] ✓ Already logged in - ignoring', event);
        // FORCE hide login screen if visible
        const loginScreen = document.getElementById('loginScreen');
        if (loginScreen && loginScreen.classList.contains('active')) {
          console.warn('[Auth] FORCING login screen to hide');
          loginScreen.classList.remove('active');
        }
        return;
      }

      if (event === 'SIGNED_OUT') {
        // Don't sign out if login in progress
        if (this._loginInProgress) {
          console.warn('[Auth] SIGNED_OUT during login - ignoring');
          return;
        }

        // Safety net: if a session still exists in storage, ignore the SIGNED_OUT event
        // (can happen in edge cases when the browser throttles background timers).
        try {
          const s = await Hub.auth.getSession();
          if (s?.user) {
            console.warn('[Auth] SIGNED_OUT event but session still exists — ignoring');
            return;
          }
        } catch (e) {}
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

      // If refresh fails (often due to network sleep), don't instantly dump the user to login.
      if (event === 'TOKEN_REFRESH_FAILED') {
        console.warn('[Auth] TOKEN_REFRESH_FAILED — keeping session, will retry when tab is active/online');
        try { 
          Hub.ui.toast('Session refresh failed (network sleep?). Keeping you signed in…', 'error'); 
        } catch (e) {
          console.warn('[Auth] Failed to show toast:', e.message);
        }
        return;
      }

      if ((event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session?.user) {
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
    }, APP_CONFIG.AUTH_FALLBACK_TIMEOUT_MS);

    // Fallback 2: 8s — absolute safety net
    setTimeout(() => {
      if (this._loggedIn) {
        console.log('[Auth] 8s fallback skipped - already logged in');
        return;
      }
      if (!this._loggedIn && !this._loginInProgress) {
        const el = document.getElementById('loadingScreen');
        if (el && el.style.display !== 'none') {
          console.warn('[Auth] 8s HARD fallback → login');
          Hub.router.showScreen('login');
        }
      }
    }, APP_CONFIG.AUTH_HARD_FALLBACK_MS);

    this._startIdleTimer();
  },

  async _onLogin(user) {
    // Atomic check and set - prevent concurrent login attempts
    if (this._loginInProgress || this._loggedIn) {
      console.log('[Auth] Login already in progress or completed, skip');
      return;
    }
    
    this._loginInProgress = true;

    try {
      console.log('[Auth] _onLogin:', user.email);
      
      // Double-check after setting flag
      if (this._loggedIn) {
        console.log('[Auth] Already logged in (detected after flag set), skip');
        return;
      }
      
      const allowed = await Hub.auth.checkAccess(user);
      console.log('[Auth] checkAccess →', allowed);

      // Triple check - another tab could have completed login
      if (this._loggedIn) {
        console.log('[Auth] Already logged in (detected after checkAccess), skip');
        return;
      }

      if (!allowed) {
        console.warn('[Auth] DENIED:', user.email);
        Hub.utils.$('deniedEmail').textContent = user.email;
        Hub.router.showScreen('accessDenied');
        return;
      }

      // Set logged in BEFORE any async operations
      this._loggedIn = true;
      Hub.state.user = user;

      try {
        const s = await Hub.db.loadSettings(user.id);
        Hub.state.settings = s || {};
        
        // Clear caches when loading new settings
        if (s?.selected_calendars) {
          if (Hub.calendar?.clearCache) Hub.calendar.clearCache();
        }
      } catch (e) {
        console.warn('[Auth] Settings load failed:', e.message);
        Hub.state.settings = {};
      }

      console.log('[Auth] ✓ Showing app');
      
      // Call chore reset endpoint (non-blocking fallback)
      this._callChoreResetEndpoint().catch(e => 
        console.warn('[App] Chore reset call failed:', e.message)
      );
      
      this._showApp();
    } catch (e) {
      console.error('[Auth] _onLogin error:', e);
      this._loggedIn = false;
      Hub.router.showScreen('login');
    } finally {
      this._loginInProgress = false;
    }
  },

  _showApp() {
    console.log('[Auth] _showApp called');
    
    // FORCE hide loading screen
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      loadingScreen.style.display = 'none';
      console.log('[Auth] Loading screen hidden');
    }
    
    // FORCE hide all pages including login
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none'; // EXTRA: force display none
    });
    console.log('[Auth] All pages hidden');

    // CRITICAL: Clear OAuth code from URL to prevent reprocessing
    if (window.location.search.includes('code=')) {
      const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
      console.log('[Auth] OAuth code cleared from URL');
    }

    const hash = window.location.hash.replace('#/', '').replace('#', '');
    const page = Hub.router.VALID_PAGES.includes(hash) ? hash : 'dashboard';
    const el = Hub.utils.$(page + 'Page');
    
    if (el) {
      el.classList.add('active');
      el.style.display = 'block'; // EXTRA: force display block
      console.log('[Auth] Showing page:', page);
    } else {
      const dashboard = document.getElementById('dashboardPage');
      dashboard.classList.add('active');
      dashboard.style.display = 'block'; // EXTRA: force display block
      console.log('[Auth] Showing dashboard (fallback)');
    }

    Hub.router.current = page;
    console.log('[Auth] Page:', page);
    this.onPageEnter(page);
  },

  onPageEnter(page) {
    this._resetIdleTimer();
    // Stop radar animation when leaving weather page
    if (page !== 'weather' && Hub.weather) {
      Hub.weather.stopRadarAnimation();
    }
    switch (page) {
      case 'dashboard': this._loadDashboard(); break;
      case 'weather':   this._loadWeatherPage(); break;
      case 'chores':
        Hub.chores.load();
        Hub.chores.renderStats?.('choresStats', 7).catch?.(() => {});
        break;
      case 'treats':    Hub.treats.loadDogs(); break;
      case 'standby':   Hub.standby.start(); break;
      case 'music':
        Hub.music?.onEnter?.();
        Hub.music?.renderBluetoothHelp?.();
        break;
      case 'radio':
        Hub.radio?.onEnter?.();
        break;
      case 'settings':  this._loadSettingsForm(); break;
      case 'status':    this._loadStatusPage(); break;
      case 'control':   Hub.control?.load?.(); break;
    }
  },

  async _loadDashboard() {
    Hub.ui.updateDashboardDate();
    Hub.ui.updateDashboardGreeting();
    
    // Load chores for dashboard
    if (Hub.chores && typeof Hub.chores.renderDashboard === 'function') {
      Hub.chores.renderDashboard().catch(e => console.warn('[Dashboard] Chores error:', e));
    }

    // Load chore stats (leaderboard)
    if (Hub.chores && typeof Hub.chores.renderStats === 'function') {
      Hub.chores.renderStats('dashboardChoreStats', 7, { compact: true }).catch(e => console.warn('[Dashboard] Chore stats error:', e));
    }
    
    this._loadDashboardWeather();
    
    // Load calendar widget
    if (Hub.calendar && typeof Hub.calendar.renderDashboard === 'function') {
      Hub.calendar.renderDashboard().catch(e => console.warn('[Dashboard] Calendar error:', e));
    }
    
    // Load dog status widget
    if (Hub.treats && typeof Hub.treats.renderDashboardWidget === 'function') {
      Hub.treats.renderDashboardWidget().catch(e => console.warn('[Dashboard] Dog status error:', e));
    }
    
    // Load Immich photos widget
    if (Hub.immich && typeof Hub.immich.renderDashboardWidget === 'function') {
      Hub.immich.renderDashboardWidget().catch(e => console.warn('[Dashboard] Photos error:', e));
    }
    
    // Update Now Playing widget
    if (Hub.player) {
      Hub.player.updateUI();
    }
  },

  async _loadDashboardWeather() {
    try {
      await Hub.weather.renderDashboard();
      // Check for alerts (still works without AI)
      const alerts = await Hub.weather.fetchAlerts();
      if (alerts.length > 0) {
        const alert = alerts[0];
        Hub.ui.showBanner(alert.headline || 'Weather Alert', alert.severity || 'warning');
      } else {
        Hub.ui.hideBanner();
      }
    } catch (e) {
      console.error('Dashboard weather error:', e);
    }
  },

  async _loadWeatherPage() {
    try {
      await Hub.weather.renderWeatherPage();
    } catch (e) {
      console.error('Weather page error:', e);
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
    
    // Load calendar selection if calendars available
    this._loadCalendarSelection();
  },

  async _loadCalendarSelection() {
    const container = Hub.utils.$('calendarCheckboxes');
    if (!container) return;

    const savedCalendars = Hub.state?.settings?.selected_calendars || ['primary'];
    
    // Show loading state
    container.innerHTML = '<p class="text-gray-400 text-sm">Click "Load My Calendars" to select which calendars to display</p>';
  },

  async _fetchAndDisplayCalendars() {
    const container = Hub.utils.$('calendarCheckboxes');
    const btn = Hub.utils.$('btnLoadCalendars');
    if (!container) {
      console.error('[App] Calendar container not found');
      return;
    }

    console.log('[App] Fetching calendars...');
    btn.disabled = true;
    btn.textContent = 'Loading...';
    container.innerHTML = '<p class="text-gray-400 text-sm animate-pulse">Fetching your calendars...</p>';

    const calendars = await Hub.calendar.getCalendarList();
    btn.disabled = false;
    btn.textContent = 'Reload Calendars';

    console.log('[App] Calendar fetch result:', calendars);

    if (calendars.error) {
      console.error('[App] Calendar fetch error:', calendars.error);
      container.innerHTML = `
        <div class="text-red-400 text-sm">
          <p class="font-semibold mb-2">⚠️ Error loading calendars</p>
          <p class="text-xs mb-3">${Hub.utils.esc(calendars.error)}</p>
          <div class="bg-red-900 bg-opacity-20 p-3 rounded text-xs space-y-2">
            <p><strong>Troubleshooting:</strong></p>
            <ul class="list-disc pl-4 space-y-1">
              <li>Make sure you signed in with calendar permissions</li>
              <li>Try signing out and back in</li>
              <li>Check browser console (F12) for detailed errors</li>
              <li>Verify Calendar API is enabled in Google Cloud</li>
            </ul>
            <button onclick="Hub.auth.signOut()" class="btn btn-sm btn-secondary mt-2">
              Sign Out & Reconnect
            </button>
          </div>
        </div>
      `;
      Hub.ui.toast('Failed to load calendars', 'error');
      return;
    }

    if (!calendars || calendars.length === 0) {
      container.innerHTML = `
        <div class="text-gray-400 text-sm">
          <p class="mb-2">No calendars found</p>
          <p class="text-xs">This might mean:</p>
          <ul class="list-disc pl-4 text-xs space-y-1 mt-2">
            <li>You don't have any Google Calendars</li>
            <li>Calendar permissions weren't granted</li>
          </ul>
          <button onclick="Hub.auth.signOut()" class="btn btn-sm btn-secondary mt-2">
            Sign Out & Reconnect
          </button>
        </div>
      `;
      return;
    }

    const savedCalendars = Hub.state?.settings?.selected_calendars || ['primary'];
    console.log('[App] Saved calendars:', savedCalendars);
    console.log('[App] Available calendars:', calendars.map(c => c.id));
    
    // Create checkboxes for each calendar
    container.innerHTML = calendars.map((cal, idx) => {
      const isChecked = savedCalendars.includes(cal.id);
      const colorStyle = cal.backgroundColor ? `background-color: ${cal.backgroundColor}` : 'background-color: #3b82f6';
      
      return `
        <label class="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
          <input 
            type="checkbox" 
            class="calendar-checkbox w-4 h-4" 
            data-calendar-id="${Hub.utils.esc(cal.id)}"
            ${isChecked ? 'checked' : ''}
          >
          <div class="w-3 h-3 rounded-full flex-shrink-0" style="${colorStyle}"></div>
          <div class="flex-1 min-w-0">
            <p class="font-medium text-sm truncate">${Hub.utils.esc(cal.summary || 'Untitled')}</p>
            ${cal.description ? `<p class="text-xs text-gray-400 truncate">${Hub.utils.esc(cal.description)}</p>` : ''}
            <p class="text-xs text-gray-500 mt-1">ID: ${Hub.utils.esc(cal.id)}</p>
          </div>
        </label>
      `;
    }).join('');

    Hub.ui.toast(`Loaded ${calendars.length} calendars! Select which ones to show`, 'success');
    console.log('[App] Calendar checkboxes rendered');
  },

  async _saveSettings() {
    if (!Hub.state.user || !Hub.state.household_id) return;
    
    // Get selected calendar IDs from checkboxes
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
      immich_base_url: Hub.utils.$('settingImmichUrl').value.trim(),
      immich_api_key: Hub.utils.$('settingImmichKey').value.trim(),
      immich_album_id: Hub.utils.$('settingImmichAlbum').value.trim(),
      selected_calendars: selectedCalendars.length > 0 ? selectedCalendars : ['primary']
    };
    try {
      const saved = await Hub.db.saveSettings(Hub.state.user.id, Hub.state.household_id, payload);
      Hub.state.settings = saved; 
      
      // ALSO save to localStorage as backup
      if (selectedCalendars.length > 0) {
        localStorage.setItem('selected_calendars', JSON.stringify(selectedCalendars));
        console.log('[App] Saved to localStorage backup:', selectedCalendars);
      }
      
      // Clear caches so new settings take effect immediately
      Hub.weather._cache = null; 
      Hub.ai._cache = null;
      Hub.calendar._cache = null; // Clear calendar cache!
      
      console.log('[App] Settings saved, calendars selected:', saved.selected_calendars);
      
      Hub.ui.toast('Settings saved! Refreshing calendar...', 'success'); 
      
      // Refresh dashboard to show new calendar selection
      Hub.router.go('dashboard');
    } catch (e) { 
      console.error('[Settings] Save error:', e.message);
      Hub.ui.toast('Failed to save settings. Please check your internet connection and try again.', 'error');
    }
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
    Hub.utils.$('btnLoadCalendars')?.addEventListener('click', () => Hub.app._fetchAndDisplayCalendars());

    // Hidden: secret admin-only control center entry
    this._bindSecretControlEntry();
  },

  _bindSecretControlEntry() {
    const title = document.getElementById('homeHubTitle');
    if (title && !title._controlBound) {
      title._controlBound = true;
      let clicks = 0;
      let timer = null;
      title.addEventListener('click', () => {
        clicks++;
        clearTimeout(timer);
        timer = setTimeout(() => { clicks = 0; }, 1200);
        if (clicks >= APP_CONFIG.SECRET_CLICK_COUNT) {
          clicks = 0;
          if (Hub.state?.userRole === 'admin') {
            Hub.router.go('control');
            try { Hub.ui.toast('Control Center unlocked', 'success'); } catch (e) {
              console.warn('[App] Failed to show toast:', e.message);
            }
          } else {
            try { Hub.ui.toast('Admin only', 'error'); } catch (e) {
              console.warn('[App] Failed to show toast:', e.message);
            }
          }
        }
      });
    }

    // Optional extra: type "control" anywhere to open (admin-only)
    if (!window._hubControlKeySeqBound) {
      window._hubControlKeySeqBound = true;
      let buf = '';
      let last = 0;
      window.addEventListener('keydown', (e) => {
        if (!Hub.state?.user) return;
        const now = Date.now();
        if (now - last > APP_CONFIG.SECRET_KEY_TIMEOUT_MS) buf = '';
        last = now;
        const k = (e.key || '').toLowerCase();
        if (k.length !== 1) return;
        buf = (buf + k).slice(-7);
        if (buf === 'control') {
          buf = '';
          if (Hub.state?.userRole === 'admin') {
            Hub.router.go('control');
            try { Hub.ui.toast('Control Center unlocked', 'success'); } catch (e) {
              console.warn('[App] Failed to show toast:', e.message);
            }
          } else {
            try { Hub.ui.toast('Admin only', 'error'); } catch (e) {
              console.warn('[App] Failed to show toast:', e.message);
            }
          }
        }
      });
    }
  },

  // Debounce helper to avoid excessive function calls
  _debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func.apply(this, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  _startIdleTimer() {
    this._resetIdleTimer();
    
    // Debounce the reset to avoid excessive calls (especially for mousemove)
    const debouncedReset = this._debounce(() => this._resetIdleTimer(), APP_CONFIG.IDLE_DEBOUNCE_MS);
    
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, debouncedReset, { passive: true })
    );
  },

  _resetIdleTimer() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    const timeout = ((Hub.state.settings?.standby_timeout_min) || 10) * 60 * 1000;
    this._idleTimer = setTimeout(() => {
      if (Hub.router.current !== 'standby' && Hub.state.user) Hub.router.go('standby');
    }, timeout);
  },

  /** Call chore reset endpoint (client fallback) */
  async _callChoreResetEndpoint() {
    if (!Hub.state.household_id) {
      console.log('[App] Skip chore reset - no household');
      return;
    }

    try {
      console.log('[App] Calling chore reset endpoint...');
      const apiBase = window.HOME_HUB_CONFIG?.apiBase || '';
      const response = await fetch(`${apiBase}/api/cron-chores-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      console.log('[App] Chore reset result:', result);
      
      // If chores were reset, refresh chores page if we're on it
      if (result.processed > 0 && Hub.router.current === 'chores') {
        Hub.chores?.load?.();
      }
    } catch (error) {
      console.error('[App] Chore reset endpoint error:', error);
      // Don't throw - this is a fallback, cron is primary
    }
  }
};

window.addEventListener('DOMContentLoaded', () => Hub.app.init());
