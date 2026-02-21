// ============================================================
// public/assets/control.js — Admin Panel (full control console)
// Philosophy: Tap → immediate effect. No forms. No save buttons.
// Tabbed: System | Media | Display | Input | Debug | Simulate | Nav
// ============================================================
window.Hub = window.Hub || {};

Hub.control = {
  _activeTab: 'system',
  _eventLog: [],
  _fpsMeter: null,
  _lastFps: 0,

  init() {
    console.log('[Admin] Init');
    this.startAutoResetChecker?.();
    // Start FPS tracking always in background
    this._trackFPS();
    // Log events globally
    this._hookEventLog();
  },

  load() {
    const el = document.getElementById('adminPanelContent');
    if (!el) return;

    // Admin-only gate (belt-and-suspenders check)
    if (Hub.state?.userRole !== 'admin') {
      el.innerHTML = `
        <div class="card text-center py-12">
          <p class="text-4xl mb-4">🔒</p>
          <h2 class="text-2xl font-bold mb-2">Admin Only</h2>
          <p class="text-gray-400 mb-6">You don't have admin access to this panel.</p>
          <button onclick="Hub.router.go('settings')" class="btn btn-secondary">← Back to Settings</button>
        </div>`;
      return;
    }

    el.innerHTML = this._renderPanel();
    this._bindTab(this._activeTab);
  },

  /** Called by router when navigating away — clean up any intervals/listeners */
  onLeave() {
    // FPS tracker uses rAF and self-cleans; event log hook is one-time.
    // Clear any admin-specific setIntervals if they were added.
    console.log('[Admin] onLeave — cleanup');
  },

  // ── Event log ───────────────────────────────────────────
  _hookEventLog() {
    const orig = Hub.router.go.bind(Hub.router);
    Hub.router.go = (page) => { this._log(`→ Navigate: ${page}`); orig(page); };
  },

  _log(msg) {
    this._eventLog.unshift({ t: new Date().toLocaleTimeString(), msg });
    if (this._eventLog.length > 50) this._eventLog.pop();
    const el = document.getElementById('adminEventLog');
    if (el) el.innerHTML = this._eventLog.map(e =>
      `<div class="text-xs border-b border-gray-800 py-1"><span class="text-gray-500">${e.t}</span> ${Hub.utils.esc(e.msg)}</div>`
    ).join('');
  },

  // ── FPS tracker ─────────────────────────────────────────
  _trackFPS() {
    let frames = 0, last = performance.now();
    const tick = (now) => {
      frames++;
      if (now - last >= 1000) {
        this._lastFps = frames;
        frames = 0; last = now;
        const el = document.getElementById('adminFPS');
        if (el) el.textContent = this._lastFps + ' fps';
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  // ── Panel render ─────────────────────────────────────────
  _renderPanel() {
    const tabs = [
      { id: 'system',   icon: '🖥', label: 'System'   },
      { id: 'media',    icon: '🎵', label: 'Media'    },
      { id: 'display',  icon: '🎨', label: 'Display'  },
      { id: 'input',    icon: '🖐', label: 'Input'    },
      { id: 'debug',    icon: '🔍', label: 'Debug'    },
      { id: 'simulate', icon: '🧪', label: 'Simulate' },
      { id: 'nav',      icon: '🗺', label: 'Nav'      },
    ];

    return `
      <!-- Quick Actions Strip -->
      <div class="grid grid-cols-4 gap-2 mb-6">
        ${this._quickTile('🔄','Restart Hub',     'Hub.control.restartHub()')}
        ${this._quickTile('📡','Reload Data',     'Hub.control.reloadData()')}
        ${this._quickTile('🔇','Silence All',     'Hub.control.silenceAll()')}
        ${this._quickTile('🧹','Clear State',     'Hub.control.clearState()')}
        ${this._quickTile('👀','Debug Overlay',   'Hub.control.toggleDebugOverlay()')}
        ${this._quickTile('🛡','Safe Mode',       'Hub.control.safeMode()')}
        ${this._quickTile('🧪','Demo Mode',       'Hub.control.demoMode()')}
        ${this._quickTile('💬','Explain Events',  'Hub.control.explainEvents()')}
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 mb-4 overflow-x-auto pb-1">
        ${tabs.map(t => `
          <button onclick="Hub.control.switchTab('${t.id}')"
            id="adminTab_${t.id}"
            class="btn text-sm px-3 py-2 flex-shrink-0 ${this._activeTab === t.id ? 'btn-primary' : 'btn-secondary'}">
            ${t.icon} ${t.label}
          </button>`).join('')}
      </div>

      <!-- Tab content -->
      <div id="adminTabContent">${this._renderTab(this._activeTab)}</div>
    `;
  },

  _quickTile(icon, label, action) {
    return `
      <button onclick="${action}"
        class="card flex flex-col items-center justify-center gap-1 py-4 cursor-pointer hover:bg-blue-900 hover:bg-opacity-30 transition-all text-center"
        style="margin:0;border-radius:.75rem;">
        <span class="text-2xl">${icon}</span>
        <span class="text-xs font-semibold text-gray-300">${label}</span>
      </button>`;
  },

  switchTab(tab) {
    this._activeTab = tab;
    document.querySelectorAll('[id^="adminTab_"]').forEach(b => {
      b.className = 'btn text-sm px-3 py-2 flex-shrink-0 ' + (b.id === `adminTab_${tab}` ? 'btn-primary' : 'btn-secondary');
    });
    const content = document.getElementById('adminTabContent');
    if (content) content.innerHTML = this._renderTab(tab);
    this._bindTab(tab);
  },

  _bindTab(tab) {
    if (tab === 'display') this._bindDisplaySliders();
    if (tab === 'debug')   { this._renderLog(); this._renderSystemStats(); }
  },

  // ── Tabs ────────────────────────────────────────────────

  _renderTab(tab) {
    const t = {
      system:   this._tabSystem(),
      media:    this._tabMedia(),
      display:  this._tabDisplay(),
      input:    this._tabInput(),
      debug:    this._tabDebug(),
      simulate: this._tabSimulate(),
      nav:      this._tabNav(),
    };
    return t[tab] || '';
  },

  _tile(icon, label, sub, action, color) {
    const bg = color ? `background:${color};` : '';
    return `
      <button onclick="${action}"
        class="card flex flex-col items-start gap-1 p-4 cursor-pointer hover:opacity-90 transition-all text-left"
        style="margin:0;border-radius:.75rem;${bg}">
        <span class="text-xl">${icon}</span>
        <span class="font-semibold text-sm">${label}</span>
        ${sub ? `<span class="text-xs text-gray-400">${sub}</span>` : ''}
      </button>`;
  },

  // SYSTEM TAB
  _tabSystem() { return `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      ${this._tile('⛶','Fullscreen','Enter kiosk mode','Hub.ui.enterFullscreen()')}
      ${this._tile('✕','Exit Fullscreen','Return to window','Hub.ui.exitFullscreen()')}
      ${this._tile('🔒','Lock Fullscreen','Auto re-enter','Hub.control.lockFullscreen()')}
      ${this._tile('💤','Force Standby','Enter standby now','Hub.router.go("standby")')}
      ${this._tile('☀️','Wake Screen','Exit standby','Hub.router.go("dashboard")')}
      ${this._tile('🔄','Reload App','Hard reload page','location.reload()')}
      ${this._tile('🧹','Clear Cache','Clear app storage','Hub.control.clearCache()')}
      ${this._tile('🚫','No Context Menu','Disable right-click','Hub.control.disableContextMenu()')}
      ${this._tile('📵','Disable Back Nav','Prevent accidental back','Hub.control.preventBack()')}
      ${this._tile('😴','Wake Lock','Prevent sleep','Hub.control.requestWakeLock()')}
      ${this._tile('⚙️','Reset Settings','Restore defaults','Hub.control.resetSettings()')}
      ${this._tile('📋','Chore Reset','Reset all chores','Hub.control.manualChoreReset()')}
    </div>
    <div class="card mt-4">
      <h3 class="font-bold mb-2 text-sm text-gray-400">AUTO CHORE RESET</h3>
      <div class="flex items-center justify-between">
        <span class="text-sm">Daily reset at 4am</span>
        <button onclick="Hub.control.toggleAutoReset(this)"
          id="btnAutoReset"
          class="btn ${localStorage.getItem('chore_auto_reset_enabled')==='true' ? 'btn-success' : 'btn-secondary'} text-sm">
          ${localStorage.getItem('chore_auto_reset_enabled')==='true' ? '✓ Enabled' : 'Disabled'}
        </button>
      </div>
    </div>
    ${this._renderPwaCard()}
  `; },

  // ── PWA install card (System tab) ────────────────────────
  _renderPwaCard() {
    const kioskCmd = `chromium-browser --app=${location.origin}/#/dashboard --start-fullscreen --noerrdialogs --disable-infobars`;
    if (Hub.pwa?.installed) {
      return `
        <div class="card mt-4" style="border:1px solid rgba(16,185,129,.3);background:rgba(16,185,129,.05);">
          <div class="flex items-center gap-3">
            <span class="text-2xl">✅</span>
            <div>
              <h3 class="font-bold">App Install (PWA)</h3>
              <p class="text-green-400 text-sm">HomeHub is installed on this device.</p>
            </div>
          </div>
        </div>`;
    }
    if (Hub.pwa?.bipEvent) {
      return `
        <div class="card mt-4" style="border:1px solid rgba(59,130,246,.3);background:rgba(59,130,246,.05);">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h3 class="font-bold">App Install (PWA)</h3>
              <p class="text-gray-400 text-sm">Install HomeHub as an app on this device.</p>
            </div>
            <button onclick="Hub.control.triggerPwaInstall()"
              class="btn btn-primary flex-shrink-0" style="background:#2563eb;">
              📲 Install HomeHub
            </button>
          </div>
        </div>`;
    }
    // No install event — show Chromium fallback instructions
    return `
      <div class="card mt-4" style="border:1px solid rgba(251,191,36,.3);background:rgba(251,191,36,.05);">
        <h3 class="font-bold mb-2">App Install (PWA)</h3>
        <p class="text-gray-300 text-sm mb-3">
          Install not available via automatic prompt. Use the browser menu instead:
        </p>
        <ol class="text-sm text-gray-400 space-y-1 mb-4 list-decimal list-inside">
          <li>Open Chromium menu <span class="font-mono bg-gray-800 px-1 rounded">⋮</span></li>
          <li>Select <strong class="text-white">Install HomeHub…</strong></li>
          <li>Click <strong class="text-white">Install</strong> in the dialog</li>
        </ol>
        <p class="text-gray-500 text-xs mb-2">Or launch in kiosk mode directly:</p>
        <div class="flex gap-2 items-start">
          <code class="flex-1 text-xs bg-gray-900 text-green-400 p-2 rounded break-all">${Hub.utils.esc(kioskCmd)}</code>
          <button onclick="navigator.clipboard.writeText('${Hub.utils.esc(kioskCmd)}').then(()=>Hub.ui.toast('Copied','success'))"
            class="btn btn-secondary text-xs flex-shrink-0">Copy</button>
        </div>
      </div>`;
  },

  async triggerPwaInstall() {
    if (!Hub.pwa?.bipEvent) {
      Hub.ui?.toast?.('Install prompt not available — use browser menu', 'error');
      return;
    }
    Hub.pwa.bipEvent.prompt();
    const { outcome } = await Hub.pwa.bipEvent.userChoice;
    if (outcome === 'accepted') {
      Hub.ui?.toast?.('HomeHub installed! ✅', 'success');
      Hub.pwa.bipEvent = null;
    } else {
      Hub.ui?.toast?.('Install dismissed', 'info');
    }
    // Re-render the system tab to update the card
    this.switchTab('system');
  },

  // MEDIA TAB
  _tabMedia() { return `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      ${this._tile('🔇','Kill Audio','Stop all playback','Hub.control.silenceAll()')}
      ${this._tile('🔄','Reload Stream','Force restart radio','Hub.control.reloadStream()')}
      ${this._tile('▶️','Force Autoplay','Unlock browser audio','Hub.control.unlockAudio()')}
      ${this._tile('⏸','Pause Slideshow','Stop photo rotation','Hub.immich._ss.paused=true;Hub.ui.toast("Slideshow paused","info")')}
      ${this._tile('▶','Resume Slideshow','Restart photo rotation','Hub.immich._ss.paused=false;Hub.immich._ss.lastSwitchTime=performance.now();Hub.ui.toast("Slideshow resumed","success")')}
      ${this._tile('⏭','Next Photo','Skip to next image','Hub.control.slideshowNext()')}
      ${this._tile('⏮','Prev Photo','Back one image','Hub.control.slideshowPrev()')}
      ${this._tile('🔀','Shuffle Photos','Re-randomize order','Hub.control.slideshowShuffle()')}
    </div>
    <div class="card mt-4">
      <h3 class="font-bold mb-2 text-sm text-gray-400">VOLUME LIMITER</h3>
      <div class="flex items-center gap-3">
        <span class="text-sm w-16">Max vol</span>
        <input type="range" id="adminVolLimit" min="0" max="1" step="0.05"
          value="${Hub.player?.state?.volume ?? 0.7}"
          oninput="Hub.player?.setVolume(parseFloat(this.value));document.getElementById('adminVolVal').textContent=Math.round(this.value*100)+'%'"
          class="flex-1">
        <span id="adminVolVal" class="text-sm w-10 text-right">${Math.round((Hub.player?.state?.volume ?? 0.7)*100)}%</span>
      </div>
    </div>
    <div class="card mt-3" id="audioDebugCard">
      <h3 class="font-bold mb-2 text-sm text-gray-400">AUDIO DEBUG</h3>
      <div class="text-xs space-y-1 font-mono">
        <div>Source: <span class="text-blue-400">${Hub.player?.state?.currentSource || 'none'}</span></div>
        <div>Status: <span class="text-green-400">${Hub.player?.state?.radioStatus || '—'}</span></div>
        <div>Playing: <span class="${Hub.player?.state?.isPlaying ? 'text-green-400' : 'text-red-400'}">${Hub.player?.state?.isPlaying ? 'yes' : 'no'}</span></div>
        <div>ReadyState: <span class="text-yellow-400">${Hub.player?.radioAudio?.readyState ?? '—'}</span></div>
      </div>
      <button onclick="Hub.control.refreshAudioDebug()" class="btn btn-secondary text-xs mt-2">↻ Refresh</button>
    </div>
  `; },

  // DISPLAY TAB
  _tabDisplay() { return `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
      ${this._tile('🌙','Night Mode','Warm dark filter','Hub.control.toggleNightMode()')}
      ${this._tile('☀️','Day Mode','Clear all filters','Hub.control.clearFilters()')}
      ${this._tile('🔆','High Contrast','Accessibility','Hub.control.toggleHighContrast()')}
      ${this._tile('📝','Large Text','Bigger fonts','Hub.control.toggleLargeText()')}
      ${this._tile('🚫','No Animations','Stop all motion','document.body.classList.toggle("reduce-motion");Hub.ui.toast("Motion toggled","info")')}
      ${this._tile('🐌','Slow Motion','0.5x transitions','Hub.control.setMotionSpeed(0.5)')}
      ${this._tile('💫','Fast Motion','2x transitions','Hub.control.setMotionSpeed(2)')}
      ${this._tile('🔲','Outline Mode','Show button borders','Hub.control.toggleOutlineMode()')}
    </div>
    <div class="card space-y-4">
      <h3 class="font-bold text-sm text-gray-400">THEME CONTROLS</h3>
      ${this._slider('Accent Hue','accentHue','0','360','220','Hub.control.setAccentHue(this.value)')}
      ${this._slider('Background Dim','bgDim','0','100','11','Hub.control.setBgDim(this.value)')}
      ${this._slider('Blur Strength','blurStr','0','40','20','Hub.control.setBlur(this.value)')}
      ${this._slider('Saturation','satVal','0','200','100','Hub.control.setSaturation(this.value)')}
    </div>
  `; },

  _slider(label, id, min, max, val, oninput) { return `
    <div class="flex items-center gap-3">
      <span class="text-sm w-28 flex-shrink-0">${label}</span>
      <input type="range" id="admin_${id}" min="${min}" max="${max}" value="${val}" oninput="${oninput}" class="flex-1">
      <span id="adminV_${id}" class="text-xs w-8 text-right">${val}</span>
    </div>`; },

  // INPUT TAB
  _tabInput() { return `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
      ${this._tile('🖐','Touch Mode','Big hit areas','document.body.dataset.input="touch";document.body.classList.add("touchscreen-mode");Hub.ui.toast("Touch mode","info")')}
      ${this._tile('🖱','Desktop Mode','Normal UI','document.body.dataset.input="desktop";document.body.classList.remove("touchscreen-mode");Hub.ui.toast("Desktop mode","info")')}
      ${this._tile('🎯','Precision Mode','Stylus/fine','document.body.dataset.input="precision";Hub.ui.toast("Precision mode","info")')}
      ${this._tile('💧','Tap Ripples','Show touch points','Hub.control.toggleTapRipples()')}
      ${this._tile('🔎','Tap Heatmap','Debug touch areas','Hub.control.toggleHeatmap()')}
      ${this._tile('📜','Kinetic Scroll','Smooth momentum','Hub.control.toggleKineticScroll()')}
      ${this._tile('⬆','Swipe Gestures','Enable nav swipes','Hub.control.enableGestures()')}
      ${this._tile('🧒','Kid Mode','Lock danger buttons','Hub.control.toggleKidMode()')}
    </div>
    <div class="card">
      <h3 class="font-bold mb-2 text-sm text-gray-400">SWIPE GESTURES</h3>
      <div class="text-xs text-gray-400 space-y-1">
        <div>↓ Swipe down → Dashboard</div>
        <div>↑ Swipe up → Standby</div>
        <div>← Swipe left → Back</div>
        <div>→ Swipe right → Forward</div>
      </div>
      <button onclick="Hub.control.enableGestures()" class="btn btn-secondary text-xs mt-2">Enable Gestures</button>
    </div>
  `; },

  // DEBUG TAB
  _tabDebug() { return `
    <div class="grid grid-cols-3 gap-2 mb-4">
      <div class="card text-center" style="margin:0;">
        <div id="adminFPS" class="text-2xl font-bold text-green-400">${this._lastFps} fps</div>
        <div class="text-xs text-gray-500">FPS</div>
      </div>
      <div class="card text-center" style="margin:0;">
        <div id="adminMem" class="text-2xl font-bold text-blue-400">—</div>
        <div class="text-xs text-gray-500">Memory</div>
      </div>
      <div class="card text-center" style="margin:0;">
        <div id="adminUptime" class="text-2xl font-bold text-purple-400">${this._uptime()}</div>
        <div class="text-xs text-gray-500">Uptime</div>
      </div>
    </div>
    <div class="card mb-3">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-bold text-sm text-gray-400">EVENT LOG</h3>
        <button onclick="Hub.control._eventLog=[];Hub.control._renderLog()" class="text-xs text-red-400">Clear</button>
      </div>
      <div id="adminEventLog" class="max-h-48 overflow-y-auto font-mono">
        ${this._eventLog.length ? this._eventLog.map(e =>
          `<div class="text-xs border-b border-gray-800 py-1"><span class="text-gray-500">${e.t}</span> ${Hub.utils.esc(e.msg)}</div>`
        ).join('') : '<div class="text-xs text-gray-500">No events yet</div>'}
      </div>
    </div>
    <div class="card mb-3" id="sysStatsCard">
      <h3 class="font-bold mb-2 text-sm text-gray-400">SYSTEM INFO</h3>
      <div id="adminSysStats" class="text-xs font-mono space-y-1 text-gray-300"></div>
      <button onclick="Hub.control._renderSystemStats()" class="btn btn-secondary text-xs mt-2">↻ Refresh</button>
    </div>
    <div class="grid grid-cols-2 gap-2">
      ${this._tile('🔍','Inspect Element','Tap-to-inspect mode','Hub.control.enableInspector()')}
      ${this._tile('📊','Network Ping','Test latency','Hub.control.pingTest()')}
    </div>
  `; },

  // SIMULATE TAB
  _tabSimulate() { return `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      ${this._tile('❄️','Simulate Snow','Inject storm data','Hub.control.simWeather("snow")')}
      ${this._tile('⛈','Simulate Storm','Inject thunder data','Hub.control.simWeather("storm")')}
      ${this._tile('☀️','Clear Weather','Sunny forecast','Hub.control.simWeather("clear")')}
      ${this._tile('⚠️','Trigger Alert','Show weather alert','Hub.control.simAlert()')}
      ${this._tile('📡','Offline Mode','Simulate no network','Hub.control.simOffline()')}
      ${this._tile('🌅','Force Sunrise','Override time','Hub.control.simTime("06:00")')}
      ${this._tile('🌇','Force Sunset','Override time','Hub.control.simTime("19:00")')}
      ${this._tile('⏰','Freeze Time','Stop clock updates','Hub.control.freezeTime()')}
      ${this._tile('📋','Sim Many Chores','Fill test data','Hub.control.simChores()')}
      ${this._tile('🎵','Sim Now Playing','Test player UI','Hub.control.simNowPlaying()')}
      ${this._tile('📸','Slideshow Timer','Show countdown overlay','Hub.control.showSlideshowTimer()')}
      ${this._tile('👁','Sim Tab Hide','Test visibility pause','Hub.control.simVisibility()')}
    </div>
  `; },

  // NAV TAB
  _tabNav() {
    const pages = ['dashboard','weather','chores','treats','music','radio','settings','grocery','standby'];
    return `
    <div class="grid grid-cols-3 gap-3 mb-4">
      ${pages.map(p => this._tile(this._pageIcon(p), p.charAt(0).toUpperCase()+p.slice(1), '', `Hub.router.go('${p}')`)).join('')}
    </div>
    <div class="grid grid-cols-2 gap-3">
      ${this._tile('🔙','Go Back','Browser back','history.back()')}
      ${this._tile('🔄','Refresh','Reload current page','location.reload()')}
    </div>
  `; },

  _pageIcon(p) {
    const m = {dashboard:'🏠',weather:'🌤️',chores:'✅',treats:'🐕',music:'🎵',radio:'📻',settings:'⚙️',grocery:'🛒',standby:'💤'};
    return m[p] || '📄';
  },

  // ── Action implementations ────────────────────────────────

  restartHub() {
    if (confirm('Reload Home Hub?')) location.reload();
  },

  reloadData() {
    Hub.app?._loadDashboard?.();
    Hub.ui?.toast?.('Data refreshed', 'success');
    this._log('Reload data');
  },

  silenceAll() {
    Hub.player?.stop?.();
    Hub.ui?.toast?.('Audio stopped', 'info');
    this._log('Silence all');
  },

  clearState() {
    Hub.player?.stop?.();
    Hub.ui?.toast?.('UI state cleared', 'info');
    this._log('Clear state');
  },

  safeMode() {
    document.body.classList.add('reduce-motion');
    Hub.player?.stop?.();
    Hub.ui?.toast?.('Safe mode: animations off, audio stopped', 'info');
    this._log('Safe mode');
  },

  demoMode() {
    Hub.ui?.toast?.('Demo mode — simulating activity', 'success');
    this.simNowPlaying();
    this._log('Demo mode');
  },

  explainEvents() {
    const recent = this._eventLog.slice(0, 10).map(e => `${e.t}: ${e.msg}`).join('\n');
    alert('Recent events:\n\n' + (recent || 'No events recorded yet.'));
  },

  lockFullscreen() {
    Hub.ui.enterFullscreen();
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        setTimeout(() => Hub.ui.enterFullscreen(), 300);
      }
    });
    Hub.ui?.toast?.('Fullscreen locked', 'info');
  },

  requestWakeLock() {
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(() => {
        Hub.ui?.toast?.('Wake lock active — screen won\'t sleep', 'success');
      }).catch(e => Hub.ui?.toast?.('Wake lock: ' + e.message, 'error'));
    } else {
      Hub.ui?.toast?.('Wake Lock not supported in this browser', 'error');
    }
  },

  clearCache() {
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => Hub.ui?.toast?.('Cache cleared', 'success'));
    } else {
      Hub.ui?.toast?.('Cache API not available', 'error');
    }
  },

  disableContextMenu() {
    document.addEventListener('contextmenu', e => e.preventDefault());
    Hub.ui?.toast?.('Context menu disabled', 'info');
  },

  preventBack() {
    history.pushState(null, '', location.href);
    window.addEventListener('popstate', () => history.pushState(null, '', location.href));
    Hub.ui?.toast?.('Back navigation blocked', 'info');
  },

  resetSettings() {
    if (!confirm('Reset all settings to defaults?')) return;
    const keys = Object.keys(localStorage).filter(k => k.startsWith('hub_'));
    keys.forEach(k => localStorage.removeItem(k));
    Hub.ui?.toast?.('Settings reset', 'success');
  },

  toggleAutoReset() {
    const enabled = localStorage.getItem('chore_auto_reset_enabled') === 'true';
    localStorage.setItem('chore_auto_reset_enabled', String(!enabled));
    const btn = document.getElementById('btnAutoReset');
    if (btn) {
      btn.className = 'btn text-sm ' + (!enabled ? 'btn-success' : 'btn-secondary');
      btn.textContent = !enabled ? '✓ Enabled' : 'Disabled';
    }
    Hub.ui?.toast?.(`Auto reset ${!enabled ? 'enabled' : 'disabled'}`, 'info');
  },

  manualChoreReset() {
    if (!confirm('Reset ALL chores to pending?')) return;
    Hub.app?._callChoreResetEndpoint?.()
      .then(() => { Hub.ui?.toast?.('All chores reset!', 'success'); this._log('Manual chore reset'); })
      .catch(e => Hub.ui?.toast?.('Reset: ' + (e?.message || 'failed'), 'error'));
  },

  reloadStream() {
    if (Hub.player?.state?.currentSource === 'radio') {
      const name = Hub.player.state.title;
      const src  = Hub.player.radioAudio?.src;
      if (src) { Hub.player.playRadio(name, src); Hub.ui?.toast?.('Stream reloading', 'info'); }
    } else { Hub.ui?.toast?.('No radio stream active', 'error'); }
  },

  unlockAudio() {
    const ctx = new AudioContext();
    ctx.resume().then(() => Hub.ui?.toast?.('Audio context resumed', 'success'));
    const buf = ctx.createBuffer(1,1,22050);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start(0);
    Hub.ui?.toast?.('Audio unlocked', 'success');
  },

  slideshowNext() {
    const ss = Hub.immich._ss;
    if (!ss.images.length) { Hub.ui?.toast?.('No slideshow running', 'error'); return; }
    ss.index = (ss.index + 1) % ss.images.length;
    ss.crossfade(ss.images[ss.index]);
    Hub.ui?.toast?.(`Photo ${ss.index + 1}/${ss.images.length}`, 'info');
  },

  slideshowPrev() {
    const ss = Hub.immich._ss;
    if (!ss.images.length) { Hub.ui?.toast?.('No slideshow running', 'error'); return; }
    ss.index = (ss.index - 1 + ss.images.length) % ss.images.length;
    ss.crossfade(ss.images[ss.index]);
    Hub.ui?.toast?.(`Photo ${ss.index + 1}/${ss.images.length}`, 'info');
  },

  slideshowShuffle() {
    const ss = Hub.immich._ss;
    ss.images.sort(() => Math.random() - 0.5);
    Hub.ui?.toast?.('Photos reshuffled', 'info');
  },

  showSlideshowTimer() {
    const ss = Hub.immich._ss;
    const overlay = document.getElementById('slideshowTimerOverlay') || document.createElement('div');
    overlay.id = 'slideshowTimerOverlay';
    overlay.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:9998;background:rgba(0,0,0,.7);color:#fff;padding:.5rem 1rem;border-radius:.5rem;font-family:monospace;font-size:1rem;pointer-events:none;';
    document.body.appendChild(overlay);
    const tick = () => {
      const elapsed = performance.now() - ss.lastSwitchTime;
      const remain  = Math.max(0, ss.displayMs - elapsed);
      overlay.textContent = `📸 ${(remain/1000).toFixed(1)}s | ${ss.index+1}/${ss.images.length}`;
      if (document.contains(overlay)) requestAnimationFrame(tick);
    };
    tick();
    setTimeout(() => overlay.remove(), 30000);
  },

  simVisibility() {
    Hub.ui?.toast?.('Simulating tab hide for 3s…', 'info');
    document.dispatchEvent(new Event('visibilitychange'));
    setTimeout(() => {
      Object.defineProperty(document, 'hidden', { value: false, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, 3000);
  },

  refreshAudioDebug() {
    const el = document.getElementById('audioDebugCard');
    if (el) el.querySelector('.font-mono').innerHTML = `
      <div>Source: <span class="text-blue-400">${Hub.player?.state?.currentSource || 'none'}</span></div>
      <div>Status: <span class="text-green-400">${Hub.player?.state?.radioStatus || '—'}</span></div>
      <div>Playing: <span class="${Hub.player?.state?.isPlaying ? 'text-green-400' : 'text-red-400'}">${Hub.player?.state?.isPlaying ? 'yes' : 'no'}</span></div>
      <div>ReadyState: <span class="text-yellow-400">${Hub.player?.radioAudio?.readyState ?? '—'}</span></div>
    `;
  },

  toggleDebugOverlay() {
    let ov = document.getElementById('debugStatusOverlay');
    if (ov) { ov.remove(); return; }
    ov = document.createElement('div');
    ov.id = 'debugStatusOverlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;z-index:9997;background:rgba(0,0,0,.8);color:#0f0;font-family:monospace;font-size:.7rem;padding:.5rem;pointer-events:none;min-width:180px;';
    document.body.appendChild(ov);
    const update = () => {
      if (!document.contains(ov)) return;
      ov.innerHTML = `FPS: ${this._lastFps}<br>Route: ${Hub.router.current}<br>Playing: ${Hub.player?.state?.isPlaying ? '▶' : '⏸'}<br>Source: ${Hub.player?.state?.currentSource || '—'}<br>Slide: ${Hub.immich._ss.index+1}/${Hub.immich._ss.images.length||0}`;
      setTimeout(update, 500);
    };
    update();
  },

  toggleNightMode() {
    document.body.style.filter = document.body.style.filter ? '' : 'sepia(0.4) brightness(0.85) saturate(0.8)';
    Hub.ui?.toast?.('Night mode toggled', 'info');
  },

  clearFilters() { document.body.style.filter = ''; Hub.ui?.toast?.('Filters cleared', 'info'); },

  toggleHighContrast() {
    document.body.classList.toggle('high-contrast');
    Hub.ui?.toast?.('High contrast toggled', 'info');
  },

  toggleLargeText() {
    const cur = parseFloat(document.documentElement.style.fontSize || '16');
    document.documentElement.style.fontSize = (cur === 16 ? '20' : '16') + 'px';
    Hub.ui?.toast?.('Font size toggled', 'info');
  },

  toggleOutlineMode() {
    const s = document.getElementById('outlineStyle') || document.createElement('style');
    s.id = 'outlineStyle';
    if (s.textContent) { s.textContent = ''; Hub.ui?.toast?.('Outlines off', 'info'); }
    else { s.textContent = '* { outline: 1px solid rgba(59,130,246,.4) !important; }'; Hub.ui?.toast?.('Outlines on', 'info'); }
    document.head.appendChild(s);
  },

  setMotionSpeed(speed) {
    const s = document.getElementById('motionSpeedStyle') || document.createElement('style');
    s.id = 'motionSpeedStyle';
    s.textContent = `* { transition-duration: calc(var(--tw-transition-duration, 200ms) * ${speed}) !important; animation-duration: calc(0.4s * ${speed}) !important; }`;
    document.head.appendChild(s);
    Hub.ui?.toast?.(`Motion ${speed}x`, 'info');
  },

  setAccentHue(h) {
    document.getElementById('adminV_accentHue').textContent = h;
    document.documentElement.style.setProperty('--accent-primary', `hsl(${h},70%,55%)`);
  },

  setBgDim(v) {
    document.getElementById('adminV_bgDim').textContent = v;
    document.documentElement.style.setProperty('--bg-base', `hsl(222,35%,${Math.round(v/10)}%)`);
  },

  setBlur(v) {
    document.getElementById('adminV_blurStr').textContent = v;
    const s = document.getElementById('blurStyle') || document.createElement('style');
    s.id = 'blurStyle';
    s.textContent = `.glass-panel,.backdrop-blur-md{backdrop-filter:blur(${v}px) saturate(180%)!important;}`;
    document.head.appendChild(s);
  },

  setSaturation(v) {
    document.getElementById('adminV_satVal').textContent = v;
    document.body.style.filter = `saturate(${v}%)`;
  },

  toggleTapRipples() {
    if (window._tapRipple) {
      document.removeEventListener('touchstart', window._tapRipple);
      document.removeEventListener('click', window._tapRipple);
      window._tapRipple = null;
      Hub.ui?.toast?.('Tap ripples off', 'info');
    } else {
      window._tapRipple = (e) => {
        const t = e.touches?.[0] || e;
        const r = document.createElement('div');
        r.style.cssText = `position:fixed;left:${t.clientX-20}px;top:${t.clientY-20}px;width:40px;height:40px;border-radius:50%;background:rgba(59,130,246,.4);pointer-events:none;z-index:99999;animation:ripple .5s ease-out forwards;`;
        document.body.appendChild(r);
        setTimeout(() => r.remove(), 550);
      };
      if (!document.getElementById('rippleStyle')) {
        const s = document.createElement('style');
        s.id = 'rippleStyle';
        s.textContent = '@keyframes ripple{from{opacity:1;transform:scale(0)}to{opacity:0;transform:scale(2)}}';
        document.head.appendChild(s);
      }
      document.addEventListener('touchstart', window._tapRipple, {passive:true});
      document.addEventListener('click', window._tapRipple);
      Hub.ui?.toast?.('Tap ripples on', 'success');
    }
  },

  toggleHeatmap() {
    Hub.ui?.toast?.('Heatmap: tap around the screen — dots show touch frequency', 'info');
    const counts = {};
    const handler = (e) => {
      const t = e.touches?.[0] || e;
      const key = `${Math.round(t.clientX/50)}_${Math.round(t.clientY/50)}`;
      counts[key] = (counts[key] || 0) + 1;
      const dot = document.getElementById('hm_' + key) || (() => {
        const d = document.createElement('div');
        d.id = 'hm_' + key;
        d.style.cssText = `position:fixed;left:${Math.round(t.clientX/50)*50}px;top:${Math.round(t.clientY/50)*50}px;width:48px;height:48px;border-radius:50%;pointer-events:none;z-index:99998;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:bold;`;
        document.body.appendChild(d); return d;
      })();
      const c = counts[key];
      dot.style.background = `rgba(239,68,68,${Math.min(0.8, c*0.15)})`;
      dot.textContent = c;
    };
    document.addEventListener('click', handler);
    document.addEventListener('touchstart', handler, {passive:true});
    setTimeout(() => {
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
      document.querySelectorAll('[id^="hm_"]').forEach(d => d.remove());
    }, 15000);
  },

  enableGestures() {
    let startX, startY;
    const threshold = 80;
    document.addEventListener('touchstart', e => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }, {passive:true});
    document.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        if (dy > threshold) Hub.router.go('dashboard');
        if (dy < -threshold) Hub.router.go('standby');
      }
    }, {passive:true});
    Hub.ui?.toast?.('Swipe gestures enabled (↑ standby, ↓ home)', 'success');
  },

  toggleKidMode() {
    const on = document.body.classList.toggle('kid-mode');
    if (on) {
      const s = document.getElementById('kidStyle') || document.createElement('style');
      s.id = 'kidStyle';
      s.textContent = '.btn-danger,.btn-secondary[onclick*="remove"],[onclick*="delete"],[onclick*="reset"]{opacity:.3!important;pointer-events:none!important;}';
      document.head.appendChild(s);
    } else {
      document.getElementById('kidStyle')?.remove();
    }
    Hub.ui?.toast?.(`Kid mode ${on ? 'on — danger buttons locked' : 'off'}`, 'info');
  },

  toggleKineticScroll() {
    const s = document.getElementById('kineticStyle') || document.createElement('style');
    s.id = 'kineticStyle';
    if (s.textContent) { s.textContent = ''; Hub.ui?.toast?.('Kinetic scroll off', 'info'); }
    else {
      s.textContent = `* { -webkit-overflow-scrolling: touch !important; scroll-behavior: smooth !important; }`;
      document.head.appendChild(s);
      Hub.ui?.toast?.('Kinetic scroll on', 'success');
    }
  },

  enableInspector() {
    Hub.ui?.toast?.('Tap any element to inspect it', 'info');
    const handler = (e) => {
      e.preventDefault(); e.stopPropagation();
      const el = e.target;
      const info = `id: ${el.id||'—'}\nclasses: ${el.className||'—'}\nsize: ${Math.round(el.offsetWidth)}×${Math.round(el.offsetHeight)}\ntag: ${el.tagName}`;
      alert(info);
      document.removeEventListener('click', handler, true);
    };
    document.addEventListener('click', handler, true);
  },

  async pingTest() {
    const start = performance.now();
    try {
      await fetch('/api/health?t=' + Date.now(), {cache:'no-store'});
      const ms = Math.round(performance.now() - start);
      Hub.ui?.toast?.(`Ping: ${ms}ms`, ms < 200 ? 'success' : 'error');
    } catch {
      Hub.ui?.toast?.('Network offline or API unreachable', 'error');
    }
  },

  simWeather(type) {
    const data = {
      snow:  { headline:'Heavy snow expected', today:{high_f:28,low_f:18}, tomorrow:{high_f:24,low_f:14}, hazards:['Winter storm warning in effect'] },
      storm: { headline:'Severe thunderstorms likely', today:{high_f:65,low_f:55}, tomorrow:{high_f:70,low_f:58}, hazards:['Tornado watch until 8pm'] },
      clear: { headline:'Beautiful sunny day', today:{high_f:75,low_f:60}, tomorrow:{high_f:78,low_f:62}, hazards:[] },
    };
    const sim = data[type];
    if (!sim) return;
    // Inject into ai cache so standby._loadWeather picks it up
    if (Hub.ai) {
      Hub.ai._cache     = sim;
      Hub.ai._cacheTime = Date.now();
    }
    Hub.ui?.toast?.(`Simulating: ${type} weather`, 'info');
    this._log(`Sim weather: ${type}`);
    // If currently on standby, refresh
    if (Hub.router.current === 'standby') Hub.standby?._loadWeather?.();
  },

  simAlert() {
    Hub.ui?.showBanner?.('SIMULATED ALERT: Severe thunderstorm warning in effect', 'warning');
    Hub.ui?.toast?.('Alert simulated', 'info');
  },

  simOffline() {
    Hub.ui?.toast?.('Simulating offline — API calls will appear to fail', 'info');
    window._origFetch = window.fetch;
    window.fetch = () => Promise.reject(new Error('Simulated offline'));
    setTimeout(() => {
      window.fetch = window._origFetch;
      Hub.ui?.toast?.('Network restored', 'success');
    }, 10000);
  },

  simTime(time) {
    const [h, m] = time.split(':').map(Number);
    const orig = Date;
    window.Date = class extends orig {
      constructor(...a) { super(...a); if (!a.length) { const d = new orig(); d.setHours(h,m,0); return d; } }
      static now() { const d = new orig(); d.setHours(h,m,0); return d.getTime(); }
    };
    Hub.ui?.toast?.(`Time frozen at ${time}`, 'info');
    setTimeout(() => { window.Date = orig; Hub.ui?.toast?.('Time restored', 'info'); }, 30000);
  },

  freezeTime() {
    const now = new Date();
    const orig = Date;
    window.Date = class extends orig { constructor(...a) { super(...a); if (!a.length) return new orig(now); } static now() { return now.getTime(); } };
    Hub.ui?.toast?.(`Time frozen at ${now.toLocaleTimeString()}`, 'info');
  },

  simChores() {
    Hub.ui?.toast?.('Chore simulation — use real chore page to add items', 'info');
    Hub.router.go('chores');
  },

  simNowPlaying() {
    Hub.player.state.currentSource = 'radio';
    Hub.player.state.title = 'WNYC 93.9 FM';
    Hub.player.state.isPlaying = true;
    Hub.player.state.radioStatus = 'playing';
    Hub.player.updateUI();
    Hub.ui?.toast?.('Now Playing simulated', 'info');
  },

  _renderLog() {
    const el = document.getElementById('adminEventLog');
    if (!el) return;
    el.innerHTML = this._eventLog.length
      ? this._eventLog.map(e => `<div class="text-xs border-b border-gray-800 py-1"><span class="text-gray-500">${e.t}</span> ${Hub.utils.esc(e.msg)}</div>`).join('')
      : '<div class="text-xs text-gray-500">No events yet</div>';
  },

  _renderSystemStats() {
    const el = document.getElementById('adminSysStats');
    if (!el) return;
    const mem = performance.memory ? `${Math.round(performance.memory.usedJSHeapSize/1048576)}MB / ${Math.round(performance.memory.totalJSHeapSize/1048576)}MB` : 'N/A';
    if (document.getElementById('adminMem')) document.getElementById('adminMem').textContent = mem.split(' ')[0];
    el.innerHTML = `
      <div>User Agent: ${navigator.userAgent.slice(0,50)}…</div>
      <div>Memory: ${mem}</div>
      <div>Uptime: ${this._uptime()}</div>
      <div>Route: ${Hub.router.current}</div>
      <div>Household: ${Hub.state?.household_id?.slice(0,8) || '—'}…</div>
      <div>Role: ${Hub.state?.userRole || '—'}</div>
      <div>Slideshow: ${Hub.immich._ss.images.length} photos, index ${Hub.immich._ss.index}</div>
    `;
  },

  _bindDisplaySliders() {
    // sliders are rendered inline — no extra binding needed
  },

  _uptime() {
    if (!this._startTime) this._startTime = Date.now();
    const s = Math.floor((Date.now() - this._startTime) / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return h ? `${h}h ${m%60}m` : `${m}m ${s%60}s`;
  },

  startAutoResetChecker() {
    // Stub — auto reset is controlled by toggle in System tab
  }
};
