// ============================================================
// public/assets/control.js — Admin Panel
// Tabs: Household | Chores | System | Media | Display | Debug | Simulate
// ============================================================
window.Hub = window.Hub || {};

Hub.control = {
  _activeTab:  'household',
  _eventLog:   [],
  _lastFps:    0,
  _startTime:  null,

  init() {
    console.log('[Admin] Init');
    this.startAutoResetChecker?.();
    this._trackFPS();
    this._hookEventLog();
  },

  load() {
    const el = document.getElementById('adminTabContent');
    if (!el) return;

    if (Hub.state?.userRole !== 'admin') {
      el.innerHTML = `
        <div class="card text-center py-12">
          <p class="text-4xl mb-4">🔒</p>
          <h2 class="text-2xl font-bold mb-2">Admin Only</h2>
          <p class="text-gray-400 mb-6">You need admin access to use this panel.</p>
          <button onclick="Hub.router.go('settings')" class="btn btn-secondary">← Back to Settings</button>
        </div>`;
      return;
    }

    this.switchTab(this._activeTab);
  },

  onLeave() {},

  // ── Tab switching ──────────────────────────────────────────

  switchTab(tab) {
    this._activeTab = tab;

    // Update tab button styles
    document.querySelectorAll('[id^="adminTab_"]').forEach(b => {
      b.className = 'admin-tab' + (b.id === `adminTab_${tab}` ? ' admin-tab-active' : '');
    });

    // Update subtitle
    const subtitles = {
      household: 'Members, roles & household stats',
      chores:    'Reset controls, schedule & history',
      system:    'Kiosk controls & app management',
      media:     'Audio, photos & player debug',
      display:   'Theme, filters & accessibility',
      debug:     'Performance, logs & diagnostics',
      simulate:  'Inject test data & simulate states',
    };
    const sub = document.getElementById('adminSubtitle');
    if (sub) sub.textContent = subtitles[tab] || 'Admin control console';

    const content = document.getElementById('adminTabContent');
    if (!content) return;

    content.innerHTML = '<div class="text-gray-500 text-center py-6 text-sm">Loading…</div>';
    requestAnimationFrame(() => {
      content.innerHTML = this._renderTab(tab);
      if (tab === 'household') this._loadHouseholdTab();
      if (tab === 'chores')    this._loadChoresTab();
      if (tab === 'debug')     { this._renderLog(); this._renderSystemStats(); }
    });
  },

  _renderTab(tab) {
    const map = {
      household: this._tabHousehold(),
      chores:    this._tabChores(),
      system:    this._tabSystem(),
      media:     this._tabMedia(),
      display:   this._tabDisplay(),
      debug:     this._tabDebug(),
      simulate:  this._tabSimulate(),
    };
    return map[tab] || '';
  },

  // ── HOUSEHOLD TAB ─────────────────────────────────────────

  _tabHousehold() {
    return `
      <!-- Stats row -->
      <div class="grid grid-cols-3 gap-3 mb-5">
        <div class="admin-stat"><div class="admin-stat-val text-blue-400" id="hstat-members">—</div><div class="admin-stat-label">Members</div></div>
        <div class="admin-stat"><div class="admin-stat-val text-green-400" id="hstat-chores">—</div><div class="admin-stat-label">Chores</div></div>
        <div class="admin-stat"><div class="admin-stat-val text-yellow-400" id="hstat-grocery">—</div><div class="admin-stat-label">Grocery</div></div>
      </div>

      <!-- Members -->
      <div class="card mb-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold">Household Members</h3>
          <span class="text-xs text-gray-500" id="householdName"></span>
        </div>
        <div id="membersList" class="space-y-2">
          <div class="skeleton" style="height:48px;border-radius:.5rem;"></div>
          <div class="skeleton" style="height:48px;border-radius:.5rem;"></div>
        </div>
      </div>

      <!-- Invited emails -->
      <div class="card">
        <h3 class="font-bold mb-3">Allowed Email Addresses</h3>
        <p class="text-xs text-gray-500 mb-3">Only these emails can sign in to this household.</p>
        <div id="allowedEmailsList" class="space-y-2 mb-3">
          <div class="skeleton" style="height:36px;border-radius:.5rem;"></div>
        </div>
      </div>
    `;
  },

  async _loadHouseholdTab() {
    const hhId = Hub.state?.household_id;
    if (!hhId) return;

    try {
      // Load members, chores count, grocery count in parallel
      const [members, chores, grocery, allowed] = await Promise.all([
        Hub.db.loadMemberNames(hhId).catch(() => []),
        Hub.sb.from('chores').select('id,status', {count:'exact'}).eq('household_id',hhId).then(r => r.data || []),
        Hub.sb.from('grocery_items').select('id,done', {count:'exact'}).eq('household_id',hhId).then(r => r.data || []),
        Hub.sb.from('allowed_emails').select('email').eq('household_id',hhId).then(r => r.data || []),
      ]);

      // Stats
      const doneChores    = chores.filter(c => c.status === 'done').length;
      const pendingChores = chores.filter(c => c.status === 'pending').length;
      const groceryLeft   = grocery.filter(g => !g.done).length;

      document.getElementById('hstat-members').textContent = members.length;
      document.getElementById('hstat-chores').textContent  = `${doneChores}/${chores.length}`;
      document.getElementById('hstat-grocery').textContent = groceryLeft;

      // Members list
      const roleColors = { admin: 'text-red-400 bg-red-900/20', member: 'text-blue-400 bg-blue-900/20' };
      document.getElementById('membersList').innerHTML = members.map(m => `
        <div class="flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-800/60">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-blue-900 flex items-center justify-center text-sm font-bold text-blue-300">
              ${(m.name || m.email || '?')[0].toUpperCase()}
            </div>
            <div>
              <p class="text-sm font-semibold">${Hub.utils.esc(m.name || '—')}</p>
              <p class="text-xs text-gray-500">${Hub.utils.esc(m.email)}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs px-2 py-0.5 rounded-full font-semibold ${roleColors[m.role] || 'text-gray-400 bg-gray-700'}">
              ${m.role}
            </span>
            ${m.email !== Hub.state?.user?.email ? `
              <button onclick="Hub.control._editMemberName('${Hub.utils.esc(m.email)}', '${Hub.utils.esc(m.name || '')}')"
                class="text-xs text-gray-500 hover:text-white px-1.5 py-0.5 rounded border border-gray-700 hover:border-gray-500 transition">
                ✏️
              </button>` : '<span class="text-xs text-gray-600 italic">you</span>'}
          </div>
        </div>`).join('');

      // Allowed emails
      document.getElementById('allowedEmailsList').innerHTML = allowed.map(a => `
        <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/40 text-sm">
          <span class="text-gray-300">${Hub.utils.esc(a.email)}</span>
        </div>`).join('') || '<p class="text-gray-500 text-sm">No entries</p>';

    } catch (e) {
      console.error('[Admin] Household load error:', e);
    }
  },

  async _editMemberName(email, currentName) {
    const name = prompt(`New display name for ${email}:`, currentName);
    if (!name || name.trim() === currentName) return;
    try {
      await Hub.sb.from('household_members')
        .update({ name: name.trim() })
        .eq('household_id', Hub.state.household_id)
        .eq('email', email);
      Hub.ui?.toast?.('Name updated ✓', 'success');
      this._loadHouseholdTab();
      // Refresh global state
      const members = await Hub.db.loadMemberNames(Hub.state.household_id).catch(() => []);
      Hub.state.members = members;
      if (window.HOME_HUB_CONFIG) window.HOME_HUB_CONFIG.familyMembers = members.map(m => m.name).filter(Boolean);
    } catch (e) {
      Hub.ui?.toast?.('Update failed: ' + e.message, 'error');
    }
  },

  // ── CHORES TAB ────────────────────────────────────────────

  _tabChores() {
    return `
      <!-- Stats row -->
      <div class="grid grid-cols-4 gap-3 mb-5">
        <div class="admin-stat"><div class="admin-stat-val text-green-400" id="cstat-done">—</div><div class="admin-stat-label">Done today</div></div>
        <div class="admin-stat"><div class="admin-stat-val text-yellow-400" id="cstat-pending">—</div><div class="admin-stat-label">Pending</div></div>
        <div class="admin-stat"><div class="admin-stat-val text-blue-400" id="cstat-total">—</div><div class="admin-stat-label">Total</div></div>
        <div class="admin-stat"><div class="admin-stat-val text-purple-400" id="cstat-logs">—</div><div class="admin-stat-label">Logged 7d</div></div>
      </div>

      <!-- Reset controls -->
      <div class="card mb-4">
        <h3 class="font-bold mb-3">Reset Controls</h3>
        <div class="grid grid-cols-2 gap-3">
          <button onclick="Hub.control.manualChoreReset()" class="admin-tile danger">
            <span class="text-xl">🔄</span>
            <span class="text-sm font-semibold">Reset Today's Chores</span>
            <span class="text-xs text-gray-400">Daily + today's weekday category</span>
          </button>
          <button onclick="Hub.control.forceResetAll()" class="admin-tile danger">
            <span class="text-xl">⚠️</span>
            <span class="text-sm font-semibold">Force Reset All</span>
            <span class="text-xs text-gray-400">Reset every chore regardless of day</span>
          </button>
        </div>
        <div class="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
          <div>
            <p class="text-sm font-medium">Auto-reset via cron</p>
            <p class="text-xs text-gray-500">Runs daily at 5am UTC (midnight EST)</p>
          </div>
          <span class="text-xs px-2 py-1 rounded-full bg-green-900/40 text-green-400 font-semibold">Vercel Cron ✓</span>
        </div>
      </div>

      <!-- Recent chore log -->
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold">Recent Completions</h3>
          <span class="text-xs text-gray-500">Last 20</span>
        </div>
        <div id="choreLogList" class="space-y-1.5 max-h-64 overflow-y-auto">
          <div class="skeleton" style="height:32px;border-radius:.4rem;"></div>
          <div class="skeleton" style="height:32px;border-radius:.4rem;"></div>
          <div class="skeleton" style="height:32px;border-radius:.4rem;"></div>
        </div>
      </div>
    `;
  },

  async _loadChoresTab() {
    const hhId = Hub.state?.household_id;
    if (!hhId) return;
    try {
      const [chores, logs] = await Promise.all([
        Hub.sb.from('chores').select('id,status,category').eq('household_id', hhId).then(r => r.data || []),
        Hub.sb.from('chore_logs').select('notes,completed_at,completed_by').eq('household_id', hhId)
          .order('completed_at', {ascending: false}).limit(20).then(r => r.data || []),
      ]);

      const since7d = new Date(Date.now() - 7*86400000).toISOString();
      const logs7d  = logs.filter(l => l.completed_at >= since7d);

      document.getElementById('cstat-done').textContent    = chores.filter(c => c.status==='done').length;
      document.getElementById('cstat-pending').textContent = chores.filter(c => c.status==='pending').length;
      document.getElementById('cstat-total').textContent   = chores.length;
      document.getElementById('cstat-logs').textContent    = logs7d.length;

      if (!logs.length) {
        document.getElementById('choreLogList').innerHTML = '<p class="text-gray-500 text-sm">No completions logged yet.</p>';
        return;
      }

      document.getElementById('choreLogList').innerHTML = logs.map(l => {
        const m    = (l.notes || '').match(/Completed by (.+)/);
        const who  = m ? m[1] : '?';
        const when = new Date(l.completed_at).toLocaleString('en-US', {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
        const task = (l.notes || '').replace(/Completed by .+$/, '').trim() || 'Chore';
        return `<div class="flex items-center justify-between px-3 py-1.5 rounded bg-gray-800/40 text-sm">
          <span class="text-gray-300">${Hub.utils.esc(who)}</span>
          <span class="text-xs text-gray-500">${Hub.utils.esc(when)}</span>
        </div>`;
      }).join('');
    } catch (e) {
      console.error('[Admin] Chores tab error:', e);
    }
  },

  // ── SYSTEM TAB ────────────────────────────────────────────

  _tabSystem() {
    const kioskCmd = `chromium-browser --app=${location.origin}/#/dashboard --start-fullscreen --noerrdialogs --disable-infobars`;
    return `
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        ${this._tile('⛶','Fullscreen','Enter kiosk mode','Hub.ui.enterFullscreen()')}
        ${this._tile('✕','Exit Fullscreen','Return to window','Hub.ui.exitFullscreen()')}
        ${this._tile('🔒','Lock Fullscreen','Auto re-enter on exit','Hub.control.lockFullscreen()')}
        ${this._tile('💤','Force Standby','Enter standby now','Hub.router.go("standby")')}
        ${this._tile('☀️','Wake Screen','Exit standby','Hub.router.go("dashboard")')}
        ${this._tile('😴','Wake Lock','Prevent screen sleep','Hub.control.requestWakeLock()')}
        ${this._tile('🔄','Reload App','Hard reload page','location.reload()')}
        ${this._tile('🧹','Clear Cache','Delete service worker cache','Hub.control.clearCache()')}
        ${this._tile('🚫','No Context Menu','Disable right-click','Hub.control.disableContextMenu()')}
        ${this._tile('📵','Disable Back Nav','Prevent accidental back','Hub.control.preventBack()')}
        ${this._tile('⚙️','Reset Settings','Clear hub_* localStorage','Hub.control.resetSettings()')}
        ${this._tile('🧒','Kid Mode','Lock destructive buttons','Hub.control.toggleKidMode()')}
      </div>
      ${this._renderPwaCard()}
      <div class="card mt-4">
        <p class="text-xs text-gray-500 mb-2">Kiosk launch command:</p>
        <div class="flex gap-2">
          <code class="flex-1 text-xs bg-gray-900 text-green-400 p-2 rounded break-all">${Hub.utils.esc(kioskCmd)}</code>
          <button onclick="navigator.clipboard.writeText('${Hub.utils.esc(kioskCmd)}').then(()=>Hub.ui.toast('Copied','success'))"
            class="btn btn-secondary text-xs flex-shrink-0">Copy</button>
        </div>
      </div>
    `;
  },

  // ── MEDIA TAB ─────────────────────────────────────────────

  _tabMedia() { return `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
      ${this._tile('🔇','Kill Audio','Stop all playback','Hub.control.silenceAll()')}
      ${this._tile('🔄','Reload Stream','Force restart radio','Hub.control.reloadStream()')}
      ${this._tile('▶️','Unlock Audio','Force browser audio resume','Hub.control.unlockAudio()')}
      ${this._tile('⏭','Next Photo','Skip slideshow forward','Hub.control.slideshowNext()')}
      ${this._tile('⏮','Prev Photo','Back one image','Hub.control.slideshowPrev()')}
      ${this._tile('🔀','Shuffle Photos','Re-randomize order','Hub.control.slideshowShuffle()')}
    </div>
    <div class="card">
      <h3 class="font-bold mb-3 text-sm text-gray-400 uppercase tracking-wide">Volume</h3>
      <div class="flex items-center gap-3">
        <span class="text-sm w-12 text-gray-400">Vol</span>
        <input type="range" min="0" max="1" step="0.05"
          value="${Hub.player?.state?.volume ?? 0.7}"
          oninput="Hub.player?.setVolume(parseFloat(this.value));document.getElementById('adminVolVal').textContent=Math.round(this.value*100)+'%'"
          class="flex-1" style="accent-color:#3b82f6;">
        <span id="adminVolVal" class="text-sm w-10 text-right">${Math.round((Hub.player?.state?.volume ?? 0.7)*100)}%</span>
      </div>
    </div>
    <div class="card mt-3">
      <h3 class="font-bold mb-2 text-sm text-gray-400 uppercase tracking-wide">Audio State</h3>
      <div class="grid grid-cols-2 gap-2 text-xs font-mono" id="audioDebugCard">
        <div class="bg-gray-900 rounded p-2"><span class="text-gray-500">Source</span><br><span class="text-blue-400">${Hub.player?.state?.currentSource || '—'}</span></div>
        <div class="bg-gray-900 rounded p-2"><span class="text-gray-500">Status</span><br><span class="text-green-400">${Hub.player?.state?.radioStatus || '—'}</span></div>
        <div class="bg-gray-900 rounded p-2"><span class="text-gray-500">Playing</span><br><span class="${Hub.player?.state?.isPlaying ? 'text-green-400' : 'text-red-400'}">${Hub.player?.state?.isPlaying ? 'yes' : 'no'}</span></div>
        <div class="bg-gray-900 rounded p-2"><span class="text-gray-500">Ready</span><br><span class="text-yellow-400">${Hub.player?._audio?.readyState ?? '—'}</span></div>
      </div>
    </div>
  `; },

  // ── DISPLAY TAB ───────────────────────────────────────────

  _tabDisplay() { return `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
      ${this._tile('🌙','Night Mode','Warm dark filter','Hub.control.toggleNightMode()')}
      ${this._tile('☀️','Day Mode','Clear all filters','Hub.control.clearFilters()')}
      ${this._tile('🔆','High Contrast','Accessibility mode','Hub.control.toggleHighContrast()')}
      ${this._tile('📝','Large Text','Increase base font size','Hub.control.toggleLargeText()')}
      ${this._tile('🚫','No Animations','Stop all motion','document.body.classList.toggle("reduce-motion");Hub.ui.toast("Motion toggled","info")')}
      ${this._tile('💧','Tap Ripples','Visual touch feedback','Hub.control.toggleTapRipples()')}
    </div>
    <div class="card space-y-4">
      <h3 class="font-bold text-sm text-gray-400 uppercase tracking-wide">Theme</h3>
      ${this._slider('Accent Hue','accentHue','0','360','220','Hub.control.setAccentHue(this.value)')}
      ${this._slider('Background Dim','bgDim','0','100','11','Hub.control.setBgDim(this.value)')}
      ${this._slider('Saturation','satVal','0','200','100','Hub.control.setSaturation(this.value)')}
    </div>
  `; },

  // ── DEBUG TAB ─────────────────────────────────────────────

  _tabDebug() { return `
    <div class="grid grid-cols-3 gap-3 mb-4">
      <div class="admin-stat"><div class="admin-stat-val text-green-400" id="adminFPS">${this._lastFps}</div><div class="admin-stat-label">FPS</div></div>
      <div class="admin-stat"><div class="admin-stat-val text-blue-400"  id="adminMem">—</div><div class="admin-stat-label">JS Memory</div></div>
      <div class="admin-stat"><div class="admin-stat-val text-purple-400" id="adminUptime">${this._uptime()}</div><div class="admin-stat-label">Uptime</div></div>
    </div>
    <div class="card mb-3">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-bold text-sm text-gray-400 uppercase tracking-wide">System Info</h3>
        <button onclick="Hub.control._renderSystemStats()" class="text-xs text-blue-400 hover:text-blue-300">↻ Refresh</button>
      </div>
      <div id="adminSysStats" class="text-xs font-mono space-y-1 text-gray-400"></div>
    </div>
    <div class="card mb-3">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-bold text-sm text-gray-400 uppercase tracking-wide">Event Log</h3>
        <button onclick="Hub.control._eventLog=[];Hub.control._renderLog()" class="text-xs text-red-400 hover:text-red-300">Clear</button>
      </div>
      <div id="adminEventLog" class="max-h-40 overflow-y-auto space-y-0.5"></div>
    </div>
    <div class="grid grid-cols-2 gap-3">
      ${this._tile('🔍','Inspect Element','Tap-to-inspect mode','Hub.control.enableInspector()')}
      ${this._tile('📊','Network Ping','Test API latency','Hub.control.pingTest()')}
    </div>
  `; },

  // ── SIMULATE TAB ──────────────────────────────────────────

  _tabSimulate() { return `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      ${this._tile('❄️','Snow Storm','Inject winter weather','Hub.control.simWeather("snow")')}
      ${this._tile('⛈','Thunderstorm','Inject storm data','Hub.control.simWeather("storm")')}
      ${this._tile('☀️','Clear Day','Sunny forecast','Hub.control.simWeather("clear")')}
      ${this._tile('⚠️','Severe Alert','Trigger alert banner','Hub.control.simAlert()')}
      ${this._tile('📡','Offline Mode','Simulate no network (10s)','Hub.control.simOffline()')}
      ${this._tile('🌅','Force Sunrise','Override time to 6am','Hub.control.simTime("06:00")')}
      ${this._tile('🌇','Force Sunset','Override time to 7pm','Hub.control.simTime("19:00")')}
      ${this._tile('⏰','Freeze Time','Stop clock updates','Hub.control.freezeTime()')}
      ${this._tile('🎵','Sim Now Playing','Test player UI','Hub.control.simNowPlaying()')}
      ${this._tile('👁','Sim Tab Hide','Test visibility pause','Hub.control.simVisibility()')}
      ${this._tile('📸','Slideshow Timer','Show countdown overlay','Hub.control.showSlideshowTimer()')}
      ${this._tile('🔁','Restore Defaults','Reset all simulations','location.reload()')}
    </div>
  `; },

  // ── Shared tile helpers ────────────────────────────────────

  _tile(icon, label, sub, action, isDanger) {
    return `<button onclick="${action}" class="admin-tile${isDanger ? ' danger' : ''}">
      <span class="text-xl">${icon}</span>
      <span class="text-sm font-semibold">${label}</span>
      ${sub ? `<span class="text-xs text-gray-500">${sub}</span>` : ''}
    </button>`;
  },

  _slider(label, id, min, max, val, oninput) {
    return `<div class="flex items-center gap-3">
      <span class="text-sm text-gray-400 w-28 flex-shrink-0">${label}</span>
      <input type="range" id="admin_${id}" min="${min}" max="${max}" value="${val}"
        oninput="${oninput};document.getElementById('adminV_${id}').textContent=this.value"
        class="flex-1" style="accent-color:#3b82f6;">
      <span id="adminV_${id}" class="text-xs w-8 text-right text-gray-400">${val}</span>
    </div>`;
  },

  // ── PWA card ───────────────────────────────────────────────

  _renderPwaCard() {
    if (Hub.pwa?.installed) {
      return `<div class="card mt-4" style="border-color:rgba(16,185,129,.25);background:rgba(16,185,129,.04);">
        <div class="flex items-center gap-3"><span class="text-2xl">✅</span><div>
          <p class="font-bold">PWA Installed</p><p class="text-green-400 text-sm">HomeHub is installed on this device.</p>
        </div></div></div>`;
    }
    if (Hub.pwa?.bipEvent) {
      return `<div class="card mt-4" style="border-color:rgba(59,130,246,.25);background:rgba(59,130,246,.04);">
        <div class="flex items-center justify-between gap-4">
          <div><p class="font-bold">Install as App (PWA)</p><p class="text-gray-400 text-sm">Install HomeHub on this device.</p></div>
          <button onclick="Hub.control.triggerPwaInstall()" class="btn btn-primary flex-shrink-0">📲 Install</button>
        </div></div>`;
    }
    return '';
  },

  async triggerPwaInstall() {
    if (!Hub.pwa?.bipEvent) { Hub.ui?.toast?.('Install prompt not available — use browser menu', 'error'); return; }
    Hub.pwa.bipEvent.prompt();
    const { outcome } = await Hub.pwa.bipEvent.userChoice;
    if (outcome === 'accepted') { Hub.ui?.toast?.('HomeHub installed! ✅', 'success'); Hub.pwa.bipEvent = null; }
    else Hub.ui?.toast?.('Install dismissed', 'info');
    this.switchTab('system');
  },

  // ── Event log & FPS ───────────────────────────────────────

  _hookEventLog() {
    const orig = Hub.router.go.bind(Hub.router);
    Hub.router.go = (page) => { this._log(`→ Navigate: ${page}`); orig(page); };
  },

  _log(msg) {
    this._eventLog.unshift({ t: new Date().toLocaleTimeString(), msg });
    if (this._eventLog.length > 50) this._eventLog.pop();
    this._renderLog();
  },

  _renderLog() {
    const el = document.getElementById('adminEventLog');
    if (!el) return;
    el.innerHTML = this._eventLog.length
      ? this._eventLog.map(e =>
          `<div class="text-xs border-b border-gray-800 py-1 font-mono"><span class="text-gray-600">${e.t}</span> <span class="text-gray-300">${Hub.utils.esc(e.msg)}</span></div>`
        ).join('')
      : '<div class="text-xs text-gray-600">No events yet</div>';
  },

  _trackFPS() {
    let frames = 0, last = performance.now();
    const tick = (now) => {
      frames++;
      if (now - last >= 1000) {
        this._lastFps = frames; frames = 0; last = now;
        const el = document.getElementById('adminFPS');
        if (el) el.textContent = this._lastFps;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  _renderSystemStats() {
    const el = document.getElementById('adminSysStats');
    if (!el) return;
    const mem = performance.memory
      ? `${Math.round(performance.memory.usedJSHeapSize/1048576)}MB / ${Math.round(performance.memory.totalJSHeapSize/1048576)}MB`
      : 'N/A';
    const memEl = document.getElementById('adminMem');
    if (memEl) memEl.textContent = mem.split(' ')[0];
    el.innerHTML = [
      `UA: ${navigator.userAgent.slice(0,60)}…`,
      `Memory: ${mem}`,
      `Uptime: ${this._uptime()}`,
      `Route: ${Hub.router.current}`,
      `Household: ${Hub.state?.household_id?.slice(0,8) || '—'}…`,
      `Role: ${Hub.state?.userRole || '—'}`,
      `User: ${Hub.state?.user?.email || '—'}`,
    ].map(s => `<div>${Hub.utils.esc(s)}</div>`).join('');
  },

  _uptime() {
    if (!this._startTime) this._startTime = Date.now();
    const s = Math.floor((Date.now() - this._startTime) / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return h ? `${h}h ${m%60}m` : `${m}m ${s%60}s`;
  },

  // ── Action implementations (unchanged from prior version) ─

  restartHub()      { if (confirm('Reload Home Hub?')) location.reload(); },
  silenceAll()      { Hub.player?.stop?.(); Hub.ui?.toast?.('Audio stopped','info'); },
  clearFilters()    { document.body.style.filter = ''; Hub.ui?.toast?.('Filters cleared','info'); },
  toggleNightMode() { document.body.style.filter = document.body.style.filter ? '' : 'sepia(0.4) brightness(0.85)'; Hub.ui?.toast?.('Night mode toggled','info'); },
  toggleHighContrast() { document.body.classList.toggle('high-contrast'); Hub.ui?.toast?.('High contrast toggled','info'); },
  toggleLargeText() {
    const cur = parseFloat(document.documentElement.style.fontSize || '16');
    document.documentElement.style.fontSize = (cur === 16 ? '20' : '16') + 'px';
    Hub.ui?.toast?.('Font size toggled','info');
  },
  lockFullscreen() {
    Hub.ui.enterFullscreen();
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) setTimeout(() => Hub.ui.enterFullscreen(), 300);
    });
    Hub.ui?.toast?.('Fullscreen locked','info');
  },
  requestWakeLock() {
    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(() => Hub.ui?.toast?.('Wake lock active','success')).catch(e => Hub.ui?.toast?.('Wake lock: '+e.message,'error'));
    else Hub.ui?.toast?.('Wake Lock not supported','error');
  },
  clearCache() {
    if ('caches' in window) caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => Hub.ui?.toast?.('Cache cleared','success'));
    else Hub.ui?.toast?.('Cache API not available','error');
  },
  disableContextMenu() { document.addEventListener('contextmenu', e => e.preventDefault()); Hub.ui?.toast?.('Context menu disabled','info'); },
  preventBack() { history.pushState(null,'',location.href); window.addEventListener('popstate', () => history.pushState(null,'',location.href)); Hub.ui?.toast?.('Back navigation blocked','info'); },
  resetSettings() {
    if (!confirm('Reset all settings to defaults?')) return;
    Object.keys(localStorage).filter(k => k.startsWith('hub_')).forEach(k => localStorage.removeItem(k));
    Hub.ui?.toast?.('Settings reset','success');
  },
  manualChoreReset() {
    if (!confirm('Reset today\'s chores (Daily + today\'s weekday category) to pending?')) return;
    Hub.app?._callChoreResetEndpoint?.().then(() => { Hub.ui?.toast?.('Chores reset ✓','success'); this.switchTab('chores'); }).catch(e => Hub.ui?.toast?.('Reset failed: '+(e?.message||'error'),'error'));
  },
  forceResetAll() {
    if (!confirm('⚠️ Force reset ALL chores to pending? (bypasses day filter)')) return;
    Hub.app?._forceResetChores?.().then(() => { Hub.ui?.toast?.('All chores reset ✓','success'); this.switchTab('chores'); }).catch(e => Hub.ui?.toast?.('Reset failed: '+(e?.message||'error'),'error'));
  },
  reloadStream() {
    if (Hub.player?.state?.currentSource === 'radio') {
      const src = Hub.player._audio?.src;
      if (src) { Hub.player.playRadio(Hub.player.state.title, src); Hub.ui?.toast?.('Stream reloading','info'); }
    } else Hub.ui?.toast?.('No radio stream active','error');
  },
  unlockAudio() {
    const ctx = new AudioContext();
    ctx.resume().then(() => Hub.ui?.toast?.('Audio context resumed','success'));
    const buf = ctx.createBuffer(1,1,22050); const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start(0);
  },
  slideshowNext() {
    const ss = Hub.immich?._ss;
    if (!ss?.images?.length) { Hub.ui?.toast?.('No slideshow running','error'); return; }
    ss.index = (ss.index + 1) % ss.images.length; ss.crossfade(ss.images[ss.index]);
  },
  slideshowPrev() {
    const ss = Hub.immich?._ss;
    if (!ss?.images?.length) { Hub.ui?.toast?.('No slideshow running','error'); return; }
    ss.index = (ss.index - 1 + ss.images.length) % ss.images.length; ss.crossfade(ss.images[ss.index]);
  },
  slideshowShuffle() { Hub.immich?._ss?.images?.sort(() => Math.random()-0.5); Hub.ui?.toast?.('Photos reshuffled','info'); },
  showSlideshowTimer() {
    const ss = Hub.immich?._ss;
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:9998;background:rgba(0,0,0,.7);color:#fff;padding:.5rem 1rem;border-radius:.5rem;font-family:monospace;font-size:1rem;pointer-events:none;';
    document.body.appendChild(ov);
    const tick = () => {
      if (!document.contains(ov)) return;
      const remain = Math.max(0, (ss?.displayMs||5000) - (performance.now() - (ss?.lastSwitchTime||0)));
      ov.textContent = `📸 ${(remain/1000).toFixed(1)}s`;
      requestAnimationFrame(tick);
    };
    tick(); setTimeout(() => ov.remove(), 30000);
  },
  simVisibility() { document.dispatchEvent(new Event('visibilitychange')); Hub.ui?.toast?.('Simulated tab hide','info'); },
  toggleTapRipples() {
    if (window._tapRipple) {
      document.removeEventListener('touchstart', window._tapRipple); document.removeEventListener('click', window._tapRipple);
      window._tapRipple = null; Hub.ui?.toast?.('Tap ripples off','info');
    } else {
      if (!document.getElementById('rippleStyle')) { const s = document.createElement('style'); s.id = 'rippleStyle'; s.textContent = '@keyframes ripple{from{opacity:1;transform:scale(0)}to{opacity:0;transform:scale(2)}}'; document.head.appendChild(s); }
      window._tapRipple = (e) => { const t = e.touches?.[0]||e; const r = document.createElement('div'); r.style.cssText = `position:fixed;left:${t.clientX-20}px;top:${t.clientY-20}px;width:40px;height:40px;border-radius:50%;background:rgba(59,130,246,.4);pointer-events:none;z-index:99999;animation:ripple .5s ease-out forwards;`; document.body.appendChild(r); setTimeout(()=>r.remove(),550); };
      document.addEventListener('touchstart', window._tapRipple, {passive:true}); document.addEventListener('click', window._tapRipple);
      Hub.ui?.toast?.('Tap ripples on','success');
    }
  },
  toggleKidMode() {
    const on = document.body.classList.toggle('kid-mode');
    if (on) { const s = document.getElementById('kidStyle')||document.createElement('style'); s.id='kidStyle'; s.textContent='.admin-tile.danger{opacity:.3!important;pointer-events:none!important;}'; document.head.appendChild(s); }
    else document.getElementById('kidStyle')?.remove();
    Hub.ui?.toast?.(`Kid mode ${on?'on':'off'}`,'info');
  },
  setAccentHue(h) { document.getElementById('adminV_accentHue').textContent=h; document.documentElement.style.setProperty('--accent-primary',`hsl(${h},70%,55%)`); },
  setBgDim(v)     { document.getElementById('adminV_bgDim').textContent=v; document.documentElement.style.setProperty('--bg-base',`hsl(222,35%,${Math.round(v/10)}%)`); },
  setSaturation(v){ document.getElementById('adminV_satVal').textContent=v; document.body.style.filter=`saturate(${v}%)`; },
  enableInspector() {
    Hub.ui?.toast?.('Tap any element to inspect it','info');
    const h = (e) => { e.preventDefault(); e.stopPropagation(); alert(`id:${e.target.id||'—'}\nclass:${e.target.className||'—'}\nsize:${Math.round(e.target.offsetWidth)}×${Math.round(e.target.offsetHeight)}\ntag:${e.target.tagName}`); document.removeEventListener('click',h,true); };
    document.addEventListener('click',h,true);
  },
  async pingTest() {
    const t = performance.now();
    try { await fetch('/api/health?t='+Date.now(),{cache:'no-store'}); const ms=Math.round(performance.now()-t); Hub.ui?.toast?.(`Ping: ${ms}ms`,ms<200?'success':'error'); }
    catch { Hub.ui?.toast?.('Network unreachable','error'); }
  },
  simWeather(type) {
    const d = { snow:{headline:'Heavy snow expected',today:{high_f:28,low_f:18},tomorrow:{high_f:24,low_f:14}}, storm:{headline:'Severe thunderstorms likely',today:{high_f:65,low_f:55},tomorrow:{high_f:70,low_f:58}}, clear:{headline:'Beautiful sunny day',today:{high_f:75,low_f:60},tomorrow:{high_f:78,low_f:62}} };
    const sim = d[type]; if (!sim) return;
    if (Hub.ai) { Hub.ai._cache = sim; Hub.ai._cacheTime = Date.now(); }
    Hub.ui?.toast?.(`Simulating: ${type} weather`,'info');
    if (Hub.router.current==='standby') Hub.standby?._loadWeather?.();
  },
  simAlert() {
    const fakeAlerts = [{event:'Severe Thunderstorm Warning',severity:'Severe',urgency:'Immediate',area:'Franklin County, OH',headline:'Severe thunderstorm warning in effect until 8:00 PM EDT',description:'At 5:45 PM EDT, a severe thunderstorm was located near Columbus, moving northeast at 35 mph. HAZARD: 60 mph wind gusts and penny size hail.',instruction:'Move to an interior room on the lowest floor of a building.',expires:new Date(Date.now()+3600000).toISOString()}];
    Hub.weather?._renderAlertBanner?.(fakeAlerts);
    Hub.ui?.toast?.('Simulated alert banner fired','info');
  },
  simOffline() {
    Hub.ui?.toast?.('Simulating offline for 10s','info');
    window._origFetch = window.fetch;
    window.fetch = () => Promise.reject(new Error('Simulated offline'));
    setTimeout(() => { window.fetch = window._origFetch; Hub.ui?.toast?.('Network restored','success'); }, 10000);
  },
  simTime(time) {
    const [h,m] = time.split(':').map(Number); const orig = Date;
    window.Date = class extends orig { constructor(...a){super(...a);if(!a.length){const d=new orig();d.setHours(h,m,0);return d;}} static now(){const d=new orig();d.setHours(h,m,0);return d.getTime();} };
    Hub.ui?.toast?.(`Time simulated at ${time} (30s)`,'info');
    setTimeout(()=>{window.Date=orig;Hub.ui?.toast?.('Time restored','info');},30000);
  },
  freezeTime() {
    const now = new Date(); const orig = Date;
    window.Date = class extends orig { constructor(...a){super(...a);if(!a.length)return new orig(now);} static now(){return now.getTime();} };
    Hub.ui?.toast?.(`Time frozen at ${now.toLocaleTimeString()}`,'info');
  },
  simNowPlaying() {
    Hub.player.state.currentSource='radio'; Hub.player.state.title='WNYC 93.9 FM'; Hub.player.state.isPlaying=true;
    Hub.player.state.radioStatus='playing'; Hub.player.updateUI(); Hub.ui?.toast?.('Now Playing simulated','info');
  },

  // ── Auto chore reset ──────────────────────────────────────

  startAutoResetChecker() {
    if (this._autoResetInterval) { clearInterval(this._autoResetInterval); this._autoResetInterval = null; }
    const enabled = localStorage.getItem('chore_auto_reset_enabled') === 'true';
    if (!enabled) { console.log('[Admin] Auto chore reset is disabled'); return; }
    setTimeout(() => { if (Hub.state?.user && Hub.state?.household_id) Hub.app?._callChoreResetEndpoint?.().catch(()=>{}); }, 5000);
    this._autoResetInterval = setInterval(() => {
      if (!Hub.state?.user || !Hub.state?.household_id) return;
      if (localStorage.getItem('chore_auto_reset_enabled') !== 'true') { clearInterval(this._autoResetInterval); return; }
      Hub.app?._callChoreResetEndpoint?.().catch(()=>{});
    }, 5 * 60 * 1000);
  },
};
