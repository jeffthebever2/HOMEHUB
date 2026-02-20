// ============================================================
// public/assets/router.js — SPA hash-router
// ============================================================
window.Hub = window.Hub || {};

Hub.router = {
  current: 'dashboard',
  VALID_PAGES: ['dashboard','standby','weather','chores','treats','music','radio',
                'settings','status','control','grocery','admin'],

  go(page) { window.location.hash = '#/' + page; },

  showScreen(screen) {
    if (screen === 'login' && Hub.app?._loggedIn) {
      console.error('[Router] BLOCKED showScreen(login) — already logged in');
      return;
    }
    if (window.location.search.includes('code=')) {
      const clean = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, clean);
    }
    const $ = Hub.utils.$;
    const loading = $('loadingScreen');
    if (loading) loading.style.display = 'none';
    document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    if (screen === 'login') {
      const el = $('loginScreen');
      if (el) { el.classList.add('active'); el.style.display = 'flex'; }
    } else if (screen === 'accessDenied') {
      const el = $('accessDeniedScreen');
      if (el) { el.classList.add('active'); el.style.display = 'flex'; }
    }
  },

  _activate(page) {
    if (!this.VALID_PAGES.includes(page)) page = 'dashboard';

    // Call leave hook on the previous page before switching
    const prev = Hub.router.current;
    if (prev && prev !== page) {
      Hub.app?.onPageLeave?.(prev);
    }

    Hub.router.current = page;
    document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    const el = Hub.utils.$(page + 'Page');
    if (el) { el.classList.add('active'); el.style.display = 'block'; }
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
    const handle = () => {
      if (!Hub.state?.user || Hub.app?._loginInProgress) return;
      Hub.router._activate(Hub.router._resolveRoute());
    };
    window.addEventListener('hashchange', handle);
    window.addEventListener('popstate', handle);
    Hub.router._handleHash = handle;
    const pathPage = window.location.pathname.replace(/^\//, '').split('/')[0];
    if (pathPage && this.VALID_PAGES.includes(pathPage) && !window.location.hash)
      window.location.hash = '#/' + pathPage;
  }
};
