import { fetchJson } from '../../fetch.js';
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
  if (level === 3) return 'warning';
  if (level === 2) return 'warning';
  if (level === 1) return 'info';
  return 'success';
}

function dedupeAndRankAlerts(features = []) {
  const byId = new Map();
  for (const feature of features) {
    const properties = feature.properties || {};
    const id = properties.id || feature.id || `${properties.event}-${properties.sent || properties.effective || ''}`;
    const current = byId.get(id);
    if (!current || new Date(properties.sent || properties.updated || 0) > new Date(current.properties?.sent || current.properties?.updated || 0)) {
      byId.set(id, feature);
    }
  }

  const normalized = [...byId.values()].map((feature) => {
    const properties = feature.properties || {};
    const severityLevel = mapSeverityLevel(properties);
    return {
      id: properties.id || feature.id,
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

function buildRiskSummary(current, daily, alerts) {
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

function buildSummaryPayload(config, forecast, alerts, stale = false, degraded = false) {
  const current = forecast?.current || {};
  const daily = forecast?.daily || {};
  const risk = buildRiskSummary(current, daily, alerts);
  const now = new Date().toISOString();
  return {
    meta: {
      schemaVersion: 1,
      fetchedAt: now,
      stale,
      degraded,
      isMock: false,
      warnings: [],
    },
    summary: {
      status: risk.status,
      priority: risk.level >= 4 ? 'critical_alert' : risk.level >= 2 ? 'attention_needed' : 'normal',
      headline: risk.headline,
      supportingText: risk.summary,
      badges: [
        `${config.environment.locationName}`,
        `${Math.round(current.temperature_2m ?? 0)}°`,
      ],
      cta: risk.level >= 3 ? { label: 'View Alerts', route: '#/alerts' } : { label: 'Open Weather', route: '#/weather' },
      updatedAt: now,
      weather: {
        temp: Math.round(current.temperature_2m ?? 0),
        high: Math.round(daily.temperature_2m_max?.[0] ?? 0),
        low: Math.round(daily.temperature_2m_min?.[0] ?? 0),
        condition: getConditionLabel(current.weather_code),
        icon: getConditionIcon(current.weather_code),
      },
      risk,
      activeAlertCount: alerts.length,
      ticker: alerts.slice(0, 3).map((alert) => alert.type).join(' · ') || 'No alerts',
    },
    detail: {
      current: {
        temp: Math.round(current.temperature_2m ?? 0),
        feelsLike: Math.round(current.apparent_temperature ?? current.temperature_2m ?? 0),
        humidity: Math.round(current.relative_humidity_2m ?? 0),
        windMph: Math.round(current.wind_speed_10m ?? 0),
        gustMph: Math.round(current.wind_gusts_10m ?? 0),
        condition: getConditionLabel(current.weather_code),
        icon: getConditionIcon(current.weather_code),
      },
      hourly: (forecast?.hourly?.time || []).slice(0, 12).map((time, index) => ({
        time,
        temp: Math.round(forecast.hourly.temperature_2m?.[index] ?? 0),
        precipitationChance: Math.round(forecast.hourly.precipitation_probability?.[index] ?? 0),
        icon: getConditionIcon(forecast.hourly.weather_code?.[index]),
      })),
      daily: (daily.time || []).slice(0, 7).map((time, index) => ({
        date: time,
        high: Math.round(daily.temperature_2m_max?.[index] ?? 0),
        low: Math.round(daily.temperature_2m_min?.[index] ?? 0),
        precipitationChance: Math.round(daily.precipitation_probability_max?.[index] ?? 0),
        icon: getConditionIcon(daily.weather_code?.[index]),
      })),
      radar: {
        available: true,
        source: 'RainViewer',
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
      area: config.environment.locationName,
      severity: 'Extreme',
      urgency: 'Immediate',
      certainty: 'Observed',
    };
    updateRecentAlerts([mockAlert]);
    const mockForecast = {
      current: { temperature_2m: 73, apparent_temperature: 74, relative_humidity_2m: 73, wind_speed_10m: 18, wind_gusts_10m: 31, weather_code: 95 },
      hourly: { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [] },
      daily: { time: [], temperature_2m_max: [75], temperature_2m_min: [59], precipitation_probability_max: [90], weather_code: [95] },
    };
    const payload = buildSummaryPayload(config, mockForecast, [mockAlert], false, false);
    payload.meta.isMock = true;
    return payload;
  }

  const lat = config.environment.lat;
  const lon = config.environment.lon;
  const [forecastResponse, alertsResponse] = await Promise.all([
    fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m' +
      '&hourly=temperature_2m,precipitation_probability,weather_code' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
      '&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto',
      {},
      7000
    ),
    fetchJson(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, {
      headers: { 'User-Agent': NWS_USER_AGENT },
    }, 7000),
  ]);

  const snapshotKey = `environment:${lat}:${lon}`;
  if (!forecastResponse.ok || !alertsResponse.ok) {
    const snapshot = readSnapshot(snapshotKey);
    if (snapshot) {
      return {
        ...snapshot,
        meta: {
          ...snapshot.meta,
          stale: true,
          degraded: true,
          warnings: ['Environment origin fetch failed. Returned last-known-good snapshot.'],
        },
      };
    }
  }

  const alerts = alertsResponse.ok
    ? dedupeAndRankAlerts((alertsResponse.data?.features || []).filter((feature) => {
      const props = feature.properties || {};
      const endsAt = props.ends || props.expires;
      return !endsAt || new Date(endsAt) > new Date();
    }))
    : [];

  updateRecentAlerts(alerts);

  const payload = buildSummaryPayload(config, forecastResponse.data || {}, alerts, false, !forecastResponse.ok || !alertsResponse.ok);
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
