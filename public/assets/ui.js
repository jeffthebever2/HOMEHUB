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

    if (isQuiet && alertData.severity !== 'warning') return;

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

  /** Toast notification */
  toast(msg, type) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);z-index:100;padding:.75rem 1.5rem;border-radius:.5rem;font-weight:500;transition:opacity .3s;max-width:90vw;text-align:center;';
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
      el.textContent = greeting + ', ' + firstName + '!';
    } else {
      el.textContent = '';
    }
  }
};
