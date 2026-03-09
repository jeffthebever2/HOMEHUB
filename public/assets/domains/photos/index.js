import { apiFetch } from '../../core/api.js';
import { asArray, asObject, bindRouteButtons, escapeHtml, formatDateTime } from '../../core/format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';

function getFallbackPayload(errorMessage = '') {
  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      degraded: Boolean(errorMessage),
      warnings: errorMessage ? [errorMessage] : [],
    },
    summary: {
      headline: 'Photo queue unavailable',
    },
    detail: {
      source: 'local_fallback',
      fallbackInUse: true,
      currentPhoto: {
        id: 'fallback-1',
        url: '/fallback/photos/family-1.svg',
        credit: 'HomeHub fallback',
      },
      queue: [
        { id: 'fallback-1', url: '/fallback/photos/family-1.svg', credit: 'HomeHub fallback' },
        { id: 'fallback-2', url: '/fallback/photos/family-2.svg', credit: 'HomeHub fallback' },
        { id: 'fallback-3', url: '/fallback/photos/family-3.svg', credit: 'HomeHub fallback' },
      ],
    },
  };
}

function normalizePhotosPayload(payload, errorMessage = '') {
  const fallback = getFallbackPayload(errorMessage);
  const meta = asObject(payload?.meta);
  const summary = asObject(payload?.summary);
  const detail = asObject(payload?.detail);
  return {
    meta: {
      ...fallback.meta,
      ...meta,
      warnings: asArray(meta.warnings),
    },
    summary: {
      ...fallback.summary,
      ...summary,
    },
    detail: {
      ...fallback.detail,
      ...detail,
      currentPhoto: detail.currentPhoto && typeof detail.currentPhoto === 'object' ? detail.currentPhoto : fallback.detail.currentPhoto,
      queue: asArray(detail.queue).length ? asArray(detail.queue) : fallback.detail.queue,
    },
  };
}

function renderBanner(payload) {
  if (!payload.detail.fallbackInUse && !payload.meta.degraded && !payload.meta.isMock) return '';
  const message = payload.meta.warnings?.[0]
    || (payload.detail.fallbackInUse ? 'A fallback photo source is currently in use.' : 'Photos are partially degraded.');
  return `
    <div class="hh-banner ${payload.detail.fallbackInUse ? 'hh-banner-warning' : 'hh-banner-offline'}">
      <div class="hh-banner-copy">
        <p class="hh-banner-title">${escapeHtml(payload.summary.headline || 'Photo queue')}</p>
        <p class="hh-banner-subtitle">${escapeHtml(message)}</p>
      </div>
      <button class="hh-btn hh-btn-secondary" data-route="settings">Open Settings</button>
    </div>
  `;
}

export async function renderPhotosPage(container) {
  let disposed = false;
  let loadVersion = 0;

  async function load({ showLoading = true } = {}) {
    const currentLoad = ++loadVersion;
    if (showLoading && !disposed) {
      container.innerHTML = loadingState('Loading photos…');
    }

    let payload;
    try {
      payload = normalizePhotosPayload(await apiFetch('/api/photos'));
    } catch (error) {
      payload = normalizePhotosPayload(null, error.message);
    }

    if (disposed || currentLoad !== loadVersion) return;

    const queue = asArray(payload.detail.queue);
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
              <span class="hh-badge hh-badge-neutral">${escapeHtml(payload.detail.source || 'local_fallback')}</span>
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
            ${queue.length ? `
              <div class="hh-photo-grid">
                ${queue.map((photo) => `
                  <div class="hh-photo-tile">
                    <div class="hh-photo-frame">
                      <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.credit || 'Household photo')}">
                    </div>
                    <div class="hh-row-copy">${escapeHtml(photo.credit || 'Household photo')}</div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="hh-state">
                <p class="hh-state-title">Queue unavailable</p>
                <p class="hh-state-copy">HomeHub could not load the photo queue from the current payload.</p>
              </div>
            `}
          </div>
        </section>
      </div>
    `;

    bindRouteButtons(container);
    container.querySelector('#hh-photos-refresh')?.addEventListener('click', async () => {
      pushToast('Refreshing photo queue…');
      await load({ showLoading: false });
    });
  }

  await load();
  return () => {
    disposed = true;
    loadVersion += 1;
  };
}
