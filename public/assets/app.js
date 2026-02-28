// ============================================================
// assets/app.js — Main application init & orchestration (v5)
//
// v5 changes:
//  - Immediate session check at boot (no waiting 3s for existing sessions)
//  - OAuth code= in URL → never show login from fallback timers
//  - _callChoreResetEndpoint → calls secure /api/chores-reset-my-household
//  - Admin FAB NOT shown globally; only Settings page has admin button
//  - Photo provider settings saved/loaded
// ============================================================
window.Hub = window.Hub || {};

// PWA install event — captured globally, UI lives ONLY in Admin Panel
window.Hub = window.Hub || {};
Hub.pwa = { bipEvent: null, installed: false };

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  Hub.pwa.bipEvent = e;
  console.log('[PWA] beforeinstallprompt captured');
  window.dispatchEvent(new Event('homehub:pwa-available'));
  // If admin panel is currently open, re-render the install card
  if (Hub.router?.current === 'admin') {
    Hub.control?.load?.();
  }
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] App installed');
  Hub.pwa.installed = true;
  Hub.pwa.bipEvent  = null;
  Hub.ui?.toast?.('HomeHub installed on this device ✅', 'success');
  if (Hub.router?.current === 'admin') Hub.control?.load?.();
});

const APP_CONFIG = {
  VERSION: '2.0.5',
  SECRET_CLICK_COUNT: 7,
  SECRET_KEY_TIMEOUT_MS: 1500,
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
  _idleListenersBound: false,   // prevents stacking listeners on re-login
  _loggedIn: false,
  _authHandled: false,
  _loginInProgress: false,
  _lastPage: null,

  async init() {
    console.log('[App] init() v' + APP_CONFIG.VERSION);
    this._bindUI();
    Hub.router.init();
    Hub.treats.init();
    Hub.player?.init?.();
    Hub.radio?.init?.();
    Hub.control?.init?.();
    Hub.grocery?.init?.();
    Hub.ui?.loadTouchscreenMode?.();
    this._initAdminGesture();

    // ── DEV BYPASS ─────────────────────────────────────────
    if (window.location.hash === '#letmein') {
      const isDev = ['localhost','127.0.0.1'].includes(window.location.hostname)
                  || window.location.hostname.includes('preview')
                  || window.location.hostname.includes('.vercel.app');
      if (!isDev) {
        alert('Debug mode is disabled in production');
        window.location.hash = '';
        return;
      }
      console.log('[Auth] ⚠️ BYPASS MODE');
      this._loggedIn   = true;
      this._authHandled = true;
      Hub.state.user         = { id: 'test', email: 'bypass@test' };
      Hub.state.household_id = 'd49c4c5b-1ffd-42db-9b3e-bec70545bf87';
      Hub.state.userRole     = 'admin';
      Hub.state.settings     = {};
      document.getElementById('loadingScreen').style.display = 'none';
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('dashboardPage').classList.add('active');
      return;
    }

    // ── STEP 1: If OAuth code= is in URL, show "Finishing sign-in…"
    //    and wait longer — do NOT flash login from fallback timers.
    const oauthInProgress = window.location.search.includes('code=')
                         || window.location.hash.includes('access_token');
    if (oauthInProgress) {
      const loadingMsg = document.getElementById('loadingText');
      if (loadingMsg) loadingMsg.textContent = 'Finishing sign-in…';
      console.log('[Auth] OAuth exchange in progress — suppressing fast fallbacks');
    }

    // ── STEP 2: Immediately try existing session BEFORE any timers.
    //    This is the primary path for page refreshes + kiosk use.
    if (!oauthInProgress) {
      try {
        const existingSession = await Hub.auth.getSession();
        if (existingSession?.user) {
          console.log('[Auth] ✓ Immediate session found:', existingSession.user.email);
          await this._onLogin(existingSession.user);
          return; // done — skip all listener + timer setup
        }
      } catch (e) {
        console.warn('[Auth] Immediate session check error:', e.message);
      }
    }

    // ── STEP 3: Auth state change listener (primary for OAuth return)
    Hub.auth.onAuthChange(async (event, session) => {
      console.log('[Auth] Event:', event, session?.user?.email || 'none', 'loggedIn:', this._loggedIn);

      if (this._loggedIn && event !== 'SIGNED_OUT') {
        const loginScreen = document.getElementById('loginScreen');
        if (loginScreen?.classList.contains('active')) {
          loginScreen.classList.remove('active');
        }
        return;
      }

      if (event === 'SIGNED_OUT') {
        if (this._loginInProgress) return;
        try {
          const s = await Hub.auth.getSession();
          if (s?.user) return; // still have session — ignore
        } catch (e) {}
        this._loggedIn        = false;
        this._authHandled     = true;
        this._loginInProgress = false;
        Hub.state.user        = null;
        Hub.router.showScreen('login');
        return;
      }

      if (event === 'SIGNED_IN') {
        console.log('[Auth] Ignoring SIGNED_IN (waiting for INITIAL_SESSION)');
        return;
      }

      if (event === 'TOKEN_REFRESH_FAILED') {
        console.warn('[Auth] TOKEN_REFRESH_FAILED — keeping session, will retry');
        try { Hub.ui.toast('Session refresh failed (network?). Keeping you signed in…', 'error'); } catch {}
        return;
      }

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

    // ── STEP 4: Fallback timers — ONLY if not in OAuth flow
    if (!oauthInProgress) {
      // 4s fallback: try getSession one more time
      setTimeout(async () => {
        if (this._loggedIn || this._authHandled || this._loginInProgress) return;
        console.log('[Auth] 4s fallback — getSession()');
        try {
          const session = await Hub.auth.getSession();
          if (session?.user && !this._loggedIn) {
            await this._onLogin(session.user);
          } else if (!this._loggedIn) {
            Hub.router.showScreen('login');
          }
        } catch (e) {
          if (!this._loggedIn) Hub.router.showScreen('login');
        }
      }, 4000);

      // 10s absolute safety net
      setTimeout(() => {
        if (this._loggedIn || this._authHandled || this._loginInProgress) return;
        const el = document.getElementById('loadingScreen');
        if (el && el.style.display !== 'none') {
          console.warn('[Auth] 10s HARD fallback → login');
          Hub.router.showScreen('login');
        }
      }, 10000);
    } else {
      // OAuth in progress: 30s safety net only (enough for slow connections)
      setTimeout(() => {
        if (this._loggedIn) return;
        const el = document.getElementById('loadingScreen');
        if (el && el.style.display !== 'none') {
          console.warn('[Auth] 30s OAuth safety net → login');
          Hub.router.showScreen('login');
        }
      }, 30000);
    }

    this._startIdleTimer();
  },

  async _onLogin(user) {
    if (this._loginInProgress || this._loggedIn) {
      console.log('[Auth] Login already in progress or completed, skip');
      return;
    }
    this._loginInProgress = true;

    try {
      console.log('[Auth] _onLogin:', user.email);
      if (this._loggedIn) return;

      const allowed = await Hub.auth.checkAccess(user);
      if (this._loggedIn) return;

      if (!allowed) {
        Hub.utils.$('deniedEmail').textContent = user.email;
        Hub.router.showScreen('accessDenied');
        return;
      }

      this._loggedIn   = true;
      Hub.state.user   = user;

      try {
        const s = await Hub.db.loadSettings(user.id);
        Hub.state.settings = s || {};
        if (s?.selected_calendars) Hub.calendar?.clearCache?.();
      } catch (e) {
        console.warn('[Auth] Settings load failed:', e.message);
        Hub.state.settings = {};
      }

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
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.style.display = 'none';

    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });

    if (window.location.search.includes('code=')) {
      const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    const hash = window.location.hash.replace('#/', '').replace('#', '');
    const page = Hub.router.VALID_PAGES.includes(hash) ? hash : 'dashboard';
    const el   = Hub.utils.$(page + 'Page');

    if (el) {
      el.classList.add('active');
      el.style.display = 'block';
    } else {
      const dashboard = document.getElementById('dashboardPage');
      dashboard.classList.add('active');
      dashboard.style.display = 'block';
    }

    Hub.router.current = page;
    this.onPageEnter(page);

    // Trigger chore reset check in background (never blocks login)
    setTimeout(() => this._callChoreResetEndpoint().catch(() => {}), 2000);
  },

  /** Called by router BEFORE switching away from a page */
  onPageLeave(page) {
    switch (page) {
      case 'admin':   Hub.control?.onLeave?.();        break;
      case 'standby': Hub.standby?.onLeave?.();        break;
      case 'grocery': Hub.grocery?.onLeave?.();        break;
      case 'radio':   Hub.radio?.onLeave?.();          break;
      case 'weather': Hub.weather?.onLeave?.();        break;
      case 'control': Hub.siteControl?.onLeave?.();    break;
    }
  },

  onPageEnter(page) {
    this._lastPage = page;
    this._resetIdleTimer();
    if (page !== 'weather' && Hub.weather) Hub.weather.stopRadarAnimation?.();

    // ── Admin gate ─────────────────────────────────────────
    if (page === 'admin' && Hub.state.userRole !== 'admin') {
      Hub.ui?.toast?.('Admin access only', 'error');
      Hub.router.go('settings');
      return;
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
      case 'radio':     Hub.radio?.onEnter?.(); break;
      case 'settings':  this._loadSettingsForm(); break;
      case 'status':    this._loadStatusPage(); break;
      case 'control':   Hub.siteControl?.load?.(); break;
      case 'admin':     Hub.control?.load?.(); break;
      case 'grocery':   Hub.grocery?.onEnter?.(); break;
    }
  },

  async _loadDashboard() {
    Hub.ui.updateDashboardDate();
    Hub.ui.updateDashboardGreeting();
    Hub.chores?.renderDashboard?.().catch(e => console.warn('[Dashboard] Chores:', e));
    Hub.chores?.renderStats?.('dashboardChoreStats', 7, { compact: true }).catch(() => {});
    this._loadDashboardWeather();
    Hub.calendar?.renderDashboard?.().catch(() => {});
    Hub.treats?.renderDashboardWidget?.().catch(() => {});
    Hub.photos?.renderDashboardWidget?.().catch(() => {});
    Hub.player?.updateUI?.();
  },

  async _loadDashboardWeather() {
    try {
      await Hub.weather.renderDashboard();
      // fetchAlerts() already filters out expired alerts client-side
      const alerts = await Hub.weather.fetchAlerts();
      if (alerts.length > 0) {
        // Build threat list from real NWS event names
        const threats = alerts.map(a => a.event || a.headline).filter(Boolean);
        // Worst severity wins banner colour
        const sevOrder = { extreme: 0, severe: 1, moderate: 2, minor: 3 };
        const sorted   = [...alerts].sort((a, b) =>
          (sevOrder[(a.severity||'').toLowerCase()] ?? 4) - (sevOrder[(b.severity||'').toLowerCase()] ?? 4));
        Hub.ui.showBanner(threats, sorted[0].severity);
        // Show popup for highest-severity unacknowledged alert
        Hub.ui.showAlertPopup(alerts).catch(() => {});
      } else {
        Hub.ui.hideBanner();
      }
    } catch (e) { console.error('Dashboard weather error:', e); }
  },

  async _loadWeatherPage() {
    try {
      await Hub.weather.renderWeatherPage();
    } catch (e) {
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
      { name: 'Supabase', key: 'supabase' }, { name: 'Weather', key: 'weather' },
      { name: 'AI Summary', key: 'ai' },     { name: 'Immich', key: 'immich' }
    ];
    try {
      const resp = await fetch(`${base}/api/health`);
      const data = resp.ok ? await resp.json() : {};
      const svcData = data.services || data;
      el.innerHTML = '<div class="space-y-4">' + checks.map(c => {
        const svc = svcData[c.key]; const ok = svc?.status === 'ok';
        return `<div class="card flex items-center justify-between"><div class="flex items-center gap-3"><span class="status-dot ${ok?'green':'red'}"></span><span class="font-medium">${Hub.utils.esc(c.name)}</span></div><div class="text-right"><span class="text-sm ${ok?'text-green-400':'text-red-400'}">${ok?'OK':svc?.error||'Error'}</span>${svc?.latency_ms?`<span class="text-xs text-gray-500 ml-2">${svc.latency_ms}ms</span>`:''}</div></div>`;
      }).join('') + '</div>' + `<p class="text-xs text-gray-500 mt-4">Last checked: ${new Date().toLocaleTimeString()}</p>`;
    } catch (e) { el.innerHTML = '<div class="card"><p class="text-red-400">Unable to reach health endpoint</p></div>'; }
  },

  _loadSettingsForm() {
    const s   = Hub.state.settings || {};
    const cfg = window.HOME_HUB_CONFIG || {};
    Hub.utils.$('settingLocationName').value  = s.location_name     || cfg.defaultLocation?.name || '';
    Hub.utils.$('settingLat').value           = s.location_lat      || cfg.defaultLocation?.lat  || '';
    Hub.utils.$('settingLon').value           = s.location_lon      || cfg.defaultLocation?.lon  || '';
    Hub.utils.$('settingImmichUrl').value     = s.immich_base_url   || cfg.immichBaseUrl          || '';
    Hub.utils.$('settingImmichKey').value     = s.immich_api_key    || cfg.immichSharedAlbumKeyOrToken || '';
    Hub.utils.$('settingImmichAlbum').value   = s.immich_album_id   || '';
    Hub.utils.$('settingIdleTimeout').value   = s.standby_timeout_min || 10;
    Hub.utils.$('settingQuietStart').value    = s.quiet_hours_start || '22:00';
    Hub.utils.$('settingQuietEnd').value      = s.quiet_hours_end   || '07:00';

    // Photo provider settings
    const photoProviderEl = document.getElementById('settingPhotoProvider');
    if (photoProviderEl) {
      const provider = s.photo_provider || localStorage.getItem('photo_provider') || 'imgur';
      photoProviderEl.value = provider;
      this._updatePhotoProviderUI(provider);
    }
    const imgurAlbumEl = document.getElementById('settingImgurAlbum');
    if (imgurAlbumEl) {
      imgurAlbumEl.value = s.imgur_album_id || localStorage.getItem('imgur_album_id') || 'kAG2MS3';
    }
    const gpAlbumTitleEl = document.getElementById('settingGooglePhotosAlbumTitle');
    if (gpAlbumTitleEl) {
      gpAlbumTitleEl.value = s.google_photos_album_title || localStorage.getItem('google_photos_album_title') || '';
    }
    const gpAlbumIdEl = document.getElementById('settingGooglePhotosAlbumId');
    if (gpAlbumIdEl) {
      gpAlbumIdEl.value = s.google_photos_album_id || localStorage.getItem('google_photos_album_id') || '';
    }

    this._loadCalendarSelection();

    // Gate admin button by role
    const adminBtnEl = document.getElementById('settingsAdminBtn');
    if (adminBtnEl) {
      if (Hub.state.userRole === 'admin') {
        adminBtnEl.innerHTML = `<button onclick="Hub.router.go('admin')"
          class="btn btn-primary px-6 py-3 text-base font-bold" style="background:#dc2626;">
          Open Admin →
        </button>`;
      } else {
        adminBtnEl.innerHTML = `<span class="text-gray-500 text-sm italic">Admin only</span>`;
      }
    }
  },

  _updatePhotoProviderUI(provider) {
    const googleSection = document.getElementById('photoSettingsGoogle');
    const imgurSection  = document.getElementById('photoSettingsImgur');
    const immichSection = document.getElementById('photoSettingsImmich');
    if (googleSection) googleSection.style.display = provider === 'google'  ? '' : 'none';
    if (imgurSection)  imgurSection.style.display  = provider === 'imgur'   ? '' : 'none';
    if (immichSection) immichSection.style.display = provider === 'immich'  ? '' : 'none';
  },

  async _loadGooglePhotoAlbums() {
    const btn       = document.getElementById('btnLoadGoogleAlbums');
    const albumSel  = document.getElementById('settingGooglePhotosAlbumSelect');
    const albumId   = document.getElementById('settingGooglePhotosAlbumId');
    const albumTitle = document.getElementById('settingGooglePhotosAlbumTitle');
    if (!albumSel) return;

    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    albumSel.innerHTML = '<option value="">Loading albums…</option>';

    try {
      const albums = await Hub.googlePhotos?.listAlbums?.();
      if (!albums || albums.error) {
        albumSel.innerHTML = `<option value="">Error: ${albums?.error || 'unknown'}</option>`;
        Hub.ui?.toast?.('Could not load albums — try signing out and back in', 'error');
        return;
      }
      albumSel.innerHTML = '<option value="">— Select album —</option>'
        + albums.map(a => `<option value="${Hub.utils.esc(a.id)}" data-title="${Hub.utils.esc(a.title)}">${Hub.utils.esc(a.title)} (${a.mediaItemsCount || '?'} items)</option>`).join('');

      // Restore saved selection
      const saved = albumId?.value;
      if (saved) albumSel.value = saved;

      albumSel.onchange = () => {
        const opt = albumSel.selectedOptions[0];
        if (albumId) albumId.value = albumSel.value;
        if (albumTitle) albumTitle.value = opt?.dataset.title || '';
      };
    } catch (e) {
      albumSel.innerHTML = `<option value="">Error: ${e.message}</option>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Load My Albums'; }
    }
  },

  async _loadCalendarSelection() {
    const container = Hub.utils.$('calendarCheckboxes');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-400 text-sm">Click "Load My Calendars" to select which calendars to display</p>';
  },

  async _fetchAndDisplayCalendars() {
    const container = Hub.utils.$('calendarCheckboxes');
    const btn       = Hub.utils.$('btnLoadCalendars');
    if (!container) return;

    btn.disabled = true;
    btn.textContent = 'Loading…';
    container.innerHTML = '<p class="text-gray-400 text-sm animate-pulse">Fetching your calendars…</p>';

    const calendars = await Hub.calendar.getCalendarList();
    btn.disabled = false;
    btn.textContent = 'Reload Calendars';

    if (calendars.error) {
      container.innerHTML = `<div class="text-red-400 text-sm"><p class="font-semibold">⚠️ Error: ${Hub.utils.esc(calendars.error)}</p><button onclick="Hub.auth.signOut()" class="btn btn-secondary mt-2 text-xs">Sign Out & Reconnect</button></div>`;
      Hub.ui.toast('Failed to load calendars', 'error');
      return;
    }

    if (!calendars?.length) {
      container.innerHTML = '<p class="text-gray-400 text-sm">No calendars found. Try signing out and back in.</p>';
      return;
    }

    const saved = Hub.state?.settings?.selected_calendars || ['primary'];
    container.innerHTML = calendars.map(cal => {
      const colorStyle = cal.backgroundColor ? `background:${cal.backgroundColor}` : 'background:#3b82f6';
      return `<label class="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
        <input type="checkbox" class="calendar-checkbox w-4 h-4" data-calendar-id="${Hub.utils.esc(cal.id)}" ${saved.includes(cal.id)?'checked':''}>
        <div class="w-3 h-3 rounded-full flex-shrink-0" style="${colorStyle}"></div>
        <div class="flex-1 min-w-0"><p class="font-medium text-sm truncate">${Hub.utils.esc(cal.summary||'Untitled')}</p></div>
      </label>`;
    }).join('');
    Hub.ui.toast(`Loaded ${calendars.length} calendars`, 'success');
  },

  async _saveSettings() {
    if (!Hub.state.user || !Hub.state.household_id) return;

    const selectedCalendars = [];
    document.querySelectorAll('.calendar-checkbox:checked').forEach(cb => selectedCalendars.push(cb.dataset.calendarId));

    // Photo provider
    const photoProvider     = document.getElementById('settingPhotoProvider')?.value || 'imgur';
    const imgurAlbumId      = document.getElementById('settingImgurAlbum')?.value.trim()    || '';
    const gpAlbumId         = document.getElementById('settingGooglePhotosAlbumId')?.value.trim()    || '';
    const gpAlbumTitle      = document.getElementById('settingGooglePhotosAlbumTitle')?.value.trim() || '';

    const payload = {
      location_name:              Hub.utils.$('settingLocationName').value.trim(),
      location_lat:               parseFloat(Hub.utils.$('settingLat').value) || 40.029059,
      location_lon:               parseFloat(Hub.utils.$('settingLon').value) || -82.863462,
      standby_timeout_min:        parseInt(Hub.utils.$('settingIdleTimeout').value) || 10,
      quiet_hours_start:          Hub.utils.$('settingQuietStart').value || '22:00',
      quiet_hours_end:            Hub.utils.$('settingQuietEnd').value   || '07:00',
      immich_base_url:            Hub.utils.$('settingImmichUrl').value.trim(),
      immich_api_key:             Hub.utils.$('settingImmichKey').value.trim(),
      immich_album_id:            Hub.utils.$('settingImmichAlbum').value.trim(),
      selected_calendars:         selectedCalendars.length > 0 ? selectedCalendars : ['primary'],
      photo_provider:             photoProvider,
      google_photos_album_id:     gpAlbumId,
      google_photos_album_title:  gpAlbumTitle,
      imgur_album_id:             imgurAlbumId
    };

    // Always save photo settings to localStorage too (works without DB columns)
    localStorage.setItem('photo_provider',               photoProvider);
    localStorage.setItem('google_photos_album_id',       gpAlbumId);
    localStorage.setItem('google_photos_album_title',    gpAlbumTitle);
    localStorage.setItem('imgur_album_id',               imgurAlbumId);

    try {
      const saved = await Hub.db.saveSettings(Hub.state.user.id, Hub.state.household_id, payload);
      Hub.state.settings = saved;
      Hub.weather._cache = null;
      Hub.ai._cache      = null;
      Hub.calendar._cache = null;
      if (selectedCalendars.length > 0) localStorage.setItem('selected_calendars', JSON.stringify(selectedCalendars));
      Hub.ui.toast('Settings saved!', 'success');
      Hub.router.go('dashboard');
    } catch (e) {
      console.error('[Settings] Save error:', e.message);
      Hub.ui.toast('Saved locally (DB sync failed — will retry on next load)', 'error');
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
    Hub.utils.$('btnGoogleLogin')?.addEventListener('click',      () => Hub.auth.signInGoogle());
    Hub.utils.$('btnCheckSupabase')?.addEventListener('click',    () => Hub.debug.checkSupabase());
    Hub.utils.$('btnSignOut')?.addEventListener('click',          () => Hub.auth.signOut());
    Hub.utils.$('btnSignOutDenied')?.addEventListener('click',    () => Hub.auth.signOut());
    Hub.utils.$('btnDismissAlert')?.addEventListener('click',     () => Hub.ui.dismissAlert());
    Hub.utils.$('btnAddChore')?.addEventListener('click',         () => Hub.chores.showAdd());
    Hub.utils.$('btnSaveChore')?.addEventListener('click',        () => Hub.chores.add());
    Hub.utils.$('btnAddTreat')?.addEventListener('click',         () => Hub.treats.showAddTreat());
    Hub.utils.$('btnSaveTreat')?.addEventListener('click',        () => Hub.treats.logTreat());
    Hub.utils.$('btnAddDog')?.addEventListener('click',           () => Hub.treats.showAddDog());
    Hub.utils.$('btnSaveDog')?.addEventListener('click',          () => Hub.treats.addDog());
    Hub.utils.$('btnSaveSettings')?.addEventListener('click',     () => Hub.app._saveSettings());
    Hub.utils.$('btnUseLocation')?.addEventListener('click',      () => Hub.app._useCurrentLocation());
    Hub.utils.$('btnRefreshStatus')?.addEventListener('click',    () => Hub.app._loadStatusPage());
    Hub.utils.$('btnManualResetChores')?.addEventListener('click', () => Hub.app._forceResetChores());
    Hub.utils.$('btnLoadCalendars')?.addEventListener('click',    () => Hub.app._fetchAndDisplayCalendars());
    Hub.utils.$('btnLoadGoogleAlbums')?.addEventListener('click', () => Hub.app._loadGooglePhotoAlbums());
    Hub.utils.$('btnTestSlideshow')?.addEventListener('click',    () => Hub.app._testSlideshow());

    const providerSel = document.getElementById('settingPhotoProvider');
    if (providerSel) providerSel.addEventListener('change', e => Hub.app._updatePhotoProviderUI(e.target.value));

    this._bindSecretControlEntry();
  },

  async _testSlideshow() {
    Hub.router.go('standby');
    setTimeout(() => Hub.router.go('settings'), 8000);
    Hub.ui?.toast?.('Test slideshow — returning to Settings in 8s', 'info');
  },

  _bindSecretControlEntry() {
    const title = document.getElementById('homeHubTitle');
    if (title && !title._controlBound) {
      title._controlBound = true;
      let clicks = 0, timer = null;
      title.addEventListener('click', () => {
        clicks++;
        clearTimeout(timer);
        timer = setTimeout(() => { clicks = 0; }, 1200);
        if (clicks >= APP_CONFIG.SECRET_CLICK_COUNT) {
          clicks = 0;
          if (Hub.state?.userRole === 'admin') {
            Hub.router.go('control');
            Hub.ui?.toast?.('Control Center unlocked', 'success');
          } else {
            Hub.ui?.toast?.('Admin only', 'error');
          }
        }
      });
    }
    if (!window._hubControlKeySeqBound) {
      window._hubControlKeySeqBound = true;
      let buf = '', last = 0;
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
          if (Hub.state?.userRole === 'admin') Hub.router.go('control');
          else Hub.ui?.toast?.('Admin only', 'error');
        }
      });
    }
  },

  _debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },

  _startIdleTimer() {
    // Only bind activity listeners once — prevents stacking on re-login
    if (!this._idleListenersBound) {
      this._idleListenersBound = true;
      const debouncedReset = this._debounce(() => this._resetIdleTimer(), APP_CONFIG.IDLE_DEBOUNCE_MS);
      ['mousedown','mousemove','keypress','scroll','touchstart'].forEach(ev =>
        window.addEventListener(ev, debouncedReset, { passive: true })
      );
    }
    this._resetIdleTimer();
  },

  _resetIdleTimer() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    // Don't schedule a new fire if we're already in standby — nothing to do
    if (Hub.router?.current === 'standby') return;
    if (!Hub.state?.user) return;
    const timeout = ((Hub.state.settings?.standby_timeout_min) || 10) * 60 * 1000;
    this._idleTimer = setTimeout(() => {
      if (Hub.router.current !== 'standby' && Hub.state.user) Hub.router.go('standby');
    }, timeout);
  },

  /** Secure per-household chore reset (called on login, not public cron) */
  async _callChoreResetEndpoint() {
    if (!Hub.state.household_id) return;

    try {
      const session = await Hub.auth.getSession();
      const token   = session?.access_token;
      if (!token) return;

      const apiBase = window.HOME_HUB_CONFIG?.apiBase || '';
      const resp = await fetch(`${apiBase}/api/chores-reset-my-household`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ tz: 'America/New_York' })
      });

      if (!resp.ok) {
        let errBody = '';
        try { errBody = JSON.stringify(await resp.json()); } catch (_) { errBody = await resp.text().catch(() => ''); }
        console.error('[App] Chore reset HTTP error:', resp.status, errBody);
        // Non-blocking toast so user knows something went wrong without interrupting flow
        Hub.ui?.toast?.(`Chore reset error (${resp.status}) — chores may not have reset`, 'error');
        return;
      }

      const result = await resp.json();
      if (result.error) {
        console.error('[App] Chore reset returned error:', result.error, result.detail || '');
        Hub.ui?.toast?.('Chore reset failed: ' + result.error, 'error');
        return;
      }

      console.log('[App] Chore reset:', result.didReset ? `Reset (${result.dayName})` : result.reason || 'already reset today');

      if (result.didReset && Hub.router.current === 'chores') {
        Hub.chores?.load?.();
      }
    } catch (e) {
      console.warn('[App] Chore reset failed (non-critical):', e.message);
    }
  },

  /**
   * Manual chore reset — bypasses "already reset today" guard.
   * Called by "🔄 Reset Today" button on the Chores page.
   */
  async _forceResetChores() {
    const btn = Hub.utils.$('btnManualResetChores');
    if (btn) { btn.disabled = true; btn.textContent = 'Resetting…'; }

    try {
      const session = await Hub.auth.getSession();
      const token   = session?.access_token;
      if (!token) { Hub.ui?.toast?.('Not signed in', 'error'); return; }

      const apiBase = window.HOME_HUB_CONFIG?.apiBase || '';
      const resp = await fetch(`${apiBase}/api/chores-reset-my-household`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ tz: 'America/New_York', force: true })
      });

      const result = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        console.error('[App] Force reset failed:', resp.status, result);
        Hub.ui?.toast?.('Reset failed: ' + (result.error || resp.status), 'error');
        return;
      }

      console.log('[App] Force reset result:', result);
      Hub.ui?.toast?.(result.didReset ? '✅ Chores reset!' : (result.reason === 'already_reset_today' ? 'Already reset today — use force' : '✅ Done'), 'success');
      Hub.chores?.load?.();
    } catch (e) {
      console.error('[App] Force reset error:', e.message);
      Hub.ui?.toast?.('Reset error: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Reset Today'; }
    }
  },

  _initAdminGesture() {
    // FAB is display:none by default — do NOT show it globally.
    // Settings page has the admin button. Three-finger tap stays but
    // only routes to settings (where admin button is visible).
    let tapCount = 0, tapTimer = null;
    document.addEventListener('touchstart', (e) => {
      if (e.touches.length === 3) {
        clearTimeout(tapTimer);
        tapCount++;
        tapTimer = setTimeout(() => { tapCount = 0; }, 600);
        if (tapCount >= 1) {
          tapCount = 0;
          // Route to settings where admin button lives
          Hub.router.go('settings');
          Hub.ui?.toast?.('Settings opened — tap Admin Panel to enter', 'info');
        }
      }
    }, { passive: true });
  }
};

window.addEventListener('DOMContentLoaded', () => Hub.app.init());
