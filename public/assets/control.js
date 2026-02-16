// ============================================================
// assets/control.js — Admin utilities (safe, post-login init)
//
// Key rule: NEVER query Supabase before Hub.state.household_id is set.
// Hub.app calls initAfterLogin() once access is granted.
// ============================================================
window.Hub = window.Hub || {};

Hub.control = {
  _loaded: null,
  _afterLoginInit: false,

  init() {
    // Bind any built-in buttons on the Control page (if they exist)
    console.log('[Control] Init started');

    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (!el || el._bound) return;
      el._bound = true;
      el.addEventListener('click', fn);
    };

    bind('btnControlLoad', () => this.load());
    bind('btnControlSave', () => this.save?.());
    bind('btnControlCopyJson', () => this._copyJson?.());
  },

  // Called by Hub.app after access is granted.
  initAfterLogin() {
    if (this._afterLoginInit) return;
    if (!Hub.state?.household_id) return;
    if (Hub.state.userRole !== 'admin') return;

    this._afterLoginInit = true;

    // Insert admin tools once the control page DOM exists.
    setTimeout(() => this.addAdminControls(), 200);
  },

  async _authHeaders() {
    try {
      const session = await Hub.auth.getSession();
      const token = session?.access_token;
      return token ? { Authorization: 'Bearer ' + token } : {};
    } catch (_) {
      return {};
    }
  },

  addAdminControls() {
    const controlContent = document.getElementById('controlContent');
    if (!controlContent) return; // control page not mounted

    if (document.getElementById('adminControlsSection')) return;

    const html = `
      <div id="adminControlsSection" class="space-y-6 mb-8">
        <div class="card bg-blue-900 bg-opacity-30">
          <h2 class="text-xl font-bold mb-2">\ud83d\udd27 Admin Dashboard</h2>
          <p class="text-sm text-gray-300 mb-3">Server-managed daily reset is enabled (no manual babysitting).</p>
          <div id="adminStats"><p class="text-gray-400">Loading stats…</p></div>
        </div>

        <div class="card bg-gray-800">
          <h2 class="text-xl font-bold mb-3">\ud83d\udd04 Chores</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button id="btnAdminRunReset" class="btn btn-primary w-full">\ud83d\udd04 Run Reset Now</button>
            <button id="btnAdminRefreshStats" class="btn btn-secondary w-full">\ud83d\udcca Refresh Stats</button>
          </div>
          <div class="mt-4 p-3 bg-gray-900 rounded text-sm text-gray-400">
            <p><strong>Note:</strong> Hobby cron runs at most once/day. If the wall tablet is always on, the client fallback also keeps things correct.</p>
          </div>
        </div>
      </div>
    `;

    controlContent.insertAdjacentHTML('afterbegin', html);

    const runBtn = document.getElementById('btnAdminRunReset');
    if (runBtn && !runBtn._bound) {
      runBtn._bound = true;
      runBtn.addEventListener('click', async () => {
        try {
          if (!Hub.state?.household_id) throw new Error('Missing household_id');
          const headers = await this._authHeaders();
          const res = await fetch(Hub.utils.apiBase() + '/chores-reset-my-household', {
            method: 'POST',
            headers
          });
          if (!res.ok) {
            const t = await res.text().catch(() => '');
            throw new Error('Reset failed: ' + res.status + ' ' + t);
          }
          Hub.ui?.toast?.('Chores reset ran.', 'success');
          // Refresh visible widgets
          Hub.chores?.renderDashboard?.().catch?.(() => {});
          this.loadStats();
        } catch (e) {
          console.error('[Control] Manual reset error:', e);
          Hub.ui?.toast?.(e.message || 'Reset failed', 'error');
        }
      });
    }

    const statsBtn = document.getElementById('btnAdminRefreshStats');
    if (statsBtn && !statsBtn._bound) {
      statsBtn._bound = true;
      statsBtn.addEventListener('click', () => this.loadStats());
    }

    this.loadStats();
  },

  async loadStats() {
    const el = document.getElementById('adminStats');
    if (!el) return;

    try {
      if (!Hub.state?.household_id) throw new Error('Missing household_id');
      const chores = await Hub.db.loadChores(Hub.state.household_id);
      const total = chores.length;
      const pending = chores.filter(c => c.status === 'pending').length;
      const done = total - pending;
      const rate = total ? Math.round((done / total) * 100) : 0;

      el.innerHTML = `
        <div class="grid grid-cols-3 gap-4">
          <div class="text-center">
            <p class="text-3xl font-bold text-blue-400">${total}</p>
            <p class="text-sm text-gray-400">Total</p>
          </div>
          <div class="text-center">
            <p class="text-3xl font-bold text-yellow-400">${pending}</p>
            <p class="text-sm text-gray-400">Pending</p>
          </div>
          <div class="text-center">
            <p class="text-3xl font-bold text-green-400">${rate}%</p>
            <p class="text-sm text-gray-400">Complete</p>
          </div>
        </div>
      `;
    } catch (e) {
      console.error('[Control] Stats error:', e);
      el.innerHTML = `<p class="text-red-400">Failed to load stats: ${e.message}</p>`;
    }
  },

  // Keep existing stub hooks if other parts reference them
  load() {
    // Control page main load (optional)
    this.addAdminControls();
    this.loadStats();
  }
};
