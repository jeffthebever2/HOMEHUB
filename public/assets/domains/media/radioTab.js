import { asArray, escapeHtml } from '../../core/format.js';

export function renderRadioTab(detail = {}, nowPlaying = {}) {
  const presets = asArray(detail.radioPresets);
  return `
    <div class="hh-grid">
      <section class="hh-card hh-col-8">
        <div class="hh-stack">
          <div class="hh-page-kicker">Radio presets</div>
          ${presets.length ? `
            <div class="hh-list">
              ${presets.map((station) => `
                <div class="hh-list-row">
                  <div class="hh-row-meta">
                    <div class="hh-row-title">${escapeHtml(station.emoji || '📻')} ${escapeHtml(station.name || 'Station')}</div>
                    <div class="hh-row-copy">${escapeHtml(station.streamUrl || 'Stream URL unavailable')}</div>
                  </div>
                  <div class="hh-inline-actions">
                    <button class="hh-btn hh-btn-primary" data-radio-play="${escapeHtml(station.id)}">Play</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="hh-state">
              <p class="hh-state-title">No radio presets available</p>
              <p class="hh-state-copy">The Media page is still available, but HomeHub did not receive any preset stations.</p>
            </div>
          `}
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">Radio controls</div>
          <div class="hh-kv">
            <div class="hh-kv-row"><span>Source</span><strong>${escapeHtml(nowPlaying.sourceType || 'idle')}</strong></div>
            <div class="hh-kv-row"><span>Status</span><strong>${escapeHtml(nowPlaying.state || 'idle')}</strong></div>
            <div class="hh-kv-row"><span>Title</span><strong>${escapeHtml(nowPlaying.title || 'Nothing playing')}</strong></div>
          </div>
          <div class="hh-inline-actions">
            <button class="hh-btn hh-btn-secondary" data-media-action="pause">Pause</button>
            <button class="hh-btn hh-btn-secondary" data-media-action="stop">Stop</button>
          </div>
        </div>
      </aside>
    </div>
  `;
}
