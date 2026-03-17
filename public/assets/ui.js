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
  // showBanner() is retired — Hub.weather._renderAlertBanner() handles all alert display now.
  // Kept as a no-op so any stale call sites don't throw.
  showBanner() {},

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

    // Quiet hours — suppress non-severe alerts
    const s       = Hub.state.settings || {};
    const isQuiet = Hub.utils.isQuietHours(s.quiet_hours_start, s.quiet_hours_end);

    const sevOrder = { extreme: 0, severe: 1, moderate: 2, minor: 3, unknown: 4 };
    const sorted   = [...alerts].sort((a, b) =>
      (sevOrder[(a.severity||'').toLowerCase()] ?? 4) - (sevOrder[(b.severity||'').toLowerCase()] ?? 4)
    );
    const top = sorted[0];
    if (isQuiet && !['extreme','severe'].includes((top.severity||'').toLowerCase())) return;

    // Idempotency — don't re-show an already-acknowledged alert
    const alertId = (top.id || top.event || top.headline || 'alert').slice(0, 200);
    if (Hub.state.user) {
      try {
        const seen = await Hub.db.isAlertSeen(Hub.state.user.id, alertId);
        if (seen) return;
      } catch (e) {}
    }

    // Expiry guard
    if (top.expires) {
      const msLeft = new Date(top.expires).getTime() - Date.now();
      if (msLeft <= 0) return;
      // Auto-close when it expires
      setTimeout(() => {
        const popup = Hub.utils.$('alertPopup');
        if (popup && !popup.classList.contains('hidden')) popup.classList.add('hidden');
      }, msLeft);
    }

    // ── Per-severity theming ─────────────────────────────────────────────
    const THEME = {
      Extreme:  { bar: '#dc2626', pill: '#dc2626', icon: '🚨' },
      Severe:   { bar: '#ea580c', pill: '#ea580c', icon: '⚠️' },
      Moderate: { bar: '#d97706', pill: '#d97706', icon: '🌦️' },
      Minor:    { bar: '#2563eb', pill: '#2563eb', icon: 'ℹ️' },
      Unknown:  { bar: '#4b5563', pill: '#4b5563', icon: '📢' },
    };
    const th = THEME[top.severity] || THEME.Unknown;

    // ── Populate modal ───────────────────────────────────────────────────
    const $ = id => document.getElementById(id);

    // Store alert id for dismissal
    const popupText = Hub.utils.$('alertPopupText');
    if (popupText) popupText.dataset.alertId = alertId;

    // Colour bar + pill
    const bar = $('alertPopupBar');
    if (bar) bar.style.background = th.bar;
    const pill = $('alertPopupSeverityPill');
    if (pill) { pill.textContent = top.severity || 'Alert'; pill.style.background = th.pill; }
    const icon = $('alertPopupIcon');
    if (icon) icon.textContent = th.icon;

    // Event name
    const evEl = $('alertPopupEvent');
    if (evEl) evEl.textContent = top.event || 'Weather Alert';

    // Area + expires
    const areaEl = $('alertPopupArea');
    if (areaEl) areaEl.textContent = top.area || '';
    const expEl = $('alertPopupExpires');
    if (expEl && top.expires) {
      expEl.textContent = 'Until ' + new Date(top.expires)
        .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } else if (expEl) {
      expEl.textContent = '';
    }

    // Full NWS text
    const descEl = $('alertPopupDesc');
    if (descEl) descEl.textContent = top.description || '';
    const instrEl = $('alertPopupInstr');
    if (instrEl) {
      instrEl.textContent = top.instruction ? '⚡ What to do: ' + top.instruction : '';
    }

    // Reset full-text toggle
    const fullWrap = $('alertPopupFullWrap');
    const toggleBtn = $('alertPopupToggleFull');
    if (fullWrap) fullWrap.classList.add('hidden');
    if (toggleBtn) toggleBtn.textContent = 'View full alert ↓';

    // Hide full text button if nothing to show
    if (toggleBtn) {
      toggleBtn.style.visibility = (top.description || top.instruction) ? 'visible' : 'hidden';
    }

    // Show modal
    Hub.utils.$('alertPopup')?.classList.remove('hidden');

    // ── Async: Gemini summary ────────────────────────────────────────────
    const aiText = $('alertPopupAiText');
    if (aiText) {
      try {
        const base = Hub.utils.apiBase();
        const resp = await fetch(base + '/api/weather-ai-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'alert',
            event: top.event, severity: top.severity, urgency: top.urgency,
            area: top.area, description: top.description,
            instruction: top.instruction, expires: top.expires,
          })
        });
        const { summary } = await resp.json();
        if (!Hub.utils.$('alertPopup')?.classList.contains('hidden')) {
          if (summary) {
            const sents = summary.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
            aiText.innerHTML = sents.length > 1
              ? sents[0] + ' <span style="color:#9ca3af;">' + Hub.utils.esc(sents[1]) + '</span>'
              : Hub.utils.esc(summary);
          } else {
            aiText.textContent = top.headline || top.event || '';
          }
        }
      } catch (e) {
        if (aiText) aiText.textContent = top.headline || top.event || '';
      }
    }
  },

  /** Toggle full NWS text in alert popup */
  toggleAlertPopupFull() {
    const wrap = document.getElementById('alertPopupFullWrap');
    const btn  = document.getElementById('alertPopupToggleFull');
    if (!wrap) return;
    const hidden = wrap.classList.toggle('hidden');
    if (btn) btn.textContent = hidden ? 'View full alert ↓' : 'Hide full alert ↑';
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

  /** Update dashboard greeting with household name */
  updateDashboardGreeting() {
    const el = Hub.utils.$('dashboardGreeting');
    if (!el) return;
    
    const displayName = window.HOME_HUB_CONFIG?.householdDisplayName || Hub.utils.getUserFirstName();
    if (displayName) {
      const hour = new Date().getHours();
      let greeting = 'Good morning';
      if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
      else if (hour >= 17) greeting = 'Good evening';
      
      el.textContent = `${greeting}, ${displayName}!`;
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
};
