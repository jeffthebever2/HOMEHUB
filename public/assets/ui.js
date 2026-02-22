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

  /** Alert banner auto-dismiss watchdog interval */
  _bannerWatchdog: null,

  /**
   * showBanner(threats, severity)
   * threats: string | string[] — event names to scroll in the ticker
   * severity: 'warning' | 'watch' | 'advisory'
   * Renders a scrolling ticker with a ✕ close button.
   * Starts a watchdog that re-checks live alerts every 2 min and
   * hides the banner automatically when all alerts have expired.
   */
  showBanner(threats, severity) {
    const banner = Hub.utils.$('alertBanner');
    if (!banner) return;

    const threatList = Array.isArray(threats) ? threats : [threats];
    if (!threatList.length) { this.hideBanner(); return; }

    // Deduplicate
    const unique = [...new Set(threatList.filter(Boolean))];

    // Build ticker text repeated twice for seamless CSS loop
    const segment = unique.map(t => '⚠ ' + t).join('  ·  ');
    const ticker  = segment + '  ·  ' + segment;

    // Map NWS severity names to CSS classes (CSS defines warning/watch/advisory)
    const rawSev = (severity || 'watch').toLowerCase();
    const sevMap = { extreme: 'warning', severe: 'warning', moderate: 'watch', minor: 'advisory' };
    const sev    = sevMap[rawSev] || rawSev; // pass through warning/watch/advisory unchanged
    banner.className = 'alert-banner alert-banner--ticker ' + sev;
    banner.innerHTML =
      '<div class="alert-banner__track" aria-label="Weather alert ticker">' +
        '<span class="alert-banner__text">' + Hub.utils.esc(ticker) + '</span>' +
      '</div>' +
      '<button class="alert-banner__close" onclick="Hub.ui.hideBanner()" aria-label="Dismiss alert">✕</button>';

    banner.classList.remove('hidden');

    // Watchdog: re-fetch live alerts every 2 minutes; auto-hide when all expired
    if (this._bannerWatchdog) clearInterval(this._bannerWatchdog);
    this._bannerWatchdog = setInterval(async () => {
      try {
        const live = await Hub.weather.fetchAlerts();
        if (!live.length) {
          console.log('[UI] Banner watchdog: all alerts expired — hiding banner');
          this.hideBanner();
        } else {
          // Refresh banner text in case event names changed
          const fresh  = [...new Set(live.map(a => a.event || a.headline).filter(Boolean))];
          const seg    = fresh.map(t => '⚠ ' + t).join('  ·  ');
          const tick   = seg + '  ·  ' + seg;
          const track  = banner.querySelector('.alert-banner__text');
          if (track) track.textContent = tick;
        }
      } catch (e) { /* network error — keep showing until next check */ }
    }, 2 * 60 * 1000); // every 2 minutes
  },

  /** Hide alert banner and cancel its watchdog */
  hideBanner() {
    Hub.utils.$('alertBanner')?.classList.add('hidden');
    if (this._bannerWatchdog) {
      clearInterval(this._bannerWatchdog);
      this._bannerWatchdog = null;
    }
  },

  /**
   * showAlertPopup(alerts)
   * alerts: raw alert objects from fetchAlerts() — already expiry-filtered.
   * Shows a modal for the highest-severity active alert if not already acknowledged.
   */
  async showAlertPopup(alerts) {
    if (!alerts || !alerts.length) return;

    // Respect quiet hours — suppress advisory/watch during quiet, keep warning
    const s       = Hub.state.settings || {};
    const isQuiet = Hub.utils.isQuietHours(s.quiet_hours_start, s.quiet_hours_end);

    // Sort by severity: extreme > severe > moderate > minor
    const sevOrder = { extreme: 0, severe: 1, moderate: 2, minor: 3, unknown: 4 };
    const sorted   = [...alerts].sort((a, b) =>
      (sevOrder[(a.severity||'').toLowerCase()] ?? 4) - (sevOrder[(b.severity||'').toLowerCase()] ?? 4)
    );

    const top = sorted[0];
    if (isQuiet && !['extreme','severe'].includes((top.severity||'').toLowerCase())) return;

    // Use alert id + event as the seen-key so each unique alert type is tracked
    const alertId = (top.id || top.event || top.headline || 'alert').slice(0, 200);
    if (Hub.state.user) {
      try {
        const seen = await Hub.db.isAlertSeen(Hub.state.user.id, alertId);
        if (seen) return;
      } catch (e) {}
    }

    const popupText = Hub.utils.$('alertPopupText');
    if (popupText) {
      popupText.dataset.alertId = alertId;
      const expireMs = top.expires ? new Date(top.expires).getTime() : null;
      const expiresStr = expireMs
        ? new Date(expireMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : null;
      popupText.textContent =
        (top.event || top.headline || 'Weather Alert') +
        (top.area      ? ' · ' + top.area        : '') +
        (expiresStr    ? ' (expires ' + expiresStr + ')' : '');

      // Auto-close popup when its own expiry arrives (to the second)
      if (expireMs) {
        const msUntilExpiry = expireMs - Date.now();
        if (msUntilExpiry > 0) {
          setTimeout(() => {
            const popup = Hub.utils.$('alertPopup');
            if (popup && !popup.classList.contains('hidden')) {
              console.log('[UI] Popup auto-closed: alert expired');
              popup.classList.add('hidden');
            }
          }, msUntilExpiry);
        } else {
          // Already expired — don't show at all
          return;
        }
      }
    }
    Hub.utils.$('alertPopup')?.classList.remove('hidden');
  },

  /** Dismiss alert popup and mark as seen */
  async dismissAlert() {
    const popupText = Hub.utils.$('alertPopupText');
    const alertId   = popupText?.dataset.alertId || popupText?.textContent || '';
    Hub.utils.$('alertPopup')?.classList.add('hidden');
    if (Hub.state.user && alertId) {
      try { await Hub.db.markAlertSeen(Hub.state.user.id, alertId, 'acknowledged'); } catch (e) {}
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

  /** Update dashboard greeting — shows household display name from config */
  updateDashboardGreeting() {
    const el = Hub.utils.$('dashboardGreeting');
    if (!el) return;

    const householdName = window.HOME_HUB_CONFIG?.householdDisplayName || 'Scott family';
    const hour = new Date().getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17) greeting = 'Good evening';

    el.textContent = `${greeting}, ${householdName}!`;
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
};
