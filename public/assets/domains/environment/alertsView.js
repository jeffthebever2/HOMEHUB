import { asArray, escapeHtml, formatDateTime } from '../../core/format.js';

function bannerClass(level) {
  if (level >= 5) return 'hh-banner-danger';
  if (level >= 3) return 'hh-banner-warning';
  return 'hh-banner-info';
}

function renderAlertList(alerts, emptyTitle, emptyCopy) {
  if (!alerts.length) {
    return `
      <div class="hh-state">
        <p class="hh-state-title">${escapeHtml(emptyTitle)}</p>
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
              <span class="hh-badge hh-badge-${alert.severityLevel >= 5 ? 'danger' : alert.severityLevel >= 4 ? 'urgent' : alert.severityLevel >= 3 ? 'warning' : 'info'}">level ${escapeHtml(String(alert.severityLevel || 0))}</span>
              <span class="hh-badge hh-badge-neutral">${escapeHtml(alert.area || 'Area wide')}</span>
            </div>
            <div class="hh-row-title">${escapeHtml(alert.type || 'Weather alert')}</div>
            <div class="hh-row-copy">${escapeHtml(alert.summary || 'Weather alert details are temporarily unavailable.')}</div>
            ${asArray(alert.impacts).length ? `<div class="hh-row-copy">Impact: ${escapeHtml(asArray(alert.impacts).join(' · '))}</div>` : ''}
            ${asArray(alert.actions).length ? `<div class="hh-row-copy">Action: ${escapeHtml(asArray(alert.actions).join(' · '))}</div>` : ''}
          </div>
          <div class="hh-row-copy">${escapeHtml(alert.endsAt ? `Until ${formatDateTime(alert.endsAt, { hour: 'numeric', minute: '2-digit' })}` : 'Ongoing')}</div>
        </article>
      `).join('')}
    </div>
  `;
}

export function renderAlertsView(payload) {
  const activeAlerts = asArray(payload.detail?.alerts?.active);
  const recentlyEnded = asArray(payload.detail?.alerts?.recentlyEnded);
  const top = activeAlerts[0] || null;
  const warnings = asArray(payload.meta?.warnings);

  return `
    <div class="hh-grid">
      <section class="hh-card hh-card-hero hh-col-12">
        <div class="hh-stack">
          <div class="hh-pill-row">
            <span class="hh-badge hh-badge-${payload.summary?.status === 'danger' ? 'danger' : payload.summary?.status === 'urgent' ? 'urgent' : payload.summary?.status === 'warning' ? 'warning' : 'success'}">${escapeHtml(top ? top.type : payload.summary?.headline || 'All clear')}</span>
            <span class="hh-badge hh-badge-neutral">${escapeHtml(String(activeAlerts.length))} active</span>
          </div>
          <div>
            <h2 class="hh-page-title" style="font-size:clamp(2rem,4vw,3rem);">${escapeHtml(top ? top.headline : payload.summary?.headline || 'No active alerts')}</h2>
            <p class="hh-page-subtitle">${escapeHtml(top ? top.summary : payload.summary?.risk?.summary || 'No hazardous weather alerts are active right now.')}</p>
          </div>
          ${top ? `
            <div class="hh-banner ${bannerClass(top.severityLevel)}" style="margin:0;">
              <div class="hh-banner-copy">
                <p class="hh-banner-title">Action guidance</p>
                <p class="hh-banner-subtitle">${escapeHtml((asArray(top.actions)[0]) || 'Stay aware and monitor updates.')}</p>
              </div>
            </div>
          ` : payload.meta?.degraded ? `
            <div class="hh-banner hh-banner-offline" style="margin:0;">
              <div class="hh-banner-copy">
                <p class="hh-banner-title">Alerts data is degraded</p>
                <p class="hh-banner-subtitle">${escapeHtml(warnings[0] || 'HomeHub is showing the best available alert summary.')}</p>
              </div>
            </div>
          ` : ''}
        </div>
      </section>
      <section class="hh-card hh-col-8">
        <div class="hh-stack">
          <div class="hh-page-kicker">Active alerts</div>
          ${renderAlertList(activeAlerts, 'No active alerts', 'HomeHub will keep monitoring for threats.')}
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">Threat summary</div>
          <div class="hh-kv">
            <div class="hh-kv-row"><span>Risk level</span><strong>${escapeHtml(String(payload.summary?.risk?.level ?? 0))} / 5</strong></div>
            <div class="hh-kv-row"><span>Headline</span><strong>${escapeHtml(payload.summary?.risk?.headline || 'No active threat')}</strong></div>
            <div class="hh-kv-row"><span>Window</span><strong>${escapeHtml(payload.summary?.risk?.timeWindow || 'No active deadline')}</strong></div>
          </div>
          <p class="hh-row-copy" style="margin:0;">${escapeHtml(payload.summary?.risk?.summary || 'Threat details are temporarily unavailable.')}</p>
        </div>
      </aside>
      <section class="hh-card hh-col-12">
        <div class="hh-stack">
          <div class="hh-page-kicker">Recently ended</div>
          ${renderAlertList(recentlyEnded, 'No recently ended alerts', 'Expired alerts remain visible here for two hours.')}
        </div>
      </section>
    </div>
  `;
}
