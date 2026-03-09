import { fetchJson } from '../../fetch.js';
import { createMeta } from '../../http.js';
import { readSnapshot, writeSnapshot } from '../../cache/snapshots.js';

const NWS_USER_AGENT = 'HomeHub/3.0 (support: HomeHub)';
const recentAlerts = new Map();

function getConditionLabel(code = 0) {
  const labels = {
    0: 'Clear',
    1: 'Mostly Clear',
    2: 'Partly Cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Fog',
    51: 'Light Drizzle',
    53: 'Drizzle',
    55: 'Heavy Drizzle',
    61: 'Light Rain',
    63: 'Rain',
    65: 'Heavy Rain',
    71: 'Light Snow',
    73: 'Snow',
    75: 'Heavy Snow',
    80: 'Showers',
    81: 'Showers',
    82: 'Heavy Showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm',
    99: 'Severe Thunderstorm',
  };
  return labels[code] || 'Unknown';
}

function getConditionIcon(code = 0) {
  if (code === 0) return '☀️';
  if (code >= 1 && code <= 3) return '⛅';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 65) return '🌧️';
  if (code >= 71 && code <= 75) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}

function maybeRound(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function hazardFamily(eventName = '') {
  const value = eventName.toLowerCase();
  if (value.includes('tornado')) return 'tornado';
  if (value.includes('thunderstorm')) return 'thunderstorm';
  if (value.includes('flood')) return 'flood';
  if (value.includes('wind')) return 'wind';
  if (value.includes('heat')) return 'heat';
  if (value.includes('winter')) return 'winter';
  return value;
}

function mapSeverityLevel(alert) {
  const event = (alert.event || '').toLowerCase();
  const severity = (alert.severity || '').toLowerCase();
  const urgency = (alert.urgency || '').toLowerCase();
  if (event.includes('emergency')) return 5;
  if (event.includes('tornado warning')) return 5;
  if (severity === 'extreme' && urgency === 'immediate') return 5;
  if (event.includes('warning')) return 4;
  if (severity === 'severe' && ['immediate', 'expected'].includes(urgency)) return 4;
  if (event.includes('watch')) return 3;
  if (severity === 'severe' || severity === 'moderate') return 2;
  if (event.includes('statement') || event.includes('advisory')) return 1;
  return 1;
}

function mapStatus(level) {
  if (level >= 5) return 'danger';
  if (level === 4) return 'urgent';
  if (level >= 2) return 'warning';
  if (level === 1) return 'info';
  return 'success';
}

function dedupeAndRankAlerts(features = []) {
  const byId = new Map();
  for (const feature of Array.isArray(features) ? features : []) {
    const properties = feature?.properties || {};
    const id = properties.id || feature?.id || `${properties.event}-${properties.sent || properties.effective || ''}`;
    const current = byId.get(id);
    if (!current || new Date(properties.sent || properties.updated || 0) > new Date(current.properties?.sent || current.properties?.updated || 0)) {
      byId.set(id, feature);
    }
  }

  const normalized = [...byId.values()].map((feature) => {
    const properties = feature?.properties || {};
    const severityLevel = mapSeverityLevel(properties);
    return {
      id: properties.id || feature?.id,
      type: properties.event || 'Weather Alert',
      event: properties.event || 'Weather Alert',
      severityLevel,
      status: 'active',
      startsAt: properties.effective || properties.onset || null,
      endsAt: properties.ends || properties.expires || null,
      headline: properties.headline || properties.event || 'Weather Alert',
      summary: properties.description?.split('\n')[0] || properties.headline || properties.event || 'Weather Alert',
      impacts: extractSection(properties.description, 'IMPACT'),
      actions: extractSection(properties.instruction || properties.description, 'PRECAUTIONARY'),
      source: 'National Weather Service',
      sourceUrl: properties['@id'] || null,
      area: properties.areaDesc || null,
      severity: properties.severity || null,
      urgency: properties.urgency || null,
      certainty: properties.certainty || null,
    };
  });

  normalized.sort((left, right) => {
    if (right.severityLevel !== left.severityLevel) return right.severityLevel - left.severityLevel;
    return new Date(left.endsAt || 0) - new Date(right.endsAt || 0);
  });

  const strongestByFamily = new Map();
  const result = [];
  for (const alert of normalized) {
    const family = hazardFamily(alert.event);
    const existing = strongestByFamily.get(family);
    if (!existing || alert.severityLevel > existing.severityLevel) {
      strongestByFamily.set(family, alert);
    }
  }
  for (const alert of normalized) {
    const family = hazardFamily(alert.event);
    const strongest = strongestByFamily.get(family);
    if (strongest && strongest.id !== alert.id && strongest.severityLevel >= 4 && alert.severityLevel <= 3) {
      continue;
    }
    result.push(alert);
  }
  return result;
}

function extractSection(text = '', header = '') {
  if (!text) return [];
  const lines = String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const matches = lines
    .filter((line) => line.toUpperCase().includes(header))
    .slice(0, 3)
    .map((line) => line.replace(/^\*+\s*/, '').replace(/\.\.\./g, ' ').trim());
  if (matches.length) return matches;
  return lines.slice(0, 2);
}

function updateRecentAlerts(activeAlerts) {
  const now = Date.now();
  const activeIds = new Set(activeAlerts.map((alert) => alert.id));
  for (const alert of activeAlerts) {
    recentAlerts.set(alert.id, { ...alert, status: 'active', endedAt: null });
  }
  for (const [id, alert] of recentAlerts.entries()) {
    if (!activeIds.has(id) && !alert.endedAt) {
      recentAlerts.set(id, { ...alert, status: 'expired', endedAt: new Date().toISOString() });
    }
  }
  for (const [id, alert] of recentAlerts.entries()) {
    if (alert.endedAt && (now - new Date(alert.endedAt).getTime()) > 2 * 60 * 60 * 1000) {
      recentAlerts.delete(id);
    }
  }
}

async function safeFetchJson(url, init, timeoutMs) {
  try {
    return await fetchJson(url, init, timeoutMs);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error,
    };
  }
}

