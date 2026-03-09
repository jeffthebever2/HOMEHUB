import { escapeHtml, formatDateTime } from '../../core/format.js';

export function renderMediaHero(summary) {
  const nowPlaying = summary.nowPlaying || {};
  return `
    <section class="hh-card hh-card-hero hh-col-12">
      <div class="hh-stack">
        <div class="hh-pill-row">
          <span class="hh-badge hh-badge-${summary.status === 'success' ? 'success' : summary.status === 'warning' ? 'warning' : 'neutral'}">${escapeHtml(nowPlaying.sourceType || 'idle')}</span>
          <span class="hh-badge hh-badge-neutral">${escapeHtml(nowPlaying.state || 'idle')}</span>
        </div>
        <div>
          <div class="hh-row-title" style="font-size:2rem;">${escapeHtml(summary.headline)}</div>
          <p class="hh-row-copy" style="margin:.6rem 0 0;">${escapeHtml(summary.supportingText)}</p>
        </div>
        <div class="hh-kv">
          <div class="hh-kv-row"><span>Started</span><strong>${escapeHtml(nowPlaying.startedAt ? formatDateTime(nowPlaying.startedAt, { hour: 'numeric', minute: '2-digit' }) : 'Not active')}</strong></div>
        </div>
      </div>
    </section>
  `;
}
