import { escapeHtml } from '../../core/format.js';

export function renderMusicTab(detail = {}, nowPlaying = {}) {
  const spotifyEmbedUrl = detail.musicContext?.spotifyEmbedUrl || '';
  return `
    <div class="hh-grid">
      <section class="hh-card hh-col-8">
        <div class="hh-stack">
          <div class="hh-page-kicker">Music</div>
          <p class="hh-row-copy" style="margin:0;">Use the embedded player for streaming music. HomeHub keeps a shared now-playing state so dashboard and standby summaries stay in sync.</p>
          ${spotifyEmbedUrl ? `
            <iframe
              class="hh-embed"
              src="${escapeHtml(spotifyEmbedUrl)}"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              title="Spotify embed"
            ></iframe>
          ` : `
            <div class="hh-state">
              <p class="hh-state-title">Music embed unavailable</p>
              <p class="hh-state-copy">Add a Spotify embed URL in server config to restore the shared music view.</p>
            </div>
          `}
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">State sync</div>
          <p class="hh-row-copy" style="margin:0;">Because the current music provider is browser-owned, mark the shared state when you start or stop listening so HomeHub can summarize it correctly.</p>
          <div class="hh-inline-actions">
            <button class="hh-btn hh-btn-primary" data-media-action="music-active">Mark music active</button>
            <button class="hh-btn hh-btn-secondary" data-media-action="stop">Clear now playing</button>
          </div>
          <div class="hh-kv">
            <div class="hh-kv-row"><span>Current source</span><strong>${escapeHtml(nowPlaying.sourceType || 'idle')}</strong></div>
            <div class="hh-kv-row"><span>State</span><strong>${escapeHtml(nowPlaying.state || 'idle')}</strong></div>
          </div>
        </div>
      </aside>
    </div>
  `;
}
