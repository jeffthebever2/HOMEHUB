import { escapeHtml, formatDate, formatTime } from '../../core/format.js';

function bannerClass(status) {
  if (status === 'danger' || status === 'urgent') return 'hh-banner-danger';
  if (status === 'warning') return 'hh-banner-warning';
  return 'hh-banner-info';
}

export function renderWeatherView(payload) {
  const alerts = payload.detail.alerts.active || [];
  const topAlert = alerts[0] || null;
  return `
    ${topAlert ? `
      <div class="hh-banner ${bannerClass(payload.summary.status)}">
        <div class="hh-banner-copy">
          <p class="hh-banner-title">${escapeHtml(topAlert.type)}</p>
          <p class="hh-banner-subtitle">${escapeHtml(topAlert.summary)}</p>
        </div>
        <button class="hh-btn hh-btn-secondary" data-route="alerts">Open Alerts</button>
      </div>
    ` : ''}
    <div class="hh-grid">
      <section class="hh-card hh-card-hero hh-col-8">
        <div class="hh-stack">
          <div class="hh-pill-row">
            <span class="hh-badge hh-badge-${payload.summary.status === 'success' ? 'success' : payload.summary.status === 'warning' ? 'warning' : payload.summary.status === 'urgent' ? 'urgent' : payload.summary.status === 'danger' ? 'danger' : 'info'}">${escapeHtml(payload.summary.risk.headline)}</span>
            <span class="hh-badge hh-badge-neutral">${escapeHtml(payload.summary.weather.condition)}</span>
          </div>
          <div class="hh-split">
            <div>
              <div class="hh-row-title" style="font-size:3.5rem;line-height:1;">${escapeHtml(payload.summary.weather.temp)}° ${escapeHtml(payload.summary.weather.icon)}</div>
              <p class="hh-row-copy" style="margin:.75rem 0 0;">${escapeHtml(payload.summary.supportingText)}</p>
            </div>
            <div class="hh-kv">
              <div class="hh-kv-row"><span>High / Low</span><strong>${escapeHtml(payload.summary.weather.high)}° / ${escapeHtml(payload.summary.weather.low)}°</strong></div>
              <div class="hh-kv-row"><span>Active alerts</span><strong>${escapeHtml(String(payload.summary.activeAlertCount))}</strong></div>
              <div class="hh-kv-row"><span>Ticker</span><strong>${escapeHtml(payload.summary.ticker)}</strong></div>
            </div>
          </div>
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">Current conditions</div>
          <div class="hh-metric-grid">
            <div class="hh-metric">
              <p class="hh-metric-label">Feels like</p>
              <p class="hh-metric-value">${escapeHtml(payload.detail.current.feelsLike)}°</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Humidity</p>
              <p class="hh-metric-value">${escapeHtml(payload.detail.current.humidity)}%</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Wind</p>
              <p class="hh-metric-value">${escapeHtml(payload.detail.current.windMph)} mph</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Gusts</p>
              <p class="hh-metric-value">${escapeHtml(payload.detail.current.gustMph)} mph</p>
            </div>
          </div>
        </div>
      </aside>
      <section class="hh-card hh-col-8">
        <div class="hh-stack">
          <div class="hh-page-kicker">Next 12 hours</div>
          <div class="hh-list">
            ${(payload.detail.hourly || []).slice(0, 8).map((hour) => `
              <div class="hh-list-row">
                <div class="hh-row-meta">
                  <div class="hh-row-title">${escapeHtml(formatTime(hour.time))}</div>
                  <div class="hh-row-copy">${escapeHtml(String(hour.precipitationChance))}% precip</div>
                </div>
                <div class="hh-row-title">${escapeHtml(String(hour.temp))}° ${escapeHtml(hour.icon)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">Radar & risk</div>
          <div class="hh-kv">
            <div class="hh-kv-row"><span>Radar</span><strong>${escapeHtml(payload.detail.radar.source)}</strong></div>
            <div class="hh-kv-row"><span>Status</span><strong>${payload.detail.radar.available ? 'Available' : 'Unavailable'}</strong></div>
            <div class="hh-kv-row"><span>Window</span><strong>${escapeHtml(payload.summary.risk.timeWindow || 'Next 24 hours')}</strong></div>
          </div>
          <p class="hh-row-copy" style="margin:0;">${escapeHtml(payload.summary.risk.summary)}</p>
        </div>
      </aside>
      <section class="hh-card hh-col-12">
        <div class="hh-stack">
          <div class="hh-page-kicker">7-day outlook</div>
          <div class="hh-photo-grid">
            ${(payload.detail.daily || []).map((day) => `
              <div class="hh-metric">
                <p class="hh-metric-label">${escapeHtml(formatDate(day.date, { weekday: 'short' }))}</p>
                <p class="hh-metric-value">${escapeHtml(day.icon)} ${escapeHtml(String(day.high))}°</p>
                <p class="hh-row-copy">${escapeHtml(String(day.low))}° low · ${escapeHtml(String(day.precipitationChance))}% precip</p>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    </div>
  `;
}
