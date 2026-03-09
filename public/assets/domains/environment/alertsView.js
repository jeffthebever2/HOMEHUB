import { escapeHtml, formatDateTime } from '../../core/format.js';

function bannerClass(level) {
  if (level >= 5) return 'hh-banner-danger';
  if (level >= 3) return 'hh-banner-warning';
  return 'hh-banner-info';
}

function renderAlertList(alerts, emptyCopy) {
  if (!alerts.length) {
    return `
      <div class="hh-state">
        <p class="hh-state-title">No active alerts</p>
        <p class="hh-state-copy">${escapeHtml(emptyCopy)}</p>
      </div>
    `;
  }
  return `
    <div class="hh-list">
      ${alerts.map((alert) => `
        <article class="hh-list-row" style="align-items:flex-start;">
          <div class="hh-row-meta" style="max-width:100%;">
            <div class="hh-pill-row">
              <span class="hh-badge hh-badge-${alert.severityLevel >= 5 ? 'danger' : alert.severityLevel >= 4 ? 'urgent' : alert.severityLevel >= 3 ? 'warning' : 'info'}">level ${escapeHtml(String(alert.severityLevel))}</span>
              <span class="hh-badge hh-badge-neutral">${escapeHtml(alert.area || 'Area wide')}</span>
            </div>
            <div class="hh-row-title">${escapeHtml(alert.type)}</div>
            <div class="hh-row-copy">${escapeHtml(alert.summary)}</div>
            ${alert.impacts?.length ? `<div class="hh-row-copy">Impact: ${escapeHtml(alert.impacts.join(' · '))}</div>` : ''}
            ${alert.actions?.length ? `<div class="hh-row-copy">Action: ${escapeHtml(alert.actions.join(' · '))}</div>` : ''}
          </div>
          <div class="hh-row-copy">${escapeHtml(alert.endsAt ? `Until ${formatDateTime(alert.endsAt, { hour: 'numeric', minute: '2-digit' })}` : 'Ongoing')}</div>
        </article>
      `).join('')}
    </div>
  `;
}

export function renderAlertsView(payload) {
  const top = payload.detail.alerts.active[0] || null;
  return `
    <div class="hh-grid">
      <section class="hh-card hh-card-hero hh-col-12">
        <div class="hh-stack">
          <div class="hh-pill-row">
            <span class="hh-badge hh-badge-${payload.summary.status === 'danger' ? 'danger' : payload.summary.status === 'urgent' ? 'urgent' : payload.summary.status === 'warning' ? 'warning' : 'success'}">${escapeHtml(top ? top.type : 'All clear')}</span>
            <span class="hh-badge hh-badge-neutral">${escapeHtml(String(payload.detail.alerts.active.length))} active</span>
          </div>
          <div>
            <h2 class="hh-page-title" style="font-size:clamp(2rem,4vw,3rem);">${escapeHtml(top ? top.headline : payload.summary.headline)}</h2>
            <p class="hh-page-subtitle">${escapeHtml(top ? top.summary : 'No hazardous weather alerts are active right now.')}</p>
          </div>
          ${top ? `
            <div class="hh-banner ${bannerClass(top.severityLevel)}" style="margin:0;">
              <div class="hh-banner-copy">
                <p class="hh-banner-title">Action guidance</p>
                <p class="hh-banner-subtitle">${escapeHtml((top.actions && top.actions[0]) || 'Stay aware and monitor updates.')}</p>
              </div>
            </div>
          ` : ''}
        </div>
      </section>
      <section class="hh-card hh-col-8">
        <div class="hh-stack">
          <div class="hh-page-kicker">Active alerts</div>
          ${renderAlertList(payload.detail.alerts.active || [], 'HomeHub will keep monitoring for threats.')}
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">Threat summary</div>
          <div class="hh-kv">
            <div class="hh-kv-row"><span>Risk level</span><strong>${escapeHtml(String(payload.summary.risk.level))} / 5</strong></div>
            <div class="hh-kv-row"><span>Headline</span><strong>${escapeHtml(payload.summary.risk.headline)}</strong></div>
            <div class="hh-kv-row"><span>Window</span><strong>${escapeHtml(payload.summary.risk.timeWindow || 'No active deadline')}</strong></div>
          </div>
          <p class="hh-row-copy" style="margin:0;">${escapeHtml(payload.summary.risk.summary)}</p>
        </div>
      </aside>
      <section class="hh-card hh-col-12">
        <div class="hh-stack">
          <div class="hh-page-kicker">Recently ended</div>
          ${renderAlertList(payload.detail.alerts.recentlyEnded || [], 'Expired alerts remain visible here for two hours.')}
        </div>
      </section>
    </div>
  `;
}
