import { apiFetch } from '../../core/api.js';
import { asArray, asNumber, asObject, bindRouteButtons, formatDateTime } from '../../core/format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';
import { renderAlertsView } from './alertsView.js';
import { renderWeatherView } from './weatherView.js';

function getFallbackPayload(errorMessage = '') {
  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      degraded: Boolean(errorMessage),
      warnings: errorMessage ? [errorMessage] : [],
    },
    summary: {
      status: 'info',
      headline: 'Weather data unavailable',
      supportingText: errorMessage || 'HomeHub is showing the best available environment summary.',
      risk: {
        level: 0,
        headline: 'Weather data unavailable',
        summary: errorMessage || 'Forecast data is temporarily unavailable.',
        timeWindow: null,
      },
      weather: {
        temp: null,
        high: null,
        low: null,
        condition: 'Unavailable',
        icon: '·',
      },
      activeAlertCount: 0,
      ticker: 'Environment unavailable',
    },
    detail: {
      current: {
        feelsLike: null,
        humidity: null,
        windMph: null,
        gustMph: null,
      },
      hourly: [],
      daily: [],
      radar: {
        available: false,
        source: 'Unavailable',
      },
      alerts: {
        active: [],
        recentlyEnded: [],
      },
    },
  };
}

function normalizeEnvironmentPayload(payload, errorMessage = '') {
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
      risk: {
        ...fallback.summary.risk,
        ...asObject(summary.risk),
      },
      weather: {
        ...fallback.summary.weather,
        ...asObject(summary.weather),
      },
    },
    detail: {
      ...fallback.detail,
      ...detail,
      current: {
        ...fallback.detail.current,
        ...asObject(detail.current),
      },
      hourly: asArray(detail.hourly),
      daily: asArray(detail.daily),
      radar: {
        ...fallback.detail.radar,
        ...asObject(detail.radar),
      },
      alerts: {
        ...fallback.detail.alerts,
        ...asObject(detail.alerts),
        active: asArray(detail.alerts?.active),
        recentlyEnded: asArray(detail.alerts?.recentlyEnded),
      },
    },
  };
}

export async function renderEnvironmentPage(container, mode = 'weather') {
  let disposed = false;
  let intervalId = null;
  let loadVersion = 0;

  async function load({ showLoading = true } = {}) {
    const currentLoad = ++loadVersion;
    if (showLoading && !disposed) {
      container.innerHTML = loadingState(mode === 'alerts' ? 'Loading alerts…' : 'Loading weather…');
    }

    let payload;
    try {
      payload = normalizeEnvironmentPayload(await apiFetch('/api/environment'));
    } catch (error) {
      payload = normalizeEnvironmentPayload(null, error.message);
    }

    if (disposed || currentLoad !== loadVersion) return;

    const title = mode === 'alerts' ? 'Alerts & Severe Weather' : 'Weather';
    const subtitle = `${mode === 'alerts' ? 'Threats and response guidance' : 'Forecast, radar, and impact outlook'} · Updated ${formatDateTime(payload.meta.fetchedAt)}`;
    container.innerHTML = `
      ${pageHeader({
        kicker: 'Environment',
        title,
        subtitle,
        actions: `
          <button id="hh-environment-refresh" class="hh-btn hh-btn-secondary">Refresh</button>
          <button class="hh-btn hh-btn-secondary" data-route="${mode === 'alerts' ? 'weather' : 'alerts'}">${mode === 'alerts' ? 'Open Weather' : 'Open Alerts'}</button>
        `,
      })}
      ${mode === 'alerts' ? renderAlertsView(payload) : renderWeatherView(payload)}
    `;

    bindRouteButtons(container);
    container.querySelector('#hh-environment-refresh')?.addEventListener('click', async () => {
      pushToast('Refreshing environment…');
      await load({ showLoading: false });
    });

    window.clearInterval(intervalId);
    const pollDelay = asNumber(payload.summary?.risk?.level, 0) >= 3 ? 60000 : 300000;
    intervalId = window.setInterval(() => {
      load({ showLoading: false }).catch(() => {});
    }, pollDelay);
  }

  await load();
  return () => {
    disposed = true;
    loadVersion += 1;
    window.clearInterval(intervalId);
  };
}
