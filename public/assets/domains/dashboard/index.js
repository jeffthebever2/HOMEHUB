import { apiFetch } from '../../core/api.js';
import { asArray, asObject, bindRouteButtons, escapeHtml, formatDateTime } from '../../core/format.js';
import { summaryCard } from '../../ui/cards.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';

function displayDegrees(value) {
  return value == null || value === '' ? '--' : escapeHtml(String(value));
}

function getFallbackPayload(errorMessage = '') {
  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      degraded: Boolean(errorMessage),
      isMock: false,
      warnings: errorMessage ? [errorMessage] : [],
    },
    hero: {
      status: 'info',
      eyebrow: 'Home',
      headline: 'HomeHub is running in degraded mode',
      supportingText: errorMessage || 'Some dashboard data is temporarily unavailable.',
      actions: [{ label: 'Open Settings', route: '#/settings' }],
    },
    modules: {
      agenda: {
        headline: 'Agenda unavailable',
        supportingText: 'Calendar data could not be loaded.',
        items: [],
        sections: {
          today: 0,
          tomorrow: 0,
        },
      },
      environment: {
        status: 'warning',
        headline: 'Weather unavailable',
        supportingText: 'Forecast data could not be loaded.',
        weather: {
          temp: null,
          high: null,
          low: null,
          condition: 'Unavailable',
          icon: '·',
        },
        risk: {
          headline: 'Weather unavailable',
        },
        activeAlertCount: 0,
      },
      household: {
        status: 'warning',
        headline: 'Household unavailable',
        supportingText: 'Chore and treat data could not be loaded.',
      },
      media: {
        status: 'normal',
        headline: 'Nothing playing right now',
        supportingText: 'Open Media to start playback.',
      },
      photos: {
        status: 'warning',
        headline: 'Photo queue unavailable',
        supportingText: 'Open Photos to retry the slideshow.',
      },
    },
  };
}

function normalizeDashboardPayload(payload, errorMessage = '') {
  const fallback = getFallbackPayload(errorMessage);
  const meta = asObject(payload?.meta);
  const hero = asObject(payload?.hero);
  const modules = asObject(payload?.modules);
  return {
    meta: {
      ...fallback.meta,
      ...meta,
      warnings: asArray(meta.warnings),
    },
    hero: {
      ...fallback.hero,
      ...hero,
      actions: asArray(hero.actions).map((action) => ({
        label: action?.label || 'Open',
        route: action?.route || '#/home',
      })),
    },
    modules: {
      agenda: {
        ...fallback.modules.agenda,
        ...asObject(modules.agenda),
        items: asArray(modules.agenda?.items),
        sections: {
          ...fallback.modules.agenda.sections,
          ...asObject(modules.agenda?.sections),
        },
      },
      environment: {
        ...fallback.modules.environment,
        ...asObject(modules.environment),
        weather: {
          ...fallback.modules.environment.weather,
          ...asObject(modules.environment?.weather),
        },
        risk: {
          ...fallback.modules.environment.risk,
          ...asObject(modules.environment?.risk),
        },
      },
      household: {
        ...fallback.modules.household,
        ...asObject(modules.household),
      },
      media: {
        ...fallback.modules.media,
        ...asObject(modules.media),
      },
      photos: {
        ...fallback.modules.photos,
        ...asObject(modules.photos),
      },
    },
  };
}

function renderBanner(payload) {
  if (!payload.meta.degraded && !payload.meta.isMock) return '';
  const statusClass = payload.meta.isMock ? 'hh-banner-warning' : 'hh-banner-offline';
  const title = payload.meta.isMock ? 'Test mode is active' : 'Some dashboard data is degraded';
  const subtitle = payload.meta.warnings?.[0] || 'HomeHub is showing the best available summary right now.';
  return `
    <div class="hh-banner ${statusClass}">
      <div class="hh-banner-copy">
        <p class="hh-banner-title">${escapeHtml(title)}</p>
        <p class="hh-banner-subtitle">${escapeHtml(subtitle)}</p>
      </div>
    </div>
  `;
}

function renderHero(hero) {
  const actions = asArray(hero.actions)
    .map((action) => `<button class="hh-btn hh-btn-secondary" data-route="${String(action.route || '').replace(/^#\//, '')}">${escapeHtml(action.label || 'Open')}</button>`)
    .join('');
  return `
    <section class="hh-card hh-card-hero hh-col-12">
      <div class="hh-stack">
        <div class="hh-pill-row">
          <span class="hh-badge hh-badge-${hero.status === 'danger' ? 'danger' : hero.status === 'urgent' ? 'urgent' : hero.status === 'warning' ? 'warning' : hero.status === 'info' ? 'info' : 'success'}">${escapeHtml(hero.eyebrow || 'Home')}</span>
        </div>
        <div>
          <h2 class="hh-page-title" style="font-size:clamp(2rem,4vw,3.4rem);margin-bottom:.75rem;">${escapeHtml(hero.headline || 'HomeHub')}</h2>
          <p class="hh-page-subtitle">${escapeHtml(hero.supportingText || '')}</p>
        </div>
        ${actions ? `<div class="hh-card-actions">${actions}</div>` : ''}
      </div>
    </section>
  `;
}

