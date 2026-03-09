import { apiFetch } from '../../core/api.js';
import { bindRouteButtons, escapeHtml, formatDateTime } from '../../core/format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { errorState, loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';

function renderBanner(payload) {
  if (!payload.detail.fallbackInUse && !payload.meta.degraded && !payload.meta.isMock) return '';
  const message = payload.meta.warnings?.[0]
    || (payload.detail.fallbackInUse ? 'A fallback photo source is currently in use.' : 'Photos are partially degraded.');
  return `
    <div class="hh-banner ${payload.detail.fallbackInUse ? 'hh-banner-warning' : 'hh-banner-offline'}">
      <div class="hh-banner-copy">
        <p class="hh-banner-title">${escapeHtml(payload.summary.headline)}</p>
        <p class="hh-banner-subtitle">${escapeHtml(message)}</p>
      </div>
      <button class="hh-btn hh-btn-secondary" data-route="settings">Open Settings</button>
    </div>
  `;
}

export async function renderPhotosPage(container) {
  async function load() {
    container.innerHTML = loadingState('Loading photos…');
    try {
      const payload = await apiFetch('/api/photos');
      container.innerHTML = `
        ${pageHeader({
          kicker: 'Photos',
          title: 'Household Photos',
          subtitle: `Updated ${formatDateTime(payload.meta.fetchedAt)}`,
          actions: '<button id="hh-photos-refresh" class="hh-btn hh-btn-secondary">Refresh</button>',
        })}
        ${renderBanner(payload)}
        <div class="hh-grid">
          <section class="hh-card hh-card-hero hh-col-12">
            <div class="hh-stack">
              <div class="hh-pill-row">
                <span class="hh-badge hh-badge-neutral">${escapeHtml(payload.detail.source)}</span>
                <span class="hh-badge hh-badge-${payload.detail.fallbackInUse ? 'warning' : 'success'}">${payload.detail.fallbackInUse ? 'fallback' : 'primary source'}</span>
              </div>
              ${payload.detail.currentPhoto ? `
                <div class="hh-photo-frame" style="aspect-ratio:16/8;">
                  <img src="${escapeHtml(payload.detail.currentPhoto.url)}" alt="${escapeHtml(payload.detail.currentPhoto.credit || 'Current photo')}">
                </div>
                <div class="hh-row-copy">${escapeHtml(payload.detail.currentPhoto.credit || 'Current household photo')}</div>
              ` : `
                <div class="hh-state">
                  <p class="hh-state-title">No photos available</p>
                  <p class="hh-state-copy">Configure a photo source in Settings.</p>
                </div>
              `}
            </div>
          </section>
          <section class="hh-card hh-col-12">
            <div class="hh-stack">
              <div class="hh-page-kicker">Queue</div>
              <div class="hh-photo-grid">
                ${(payload.detail.queue || []).map((photo) => `
                  <div class="hh-photo-tile">
                    <div class="hh-photo-frame">
                      <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.credit || 'Household photo')}">
                    </div>
                    <div class="hh-row-copy">${escapeHtml(photo.credit || 'Household photo')}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </section>
        </div>
      `;
      bindRouteButtons(container);
      container.querySelector('#hh-photos-refresh')?.addEventListener('click', async () => {
        pushToast('Refreshing photo queue…');
        await load();
      });
    } catch (error) {
      container.innerHTML = `
        ${pageHeader({ kicker: 'Photos', title: 'Household Photos', subtitle: 'This section is temporarily unavailable.' })}
        ${errorState('Photos unavailable', error.message)}
      `;
    }
  }

  await load();
  return () => {};
}