function buildWarning(label, response) {
  const suffix = response?.error?.message
    ? `: ${response.error.message}`
    : response?.status
      ? ` (${response.status})`
      : '';
  return `${label} unavailable${suffix}`;
}

function buildRiskSummary(current, daily, alerts, { forecastAvailable = true, alertsAvailable = true } = {}) {
  if (alerts.length) {
    const top = alerts[0];
    return {
      level: top.severityLevel,
      status: mapStatus(top.severityLevel),
      headline: top.type,
      summary: top.summary,
      timeWindow: top.endsAt ? `Until ${new Date(top.endsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : null,
    };
  }
  if (!forecastAvailable) {
    return {
      level: 0,
      status: alertsAvailable ? 'info' : 'warning',
      headline: 'Weather data unavailable',
      summary: alertsAvailable
        ? 'Forecast data is temporarily unavailable.'
        : 'Forecast and alert feeds are temporarily unavailable.',
      timeWindow: null,
    };
  }
  const precip = Number(daily?.precipitation_probability_max?.[0] || 0);
  const wind = Number(current?.wind_speed_10m || current?.wind_gusts_10m || 0);
  const temp = Number(current?.temperature_2m || 0);
  let level = 0;
  let headline = 'No hazardous weather expected';
  let summary = 'Conditions look calm over the next 24 hours.';
  if (precip >= 70 || wind >= 30) {
    level = 2;
    headline = 'Elevated weather impact';
    summary = 'Rain or gusty conditions may affect outdoor plans today.';
  }
  if (temp >= 95) {
    level = Math.max(level, 2);
    headline = 'Heat risk';
    summary = 'Hot conditions today. Limit strenuous outdoor activity.';
  }
  return { level, status: mapStatus(level), headline, summary, timeWindow: null };
}

function buildEnvironmentPayload(config, {
  forecast = null,
  alerts = [],
  stale = false,
  degraded = false,
  isMock = false,
  warnings = [],
  forecastAvailable = true,
  alertsAvailable = true,
  fetchedAt = new Date().toISOString(),
} = {}) {
  const current = forecast?.current || {};
  const daily = forecast?.daily || {};
  const hourly = forecast?.hourly || {};
  const locationName = config?.environment?.locationName || 'Configured location';
  const risk = buildRiskSummary(current, daily, alerts, { forecastAvailable, alertsAvailable });
  const currentTemp = maybeRound(current.temperature_2m);
  const highTemp = maybeRound(daily.temperature_2m_max?.[0]);
  const lowTemp = maybeRound(daily.temperature_2m_min?.[0]);

  return {
    meta: createMeta({
      fetchedAt,
      stale,
      degraded,
      isMock,
      warnings,
    }),
    summary: {
      status: risk.status,
      priority: risk.level >= 4 ? 'critical_alert' : risk.level >= 2 ? 'attention_needed' : 'normal',
      headline: risk.headline,
      supportingText: risk.summary,
      badges: [
        locationName,
        currentTemp == null ? 'Forecast unavailable' : `${currentTemp}°`,
      ],
      cta: risk.level >= 3 ? { label: 'View Alerts', route: '#/alerts' } : { label: 'Open Weather', route: '#/weather' },
      updatedAt: fetchedAt,
      weather: {
        temp: currentTemp,
        high: highTemp,
        low: lowTemp,
        condition: forecastAvailable ? getConditionLabel(current.weather_code) : 'Forecast unavailable',
        icon: forecastAvailable ? getConditionIcon(current.weather_code) : '·',
      },
      risk,
      activeAlertCount: alertsAvailable ? alerts.length : 0,
      ticker: alerts.length
        ? alerts.slice(0, 3).map((alert) => alert.type).join(' · ')
        : alertsAvailable
          ? 'No alerts'
          : 'Alerts unavailable',
    },
    detail: {
      forecastAvailable,
      alertsAvailable,
      current: {
        temp: currentTemp,
        feelsLike: maybeRound(current.apparent_temperature ?? current.temperature_2m),
        humidity: maybeRound(current.relative_humidity_2m),
        windMph: maybeRound(current.wind_speed_10m),
        gustMph: maybeRound(current.wind_gusts_10m),
        condition: forecastAvailable ? getConditionLabel(current.weather_code) : 'Forecast unavailable',
        icon: forecastAvailable ? getConditionIcon(current.weather_code) : '·',
      },
      hourly: Array.isArray(hourly.time)
        ? hourly.time.slice(0, 12).map((time, index) => ({
            time,
            temp: maybeRound(hourly.temperature_2m?.[index]),
            precipitationChance: maybeRound(hourly.precipitation_probability?.[index]),
            icon: getConditionIcon(hourly.weather_code?.[index]),
          }))
        : [],
      daily: Array.isArray(daily.time)
        ? daily.time.slice(0, 7).map((time, index) => ({
            date: time,
            high: maybeRound(daily.temperature_2m_max?.[index]),
            low: maybeRound(daily.temperature_2m_min?.[index]),
            precipitationChance: maybeRound(daily.precipitation_probability_max?.[index]),
            icon: getConditionIcon(daily.weather_code?.[index]),
          }))
        : [],
      radar: {
        available: forecastAvailable,
        source: forecastAvailable ? 'RainViewer' : 'Unavailable',
      },
      risk,
      alerts: {
        active: alerts,
        recentlyEnded: [...recentAlerts.values()].filter((alert) => alert.status === 'expired'),
      },
    },
  };
}

export async function getEnvironmentPayload(config, { mockScenario = null } = {}) {
  if (mockScenario === 'TORNADO_5') {
    const mockAlert = {
      id: 'mock-tornado',
      type: 'Tornado Warning',
      event: 'Tornado Warning',
      severityLevel: 5,
      status: 'active',
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + (30 * 60 * 1000)).toISOString(),
      headline: 'Tornado Warning',
      summary: 'Take shelter now in an interior room on the lowest floor.',
      impacts: ['Flying debris will be dangerous.', 'Power outages are likely.'],
      actions: ['Move away from windows.', 'Take shelter immediately.'],
      source: 'HomeHub Test',
      sourceUrl: null,
      area: config?.environment?.locationName || 'Configured location',
      severity: 'Extreme',
      urgency: 'Immediate',
      certainty: 'Observed',
    };
    updateRecentAlerts([mockAlert]);
    return buildEnvironmentPayload(config, {
      forecast: {
        current: {
          temperature_2m: 73,
          apparent_temperature: 74,
          relative_humidity_2m: 73,
          wind_speed_10m: 18,
          wind_gusts_10m: 31,
          weather_code: 95,
        },
        hourly: {
          time: [],
          temperature_2m: [],
          precipitation_probability: [],
          weather_code: [],
        },
        daily: {
          time: [],
          temperature_2m_max: [75],
          temperature_2m_min: [59],
          precipitation_probability_max: [90],
          weather_code: [95],
        },
      },
      alerts: [mockAlert],
      isMock: true,
    });
  }

  const lat = Number(config?.environment?.lat);
  const lon = Number(config?.environment?.lon);
  const [forecastResponse, alertsResponse] = await Promise.all([
    safeFetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m' +
      '&hourly=temperature_2m,precipitation_probability,weather_code' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
      '&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto',
      {},
      7000
    ),
    safeFetchJson(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, {
      headers: { 'User-Agent': NWS_USER_AGENT },
    }, 7000),
  ]);

  const warnings = [];
  if (!forecastResponse.ok) warnings.push(buildWarning('Forecast feed', forecastResponse));
  if (!alertsResponse.ok) warnings.push(buildWarning('Alert feed', alertsResponse));

  const snapshotKey = `environment:${lat}:${lon}`;
  const snapshot = readSnapshot(snapshotKey);
  if (!forecastResponse.ok && !alertsResponse.ok && snapshot) {
    return {
      ...snapshot,
      meta: createMeta({
        fetchedAt: snapshot.meta?.fetchedAt,
        stale: true,
        degraded: true,
        isMock: snapshot.meta?.isMock,
        warnings: [...(snapshot.meta?.warnings || []), ...warnings, 'Environment origin fetch failed. Returned last-known-good snapshot.'],
      }),
      detail: {
        ...snapshot.detail,
        forecastAvailable: Boolean(snapshot.detail?.forecastAvailable),
        alertsAvailable: Boolean(snapshot.detail?.alertsAvailable),
      },
    };
  }

  const alerts = alertsResponse.ok
    ? dedupeAndRankAlerts((alertsResponse.data?.features || []).filter((feature) => {
        const props = feature?.properties || {};
        const endsAt = props.ends || props.expires;
        return !endsAt || new Date(endsAt) > new Date();
      }))
    : [];

  if (alertsResponse.ok) {
    updateRecentAlerts(alerts);
  }

  const payload = buildEnvironmentPayload(config, {
    forecast: forecastResponse.ok ? (forecastResponse.data || {}) : null,
    alerts,
    degraded: !forecastResponse.ok || !alertsResponse.ok,
    warnings,
    forecastAvailable: Boolean(forecastResponse.ok),
    alertsAvailable: Boolean(alertsResponse.ok),
  });

  return writeSnapshot(snapshotKey, payload);
}

export async function getEnvironmentHealth(config) {
  try {
    const payload = await getEnvironmentPayload(config);
    return {
      status: payload.meta.degraded ? 'degraded' : 'healthy',
      source: 'open-meteo + nws',
      lastUpdated: payload.meta.fetchedAt,
      warnings: payload.meta.warnings,
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'open-meteo + nws',
      errorState: error.message,
      warnings: [error.message],
    };
  }
}
