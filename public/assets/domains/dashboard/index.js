import { apiFetch } from '../../core/api.js';
import { bindRouteButtons, escapeHtml, formatDateTime } from '../../core/format.js';
import { summaryCard } from '../../ui/cards.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { errorState, loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';

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
  const actions = (hero.actions || [])
    .map((action) => `<button class="hh-btn hh-btn-secondary" data-route="${String(action.route || '').replace(/^#\//, '')}">${escapeHtml(action.label)}</button>`)
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
  const items = (agenda.items || []).slice(0, 4);
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
            <span class="hh-badge hh-badge-neutral">${escapeHtml(String(agenda.sections?.today || 0))} today</span>
            <span class="hh-badge hh-badge-neutral">${escapeHtml(String(agenda.sections?.tomorrow || 0))} tomorrow</span>
          </div>
        </div>
        ${items.length ? `
          <div class="hh-list">
            ${items.map((item) => `
              <div class="hh-list-row">
                <div class="hh-row-meta">
                  <div class="hh-row-title">${escapeHtml(item.summary)}</div>
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
        <div class="hh-row-title" style="font-size:1.35rem;">${escapeHtml(module.weather?.temp)}° ${escapeHtml(module.weather?.icon || '')}</div>
        <p class="hh-row-copy" style="margin:0;">${escapeHtml(module.weather?.condition || '')}</p>
        <div class="hh-kv">
          <div class="hh-kv-row"><span>High / Low</span><strong>${escapeHtml(module.weather?.high)}° / ${escapeHtml(module.weather?.low)}°</strong></div>
          <div class="hh-kv-row"><span>Risk</span><strong>${escapeHtml(module.risk?.headline || 'Calm')}</strong></div>
          <div class="hh-kv-row"><span>Alerts</span><strong>${escapeHtml(String(module.activeAlertCount || 0))}</strong></div>
        </div>
        <button class="hh-btn hh-btn-secondary" data-route="weather">Open Weather</button>
      </div>
    </section>
  `;
}

export async function renderDashboardPage(container) {
  let intervalId = null;

  async function load() {
    container.innerHTML = loadingState('Loading dashboard…');
    try {
      const payload = await apiFetch('/api/dashboard');
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
        await load();
      });
    } catch (error) {
      container.innerHTML = `
        ${pageHeader({ kicker: 'Home', title: 'Dashboard', subtitle: 'The household pulse is temporarily unavailable.' })}
        ${errorState('Dashboard unavailable', error.message)}
      `;
    }
  }

  await load();
  intervalId = window.setInterval(load, 120000);
  return () => {
    window.clearInterval(intervalId);
  };
}
