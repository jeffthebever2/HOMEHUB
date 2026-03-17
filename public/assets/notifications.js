// ============================================================
// assets/notifications.js — Web Push subscription manager
// ============================================================
window.Hub = window.Hub || {};

Hub.notifications = {
  VAPID_PUBLIC: 'BDTOG1Io2qVKPDuDOV-aat7wlTow6_I004jpwcNpwX4YRrglV1To2AaWlT3YyY9lZcuKZWdHrVa28QWKeQxS-4o',
  _sub: null,

  /** Call once after login to register push if permission already granted */
  async init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'granted') {
      await this._subscribe();
    }
  },

  /** Ask permission and subscribe */
  async requestAndSubscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      Hub.ui?.toast?.('Push notifications not supported in this browser', 'error');
      return false;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      Hub.ui?.toast?.('Notification permission denied', 'error');
      return false;
    }
    return await this._subscribe();
  },

  async _subscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) { this._sub = existing; this._syncToServer(existing); return true; }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this._urlBase64ToUint8Array(this.VAPID_PUBLIC),
      });
      this._sub = sub;
      await this._syncToServer(sub);
      return true;
    } catch (e) {
      console.warn('[Push] Subscribe error:', e.message);
      return false;
    }
  },

  async unsubscribe() {
    if (this._sub) {
      await this._syncToServer(this._sub, 'unsubscribe');
      await this._sub.unsubscribe();
      this._sub = null;
    }
  },

  async _syncToServer(sub, action = 'subscribe') {
    try {
      const session = await Hub.auth?.getSession?.();
      const token   = session?.access_token;
      if (!token) return;
      await fetch(Hub.utils.apiBase() + '/api/push-subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ subscription: sub.toJSON(), action }),
      });
    } catch (e) {
      console.warn('[Push] Server sync failed:', e.message);
    }
  },

  async isSubscribed() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    if (Notification.permission !== 'granted') return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch (_) { return false; }
  },

  // Called by weather.js when a severe alert fires
  async notifyAlert(alert) {
    try {
      const session = await Hub.auth?.getSession?.();
      const token   = session?.access_token;
      if (!token || !Hub.state?.household_id) return;
      await fetch(Hub.utils.apiBase() + '/api/push-alert', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          household_id: Hub.state.household_id,
          title:        `⚠️ ${alert.event || 'Weather Alert'}`,
          body:         alert.headline || alert.area || '',
          severity:     alert.severity,
        }),
      });
    } catch (e) {
      console.warn('[Push] Alert notify failed:', e.message);
    }
  },

  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  },
  /** Called by the settings page toggle button */
  async _toggleFromSettings() {
    const btn    = document.getElementById('btnPushToggle');
    const status = document.getElementById('pushStatusText');
    if (btn) btn.disabled = true;

    const subscribed = await this.isSubscribed();
    if (subscribed) {
      await this.unsubscribe();
      if (status) status.textContent = 'Notifications off';
      if (btn)    { btn.textContent = 'Enable'; btn.disabled = false; }
      Hub.ui?.toast?.('Push notifications disabled', 'success');
    } else {
      const ok = await this.requestAndSubscribe();
      if (ok) {
        if (status) status.textContent = 'Notifications on — you\'ll get alerts for Severe & Extreme weather';
        if (btn)    { btn.textContent = 'Disable'; btn.disabled = false; }
        Hub.ui?.toast?.('Push notifications enabled! 🔔', 'success');
      } else {
        if (btn) btn.disabled = false;
      }
    }
  },

  /** Refresh the settings page push status display */
  async refreshSettingsUI() {
    const btn    = document.getElementById('btnPushToggle');
    const status = document.getElementById('pushStatusText');
    if (!btn || !status) return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      status.textContent = 'Not supported in this browser';
      btn.disabled = true;
      return;
    }
    if (Notification.permission === 'denied') {
      status.textContent = 'Blocked by browser — allow notifications in browser settings';
      btn.disabled = true;
      return;
    }
    const subscribed = await this.isSubscribed();
    status.textContent = subscribed
      ? 'Notifications on — you\'ll get alerts for Severe & Extreme weather'
      : 'Off — tap Enable to receive severe weather alerts';
    btn.textContent = subscribed ? 'Disable' : 'Enable';
    btn.disabled    = false;
  },
};
