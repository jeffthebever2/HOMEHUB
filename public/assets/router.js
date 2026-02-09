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
    // CRITICAL: Don't show login if already logged in!
    if (screen === 'login' && Hub.app?._loggedIn) {
      console.warn('[Router] Blocked showScreen(login) - user already logged in!');
      return;
    }
    
    const $ = Hub.utils.$;
    $('loadingScreen').style.display = 'none';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    if (screen === 'login') $('loginScreen').classList.add('active');
    else if (screen === 'accessDenied') $('accessDeniedScreen').classList.add('active');
  },

  /** Activate a page (called after auth check) */
  _activate(page) {
    if (!this.VALID_PAGES.includes(page)) page = 'dashboard';
    Hub.router.current = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = Hub.utils.$(page + 'Page');
    if (el) el.classList.add('active');

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
