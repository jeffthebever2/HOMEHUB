// /api/weather-aggregate.js — Vercel Serverless Function
// GET /api/weather-aggregate?lat=..&lon=..
//
// Tiered weather fetch:
//   Tier 1 (always)   — Open-Meteo, Weather.gov, RainViewer
//   Tier 2 (optional) — Tomorrow.io, Visual Crossing (only when keys present)
//
// Field names match current Open-Meteo v1 API:
//   wind_speed_10m, wind_gusts_10m, dew_point_2m, weather_code

const TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS) || 6000;
const WG_UA = 'HomeHub/1.0 (contact: Will)';

async function fetchJSON(url, opts = {}) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const resp = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
    return { ok: true, data: await resp.json() };
  } catch (e) {
    return { ok: false, error: e.message || 'timeout' };
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'Missing lat/lon parameters' });

  const env = process.env;

  // ── Tier 1: must-work core ───────────────────────────────────────────────
  const [openMeteo, weatherGovPoints, rainviewer] = await Promise.all([
    // Open-Meteo — corrected field names per current API docs
    fetchJSON(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      // current: wind_speed_10m / wind_gusts_10m / dew_point_2m / weather_code
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,` +
      `wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,dew_point_2m,` +
      `surface_pressure,visibility` +
      // hourly: weather_code (not weathercode)
      `&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,weather_code` +
      // daily: weather_code now included for accurate 7-day forecast icons
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,` +
      `precipitation_probability_max,precipitation_sum,sunrise,sunset` +
      // 15-min slots for near-term rain-timing card (next ~2 hours)
      `&minutely_15=precipitation,precipitation_probability,weather_code` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch` +
      `&timezone=auto&forecast_days=7`
    ),

    // Weather.gov — points lookup; forecast + alerts fetched below
    fetchJSON(`https://api.weather.gov/points/${lat},${lon}`, {
      headers: { 'User-Agent': WG_UA }
    }),

    // RainViewer — radar manifest (host returned by API, do not hardcode)
    fetchJSON('https://api.rainviewer.com/public/weather-maps.json'),
  ]);

  // Weather.gov second hop: forecast + alerts
  let weatherGov;
  if (weatherGovPoints.ok && weatherGovPoints.data?.properties?.forecast) {
    const props = weatherGovPoints.data.properties;
    const [forecast, alerts] = await Promise.all([
      fetchJSON(props.forecast, { headers: { 'User-Agent': WG_UA } }),
      fetchJSON(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, {
        headers: { 'User-Agent': WG_UA }
      }),
    ]);
    weatherGov = {
      ok: true,
      data: {
        forecast: forecast.ok ? forecast.data : null,
        alerts:   alerts.ok   ? alerts.data   : null,
        office:   props.cwa,
        gridX:    props.gridX,
        gridY:    props.gridY,
      }
    };
  } else {
    weatherGov = { ok: false, error: weatherGovPoints.error || 'points lookup failed' };
  }

  // ── Tier 2: optional enrichment ─────────────────────────────────────────
  const [tomorrow, visualCrossing] = await Promise.all([
    env.TOMORROW_KEY
      ? fetchJSON(
          `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}` +
          `&apikey=${env.TOMORROW_KEY}&units=imperial`
        )
      : { ok: false, error: 'TOMORROW_KEY not configured' },

    env.VISUAL_CROSSING_KEY
      ? fetchJSON(
          `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${lat},${lon}` +
          `?key=${env.VISUAL_CROSSING_KEY}&unitGroup=us&include=current,days,hours` +
          `&elements=datetime,temp,tempmax,tempmin,humidity,precip,precipprob,snow,windspeed,windgust,conditions,description`
        )
      : { ok: false, error: 'VISUAL_CROSSING_KEY not configured' },
  ]);

  // ── Build response ───────────────────────────────────────────────────────
  const normalized = buildNormalized(openMeteo, weatherGov);
  const confidence  = buildConfidence(openMeteo, tomorrow, visualCrossing);

  const result = {
    location:  { lat: parseFloat(lat), lon: parseFloat(lon) },
    fetchedAt: new Date().toISOString(),
    sources: {
      openMeteo:      openMeteo.ok      ? { ok: true } : { ok: false, error: openMeteo.error },
      weatherGov:     weatherGov.ok     ? { ok: true } : { ok: false, error: weatherGov.error },
      rainviewer:     rainviewer.ok     ? { ok: true } : { ok: false, error: rainviewer.error },
      tomorrow:       tomorrow.ok       ? { ok: true } : { ok: false, error: tomorrow.error },
      visualCrossing: visualCrossing.ok ? { ok: true } : { ok: false, error: visualCrossing.error },
    },
    rainviewer:     rainviewer.ok     ? rainviewer.data     : null,
    normalized,
    confidence,
    // Flat top-level keys — backward compat for frontend & AI prompt
    openMeteo:      openMeteo.ok      ? openMeteo.data      : null,
    weatherGov:     weatherGov.ok     ? weatherGov.data     : null,
    tomorrow:       tomorrow.ok       ? tomorrow.data       : null,
    visualCrossing: visualCrossing.ok ? visualCrossing.data : null,
  };

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return res.status(200).json(result);
}

