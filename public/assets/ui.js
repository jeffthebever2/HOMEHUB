// ============================================================
// assets/ui.js — Shared UI helpers
// ============================================================
window.Hub = window.Hub || {};

Hub.ui = {
  /** Close a modal by ID */
  closeModal(id) {
    Hub.utils.$(id)?.classList.add('hidden');
  },

  /** Open a modal by ID */
  openModal(id) {
    Hub.utils.$(id)?.classList.remove('hidden');
  },

  /** Show alert banner */
  showBanner(text, severity) {
    const banner = Hub.utils.$('alertBanner');
    if (!banner) return;
    banner.className = 'alert-banner ' + (severity || 'watch');
    banner.innerHTML = '⚠️ ' + Hub.utils.esc(text);
    banner.classList.remove('hidden');
  },

  /** Hide alert banner */
  hideBanner() {
    Hub.utils.$('alertBanner')?.classList.add('hidden');
  },

  /** Show alert popup (respects quiet hours + seen state) */
  async showAlertPopup(alertData) {
    if (!alertData?.active) return;
    const s = Hub.state.settings || {};
    const isQuiet = Hub.utils.isQuietHours(s.quiet_hours_start, s.quiet_hours_end);

    // During quiet hours, suppress popup unless severity is "warning"
    if (isQuiet && alertData.severity !== 'warning') return;

    // Check if already seen
    const alertId = alertData.banner_text || 'unknown';
    if (Hub.state.user) {
      const seen = await Hub.db.isAlertSeen(Hub.state.user.id, alertId);
      if (seen) return;
    }

    Hub.utils.$('alertPopupText').textContent = alertData.banner_text || 'Weather alert active';
    Hub.utils.$('alertPopup').classList.remove('hidden');
  },

  /** Dismiss alert popup and mark as seen */
  async dismissAlert() {
    const text = Hub.utils.$('alertPopupText')?.textContent || '';
    Hub.utils.$('alertPopup').classList.add('hidden');
    if (Hub.state.user && text) {
      await Hub.db.markAlertSeen(Hub.state.user.id, text, 'acknowledged');
    }
  },

  /** Render a simple toast message */
  toast(msg, type) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);z-index:100;padding:.75rem 1.5rem;border-radius:.5rem;font-weight:500;transition:opacity .3s;';
    el.style.background = type === 'error' ? '#ef4444' : '#10b981';
    el.style.color = '#fff';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2500);
  },

  /** Update dashboard date */
  updateDashboardDate() {
    const el = Hub.utils.$('dashboardDate');
    if (el) el.textContent = Hub.utils.formatDate(new Date());
  },

  /** Update dashboard greeting with user's name */
  updateDashboardGreeting() {
    const el = Hub.utils.$('dashboardGreeting');
    if (!el) return;
    
    const firstName = Hub.utils.getUserFirstName();
    if (firstName) {
      const hour = new Date().getHours();
      let greeting = 'Good morning';
      if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
      else if (hour >= 17) greeting = 'Good evening';
      
      el.textContent = `${greeting}, ${firstName}! 👋`;
    } else {
      el.textContent = '';
    }
  },

  // ── Touchscreen Mode ─────────────────────────────────────
  applyTouchscreenMode() {
    const larger    = document.getElementById('tsLargerUI')?.checked;
    const noHover   = document.getElementById('tsDisableHover')?.checked;
    const largeHits = document.getElementById('tsLargeHits')?.checked;
    const reduceMot = document.getElementById('tsReduceMotion')?.checked;

    document.body.classList.toggle('touchscreen-mode', !!(larger || noHover || largeHits));
    document.body.classList.toggle('reduce-motion', !!reduceMot);

    // Save preferences
    localStorage.setItem('hub_ts_mode', JSON.stringify({ larger, noHover, largeHits, reduceMot }));
  },

  loadTouchscreenMode() {
    try {
      const saved = JSON.parse(localStorage.getItem('hub_ts_mode') || 'null');
      if (!saved) return;
      if (document.getElementById('tsLargerUI'))    document.getElementById('tsLargerUI').checked    = !!saved.larger;
      if (document.getElementById('tsDisableHover')) document.getElementById('tsDisableHover').checked = !!saved.noHover;
      if (document.getElementById('tsLargeHits'))  document.getElementById('tsLargeHits').checked   = !!saved.largeHits;
      if (document.getElementById('tsReduceMotion')) document.getElementById('tsReduceMotion').checked = !!saved.reduceMot;
      this.applyTouchscreenMode();
    } catch (e) { /* ignore */ }
  },

  // ── Fullscreen ───────────────────────────────────────────
  enterFullscreen() {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (fn) {
      fn.call(el).then(() => {
        const s = document.getElementById('fullscreenStatus');
        if (s) s.textContent = '✓ Fullscreen active';
      }).catch(err => {
        const s = document.getElementById('fullscreenStatus');
        if (s) s.textContent = `Error: ${err.message}`;
      });
    } else {
      const s = document.getElementById('fullscreenStatus');
      if (s) s.textContent = 'Fullscreen not supported';
    }
  },

  exitFullscreen() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
    if (fn) {
      fn.call(document).then(() => {
        const s = document.getElementById('fullscreenStatus');
        if (s) s.textContent = '✓ Exited fullscreen';
      }).catch(() => {});
    }
  },

  // ── Accordion ────────────────────────────────────────────
  toggleAccordion(headerEl) {
    const body = headerEl.nextElementSibling;
    if (!body) return;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    headerEl.classList.toggle('open', !isOpen);
  },

  // ── Confetti burst ───────────────────────────────────────
  confettiBurst(x, y) {
    const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
    for (let i = 0; i < 12; i++) {
      const dot = document.createElement('div');
      dot.className = 'confetti-dot';
      dot.style.cssText = `
        left:${x - 4}px; top:${y - 4}px;
        background:${colors[i % colors.length]};
        transform-origin:center;
        margin-left:${(Math.random()-0.5)*40}px;
      `;
      document.body.appendChild(dot);
      setTimeout(() => dot.remove(), 900);
    }
  }

  // ── Touchscreen Mode ─────────────────────────────────────────
  applyTouchscreenMode() {
    const larger    = document.getElementById('tsLargerUI')?.checked;
    const noHover   = document.getElementById('tsDisableHover')?.checked;
    const largeHits = document.getElementById('tsLargeHits')?.checked;
    const reduceMot = document.getElementById('tsReduceMotion')?.checked;

    document.body.classList.toggle('touchscreen-mode', !!(larger || noHover || largeHits));
    document.body.classList.toggle('reduce-motion',    !!reduceMot);

    localStorage.setItem('hub_ts_mode', JSON.stringify({ larger, noHover, largeHits, reduceMot }));
  },

  loadTouchscreenMode() {
    try {
      const saved = JSON.parse(localStorage.getItem('hub_ts_mode') || 'null');
      if (!saved) return;
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
      set('tsLargerUI',    saved.larger);
      set('tsDisableHover', saved.noHover);
      set('tsLargeHits',   saved.largeHits);
      set('tsReduceMotion', saved.reduceMot);
      this.applyTouchscreenMode();
    } catch (_) {}
  },

  // ── Fullscreen ────────────────────────────────────────────────
  enterFullscreen() {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (!fn) {
      const s = document.getElementById('fullscreenStatus');
      if (s) s.textContent = 'Fullscreen not supported in this browser';
      return;
    }
    fn.call(el)
      .then(() => { const s = document.getElementById('fullscreenStatus'); if (s) s.textContent = '✓ Fullscreen active'; })
      .catch(err => { const s = document.getElementById('fullscreenStatus'); if (s) s.textContent = `Error: ${err.message}`; });
  },

  exitFullscreen() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
    if (fn) fn.call(document)
      .then(() => { const s = document.getElementById('fullscreenStatus'); if (s) s.textContent = '✓ Exited fullscreen'; })
      .catch(() => {});
  },

  // ── Accordion ─────────────────────────────────────────────────
  toggleAccordion(headerEl) {
    const body = headerEl.nextElementSibling;
    if (!body) return;
    const open = body.classList.toggle('open');
    headerEl.classList.toggle('open', open);
  },

  // ── Confetti burst (lightweight, Pi-safe) ────────────────────
  confettiBurst(x, y) {
    if (document.body.classList.contains('reduce-motion')) return;
    const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
    for (let i = 0; i < 12; i++) {
      const dot = document.createElement('div');
      dot.className = 'confetti-dot';
      dot.style.cssText = `
        left:${x}px; top:${y}px;
        background:${colors[i % colors.length]};
        margin-left:${(Math.random() - 0.5) * 50}px;`;
      document.body.appendChild(dot);
      setTimeout(() => dot.remove(), 950);
    }
  }
};
