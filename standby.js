// ============================================================
// assets/control.js — Simple Working Admin Control (v4 - FIXED)
// ============================================================
window.Hub = window.Hub || {};

Hub.control = {
  _loaded: null,
  _resetCheckInterval: null,

  init() {
    console.log('[Control] Init started');
    
    // Bind existing buttons
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (!el || el._bound) return;
      el._bound = true;
      el.addEventListener('click', fn);
    };

    bind('btnControlLoad', () => this.load());
    bind('btnControlSave', () => this.save());
    bind('btnControlCopyJson', () => this._copyJson());
    
    // Start auto-reset checker
    this.startAutoResetChecker();
    
    // Add admin controls
    setTimeout(() => this.addAdminControls(), 500);
  },

  // ============================================================
  // ADD ADMIN CONTROLS TO EXISTING PAGE
  // ============================================================
  addAdminControls() {
    console.log('[Control] Adding admin controls');
    const controlContent = document.getElementById('controlContent');
    if (!controlContent) {
      console.log('[Control] controlContent not found, retrying...');
      setTimeout(() => this.addAdminControls(), 500);
      return;
    }

    // Check if already added
    if (document.getElementById('adminControlsSection')) {
      console.log('[Control] Admin controls already added');
      return;
    }

    const autoResetEnabled = localStorage.getItem('chore_auto_reset_enabled') === 'true';
    const lastReset = localStorage.getItem('chore_last_reset_date');
    
    const adminHTML = `
      <div id="adminControlsSection" class="space-y-6 mb-8">
        <!-- Admin Stats -->
        <div class="card bg-blue-900 bg-opacity-30">
          <h2 class="text-xl font-bold mb-4">🔧 Admin Dashboard</h2>
          <div id="adminStats">
            <p class="text-gray-400">Loading stats...</p>
          </div>
        </div>

        <!-- Chore Reset Control -->
        <div class="card ${autoResetEnabled ? 'bg-green-900 bg-opacity-20 border border-green-600' : 'bg-gray-800'}">
          <h2 class="text-xl font-bold mb-4">🔄 Automatic Chore Reset</h2>
          
          <div class="mb-4 p-4 bg-gray-900 rounded-lg">
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold">Status:</span>
              <span class="${autoResetEnabled ? 'text-green-400' : 'text-gray-400'} font-bold">
                ${autoResetEnabled ? '✓ ENABLED' : '○ DISABLED'}
              </span>
            </div>
            ${lastReset ? `
              <p class="text-sm text-gray-400">Last reset: ${new Date(lastReset).toLocaleString()}</p>
            ` : ''}
          </div>

          <div class="space-y-3">
            <button id="btnToggleAutoReset" class="btn ${autoResetEnabled ? 'btn-danger' : 'btn-success'} w-full">
              ${autoResetEnabled ? '⏸️ Disable Auto-Reset' : '▶️ Enable Auto-Reset'}
            </button>
            
            <button id="btnManualResetChores" class="btn btn-primary w-full">
              🔄 Reset All Chores Now (Manual)
            </button>
            
            <button id="btnViewChoreStats" class="btn btn-secondary w-full">
              📊 View Completion Statistics
            </button>
          </div>

          <div class="mt-4 p-3 bg-gray-900 rounded text-sm text-gray-400">
            <p class="font-semibold mb-2">How it works:</p>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>Daily chores:</strong> Reset at midnight every day</li>
              <li><strong>Weekly chores:</strong> Reset on their assigned day</li>
              <li><strong>Logs preserved:</strong> Completion history never deleted</li>
              <li><strong>Automatic:</strong> Works even when you're not logged in</li>
            </ul>
          </div>
        </div>

        <!-- Statistics Display -->
        <div id="choreStatsSection" class="card bg-gray-800 hidden">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">📊 Chore Statistics</h2>
            <button id="btnHideStats" class="btn btn-secondary text-sm">← Back</button>
          </div>
          <div id="choreStatsContent">
            <p class="text-gray-400">Loading...</p>
          </div>
        </div>
      </div>
    `;

    // Insert at the top
    controlContent.insertAdjacentHTML('afterbegin', adminHTML);
    
    // Bind new buttons
    this._bindAdminButtons();
    
    // Load stats
    this.loadStats();
    
    console.log('[Control] Admin controls added successfully');
  },

  _bindAdminButtons() {
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (!el || el._bound) return;
      el._bound = true;
      el.addEventListener('click', fn);
      console.log('[Control] Bound button:', id);
    };

    bind('btnToggleAutoReset', () => this.toggleAutoReset());
    bind('btnManualResetChores', () => this.manualResetChores());
    bind('btnViewChoreStats', () => this.showStats());
    bind('btnHideStats', () => this.hideStats());
  },

  // ============================================================
  // LOAD STATS
  // ============================================================
  async loadStats() {
    const el = document.getElementById('adminStats');
    if (!el) return;

    try {
      const chores = await Hub.db.loadChores(Hub.state.household_id);
      const totalChores = chores.length;
      const pendingChores = chores.filter(c => c.status === 'pending').length;
      const doneChores = totalChores - pendingChores;
      const completionRate = totalChores > 0 ? Math.round((doneChores / totalChores) * 100) : 0;

      el.innerHTML = `
        <div class="grid grid-cols-3 gap-4">
          <div class="text-center">
            <p class="text-3xl font-bold text-blue-400">${totalChores}</p>
            <p class="text-sm text-gray-400">Total Chores</p>
          </div>
          <div class="text-center">
            <p class="text-3xl font-bold text-yellow-400">${pendingChores}</p>
            <p class="text-sm text-gray-400">Pending</p>
          </div>
          <div class="text-center">
            <p class="text-3xl font-bold text-green-400">${completionRate}%</p>
            <p class="text-sm text-gray-400">Completed</p>
          </div>
        </div>
      `;
    } catch (e) {
      console.error('[Control] Stats error:', e);
      el.innerHTML = '<p class="text-red-400">Failed to load stats</p>';
    }
  },

  // ============================================================
  // AUTO-RESET FUNCTIONALITY
  // ============================================================
  
  startAutoResetChecker() {
    console.log('[Control] Starting auto-reset checker');
    
    // Clear any existing interval
    if (this._resetCheckInterval) {
      clearInterval(this._resetCheckInterval);
    }
    
    // Check every 30 seconds
    this._resetCheckInterval = setInterval(() => {
      this.checkAndReset();
    }, 30000);
    
    // Also check immediately
    setTimeout(() => this.checkAndReset(), 2000);
  },

  async checkAndReset() {
    const enabled = localStorage.getItem('chore_auto_reset_enabled') === 'true';
    if (!enabled) {
      console.log('[Control] Auto-reset disabled, skipping check');
      return;
    }

    const now = new Date();
    const lastReset = localStorage.getItem('chore_last_reset_date');
    const lastResetDate = lastReset ? new Date(lastReset) : null;
    
    // Check if we need to reset (new day)
    const needsReset = !lastResetDate || 
                      lastResetDate.toDateString() !== now.toDateString();
    
    if (needsReset) {
      console.log('[Control] Auto-reset triggered - new day detected');
      await this.performReset(false);
    } else {
      console.log('[Control] Auto-reset check: already reset today');
    }
  },

  async performReset(isManual = false) {
    try {
      console.log('[Control] Performing chore reset...');
      
      if (!Hub.state.household_id) {
        console.error('[Control] No household_id');
        if (isManual) Hub.ui.toast('Error: No household ID', 'error');
        return;
      }

      // Get all chores
      const chores = await Hub.db.loadChores(Hub.state.household_id);
      console.log('[Control] Loaded', chores.length, 'chores');
      
      const today = new Date().getDay(); // 0=Sun, 1=Mon, etc.
      
      // Filter chores to reset
      const choresToReset = chores.filter(c => {
        // Only reset done chores
        if (c.status !== 'done') return false;
        
        // Daily chores
        if (c.category === 'Daily') return true;
        
        // Weekly chores for today
        if (typeof c.day_of_week === 'number' && c.day_of_week === today) return true;
        
        // Fallback: parse category
        if (c.day_of_week == null && c.category && Hub.chores?.DAY_MAP) {
          const dayNum = Hub.chores.DAY_MAP[c.category];
          if (dayNum === today) return true;
        }
        
        return false;
      });

      console.log('[Control] Resetting', choresToReset.length, 'chores');

      // Reset each chore
      for (const chore of choresToReset) {
        await Hub.sb
          .from('chores')
          .update({ status: 'pending' })
          .eq('id', chore.id);
      }

      // Update last reset time
      localStorage.setItem('chore_last_reset_date', new Date().toISOString());

      console.log('[Control] Reset complete!');
      
      if (isManual) {
        Hub.ui.toast(`Reset ${choresToReset.length} chores successfully!`, 'success');
        this.addAdminControls(); // Refresh UI
        this.loadStats();
      }

      // Refresh dashboard if visible
      if (Hub.router?.current === 'dashboard') {
        setTimeout(() => Hub.chores?.renderDashboard?.(), 500);
      }

    } catch (e) {
      console.error('[Control] Reset error:', e);
      if (isManual) Hub.ui.toast('Reset failed: ' + e.message, 'error');
    }
  },

  // ============================================================
  // USER ACTIONS
  // ============================================================
  
  toggleAutoReset() {
    const currentState = localStorage.getItem('chore_auto_reset_enabled') === 'true';
    const newState = !currentState;
    
    localStorage.setItem('chore_auto_reset_enabled', newState ? 'true' : 'false');
    
    if (newState) {
      Hub.ui.toast('✓ Auto-reset ENABLED! Chores will reset at midnight.', 'success');
      // Check if we need to reset now
      this.checkAndReset();
    } else {
      Hub.ui.toast('Auto-reset disabled', 'success');
    }
    
    // Refresh UI
    this.addAdminControls();
  },

  async manualResetChores() {
    if (!confirm('Reset all daily chores to pending now?\n\nCompletion logs will be preserved for statistics.')) {
      return;
    }
    
    await this.performReset(true);
  },

  async showStats() {
    const section = document.getElementById('choreStatsSection');
    const content = document.getElementById('choreStatsContent');
    if (!section || !content) return;

    section.classList.remove('hidden');
    content.innerHTML = '<p class="text-gray-400">Loading statistics...</p>';

    try {
      // Get completion logs
      const { data: logs } = await Hub.sb
        .from('chore_logs')
        .select('*, chores(title, category)')
        .eq('household_id', Hub.state.household_id)
        .order('completed_at', { ascending: false })
        .limit(50);

      if (!logs || logs.length === 0) {
        content.innerHTML = '<p class="text-gray-400">No completion history yet</p>';
        return;
      }

      const totalCompletions = logs.length;
      
      // Last 7 days
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const last7Days = logs.filter(l => new Date(l.completed_at) >= weekAgo).length;

      // By member
      const byMember = {};
      logs.forEach(log => {
        const member = log.completed_by_name || 'Unknown';
        byMember[member] = (byMember[member] || 0) + 1;
      });

      content.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div class="bg-blue-900 bg-opacity-30 rounded-lg p-4 text-center">
            <p class="text-3xl font-bold text-blue-400">${totalCompletions}</p>
            <p class="text-sm text-gray-400">Total Completions</p>
          </div>
          <div class="bg-green-900 bg-opacity-30 rounded-lg p-4 text-center">
            <p class="text-3xl font-bold text-green-400">${last7Days}</p>
            <p class="text-sm text-gray-400">Last 7 Days</p>
          </div>
        </div>

        <div class="mb-6">
          <h3 class="font-bold mb-3">By Family Member</h3>
          <div class="space-y-2">
            ${Object.entries(byMember).sort((a, b) => b[1] - a[1]).map(([member, count]) => `
              <div class="flex items-center justify-between p-3 bg-gray-900 rounded">
                <span class="font-semibold">${Hub.utils.esc(member)}</span>
                <span class="text-gray-400">${count} chores</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div>
          <h3 class="font-bold mb-3">Recent Completions</h3>
          <div class="space-y-2 max-h-64 overflow-y-auto">
            ${logs.slice(0, 15).map(log => `
              <div class="p-2 bg-gray-900 rounded text-sm">
                <p class="font-semibold">${Hub.utils.esc(log.chores?.title || 'Deleted chore')}</p>
                <p class="text-xs text-gray-400">
                  ${Hub.utils.esc(log.completed_by_name || 'Unknown')} • 
                  ${new Date(log.completed_at).toLocaleString()}
                </p>
              </div>
            `).join('')}
          </div>
        </div>
      `;

    } catch (e) {
      console.error('[Control] Stats error:', e);
      content.innerHTML = '<p class="text-red-400">Failed to load statistics</p>';
    }
  },

  hideStats() {
    const section = document.getElementById('choreStatsSection');
    if (section) section.classList.add('hidden');
  },

  // ============================================================
  // EXISTING SITE CONTROL METHODS
  // ============================================================
  
  async load() {
    const gate = document.getElementById('controlAdminGate');
    const content = document.getElementById('controlContent');
    const status = document.getElementById('controlStatus');

    // Gate: admin only
    if (Hub.state?.userRole !== 'admin') {
      if (gate) gate.classList.remove('hidden');
      if (content) content.classList.add('hidden');
      return;
    }
    if (gate) gate.classList.add('hidden');
    if (content) content.classList.remove('hidden');

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
        if (status) status.textContent = 'Missing table: site_control_settings';
        this._showMissingTable();
        return;
      }

      if (status) status.textContent = 'Load failed: ' + (e.message || 'error');
      this._renderPreview({ error: e.message || 'error' });
      this._renderSnippet();
    }
  },

  async save() {
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
    const supabaseUrl = cfg.supabaseUrl || '<YOUR_SUPABASE_URL>';
    const anonKey = cfg.supabaseAnonKey || '<YOUR_SUPABASE_ANON_KEY>';
    const householdId = Hub.state?.household_id || '<HOUSEHOLD_UUID>';
    const siteName = (document.getElementById('controlSiteName')?.value || 'main').trim() || 'main';

    const rest = `${supabaseUrl}/rest/v1/site_control_settings?select=*&household_id=eq.${householdId}&site_name=eq.${encodeURIComponent(siteName)}`;

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