// ── buildNormalized ──────────────────────────────────────────────────────
function buildNormalized(openMeteo, weatherGov) {
  const n = { current: null, hourly: null, daily: null, minutely15: null };
  try {
    const om = openMeteo.ok ? openMeteo.data : null;
    if (om?.current) {
      n.current = {
        temp_f:       om.current.temperature_2m,
        humidity:     om.current.relative_humidity_2m,
        feels_like_f: om.current.apparent_temperature,
        wind_mph:     om.current.wind_speed_10m,      // updated field name
        gusts_mph:    om.current.wind_gusts_10m,      // updated field name
        dew_point_f:  om.current.dew_point_2m,        // updated field name
        pressure_hpa: om.current.surface_pressure,
        visibility_m: om.current.visibility,
        weather_code: om.current.weather_code,        // updated field name
        precip_in:    om.current.precipitation,
        description:  null,
      };
    }
    if (om?.daily?.time) {
      n.daily = om.daily.time.map((date, i) => ({
        date,
        weather_code:  om.daily.weather_code?.[i]                 ?? null,
        high_f:        om.daily.temperature_2m_max?.[i]           ?? null,
        low_f:         om.daily.temperature_2m_min?.[i]           ?? null,
        precip_chance: om.daily.precipitation_probability_max?.[i] ?? null,
        precip_sum_in: om.daily.precipitation_sum?.[i]            ?? null,
        sunrise:       om.daily.sunrise?.[i]                      ?? null,
        sunset:        om.daily.sunset?.[i]                       ?? null,
      }));
    }
    if (om?.hourly?.time) {
      n.hourly = om.hourly.time.slice(0, 48).map((time, i) => ({
        time,
        temp_f:       om.hourly.temperature_2m?.[i]              ?? null,
        precip_prob:  om.hourly.precipitation_probability?.[i]   ?? null,
        precip_in:    om.hourly.precipitation?.[i]               ?? null,
        wind_mph:     om.hourly.wind_speed_10m?.[i]              ?? null,
        weather_code: om.hourly.weather_code?.[i]                ?? null,
      }));
    }
    // 15-minute near-term data — first 8 slots ≈ next 2 hours
    if (om?.minutely_15?.time) {
      n.minutely15 = om.minutely_15.time.slice(0, 8).map((time, i) => ({
        time,
        precip:       om.minutely_15.precipitation?.[i]              ?? null,
        precip_prob:  om.minutely_15.precipitation_probability?.[i]  ?? null,
        weather_code: om.minutely_15.weather_code?.[i]               ?? null,
      }));
    }
    // Weather.gov text forecast enrichment
    const wg = weatherGov.ok ? weatherGov.data : null;
    if (wg?.forecast?.properties?.periods?.[0]) {
      const p = wg.forecast.properties.periods[0];
      if (n.current) {
        n.current.description = p.shortForecast;
        if (n.current.temp_f == null && p.temperature) n.current.temp_f = p.temperature;
      }
    }
  } catch (_) { /* partial payload is acceptable */ }
  return n;
}

// ── buildConfidence ──────────────────────────────────────────────────────
// Compares current temperature across available sources.
function buildConfidence(openMeteo, tomorrow, visualCrossing) {
  const temps = [];

  const omTemp = openMeteo.ok ? openMeteo.data?.current?.temperature_2m : null;
  if (omTemp != null) temps.push({ source: 'Open-Meteo', value: Math.round(omTemp) });

  const tmTemp = tomorrow.ok
    ? tomorrow.data?.timelines?.hourly?.[0]?.values?.temperature
    : null;
  if (tmTemp != null) temps.push({ source: 'Tomorrow.io', value: Math.round(tmTemp) });

  const vcTemp = visualCrossing.ok ? visualCrossing.data?.currentConditions?.temp : null;
  if (vcTemp != null) temps.push({ source: 'Visual Crossing', value: Math.round(vcTemp) });

  const spread = (arr) => {
    if (arr.length < 2) return null;
    const vals = arr.map(x => x.value);
    return Math.round((Math.max(...vals) - Math.min(...vals)) * 10) / 10;
  };

  const tempSpread = spread(temps);
  return {
    tempSpread_f:  tempSpread,
    tempSources:   temps,
    sourcesActive: temps.length,
    // "high" = sources within 4°F of each other
    agreement:     tempSpread == null ? 'unknown' : tempSpread < 4 ? 'high' : tempSpread < 8 ? 'medium' : 'low',
  };
}