function renderAgendaCard(agenda) {
  const items = asArray(agenda.items).slice(0, 4);
  const sections = asObject(agenda.sections);
  return `
    <section class="hh-card hh-col-8">
      <div class="hh-stack">
        <div class="hh-split">
          <div>
            <div class="hh-page-kicker">Agenda</div>
            <div class="hh-row-title" style="font-size:1.35rem;">${escapeHtml(agenda.headline || 'Today')}</div>
            <p class="hh-row-copy" style="margin:.5rem 0 0;">${escapeHtml(agenda.supportingText || '')}</p>
          </div>
          <div class="hh-pill-row">
            <span class="hh-badge hh-badge-neutral">${escapeHtml(String(sections.today || 0))} today</span>
            <span class="hh-badge hh-badge-neutral">${escapeHtml(String(sections.tomorrow || 0))} tomorrow</span>
          </div>
        </div>
        ${items.length ? `
          <div class="hh-list">
            ${items.map((item) => `
              <div class="hh-list-row">
                <div class="hh-row-meta">
                  <div class="hh-row-title">${escapeHtml(item.summary || 'Upcoming event')}</div>
                  <div class="hh-row-copy">${escapeHtml(formatDateTime(item.start, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="hh-state">
            <p class="hh-state-title">Nothing scheduled soon</p>
            <p class="hh-state-copy">Connect Google Calendar in Settings to show today’s household schedule.</p>
          </div>
        `}
      </div>
    </section>
  `;
}

function renderEnvironmentAside(module) {
  return `
    <section class="hh-card hh-col-4">
      <div class="hh-stack">
        <div class="hh-page-kicker">Weather</div>
        <div class="hh-row-title" style="font-size:1.35rem;">${displayDegrees(module.weather?.temp)}° ${escapeHtml(module.weather?.icon || '·')}</div>
        <p class="hh-row-copy" style="margin:0;">${escapeHtml(module.weather?.condition || 'Unavailable')}</p>
        <div class="hh-kv">
          <div class="hh-kv-row"><span>High / Low</span><strong>${displayDegrees(module.weather?.high)}° / ${displayDegrees(module.weather?.low)}°</strong></div>
          <div class="hh-kv-row"><span>Risk</span><strong>${escapeHtml(module.risk?.headline || 'Calm')}</strong></div>
          <div class="hh-kv-row"><span>Alerts</span><strong>${escapeHtml(String(module.activeAlertCount || 0))}</strong></div>
        </div>
        <button class="hh-btn hh-btn-secondary" data-route="weather">Open Weather</button>
      </div>
    </section>
  `;
}

export async function renderDashboardPage(container) {
  let disposed = false;
  let loadVersion = 0;
  let intervalId = null;

  async function load({ showLoading = true } = {}) {
    const currentLoad = ++loadVersion;
    if (showLoading && !disposed) {
      container.innerHTML = loadingState('Loading dashboard…');
    }

    let payload;
    try {
      payload = normalizeDashboardPayload(await apiFetch('/api/dashboard'));
    } catch (error) {
      payload = normalizeDashboardPayload(null, error.message);
    }

    if (disposed || currentLoad !== loadVersion) return;

    container.innerHTML = `
      ${pageHeader({
        kicker: 'Home',
        title: 'Dashboard',
        subtitle: `Updated ${formatDateTime(payload.meta.fetchedAt)}`,
        actions: '<button id="hh-refresh-dashboard" class="hh-btn hh-btn-secondary">Refresh</button>',
      })}
      ${renderBanner(payload)}
      <div class="hh-grid">
        ${renderHero(payload.hero)}
        ${renderAgendaCard(payload.modules.agenda)}
        ${renderEnvironmentAside(payload.modules.environment)}
        <div class="hh-col-4">${summaryCard(payload.modules.household)}</div>
        <div class="hh-col-4">${summaryCard(payload.modules.media)}</div>
        <div class="hh-col-4">${summaryCard(payload.modules.photos)}</div>
      </div>
    `;

    bindRouteButtons(container);
    container.querySelector('#hh-refresh-dashboard')?.addEventListener('click', async () => {
      pushToast('Refreshing dashboard…');
      await load({ showLoading: false });
    });
  }

  await load();
  intervalId = window.setInterval(() => {
    load({ showLoading: false }).catch(() => {});
  }, 120000);
  return () => {
    disposed = true;
    loadVersion += 1;
    window.clearInterval(intervalId);
  };
}
