import { escapeHtml } from '../core/format.js';
import { badgeClass } from './status.js';

export function summaryCard(module = {}, options = {}) {
  const safeModule = module && typeof module === 'object' ? module : {};
  const status = options.status || safeModule.status || 'normal';
  const badges = (Array.isArray(safeModule.badges) ? safeModule.badges : [])
    .slice(0, 3)
    .map((badge) => `<span class="hh-badge hh-badge-neutral">${escapeHtml(badge)}</span>`)
    .join('');
  const cta = options.cta || safeModule.cta || null;
  const footer = options.footer || '';
  return `
    <article class="hh-card ${options.hero ? 'hh-card-hero' : ''} ${options.className || ''}">
      <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;">
        <div style="display:grid;gap:.55rem;">
          <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
            <span class="hh-badge ${badgeClass(status)}">${escapeHtml(status)}</span>
            ${badges}
          </div>
          <div class="hh-row-title" style="font-size:${options.hero ? '1.6rem' : '1.15rem'};">${escapeHtml(safeModule.headline || 'Untitled module')}</div>
          <p class="hh-row-copy" style="margin:0;">${escapeHtml(safeModule.supportingText || '')}</p>
        </div>
      </div>
      ${cta || footer ? `
        <div class="hh-card-actions">
          ${cta ? `<button class="hh-btn hh-btn-secondary" data-route="${String(cta.route || '').replace(/^#\//, '')}">${escapeHtml(cta.label)}</button>` : ''}
          ${footer}
        </div>
      ` : ''}
    </article>
  `;
}
