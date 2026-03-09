import { asArray, escapeHtml, formatDate, formatTime } from '../../core/format.js';

function bannerClass(status) {
  if (status === 'danger' || status === 'urgent') return 'hh-banner-danger';
  if (status === 'warning') return 'hh-banner-warning';
  return 'hh-banner-info';
}

function displayValue(value, suffix = '') {
  return value == null || value === '' ? `--${suffix}` : `${escapeHtml(String(value))}${suffix}`;
}

export function renderWeatherView(payload) {
  const alerts = asArray(payload.detail?.alerts?.active);
  const hourly = asArray(payload.detail?.hourly).slice(0, 8);
  const daily = asArray(payload.detail?.daily);
  const topAlert = alerts[0] || null;
  const warnings = asArray(payload.meta?.warnings);
  const showDegradedBanner = payload.meta?.degraded && !topAlert;

  return `
    ${topAlert ? `
      <div class="hh-banner ${bannerClass(payload.summary?.status)}">
        <div class="hh-banner-copy">
          <p class="hh-banner-title">${escapeHtml(topAlert.type || 'Weather alert')}</p>
          <p class="hh-banner-subtitle">${escapeHtml(topAlert.summary || 'Severe weather guidance is available.')}</p>
        </div>
        <button class="hh-btn hh-btn-secondary" data-route="alerts">Open Alerts</button>
      </div>
    ` : showDegradedBanner ? `
      <div class="hh-banner hh-banner-offline">
        <div class="hh-banner-copy">
          <p class="hh-banner-title">Weather data is degraded</p>
          <p class="hh-banner-subtitle">${escapeHtml(warnings[0] || 'HomeHub is showing the best available weather summary.')}</p>
        </div>
      </div>
    ` : ''}
    <div class="hh-grid">
      <section class="hh-card hh-card-hero hh-col-8">
        <div class="hh-stack">
          <div class="hh-pill-row">
            <span class="hh-badge hh-badge-${payload.summary?.status === 'success' ? 'success' : payload.summary?.status === 'warning' ? 'warning' : payload.summary?.status === 'urgent' ? 'urgent' : payload.summary?.status === 'danger' ? 'danger' : 'info'}">${escapeHtml(payload.summary?.risk?.headline || 'Weather')}</span>
            <span class="hh-badge hh-badge-neutral">${escapeHtml(payload.summary?.weather?.condition || 'Unavailable')}</span>
          </div>
          <div class="hh-split">
            <div>
              <div class="hh-row-title" style="font-size:3.5rem;line-height:1;">${displayValue(payload.summary?.weather?.temp, '°')} ${escapeHtml(payload.summary?.weather?.icon || '·')}</div>
              <p class="hh-row-copy" style="margin:.75rem 0 0;">${escapeHtml(payload.summary?.supportingText || 'Weather data is temporarily unavailable.')}</p>
            </div>
            <div class="hh-kv">
              <div class="hh-kv-row"><span>High / Low</span><strong>${displayValue(payload.summary?.weather?.high, '°')} / ${displayValue(payload.summary?.weather?.low, '°')}</strong></div>
              <div class="hh-kv-row"><span>Active alerts</span><strong>${escapeHtml(String(payload.summary?.activeAlertCount || 0))}</strong></div>
              <div class="hh-kv-row"><span>Ticker</span><strong>${escapeHtml(payload.summary?.ticker || 'No alerts')}</strong></div>
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
              <p class="hh-metric-value">${displayValue(payload.detail?.current?.feelsLike, '°')}</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Humidity</p>
              <p class="hh-metric-value">${displayValue(payload.detail?.current?.humidity, '%')}</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Wind</p>
              <p class="hh-metric-value">${displayValue(payload.detail?.current?.windMph, ' mph')}</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Gusts</p>
              <p class="hh-metric-value">${displayValue(payload.detail?.current?.gustMph, ' mph')}</p>
            </div>
          </div>
        </div>
      </aside>
      <section class="hh-card hh-col-8">
        <div class="hh-stack">
          <div class="hh-page-kicker">Next 12 hours</div>
          ${hourly.length ? `
            <div class="hh-list">
              ${hourly.map((hour) => `
                <div class="hh-list-row">
                  <div class="hh-row-meta">
                    <div class="hh-row-title">${escapeHtml(formatTime(hour.time))}</div>
                    <div class="hh-row-copy">${displayValue(hour.precipitationChance, '% precip')}</div>
                  </div>
                  <div class="hh-row-title">${displayValue(hour.temp, '°')} ${escapeHtml(hour.icon || '·')}</div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="hh-state">
              <p class="hh-state-title">Hourly forecast unavailable</p>
              <p class="hh-state-copy">HomeHub will fill this outlook back in when forecast data returns.</p>
            </div>
          `}
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">Radar & risk</div>
          <div class="hh-kv">
            <div class="hh-kv-row"><span>Radar</span><strong>${escapeHtml(payload.detail?.radar?.source || 'Unavailable')}</strong></div>
            <div class="hh-kv-row"><span>Status</span><strong>${payload.detail?.radar?.available ? 'Available' : 'Unavailable'}</strong></div>
            <div class="hh-kv-row"><span>Window</span><strong>${escapeHtml(payload.summary?.risk?.timeWindow || 'Next 24 hours')}</strong></div>
          </div>
          <p class="hh-row-copy" style="margin:0;">${escapeHtml(payload.summary?.risk?.summary || 'Weather risk data is temporarily unavailable.')}</p>
        </div>
      </aside>
      <section class="hh-card hh-col-12">
        <div class="hh-stack">
          <div class="hh-page-kicker">7-day outlook</div>
          ${daily.length ? `
            <div class="hh-photo-grid">
              ${daily.map((day) => `
                <div class="hh-metric">
                  <p class="hh-metric-label">${escapeHtml(formatDate(day.date, { weekday: 'short' }))}</p>
                  <p class="hh-metric-value">${escapeHtml(day.icon || '·')} ${displayValue(day.high, '°')}</p>
                  <p class="hh-row-copy">${displayValue(day.low, '° low')} · ${displayValue(day.precipitationChance, '% precip')}</p>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="hh-state">
              <p class="hh-state-title">Daily forecast unavailable</p>
              <p class="hh-state-copy">HomeHub could not build the seven-day outlook from the current payload.</p>
            </div>
          `}
        </div>
      </section>
    </div>
  `;
}
