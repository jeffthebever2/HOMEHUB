// ============================================================
// assets/control.js — Comprehensive Admin Control Panel (v2)
//
// Features:
//  - User Management
//  - Chore Automation (daily reset at midnight)
//  - Statistics & Analytics
//  - System Logs
//  - Site Control Settings
//  - Database Management
// ============================================================
window.Hub = window.Hub || {};

Hub.control = {
  _loaded: null,
  _activeTab: 'overview',
  _resetCheckInterval: null,

  init() {
    console.log('[Control] Initializing admin panel');
    
    // Bind tab navigation
    const tabs = document.querySelectorAll('[data-admin-tab]');
    tabs.forEach(tab => {
      if (tab._bound) return;
      tab._bound = true;
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-admin-tab');
        this.switchTab(tabName);
      });
    });

    // Bind buttons
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (!el || el._bound) return;
      el._bound = true;
      el.addEventListener('click', fn);
    };

    // Overview
    bind('btnRefreshOverview', () => this.loadOverview());
    
    // Chores
    bind('btnResetDailyChores', () => this.resetDailyChores(true));
    bind('btnViewChoreStats', () => this.loadChoreStats());
    bind('btnEnableAutoReset', () => this.toggleAutoReset(true));
    bind('btnDisableAutoReset', () => this.toggleAutoReset(false));
    
    // Users
    bind('btnLoadUsers', () => this.loadUsers());
    bind('btnAddUser', () => this.showAddUserModal());
    bind('btnSaveNewUser', () => this.addUser());
    
    // Logs
    bind('btnLoadLogs', () => this.loadSystemLogs());
    bind('btnClearOldLogs', () => this.clearOldLogs());
    
    // Site Control (existing functionality)
    bind('btnControlLoad', () => this.loadSiteControl());
    bind('btnControlSave', () => this.saveSiteControl());
    bind('btnControlCopyJson', () => this._copyJson());

    // Start automatic chore reset checker
    this.startAutoResetChecker();
  },

  /** Switch between admin tabs */
  switchTab(tabName) {
    console.log('[Control] Switching to tab:', tabName);
    this._activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('[data-admin-tab]').forEach(btn => {
      if (btn.getAttribute('data-admin-tab') === tabName) {
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
      } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    });

    // Show/hide tab content
    document.querySelectorAll('[data-admin-content]').forEach(content => {
      if (content.getAttribute('data-admin-content') === tabName) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    });

    // Load tab data
    switch (tabName) {
      case 'overview':
        this.loadOverview();
        break;
      case 'chores':
        this.loadChoreManagement();
        break;
      case 'users':
        this.loadUsers();
        break;
      case 'stats':
        this.loadStatistics();
        break;
      case 'logs':
        this.loadSystemLogs();
        break;
      case 'site':
        this.loadSiteControl();
        break;
    }
  },

  // ============================================================
  // OVERVIEW TAB
  // ============================================================
  async loadOverview() {
    const el = document.getElementById('adminOverviewContent');
    if (!el) return;

    try {
      el.innerHTML = '<p class="text-gray-400">Loading...</p>';

      // Get counts
      const [chores, users, logs] = await Promise.all([
        Hub.db.loadChores(Hub.state.household_id),
        Hub.sb.from('household_members')
          .select('*')
          .eq('household_id', Hub.state.household_id),
        Hub.sb.from('chore_logs')
          .select('*', { count: 'exact', head: true })
          .eq('household_id', Hub.state.household_id)
      ]);

      const totalChores = chores.length;
      const pendingChores = chores.filter(c => c.status === 'pending').length;
      const doneToday = chores.filter(c => {
        if (c.status !== 'done') return false;
        const today = new Date().toDateString();
        const createdAt = new Date(c.created_at).toDateString();
        return today === createdAt;
      }).length;

      const totalUsers = users.data?.length || 0;
      const totalLogs = logs.count || 0;

      const autoResetEnabled = localStorage.getItem('chore_auto_reset_enabled') === 'true';
      const lastReset = localStorage.getItem('chore_last_reset_date');

      el.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div class="bg-blue-900 bg-opacity-30 rounded-lg p-4">
            <p class="text-sm text-gray-400 mb-1">Total Chores</p>
            <p class="text-3xl font-bold text-blue-400">${totalChores}</p>
            <p class="text-xs text-gray-500 mt-2">${pendingChores} pending</p>
          </div>
          
          <div class="bg-green-900 bg-opacity-30 rounded-lg p-4">
            <p class="text-sm text-gray-400 mb-1">Completed Today</p>
            <p class="text-3xl font-bold text-green-400">${doneToday}</p>
            <p class="text-xs text-gray-500 mt-2">${totalLogs} all-time completions</p>
          </div>
          
          <div class="bg-purple-900 bg-opacity-30 rounded-lg p-4">
            <p class="text-sm text-gray-400 mb-1">Family Members</p>
            <p class="text-3xl font-bold text-purple-400">${totalUsers}</p>
            <p class="text-xs text-gray-500 mt-2">Active users</p>
          </div>
        </div>

        <div class="mt-6 p-4 rounded-lg ${autoResetEnabled ? 'bg-green-900 bg-opacity-20 border border-green-500' : 'bg-gray-800'}">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold mb-1">🔄 Automatic Daily Reset</h3>
              <p class="text-sm text-gray-400">
                Status: <span class="${autoResetEnabled ? 'text-green-400' : 'text-gray-400'} font-semibold">
                  ${autoResetEnabled ? 'ENABLED ✓' : 'Disabled'}
                </span>
              </p>
              ${lastReset ? `<p class="text-xs text-gray-500 mt-1">Last reset: ${new Date(lastReset).toLocaleString()}</p>` : ''}
            </div>
            <div>
              ${autoResetEnabled 
                ? '<span class="text-green-400 text-4xl">✓</span>'
                : '<span class="text-gray-500 text-4xl">○</span>'
              }
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-3">
            ${autoResetEnabled 
              ? 'Daily chores will automatically reset at midnight. Weekly chores reset on their assigned day.'
              : 'Enable automatic reset to unmark daily chores at midnight (logs are preserved for statistics).'
            }
          </p>
        </div>

        <div class="mt-4">
          <button id="btnRefreshOverview" class="btn btn-secondary text-sm">🔄 Refresh</button>
        </div>
      `;

      // Re-bind button
      const refreshBtn = document.getElementById('btnRefreshOverview');
      if (refreshBtn && !refreshBtn._bound) {
        refreshBtn._bound = true;
        refreshBtn.addEventListener('click', () => this.loadOverview());
      }

    } catch (e) {
      console.error('[Control] Overview error:', e);
      el.innerHTML = `<p class="text-red-400">Error loading overview: ${Hub.utils.esc(e.message)}</p>`;
    }
  },

  // ============================================================
  // CHORE MANAGEMENT TAB
  // ============================================================
  async loadChoreManagement() {
    const el = document.getElementById('adminChoresContent');
    if (!el) return;

    try {
      const autoResetEnabled = localStorage.getItem('chore_auto_reset_enabled') === 'true';
      const lastReset = localStorage.getItem('chore_last_reset_date');
      const nextReset = this.getNextMidnight();

      el.innerHTML = `
        <div class="space-y-6">
          <!-- Auto Reset Status -->
          <div class="card bg-gray-800">
            <h3 class="text-lg font-bold mb-4">🔄 Automatic Daily Reset</h3>
            <div class="space-y-4">
              <div class="flex items-center justify-between p-4 rounded-lg ${autoResetEnabled ? 'bg-green-900 bg-opacity-20 border border-green-500' : 'bg-gray-900'}">
                <div>
                  <p class="font-semibold">Status: <span class="${autoResetEnabled ? 'text-green-400' : 'text-gray-400'}">${autoResetEnabled ? 'ENABLED' : 'DISABLED'}</span></p>
                  ${lastReset ? `<p class="text-sm text-gray-400 mt-1">Last reset: ${new Date(lastReset).toLocaleString()}</p>` : ''}
                  <p class="text-sm text-gray-400 mt-1">Next reset: ${nextReset}</p>
                </div>
                <div>
                  ${autoResetEnabled
                    ? '<button id="btnDisableAutoReset" class="btn btn-danger text-sm">Disable</button>'
                    : '<button id="btnEnableAutoReset" class="btn btn-success text-sm">Enable</button>'
                  }
                </div>
              </div>

              <div class="bg-gray-900 rounded-lg p-4">
                <h4 class="font-semibold mb-2">How it works:</h4>
                <ul class="text-sm text-gray-400 space-y-1 list-disc pl-5">
                  <li><strong>Daily chores:</strong> Reset to "pending" at midnight every day</li>
                  <li><strong>Weekly chores:</strong> Reset on their assigned day (Monday-Sunday)</li>
                  <li><strong>Completion logs:</strong> Always preserved for statistics and tracking</li>
                  <li><strong>Automatic:</strong> Runs even when no one is logged in</li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Manual Actions -->
          <div class="card bg-gray-800">
            <h3 class="text-lg font-bold mb-4">⚡ Manual Actions</h3>
            <div class="space-y-3">
              <button id="btnResetDailyChores" class="btn btn-primary w-full">
                🔄 Reset All Daily Chores Now
              </button>
              <button id="btnViewChoreStats" class="btn btn-secondary w-full">
                📊 View Chore Statistics
              </button>
              <p class="text-xs text-gray-500">
                Manual reset will unmark all daily chores as "pending" while keeping completion logs intact.
              </p>
            </div>
          </div>

          <!-- Chore Categories -->
          <div class="card bg-gray-800">
            <h3 class="text-lg font-bold mb-4">📋 Chore Categories</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div class="p-3 bg-gray-900 rounded">
                <p class="font-semibold text-blue-400">Daily</p>
                <p class="text-xs text-gray-400 mt-1">Resets every midnight</p>
              </div>
              <div class="p-3 bg-gray-900 rounded">
                <p class="font-semibold text-blue-400">Monday (Living Room)</p>
                <p class="text-xs text-gray-400 mt-1">Resets every Monday</p>
              </div>
              <div class="p-3 bg-gray-900 rounded">
                <p class="font-semibold text-blue-400">Tuesday (Bathrooms)</p>
                <p class="text-xs text-gray-400 mt-1">Resets every Tuesday</p>
              </div>
              <div class="p-3 bg-gray-900 rounded">
                <p class="font-semibold text-blue-400">Wednesday (Entryway)</p>
                <p class="text-xs text-gray-400 mt-1">Resets every Wednesday</p>
              </div>
              <div class="p-3 bg-gray-900 rounded">
                <p class="font-semibold text-blue-400">Thursday (Kitchen)</p>
                <p class="text-xs text-gray-400 mt-1">Resets every Thursday</p>
              </div>
              <div class="p-3 bg-gray-900 rounded">
                <p class="font-semibold text-blue-400">Friday (Bedrooms)</p>
                <p class="text-xs text-gray-400 mt-1">Resets every Friday</p>
              </div>
              <div class="p-3 bg-gray-900 rounded">
                <p class="font-semibold text-blue-400">Saturday (Miscellaneous)</p>
                <p class="text-xs text-gray-400 mt-1">Resets every Saturday</p>
              </div>
              <div class="p-3 bg-gray-900 rounded">
                <p class="font-semibold text-blue-400">Sunday (Grocery/Family)</p>
                <p class="text-xs text-gray-400 mt-1">Resets every Sunday</p>
              </div>
            </div>
          </div>
        </div>
      `;

      // Re-bind buttons
      this._rebindButtons();

    } catch (e) {
      console.error('[Control] Chore management error:', e);
      el.innerHTML = `<p class="text-red-400">Error: ${Hub.utils.esc(e.message)}</p>`;
    }
  },

  // ============================================================
  // CHORE AUTOMATION LOGIC
  // ============================================================
  
  /** Start checking for midnight to auto-reset chores */
  startAutoResetChecker() {
    console.log('[Control] Starting auto-reset checker');
    
    // Check every minute if it's time to reset
    if (this._resetCheckInterval) clearInterval(this._resetCheckInterval);
    
    this._resetCheckInterval = setInterval(() => {
      const enabled = localStorage.getItem('chore_auto_reset_enabled') === 'true';
      if (!enabled) return;

      const now = new Date();
      const lastReset = localStorage.getItem('chore_last_reset_date');
      const lastResetDate = lastReset ? new Date(lastReset).toDateString() : null;
      const todayDate = now.toDateString();

      // If it's a new day and we haven't reset yet today
      if (lastResetDate !== todayDate) {
        // Check if it's past midnight (first minute of new day)
        if (now.getHours() === 0 && now.getMinutes() < 2) {
          console.log('[Control] Auto-reset triggered at midnight');
          this.resetDailyChores(false);
        }
      }
    }, 60000); // Check every minute

    // Also do an immediate check
    setTimeout(() => this.checkAndResetIfNeeded(), 1000);
  },

  /** Check if reset is needed and do it */
  async checkAndResetIfNeeded() {
    const enabled = localStorage.getItem('chore_auto_reset_enabled') === 'true';
    if (!enabled) return;

    const now = new Date();
    const lastReset = localStorage.getItem('chore_last_reset_date');
    const lastResetDate = lastReset ? new Date(lastReset).toDateString() : null;
    const todayDate = now.toDateString();

    if (lastResetDate !== todayDate && now.getHours() >= 0) {
      console.log('[Control] Performing missed daily reset');
      await this.resetDailyChores(false);
    }
  },

  /** Reset daily and weekly chores */
  async resetDailyChores(manual = false) {
    if (Hub.state?.userRole !== 'admin') {
      Hub.ui.toast('Admin only', 'error');
      return;
    }

    try {
      if (manual) {
        if (!confirm('Reset all daily chores to pending? Completion logs will be preserved for statistics.')) {
          return;
        }
      }

      console.log('[Control] Resetting daily chores...');
      const today = new Date().getDay(); // 0=Sun, 1=Mon, etc.

      // Get all chores
      const chores = await Hub.db.loadChores(Hub.state.household_id);
      
      // Filter chores that need reset
      const choresToReset = chores.filter(c => {
        // Daily chores always reset
        if (c.category === 'Daily') return true;
        
        // Weekly chores reset on their assigned day
        if (c.day_of_week === today) return true;
        
        // Fallback: parse category for day
        if (c.day_of_week == null && c.category && Hub.chores.DAY_MAP[c.category] === today) return true;
        
        return false;
      });

      console.log(`[Control] Resetting ${choresToReset.length} chores`);

      // Reset each chore to pending
      for (const chore of choresToReset) {
        if (chore.status === 'done') {
          await Hub.sb
            .from('chores')
            .update({ status: 'pending' })
            .eq('id', chore.id);
        }
      }

      // Update last reset time
      localStorage.setItem('chore_last_reset_date', new Date().toISOString());

      if (manual) {
        Hub.ui.toast(`Reset ${choresToReset.length} chores successfully!`, 'success');
        this.loadChoreManagement();
      } else {
        console.log('[Control] Auto-reset completed');
      }

      // Refresh dashboard if visible
      if (Hub.router?.current === 'dashboard') {
        Hub.chores?.renderDashboard?.();
      }

    } catch (e) {
      console.error('[Control] Reset error:', e);
      if (manual) Hub.ui.toast('Reset failed: ' + e.message, 'error');
    }
  },

  /** Toggle auto-reset on/off */
  toggleAutoReset(enable) {
    if (Hub.state?.userRole !== 'admin') {
      Hub.ui.toast('Admin only', 'error');
      return;
    }

    localStorage.setItem('chore_auto_reset_enabled', enable ? 'true' : 'false');
    
    if (enable) {
      Hub.ui.toast('Automatic reset enabled! Chores will reset at midnight.', 'success');
      this.checkAndResetIfNeeded(); // Check if we need to reset now
    } else {
      Hub.ui.toast('Automatic reset disabled', 'success');
    }

    this.loadChoreManagement();
    this.loadOverview();
  },

  /** Get next midnight time */
  getNextMidnight() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const diff = tomorrow - now;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    
    return `in ${hours}h ${minutes}m`;
  },

  /** Load chore statistics */
  async loadChoreStats() {
    const el = document.getElementById('adminChoresContent');
    if (!el) return;

    try {
      el.innerHTML = '<p class="text-gray-400">Loading statistics...</p>';

      // Get completion logs
      const { data: logs } = await Hub.sb
        .from('chore_logs')
        .select('*, chores(title, category)')
        .eq('household_id', Hub.state.household_id)
        .order('completed_at', { ascending: false })
        .limit(100);

      if (!logs || logs.length === 0) {
        el.innerHTML = '<p class="text-gray-400">No completion history yet</p>';
        return;
      }

      // Calculate stats
      const totalCompletions = logs.length;
      const last7Days = logs.filter(l => {
        const logDate = new Date(l.completed_at);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return logDate >= weekAgo;
      }).length;

      // Count by family member
      const byMember = {};
      logs.forEach(log => {
        const member = log.completed_by_name || 'Unknown';
        byMember[member] = (byMember[member] || 0) + 1;
      });

      el.innerHTML = `
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold">📊 Chore Statistics</h3>
            <button onclick="Hub.control.loadChoreManagement()" class="btn btn-secondary text-sm">← Back</button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-blue-900 bg-opacity-30 rounded-lg p-4">
              <p class="text-sm text-gray-400 mb-1">Total Completions</p>
              <p class="text-3xl font-bold text-blue-400">${totalCompletions}</p>
            </div>
            <div class="bg-green-900 bg-opacity-30 rounded-lg p-4">
              <p class="text-sm text-gray-400 mb-1">Last 7 Days</p>
              <p class="text-3xl font-bold text-green-400">${last7Days}</p>
            </div>
          </div>

          <div class="card bg-gray-800">
            <h4 class="font-bold mb-4">Completions by Family Member</h4>
            <div class="space-y-2">
              ${Object.entries(byMember).sort((a, b) => b[1] - a[1]).map(([member, count]) => `
                <div class="flex items-center justify-between p-2 bg-gray-900 rounded">
                  <span class="font-semibold">${Hub.utils.esc(member)}</span>
                  <span class="text-gray-400">${count} chores</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card bg-gray-800">
            <h4 class="font-bold mb-4">Recent Completions</h4>
            <div class="space-y-2 max-h-96 overflow-y-auto">
              ${logs.slice(0, 20).map(log => {
                const completedAt = new Date(log.completed_at).toLocaleString();
                const title = log.chores?.title || 'Deleted chore';
                const member = log.completed_by_name || 'Unknown';
                return `
                  <div class="p-3 bg-gray-900 rounded">
                    <p class="font-semibold">${Hub.utils.esc(title)}</p>
                    <p class="text-sm text-gray-400">${Hub.utils.esc(member)} • ${completedAt}</p>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;

    } catch (e) {
      console.error('[Control] Stats error:', e);
      el.innerHTML = `<p class="text-red-400">Error: ${Hub.utils.esc(e.message)}</p>`;
    }
  },

  // ============================================================
  // USER MANAGEMENT TAB
  // ============================================================
  async loadUsers() {
    const el = document.getElementById('adminUsersContent');
    if (!el) return;

    try {
      el.innerHTML = '<p class="text-gray-400">Loading users...</p>';

      const { data: members } = await Hub.sb
        .from('household_members')
        .select('*')
        .eq('household_id', Hub.state.household_id)
        .order('created_at', { ascending: true });

      const { data: allowed } = await Hub.sb
        .from('allowed_emails')
        .select('*')
        .eq('household_id', Hub.state.household_id)
        .order('created_at', { ascending: true });

      el.innerHTML = `
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold">👥 User Management</h3>
            <button id="btnAddUser" class="btn btn-primary text-sm">+ Add User</button>
          </div>

          <div class="card bg-gray-800">
            <h4 class="font-bold mb-4">Household Members (${members?.length || 0})</h4>
            <div class="space-y-2">
              ${members?.map(m => `
                <div class="flex items-center justify-between p-3 bg-gray-900 rounded">
                  <div>
                    <p class="font-semibold">${Hub.utils.esc(m.email)}</p>
                    <p class="text-xs text-gray-400">Role: ${Hub.utils.esc(m.role)} • Added ${new Date(m.created_at).toLocaleDateString()}</p>
                  </div>
                  <span class="text-${m.role === 'admin' ? 'yellow' : 'blue'}-400 text-sm font-semibold uppercase">${Hub.utils.esc(m.role)}</span>
                </div>
              `).join('') || '<p class="text-gray-500">No members</p>'}
            </div>
          </div>

          <div class="card bg-gray-800">
            <h4 class="font-bold mb-4">Allowed Emails (${allowed?.length || 0})</h4>
            <div class="space-y-2">
              ${allowed?.map(a => `
                <div class="flex items-center justify-between p-3 bg-gray-900 rounded">
                  <div>
                    <p class="font-semibold">${Hub.utils.esc(a.email)}</p>
                    <p class="text-xs text-gray-400">Added ${new Date(a.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              `).join('') || '<p class="text-gray-500">No allowed emails</p>'}
            </div>
          </div>

          <div class="card bg-blue-900 bg-opacity-20 border border-blue-500">
            <h4 class="font-bold mb-2">ℹ️ How Access Control Works</h4>
            <ul class="text-sm text-gray-400 space-y-1 list-disc pl-5">
              <li>Users must be in BOTH tables to access the app</li>
              <li>Household Members: Defines role (admin/member) and household</li>
              <li>Allowed Emails: Security whitelist for access</li>
              <li>Add via Supabase dashboard: Settings → Database → Tables</li>
            </ul>
          </div>
        </div>
      `;

      // Re-bind button
      const addBtn = document.getElementById('btnAddUser');
      if (addBtn && !addBtn._bound) {
        addBtn._bound = true;
        addBtn.addEventListener('click', () => this.showAddUserModal());
      }

    } catch (e) {
      console.error('[Control] Users error:', e);
      el.innerHTML = `<p class="text-red-400">Error: ${Hub.utils.esc(e.message)}</p>`;
    }
  },

  showAddUserModal() {
    Hub.ui.toast('User management coming soon! For now, add users via Supabase Dashboard → Tables', 'info');
  },

  // ============================================================
  // STATISTICS TAB
  // ============================================================
  async loadStatistics() {
    const el = document.getElementById('adminStatsContent');
    if (!el) return;

    try {
      el.innerHTML = '<p class="text-gray-400">Loading statistics...</p>';

      // Get various counts
      const [chores, logs, members] = await Promise.all([
        Hub.db.loadChores(Hub.state.household_id),
        Hub.sb.from('chore_logs').select('*').eq('household_id', Hub.state.household_id),
        Hub.sb.from('household_members').select('*').eq('household_id', Hub.state.household_id)
      ]);

      const totalChores = chores.length;
      const pendingChores = chores.filter(c => c.status === 'pending').length;
      const completionRate = totalChores > 0 ? Math.round(((totalChores - pendingChores) / totalChores) * 100) : 0;

      // Last 7 days activity
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentLogs = logs.data?.filter(l => new Date(l.completed_at) >= weekAgo) || [];

      el.innerHTML = `
        <div class="space-y-6">
          <h3 class="text-xl font-bold">📈 System Statistics</h3>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-blue-900 bg-opacity-30 rounded-lg p-4">
              <p class="text-sm text-gray-400 mb-1">Total Chores</p>
              <p class="text-3xl font-bold text-blue-400">${totalChores}</p>
              <p class="text-xs text-gray-500 mt-2">${pendingChores} pending</p>
            </div>
            
            <div class="bg-green-900 bg-opacity-30 rounded-lg p-4">
              <p class="text-sm text-gray-400 mb-1">Completion Rate</p>
              <p class="text-3xl font-bold text-green-400">${completionRate}%</p>
              <p class="text-xs text-gray-500 mt-2">Current week</p>
            </div>
            
            <div class="bg-purple-900 bg-opacity-30 rounded-lg p-4">
              <p class="text-sm text-gray-400 mb-1">Last 7 Days</p>
              <p class="text-3xl font-bold text-purple-400">${recentLogs.length}</p>
              <p class="text-xs text-gray-500 mt-2">Completions</p>
            </div>
          </div>

          <div class="card bg-gray-800">
            <h4 class="font-bold mb-4">📊 Chores by Category</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              ${this._getChoresByCategory(chores)}
            </div>
          </div>

          <div class="card bg-gray-800">
            <h4 class="font-bold mb-4">👥 Team Activity</h4>
            <p class="text-sm text-gray-400 mb-3">Total family members: ${members.data?.length || 0}</p>
            <p class="text-sm text-gray-400">Total completions: ${logs.data?.length || 0}</p>
          </div>
        </div>
      `;

    } catch (e) {
      console.error('[Control] Stats error:', e);
      el.innerHTML = `<p class="text-red-400">Error: ${Hub.utils.esc(e.message)}</p>`;
    }
  },

  _getChoresByCategory(chores) {
    const categories = {};
    chores.forEach(c => {
      const cat = c.category || 'Uncategorized';
      categories[cat] = (categories[cat] || 0) + 1;
    });

    return Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `
        <div class="p-2 bg-gray-900 rounded">
          <p class="font-semibold">${Hub.utils.esc(cat)}</p>
          <p class="text-xs text-gray-400">${count} chores</p>
        </div>
      `).join('');
  },

  // ============================================================
  // SYSTEM LOGS TAB
  // ============================================================
  async loadSystemLogs() {
    const el = document.getElementById('adminLogsContent');
    if (!el) return;

    try {
      el.innerHTML = '<p class="text-gray-400">Loading logs...</p>';

      const { data: logs } = await Hub.sb
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      el.innerHTML = `
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold">📝 System Logs</h3>
            <div class="flex gap-2">
              <button id="btnLoadLogs" class="btn btn-secondary text-sm">🔄 Refresh</button>
              <button id="btnClearOldLogs" class="btn btn-danger text-sm">🗑️ Clear Old</button>
            </div>
          </div>

          ${logs && logs.length > 0 ? `
            <div class="space-y-2 max-h-96 overflow-y-auto">
              ${logs.map(log => {
                const statusColor = log.status === 'ok' ? 'text-green-400' : log.status === 'error' ? 'text-red-400' : 'text-yellow-400';
                return `
                  <div class="p-3 bg-gray-800 rounded">
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-semibold ${statusColor}">${Hub.utils.esc(log.service)}</span>
                      <span class="text-xs text-gray-500">${new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <p class="text-sm text-gray-400">${Hub.utils.esc(log.message || 'No message')}</p>
                    ${log.latency_ms ? `<p class="text-xs text-gray-500 mt-1">Latency: ${log.latency_ms}ms</p>` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          ` : '<p class="text-gray-500">No logs yet</p>'}
        </div>
      `;

      // Re-bind buttons
      this._rebindButtons();

    } catch (e) {
      console.error('[Control] Logs error:', e);
      el.innerHTML = `<p class="text-red-400">Error: ${Hub.utils.esc(e.message)}</p>`;
    }
  },

  async clearOldLogs() {
    if (!confirm('Delete logs older than 7 days?')) return;

    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      await Hub.sb
        .from('system_logs')
        .delete()
        .lt('created_at', weekAgo.toISOString());

      Hub.ui.toast('Old logs cleared', 'success');
      this.loadSystemLogs();
    } catch (e) {
      Hub.ui.toast('Failed to clear logs', 'error');
    }
  },

  // ============================================================
  // SITE CONTROL TAB (Existing functionality)
  // ============================================================
  async loadSiteControl() {
    const el = document.getElementById('adminSiteContent');
    const gate = document.getElementById('controlAdminGate');
    const status = document.getElementById('controlStatus');

    // Gate: admin only
    if (Hub.state?.userRole !== 'admin') {
      if (gate) gate.classList.remove('hidden');
      if (el) el.classList.add('hidden');
      return;
    }
    if (gate) gate.classList.add('hidden');
    if (el) el.classList.remove('hidden');

    if (status) status.textContent = 'Loading…';

    const siteName = (document.getElementById('controlSiteName')?.value || 'main').trim() || 'main';

    try {
      const row = await Hub.db.loadSiteControlSettings(Hub.state.household_id, siteName);
      this._loaded = row || null;
      this._fillForm(row || { site_name: siteName });
      this._renderPreview();
      this._renderSnippet();
      if (status) status.textContent = `Loaded ${siteName}${row ? '' : ' (new)'}`;
    } catch (e) {
      console.error('[Control] load error:', e);
      this._loaded = null;

      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('relation') && msg.includes('does not exist')) {
        if (status) status.textContent = 'Missing table: site_control_settings — run migration-site-control.sql';
        this._showMissingTable();
        return;
      }

      if (status) status.textContent = 'Load failed: ' + (e.message || 'error');
      this._renderPreview({ error: e.message || 'error' });
      this._renderSnippet();
    }
  },

  async saveSiteControl() {
    const status = document.getElementById('controlStatus');
    if (Hub.state?.userRole !== 'admin') {
      Hub.ui.toast('Admin only', 'error');
      return;
    }

    const siteName = (document.getElementById('controlSiteName')?.value || 'main').trim() || 'main';

    const payload = {
      base_url: (document.getElementById('controlBaseUrl')?.value || '').trim() || null,
      maintenance_mode: !!document.getElementById('controlMaintenance')?.checked,
      banner_message: (document.getElementById('controlBannerMessage')?.value || '').trim() || null,
      banner_severity: (document.getElementById('controlBannerSeverity')?.value || 'info').trim(),
      disabled_paths: this._parseLines(document.getElementById('controlDisabledPaths')?.value || ''),
      public_read: !!document.getElementById('controlPublicRead')?.checked
    };

    try {
      if (status) status.textContent = 'Saving…';
      const saved = await Hub.db.saveSiteControlSettings(Hub.state.household_id, siteName, Hub.state.user?.id, payload);
      this._loaded = saved;
      this._fillForm(saved);
      this._renderPreview();
      this._renderSnippet();
      if (status) status.textContent = 'Saved ✓';
      Hub.ui.toast('Saved control settings', 'success');
    } catch (e) {
      console.error('[Control] save error:', e);
      if (status) status.textContent = 'Save failed: ' + (e.message || 'error');
      Hub.ui.toast('Save failed', 'error');
    }
  },

  // ============================================================
  // HELPER METHODS
  // ============================================================
  
  _rebindButtons() {
    // Helper to rebind dynamically created buttons
    const buttons = {
      'btnResetDailyChores': () => this.resetDailyChores(true),
      'btnViewChoreStats': () => this.loadChoreStats(),
      'btnEnableAutoReset': () => this.toggleAutoReset(true),
      'btnDisableAutoReset': () => this.toggleAutoReset(false),
      'btnLoadUsers': () => this.loadUsers(),
      'btnAddUser': () => this.showAddUserModal(),
      'btnLoadLogs': () => this.loadSystemLogs(),
      'btnClearOldLogs': () => this.clearOldLogs(),
      'btnRefreshOverview': () => this.loadOverview()
    };

    Object.entries(buttons).forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el && !el._bound) {
        el._bound = true;
        el.addEventListener('click', fn);
      }
    });
  },

  _fillForm(row) {
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = v == null ? '' : String(v);
    };
    const setChk = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = !!v;
    };

    setVal('controlSiteName', row.site_name || 'main');
    setVal('controlBaseUrl', row.base_url || '');
    setChk('controlMaintenance', row.maintenance_mode);
    setVal('controlBannerMessage', row.banner_message || '');
    setVal('controlBannerSeverity', row.banner_severity || 'info');
    setChk('controlPublicRead', row.public_read);

    const paths = Array.isArray(row.disabled_paths) ? row.disabled_paths : [];
    setVal('controlDisabledPaths', paths.join('\n'));
  },

  _parseLines(text) {
    return String(text)
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 200);
  },

  _toPublicJson() {
    const row = this._loaded || {
      site_name: (document.getElementById('controlSiteName')?.value || 'main').trim() || 'main',
      base_url: (document.getElementById('controlBaseUrl')?.value || '').trim() || null,
      maintenance_mode: !!document.getElementById('controlMaintenance')?.checked,
      banner_message: (document.getElementById('controlBannerMessage')?.value || '').trim() || null,
      banner_severity: (document.getElementById('controlBannerSeverity')?.value || 'info').trim(),
      disabled_paths: this._parseLines(document.getElementById('controlDisabledPaths')?.value || ''),
      public_read: !!document.getElementById('controlPublicRead')?.checked,
      updated_at: null
    };

    return {
      site_name: row.site_name || 'main',
      base_url: row.base_url || null,
      maintenance_mode: !!row.maintenance_mode,
      banner: {
        message: row.banner_message || null,
        severity: row.banner_severity || 'info'
      },
      disabled_paths: Array.isArray(row.disabled_paths) ? row.disabled_paths : [],
      public_read: !!row.public_read,
      updated_at: row.updated_at || null
    };
  },

  _renderPreview(objOverride) {
    const pre = document.getElementById('controlJsonPreview');
    if (!pre) return;
    const obj = objOverride || this._toPublicJson();
    pre.textContent = JSON.stringify(obj, null, 2);
  },

  _renderSnippet() {
    const pre = document.getElementById('controlSnippet');
    if (!pre) return;

    const cfg = window.HOME_HUB_CONFIG || {};
    const supabaseUrl = cfg.supabaseUrl || cfg.supabase?.url || '<YOUR_SUPABASE_URL>';
    const anonKey = cfg.supabaseAnonKey || cfg.supabase?.anonKey || '<YOUR_SUPABASE_ANON_KEY>';
    const householdId = Hub.state?.household_id || '<HOUSEHOLD_UUID>';
    const siteName = (document.getElementById('controlSiteName')?.value || 'main').trim() || 'main';

    const rest = `${supabaseUrl}/rest/v1/site_control_settings?select=site_name,base_url,maintenance_mode,banner_message,banner_severity,disabled_paths,public_read,updated_at&household_id=eq.${householdId}&site_name=eq.${encodeURIComponent(siteName)}`;

    pre.textContent = `// Remote config fetch
async function fetchSiteControl() {
  const url = ${JSON.stringify(rest)};
  const resp = await fetch(url, {
    headers: {
      'apikey': ${JSON.stringify(anonKey)},
      'Authorization': 'Bearer ' + ${JSON.stringify(anonKey)}
    }
  });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows?.[0] || null;
}`;
  },

  async _copyJson() {
    const text = document.getElementById('controlJsonPreview')?.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      Hub.ui.toast('Copied', 'success');
    } catch (e) {
      Hub.ui.toast('Copy failed', 'error');
    }
  },

  _showMissingTable() {
    const pre = document.getElementById('controlJsonPreview');
    if (pre) {
      pre.textContent = JSON.stringify({
        error: 'Missing table: site_control_settings',
        fix: 'Run migration-site-control.sql in Supabase SQL Editor'
      }, null, 2);
    }
  }
};
