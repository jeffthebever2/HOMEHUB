// ============================================================
// assets/router.js — SPA hash-router with pathname fallback (v5)
//
// Fixes in v5:
//   - Fixed inline style.display overriding CSS classes (disappearing bug)
//   - Added noHousehold screen handling
//   - Unified _hideAll() helper to avoid style conflicts
//   - _activate also clears inline styles properly
// ============================================================
window.Hub = window.Hub || {};

Hub.router = {
  current: 'dashboard',
  VALID_PAGES: ['dashboard', 'standby', 'weather', 'chores', 'treats', 'settings', 'status'],

  // Screen IDs for auth/pre-login screens (use flex centering)
  AUTH_SCREENS: {
    login:        'loginScreen',
    accessDenied: 'accessDeniedScreen',
    noHousehold:  'noHouseholdScreen'
  },

  /** Navigate to a page */
  go(page) {
    window.location.hash = '#/' + page;
  },

  /** Hide loading screen + all .page elements cleanly */
  _hideAll() {
    const loading = document.getElementById('loadingScreen');
    if (loading) loading.style.display = 'none';

    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.style.removeProperty('display'); // Clear any leftover inline display
    });
  },

  /** Show auth screens (login/accessDenied/noHousehold) – hides all pages */
  showScreen(screen) {
    // CRITICAL: refuse to show login if logged in
    if (screen === 'login' && Hub.app?._loggedIn) {
      console.error('[Router] BLOCKED showScreen(login) - user is logged in');
      console.trace();
      return;
    }

    console.log('[Router] showScreen:', screen);

    // Clear stale OAuth code from URL
    if (window.location.search.includes('code=')) {
      var cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    this._hideAll();

    // Show the requested auth screen
    var targetId = this.AUTH_SCREENS[screen];
    if (targetId) {
      var el = document.getElementById(targetId);
      if (el) {
        el.classList.add('active');
        el.style.display = 'flex'; // Auth screens use flex centering
        console.log('[Router] ' + screen + ' screen shown');
      }
    } else {
      console.warn('[Router] Unknown screen:', screen);
    }
  },

  /** Activate an app page (called after auth check) */
  _activate(page) {
    if (!this.VALID_PAGES.includes(page)) page = 'dashboard';
    this.current = page;

    this._hideAll();

    var el = Hub.utils.$(page + 'Page');
    if (el) {
      el.classList.add('active');
      el.style.display = 'block';
      console.log('[Router] Activated page:', page);
    }

    Hub.app?.onPageEnter?.(page);
  },

  /** Resolve current page from hash or pathname */
  _resolveRoute() {
    var hash = window.location.hash.replace('#/', '').replace('#', '');
    if (hash && this.VALID_PAGES.includes(hash)) return hash;

    var path = window.location.pathname.replace(/^\//, '').split('/')[0];
    if (path && this.VALID_PAGES.includes(path)) return path;

    return 'dashboard';
  },

  /** Initialize router */
  init() {
    var self = this;
    var handleHash = function () {
      if (!Hub.state?.user || Hub.app?._loginInProgress) {
        console.log('[Router] Blocked hashchange (no user or login in progress)');
        return;
      }
      self._activate(self._resolveRoute());
    };
    window.addEventListener('hashchange', handleHash);
    window.addEventListener('popstate', handleHash);
    this._handleHash = handleHash;

    var pathPage = window.location.pathname.replace(/^\//, '').split('/')[0];
    if (pathPage && this.VALID_PAGES.includes(pathPage) && !window.location.hash) {
      window.location.hash = '#/' + pathPage;
    }
  }
};
