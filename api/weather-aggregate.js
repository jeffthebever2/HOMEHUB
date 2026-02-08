// /api/weather-aggregate.js — Vercel Serverless Function
// GET /api/weather-aggregate?lat=..&lon=..

const TIMEOUT_MS = 10000;
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

  // Parallel fetches
  const [openMeteo, weatherGovPoints, weatherbit, tomorrow, visualCrossing, pirateWeather, rainviewer] =
    await Promise.all([
      // 1. Open-Meteo (free)
      fetchJSON(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,windspeed_10m,wind_direction_10m,weathercode` +
        `&hourly=temperature_2m,precipitation_probability,precipitation,windspeed_10m,weathercode` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset` +
        `&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`
      ),

      // 2. Weather.gov points
      fetchJSON(`https://api.weather.gov/points/${lat},${lon}`, {
        headers: { 'User-Agent': WG_UA }
      }),

      // 3. Weatherbit
      env.WEATHERBIT_KEY
        ? fetchJSON(`https://api.weatherbit.io/v2.0/forecast/daily?lat=${lat}&lon=${lon}&key=${env.WEATHERBIT_KEY}&units=I&days=7`)
        : { ok: false, error: 'WEATHERBIT_KEY not configured' },

      // 4. Tomorrow.io
      env.TOMORROW_KEY
        ? fetchJSON(`https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&apikey=${env.TOMORROW_KEY}&units=imperial`)
        : { ok: false, error: 'TOMORROW_KEY not configured' },

      // 5. Visual Crossing
      env.VISUAL_CROSSING_KEY
        ? fetchJSON(
            `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${lat},${lon}` +
            `?key=${env.VISUAL_CROSSING_KEY}&unitGroup=us&include=current,days,hours` +
            `&elements=datetime,temp,tempmax,tempmin,humidity,precip,precipprob,snow,windspeed,windgust,conditions,description`
          )
        : { ok: false, error: 'VISUAL_CROSSING_KEY not configured' },

      // 6. Pirate Weather
      env.PIRATE_WEATHER_KEY
        ? fetchJSON(`https://api.pirateweather.net/forecast/${env.PIRATE_WEATHER_KEY}/${lat},${lon}?units=us`)
        : { ok: false, error: 'PIRATE_WEATHER_KEY not configured' },

      // 7. RainViewer
      fetchJSON('https://api.rainviewer.com/public/weather-maps.json')
    ]);

  // Weather.gov second hop: forecast + alerts
  let weatherGov;
  if (weatherGovPoints.ok && weatherGovPoints.data?.properties?.forecast) {
    const [forecast, alerts] = await Promise.all([
      fetchJSON(weatherGovPoints.data.properties.forecast, { headers: { 'User-Agent': WG_UA } }),
      fetchJSON(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, { headers: { 'User-Agent': WG_UA } })
    ]);
    weatherGov = { ok: true, data: { forecast: forecast.ok ? forecast.data : null, alerts: alerts.ok ? alerts.data : null } };
  } else {
    weatherGov = { ok: false, error: weatherGovPoints.error || 'points lookup failed' };
  }

  // Build normalized best-effort
  const normalized = buildNormalized(openMeteo, weatherGov);

  // Assemble — include top-level keys for backward compat with AI prompt
  const result = {
    location: { lat: parseFloat(lat), lon: parseFloat(lon) },
    fetchedAt: new Date().toISOString(),
    sources: {
      openMeteo: openMeteo.ok ? { ok: true, data: openMeteo.data } : { ok: false, error: openMeteo.error },
      weatherGov: weatherGov.ok ? { ok: true, data: weatherGov.data } : { ok: false, error: weatherGov.error },
      weatherbit: weatherbit.ok ? { ok: true, data: weatherbit.data } : { ok: false, error: weatherbit.error },
      tomorrow: tomorrow.ok ? { ok: true, data: tomorrow.data } : { ok: false, error: tomorrow.error },
      visualCrossing: visualCrossing.ok ? { ok: true, data: visualCrossing.data } : { ok: false, error: visualCrossing.error },
      pirateWeather: pirateWeather.ok ? { ok: true, data: pirateWeather.data } : { ok: false, error: pirateWeather.error }
    },
    rainviewer: rainviewer.ok ? rainviewer.data : null,
    normalized,
    // Flat top-level keys for backward compat (frontend & AI prompt use these)
    openMeteo: openMeteo.ok ? openMeteo.data : null,
    weatherGov: weatherGov.ok ? weatherGov.data : null,
    weatherbit: weatherbit.ok ? weatherbit.data : null,
    tomorrow: tomorrow.ok ? tomorrow.data : null,
    visualCrossing: visualCrossing.ok ? visualCrossing.data : null,
    pirateWeather: pirateWeather.ok ? pirateWeather.data : null
  };

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return res.status(200).json(result);
}

function buildNormalized(openMeteo, weatherGov) {
  const n = { current: null, hourly: null, daily: null };
  try {
    const om = openMeteo.ok ? openMeteo.data : null;
    if (om?.current) {
      n.current = {
        temp_f: om.current.temperature_2m,
        humidity: om.current.relative_humidity_2m,
        feels_like_f: om.current.apparent_temperature,
        wind_mph: om.current.windspeed_10m,
        precip_in: om.current.precipitation,
        description: null
      };
    }
    if (om?.daily?.time) {
      n.daily = om.daily.time.map((date, i) => ({
        date,
        high_f: om.daily.temperature_2m_max?.[i] ?? null,
        low_f: om.daily.temperature_2m_min?.[i] ?? null,
        precip_chance: om.daily.precipitation_probability_max?.[i] ?? null,
        precip_sum_in: om.daily.precipitation_sum?.[i] ?? null
      }));
    }
    if (om?.hourly?.time) {
      n.hourly = om.hourly.time.slice(0, 48).map((time, i) => ({
        time,
        temp_f: om.hourly.temperature_2m?.[i] ?? null,
        precip_prob: om.hourly.precipitation_probability?.[i] ?? null,
        precip_in: om.hourly.precipitation?.[i] ?? null,
        wind_mph: om.hourly.windspeed_10m?.[i] ?? null
      }));
    }
    // Weather.gov description
    const wg = weatherGov.ok ? weatherGov.data : null;
    if (wg?.forecast?.properties?.periods?.[0]) {
      const p = wg.forecast.properties.periods[0];
      if (n.current) {
        n.current.description = p.shortForecast;
        if (n.current.temp_f == null && p.temperature) n.current.temp_f = p.temperature;
      }
    }
  } catch (_) { /* partial is fine */ }
  return n;
}
