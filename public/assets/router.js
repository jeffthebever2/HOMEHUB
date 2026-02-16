// ============================================================
// assets/router.js — SPA hash-router with pathname fallback
// Supports both #/page hash routing AND /page clean URLs
// (Vercel rewrites /page → /index.html, so we read pathname)
// ============================================================
window.Hub = window.Hub || {};

Hub.router = {
  current: 'dashboard',
  // NOTE: 'control' is intentionally hidden from the UI (secret/admin-only entry)
  VALID_PAGES: ['dashboard', 'standby', 'weather', 'chores', 'treats', 'music', 'radio', 'settings', 'status', 'control'],

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
      console.trace();
      return;
    }

    console.log('[Router] showScreen:', screen);

    // IMPORTANT: Do NOT clear ?code= here.
    // Supabase PKCE completes the OAuth exchange using that query param.
    // Clearing it before the exchange finishes will strand users on the login screen.

    const $ = Hub.utils.$;

    // Force hide loading screen
    const loadingScreen = $('loadingScreen');
    if (loadingScreen) loadingScreen.style.display = 'none';

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
        loginScreen.style.display = 'flex';
        console.log('[Router] Login screen shown');
      }
    } else if (screen === 'accessDenied') {
      const deniedScreen = $('accessDeniedScreen');
      if (deniedScreen) {
        deniedScreen.classList.add('active');
        deniedScreen.style.display = 'flex';
        console.log('[Router] Access denied screen shown');
      }
    }
  },

  /** Activate a page (called after auth check) */
  _activate(page) {
    if (!this.VALID_PAGES.includes(page)) page = 'dashboard';

    if (page === 'control' && Hub.state?.userRole !== 'admin') {
      console.warn('[Router] Blocked control page for non-admin user');
      try { Hub.ui?.toast?.('Admin-only page', 'error'); } catch (e) {}
      page = 'dashboard';
      if (window.location.hash !== '#/dashboard') window.location.hash = '#/dashboard';
    }

    Hub.router.current = page;

    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });

    const el = Hub.utils.$(page + 'Page');
    if (el) {
      el.classList.add('active');
      el.style.display = 'block';
      console.log('[Router] Activated page:', page);
    }

    Hub.app?.onPageEnter?.(page);
  },

  _resolveRoute() {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    if (hash && this.VALID_PAGES.includes(hash)) return hash;

    const path = window.location.pathname.replace(/^\//, '').split('/')[0];
    if (path && this.VALID_PAGES.includes(path)) return path;

    return 'dashboard';
  },

  init() {
    const handleHash = () => {
      if (!Hub.state?.user || Hub.app?._loginInProgress) {
        console.log('[Router] Blocked hashchange (no user or login in progress)');
        return;
      }
      Hub.router._activate(Hub.router._resolveRoute());
    };

    window.addEventListener('hashchange', handleHash);
    window.addEventListener('popstate', handleHash);
    Hub.router._handleHash = handleHash;

    const pathPage = window.location.pathname.replace(/^\//, '').split('/')[0];
    if (pathPage && this.VALID_PAGES.includes(pathPage) && !window.location.hash) {
      window.location.hash = '#/' + pathPage;
    }
  }
};
