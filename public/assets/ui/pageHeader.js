import { escapeHtml } from '../core/format.js';

export function pageHeader({ kicker = '', title, subtitle = '', actions = '' }) {
  return `
    <header class="hh-page-header">
      <div>
        ${kicker ? `<p class="hh-page-kicker">${escapeHtml(kicker)}</p>` : ''}
        <h1 class="hh-page-title">${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="hh-page-subtitle">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      ${actions ? `<div class="hh-page-actions">${actions}</div>` : ''}
    </header>
  `;
}
