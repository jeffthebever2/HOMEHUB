// ============================================================
// assets/utils.js — Shared utilities
// ============================================================
window.Hub = window.Hub || {};

Hub.utils = {
  /** Shorthand for document.getElementById */
  $(id) { return document.getElementById(id); },

  /** Escape HTML to prevent XSS */
  esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
  },

  /** Format date nicely */
  formatDate(d) {
    return new Date(d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  },

  /** Format time nicely */
  formatTime(d) {
    return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  },

  /** Get start of today as ms timestamp */
  todayStart() {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  },

  /** Get start of N days ago as ms timestamp */
  daysAgo(n) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d.getTime();
  },

  /** Check if current time is within quiet hours */
  isQuietHours(start, end) {
    if (!start || !end) return false;
    const now = new Date();
    const hhmm = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    if (s <= e) return hhmm >= s && hhmm < e;
    return hhmm >= s || hhmm < e;  // wraps midnight
  },

  /** Deep merge objects (safe from prototype pollution) */
  merge(target, ...sources) {
    // Reject the three dangerous keys that allow escaping into Object.prototype
    // (e.g. attacker JSON {"__proto__": {"isAdmin": true}}).
    const BLOCKED = new Set(['__proto__', 'constructor', 'prototype']);
    for (const src of sources) {
      if (!src || typeof src !== 'object') continue;
      // Use hasOwnProperty-filtered keys so inherited props can't sneak in.
      for (const key of Object.keys(src)) {
        if (BLOCKED.has(key)) continue;
        if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
        const val = src[key];
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          target[key] = Hub.utils.merge(
            (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key]))
              ? target[key]
              : {},
            val
          );
        } else {
          target[key] = val;
        }
      }
    }
    return target;
  },

  /** Get API base URL */
  apiBase() {
    return (window.HOME_HUB_CONFIG?.apiBase || '').replace(/\/$/, '');
  },

  /** Get location from settings (resolved) */
  getLocation() {
    const s = Hub.state?.settings || {};
    return {
      name: s.location_name || window.HOME_HUB_CONFIG?.defaultLocation?.name || 'Home',
      lat: s.location_lat || window.HOME_HUB_CONFIG?.defaultLocation?.lat || 40.029059,
      lon: s.location_lon || window.HOME_HUB_CONFIG?.defaultLocation?.lon || -82.863462
    };
  },

  /** Get user's first name from Google OAuth */
  getUserFirstName(user) {
    if (!user) user = Hub.state?.user;
    if (!user) return null;
    
    // Try user_metadata.full_name first (Google OAuth)
    if (user.user_metadata?.full_name) {
      const name = user.user_metadata.full_name.trim();
      return name.split(' ')[0]; // Get first word as first name
    }
    
    // Try user_metadata.name
    if (user.user_metadata?.name) {
      const name = user.user_metadata.name.trim();
      return name.split(' ')[0];
    }
    
    // Fall back to email prefix
    if (user.email) {
      return user.email.split('@')[0];
    }
    
    return null;
  },

  /** Get user's display name (first name or email) */
  getUserDisplayName(user) {
    const firstName = this.getUserFirstName(user);
    if (firstName) return firstName;
    if (!user) user = Hub.state?.user;
    return user?.email || 'User';
  },

  /** Get user's initials for avatar */
  getUserInitials(user) {
    if (!user) user = Hub.state?.user;
    if (!user) return '?';
    
    // Try full name
    if (user.user_metadata?.full_name) {
      const parts = user.user_metadata.full_name.trim().split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return parts[0].substring(0, 2).toUpperCase();
    }
    
    // Fall back to email
    if (user.email) {
      return user.email.substring(0, 2).toUpperCase();
    }
    
    return '?';
  }
};
