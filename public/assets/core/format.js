import { go } from './router.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDateTime(value, options = {}) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  });
}

export function formatDate(value, options = {}) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...options,
  });
}

export function formatTime(value, options = {}) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  });
}

export function bindRouteButtons(root) {
  root.querySelectorAll('[data-route]').forEach((element) => {
    element.addEventListener('click', () => {
      if (element.dataset.route) go(element.dataset.route);
    });
  });
}

export function makeWarningBadges(warnings = []) {
  return warnings
    .filter(Boolean)
    .map((warning) => `<span class="hh-badge hh-badge-offline">${escapeHtml(warning)}</span>`)
    .join('');
}
