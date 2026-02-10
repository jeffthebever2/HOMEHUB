// ============================================================
// assets/router.js — SPA hash-router with pathname fallback
// Supports both #/page hash routing AND /page clean URLs
// (Vercel rewrites /page → /index.html, so we read pathname)
// ============================================================
window.Hub = window.Hub || {};

Hub.router = {
  current: 'dashboard',
  VALID_PAGES: ['dashboard', 'standby', 'weather', 'chores', 'treats', 'settings', 'status'],

  /** Navigate to a page */
  go(page) {
    window.location.hash = '#/' + page;
  },

  /** Show auth screens (login/accessDenied) – hides all pages */
  showScreen(screen) {
    // CRITICAL: ABSOLUTELY refuse to show login if logged in
    if (screen === 'login' && Hub.app?._loggedIn) {
      console.error('[Router] 🚨 BLOCKED showScreen(login) - USER IS LOGGED IN!');
      console.error('[Router] This should never happen - check your code!');
      console.trace(); // Show stack trace
      return;
    }

    console.log('[Router] showScreen:', screen);

    // Clear any OAuth code from URL when showing login/denied screens
    if (window.location.search.includes('code=')) {
      const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
      console.log('[Router] OAuth code cleared from URL (stale code cleanup)');
    }

    const $ = Hub.utils.$;
    
    // Force hide loading screen
    const loadingScreen = $('loadingScreen');
    if (loadingScreen) {
      loadingScreen.style.display = 'none';
    }
    
    // Force hide all pages
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });
    
    // Show requested screen
    if (screen === 'login') {
      const loginScreen = $('loginScreen');
      if (loginScreen) {
        loginScreen.classList.add('active');
        loginScreen.style.display = 'flex'; // Login uses flex
        console.log('[Router] Login screen shown');
      }
    } else if (screen === 'accessDenied') {
      const deniedScreen = $('accessDeniedScreen');
      if (deniedScreen) {
        deniedScreen.classList.add('active');
        deniedScreen.style.display = 'flex'; // Access denied uses flex
        console.log('[Router] Access denied screen shown');
      }
    }
  },

  /** Activate a page (called after auth check) */
  _activate(page) {
    if (!this.VALID_PAGES.includes(page)) page = 'dashboard';
    Hub.router.current = page;
    
    // Force hide all pages
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });
    
    // Force show target page
    const el = Hub.utils.$(page + 'Page');
    if (el) {
      el.classList.add('active');
      el.style.display = 'block'; // Force display
      console.log('[Router] Activated page:', page);
    }

    // Fire page lifecycle
    Hub.app?.onPageEnter?.(page);
  },

  /** Resolve current page from hash or pathname */
  _resolveRoute() {
    // Prefer hash
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    if (hash && this.VALID_PAGES.includes(hash)) return hash;

    // Fallback to pathname (for Vercel clean-URL rewrites)
    const path = window.location.pathname.replace(/^\//, '').split('/')[0];
    if (path && this.VALID_PAGES.includes(path)) return path;

    return 'dashboard';
  },

  /** Initialize router */
  init() {
    const handleHash = () => {
      // Don't route if user not authenticated OR if login is in progress
      if (!Hub.state?.user || Hub.app?._loginInProgress) {
        console.log('[Router] Blocked hashchange (no user or login in progress)');
        return;
      }
      Hub.router._activate(Hub.router._resolveRoute());
    };
    window.addEventListener('hashchange', handleHash);
    window.addEventListener('popstate', handleHash);
    Hub.router._handleHash = handleHash;

    // On first load, if pathname is a valid page but no hash, set hash
    const pathPage = window.location.pathname.replace(/^\//, '').split('/')[0];
    if (pathPage && this.VALID_PAGES.includes(pathPage) && !window.location.hash) {
      window.location.hash = '#/' + pathPage;
    }
  }
};
