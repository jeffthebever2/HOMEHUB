// ============================================================
// assets/weather.js — Weather data fetching & display (NO AI)
// ============================================================
window.Hub = window.Hub || {};

Hub.weather = {
  _cache: null,
  _cacheTime: 0,
  CACHE_TTL: 120000, // 2 min
  _radarFrames: [],
  _radarIndex: 0,
  _radarInterval: null,

  // ── Data fetching ─────────────────────────────────────────

  async fetchAggregate() {
    const now = Date.now();
    if (this._cache && (now - this._cacheTime) < this.CACHE_TTL) return this._cache;

    const loc  = Hub.utils.getLocation();
    const base = Hub.utils.apiBase();
    const url  = `${base}/api/weather-aggregate?lat=${loc.lat}&lon=${loc.lon}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      this._cache = data;
      this._cacheTime = now;
      return data;
    } catch (e) {
      console.error('Weather aggregate error:', e);
      return null;
    }
  },

  async fetchAlerts() {
    const loc  = Hub.utils.getLocation();
    const base = Hub.utils.apiBase();
    try {
      const url  = `${base}/api/weather-alerts?lat=${loc.lat}&lon=${loc.lon}&_t=${Date.now()}`;
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) return [];
      const data = await resp.json();
      const now  = Date.now();
      return (data.alerts || []).filter(a => {
        if (!a.expires) return true;
        return new Date(a.expires).getTime() > now;
      });
    } catch (e) {
      console.error('Weather alerts error:', e);
      return [];
    }
  },

  async fetchRainViewerData() {
    try {
      const resp = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      console.error('RainViewer error:', e);
      return null;
    }
  },

  // ── Normalize ─────────────────────────────────────────────

  normalize(agg) {
    if (!agg) return null;
    const result = { current: {}, today: {}, tomorrow: {}, forecast: [], hourly: [], minutely15: [] };

    // Open-Meteo current — use updated field names
    if (agg.openMeteo?.current) {
      const c = agg.openMeteo.current;
      result.current.temp_f       = Math.round(c.temperature_2m);
      result.current.feels_like_f = Math.round(c.apparent_temperature || c.temperature_2m);
      result.current.wind_mph     = Math.round(c.wind_speed_10m);      // updated
      result.current.humidity     = c.relative_humidity_2m;
      result.current.condition    = this._getConditionFromCode(c.weather_code);  // updated
      result.current.icon         = this._getWeatherIcon(c.weather_code);        // updated
      result.current.dewpoint_f   = c.dew_point_2m    != null ? Math.round(c.dew_point_2m)    : null; // updated
      result.current.pressure_hpa = c.surface_pressure != null ? Math.round(c.surface_pressure) : null;
      result.current.visibility_mi = c.visibility     != null ? Math.round(c.visibility * 0.000621371) : null;
      result.current.gusts_mph    = c.wind_gusts_10m  != null ? Math.round(c.wind_gusts_10m)  : null; // updated
      result.current.weather_code = c.weather_code;
    }

    // Open-Meteo daily — weather_code now present (fixes forecast icons)
    if (agg.openMeteo?.daily) {
      const d = agg.openMeteo.daily;
      if (d.temperature_2m_max?.[0] != null) result.today.high_f        = Math.round(d.temperature_2m_max[0]);
      if (d.temperature_2m_min?.[0] != null) result.today.low_f         = Math.round(d.temperature_2m_min[0]);
      if (d.precipitation_probability_max?.[0] != null) result.today.precip_chance = d.precipitation_probability_max[0];
      if (d.sunrise?.[0]) result.today.sunrise = d.sunrise[0];
      if (d.sunset?.[0])  result.today.sunset  = d.sunset[0];

      if (d.temperature_2m_max?.[1] != null) result.tomorrow.high_f    = Math.round(d.temperature_2m_max[1]);
      if (d.temperature_2m_min?.[1] != null) result.tomorrow.low_f     = Math.round(d.temperature_2m_min[1]);
      if (d.precipitation_probability_max?.[1] != null) result.tomorrow.precip_chance = d.precipitation_probability_max[1];

      // 7-day forecast — icon now uses real daily weather_code (was always sunny before)
      for (let i = 0; i < 7 && i < d.time.length; i++) {
        result.forecast.push({
          date:   d.time[i],
          high_f: Math.round(d.temperature_2m_max[i]),
          low_f:  Math.round(d.temperature_2m_min[i]),
          precip: d.precipitation_probability_max?.[i] || 0,
          icon:   this._getWeatherIcon(d.weather_code?.[i] ?? 0),  // fixed: was d.weathercode
        });
      }
    }

    // Hourly — next 6 hours strip
    if (agg.openMeteo?.hourly) {
      const h = agg.openMeteo.hourly;
      const nowMs = Date.now();
      for (let i = 0; i < h.time.length && result.hourly.length < 6; i++) {
        if (new Date(h.time[i]).getTime() >= nowMs) {
          result.hourly.push({
            time:        h.time[i],
            temp_f:      h.temperature_2m?.[i]             != null ? Math.round(h.temperature_2m[i]) : null,
            precip_prob: h.precipitation_probability?.[i]  ?? null,
            wind_mph:    h.wind_speed_10m?.[i]             != null ? Math.round(h.wind_speed_10m[i]) : null,
            icon:        this._getWeatherIcon(h.weather_code?.[i] ?? 0),  // fixed: was h.weathercode
          });
        }
      }
    }

    // 15-minute near-term strip (next ~2 hours, 8 slots × 15 min)
    if (agg.openMeteo?.minutely_15) {
      const m = agg.openMeteo.minutely_15;
      const nowMs = Date.now();
      for (let i = 0; i < m.time.length && result.minutely15.length < 8; i++) {
        if (new Date(m.time[i]).getTime() >= nowMs) {
          result.minutely15.push({
            time:        m.time[i],
            precip:      m.precipitation?.[i]              ?? null,
            precip_prob: m.precipitation_probability?.[i]  ?? null,
            weather_code: m.weather_code?.[i]              ?? null,
          });
        }
      }
    }

    // Weather.gov text descriptions
    if (agg.weatherGov?.forecast?.properties?.periods) {
      const p = agg.weatherGov.forecast.properties.periods;
      if (p[0]) {
        result.current.description = p[0].shortForecast;
        if (p[0].temperature) result.current.temp_f = result.current.temp_f || p[0].temperature;
      }
    }

    return result;
  },

  // ── Smart weather interpretation helpers ──────────────────

  /** Find rain-start time from 15-min data. Returns {time, prob} or null. */
  _findRainStart(minutely15) {
    if (!minutely15?.length) return null;
    for (const slot of minutely15) {
      if ((slot.precip_prob ?? 0) >= 40 || (slot.precip ?? 0) > 0.005) {
        return { time: slot.time, prob: slot.precip_prob };
      }
    }
    return null;
  },

  /** Find rain-start time from hourly data. Returns {time, prob} or null. */
  _findRainStartHourly(hourly) {
    if (!hourly?.length) return null;
    for (const slot of hourly) {
      if ((slot.precip_prob ?? 0) >= 40) {
        return { time: slot.time, prob: slot.precip_prob };
      }
    }
    return null;
  },

  /** Find peak wind window from hourly data. Returns {from, to, mph} or null. */
  _findPeakWindWindow(hourly) {
    if (!hourly?.length) return null;
    let peak = 0;
    let peakIdx = -1;
    hourly.forEach((h, i) => {
      if ((h.wind_mph ?? 0) > peak) { peak = h.wind_mph; peakIdx = i; }
    });
    if (peak < 15 || peakIdx < 0) return null;
    const start = hourly[Math.max(0, peakIdx - 1)];
    const end   = hourly[Math.min(hourly.length - 1, peakIdx + 1)];
    return { from: start.time, to: end.time, mph: peak };
  },

  /** Find the best outdoor window (low precip, mild temp, low wind). */
  _findBestOutdoorWindow(hourly) {
    if (!hourly?.length) return null;
    const nowMs = Date.now();
    const candidates = hourly.filter(h => {
      const t = new Date(h.time).getTime();
      if (t < nowMs) return false;
      const hour = new Date(h.time).getHours();
      if (hour < 7 || hour > 20) return false;
      return (h.precip_prob ?? 100) < 30 && (h.temp_f ?? 0) > 45 && (h.temp_f ?? 200) < 95;
    });
    if (!candidates.length) return null;
    const best = candidates.reduce((a, b) =>
      ((a.precip_prob ?? 50) + Math.abs((a.temp_f ?? 70) - 72)) <
      ((b.precip_prob ?? 50) + Math.abs((b.temp_f ?? 70) - 72)) ? a : b
    );
    const idx  = hourly.indexOf(best);
    const end  = hourly[Math.min(hourly.length - 1, idx + 2)];
    return { from: best.time, to: end.time, temp_f: best.temp_f };
  },

  /** Build household impact list from normalized data. */
  _buildImpacts(normalized, alerts) {
    const impacts = [];
    const c = normalized.current || {};
    const today = normalized.today || {};

    if ((today.precip_chance ?? 0) >= 50)
      impacts.push({ emoji: '☂️', text: 'Bring an umbrella today', priority: 'high' });

    if ((c.wind_mph ?? 0) >= 25 || (c.gusts_mph ?? 0) >= 35)
      impacts.push({ emoji: '⚡', text: 'Charge devices — possible power flickers', priority: 'medium' });

    const pm = new Date().getHours() >= 18;
    if ((today.precip_chance ?? 0) >= 30)
      impacts.push({ emoji: '🧹', text: pm ? 'Delay outdoor chores to tomorrow' : 'Wrap up outdoor chores before evening', priority: 'low' });

    if ((c.temp_f ?? 70) <= 32)
      impacts.push({ emoji: '🌡️', text: 'Freezing temps — check pipes, warm up car early', priority: 'high' });

    if ((c.temp_f ?? 70) >= 90 && (c.humidity ?? 0) >= 60)
      impacts.push({ emoji: '🥵', text: 'Heat index high — limit outdoor time, stay hydrated', priority: 'high' });

    if ((c.wind_mph ?? 0) >= 15 || (today.precip_chance ?? 0) >= 60)
      impacts.push({ emoji: '🐕', text: 'Dog walk: check best window above', priority: 'medium' });

    if (alerts?.some(a => ['Extreme', 'Severe'].includes(a.severity)))
      impacts.push({ emoji: '🚨', text: 'Severe alert active — stay aware of updates', priority: 'critical' });
    else if (alerts?.length)
      impacts.push({ emoji: '⚠️', text: `${alerts[0].event} in effect — check the alert banner`, priority: 'medium' });

    const hour = new Date().getHours();
    if (hour >= 7 && hour <= 9 && (today.precip_chance ?? 0) >= 40)
      impacts.push({ emoji: '🚌', text: 'School/commute caution — wet roads likely', priority: 'medium' });

    return impacts.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
    });
  },

  // ── WMO code helpers ──────────────────────────────────────

  _getConditionFromCode(code) {
    const map = {
      0: 'Clear Sky',
      1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Rime Fog',
      51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
      61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
      71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow',
      80: 'Light Showers', 81: 'Showers', 82: 'Heavy Showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with Hail', 99: 'Severe Thunderstorm'
    };
    return map[code] || 'Unknown';
  },

  _getWeatherIcon(code) {
    if (code === 0)                        return '☀️';
    if (code >= 1  && code <= 3)           return '⛅';
    if (code >= 45 && code <= 48)          return '🌫️';
    if (code >= 51 && code <= 55)          return '🌦️';
    if (code >= 61 && code <= 65)          return '🌧️';
    if (code >= 71 && code <= 75)          return '❄️';
    if (code >= 80 && code <= 82)          return '🌧️';
    if (code >= 95)                        return '⛈️';
    return '🌤️';
  },

  // ── Dashboard widget ──────────────────────────────────────

  async renderDashboard() {
    const el = Hub.utils.$('dashboardWeather');
    if (!el) return;
    el.innerHTML = '<p class="text-gray-400 text-sm">Loading...</p>';

    const aggregate  = await this.fetchAggregate();
    const normalized = this.normalize(aggregate);

    if (normalized?.current) {
      const fmtTime = (iso) => {
        if (!iso) return '--';
        try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); }
        catch (e) { return '--'; }
      };
      const sunrise     = fmtTime(normalized.today?.sunrise);
      const sunset      = fmtTime(normalized.today?.sunset);
      const lastUpdated = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      // Hourly strip
      const hourlyStrip = (normalized.hourly || []).map(h => {
        const hr = new Date(h.time).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
        return `<div class="text-center" style="min-width:42px;">
          <div class="text-xs text-gray-500">${hr}</div>
          <div style="font-size:.8rem;">${h.icon}</div>
          <div class="text-xs font-semibold">${h.temp_f ?? '--'}°</div>
          ${h.precip_prob ? `<div class="text-xs text-blue-400">${h.precip_prob}%</div>` : ''}
        </div>`;
      }).join('');

      el.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="text-5xl">${normalized.current.icon}</div>
            <div>
              <p class="text-3xl font-bold">${normalized.current.temp_f}°F</p>
              <p class="text-gray-400 text-sm">${Hub.utils.esc(normalized.current.condition)}</p>
            </div>
          </div>
          <div class="text-right text-xs text-gray-400 space-y-0.5">
            <p>Feels ${normalized.current.feels_like_f}°F</p>
            <p>💨 ${normalized.current.wind_mph} mph${normalized.current.gusts_mph ? ` · G${normalized.current.gusts_mph}` : ''}</p>
            <p>💧 ${normalized.current.humidity}%</p>
            ${normalized.current.dewpoint_f != null ? `<p>Dew ${normalized.current.dewpoint_f}°F</p>` : ''}
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-700">
          <div>
            <p class="text-gray-500 text-xs">Today</p>
            <p class="text-lg font-bold">${normalized.today?.high_f ?? '--'}° / ${normalized.today?.low_f ?? '--'}°</p>
            <p class="text-xs text-gray-400">💧 ${normalized.today?.precip_chance ?? 0}% rain</p>
          </div>
          <div>
            <p class="text-gray-500 text-xs">Tomorrow</p>
            <p class="text-lg font-bold">${normalized.tomorrow?.high_f ?? '--'}° / ${normalized.tomorrow?.low_f ?? '--'}°</p>
            <p class="text-xs text-gray-400">💧 ${normalized.tomorrow?.precip_chance ?? 0}% rain</p>
          </div>
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-0.5 mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
          <span>🌅 ${sunrise}</span>
          <span>🌇 ${sunset}</span>
          ${normalized.current.pressure_hpa  != null ? `<span>🔵 ${normalized.current.pressure_hpa} hPa</span>` : ''}
          ${normalized.current.visibility_mi != null ? `<span>👁 ${normalized.current.visibility_mi} mi</span>`  : ''}
        </div>
        ${hourlyStrip ? `<div class="flex gap-1 mt-3 pt-3 border-t border-gray-700 overflow-x-auto" style="scrollbar-width:none;">${hourlyStrip}</div>` : ''}
        <p class="text-right text-xs text-gray-600 mt-2">Updated ${lastUpdated}</p>
      `;
      return;
    }

    el.innerHTML = '<p class="text-yellow-400">Unable to load weather. Check settings or API keys.</p>';
  },

  // ── Full weather page ─────────────────────────────────────

  async renderWeatherPage() {
    const el = Hub.utils.$('weatherContent');
    if (!el) return;

    const aggregate  = await this.fetchAggregate();
    const normalized = this.normalize(aggregate);
    const alerts     = await this.fetchAlerts();

    if (!normalized) {
      el.innerHTML = '<p class="text-yellow-400">Unable to load weather data.</p>';
      return;
    }

    // ── Alert banner — all severity levels, AI-summarized ─────
    // Fire-and-forget — banner appears immediately, AI summary fills in async
    this._renderAlertBanner(alerts);

    let html = '';

    // ── Current conditions hero ────────────────────────────────
    html += `
      <div class="card">
        <div class="flex flex-col md:flex-row items-center justify-between gap-6">
          <div class="flex items-center gap-6">
            <div class="text-9xl">${normalized.current.icon}</div>
            <div>
              <h2 class="text-6xl font-bold mb-2">${normalized.current.temp_f}°F</h2>
              <p class="text-2xl text-gray-300">${Hub.utils.esc(normalized.current.condition)}</p>
              <p class="text-gray-400 mt-2">${Hub.utils.esc(normalized.current.description || '')}</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4 text-center">
            <div class="bg-gray-800 rounded-lg p-4">
              <p class="text-gray-400 text-sm mb-1">Feels Like</p>
              <p class="text-3xl font-bold">${normalized.current.feels_like_f}°F</p>
            </div>
            <div class="bg-gray-800 rounded-lg p-4">
              <p class="text-gray-400 text-sm mb-1">Humidity</p>
              <p class="text-3xl font-bold">${normalized.current.humidity}%</p>
            </div>
            <div class="bg-gray-800 rounded-lg p-4">
              <p class="text-gray-400 text-sm mb-1">Wind</p>
              <p class="text-3xl font-bold">${normalized.current.wind_mph}</p>
              <p class="text-xs text-gray-400">mph${normalized.current.gusts_mph ? ` · G${normalized.current.gusts_mph}` : ''}</p>
            </div>
            <div class="bg-gray-800 rounded-lg p-4">
              <p class="text-gray-400 text-sm mb-1">Rain Chance</p>
              <p class="text-3xl font-bold">${normalized.today?.precip_chance ?? 0}%</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // ── Near-term precip strip (15-min) ───────────────────────
    html += this._renderNearTermPrecip(normalized.minutely15);

    // ── Time-to-impact card ────────────────────────────────────
    html += this._renderTimeToImpact(normalized, aggregate);

    // ── Household impact mode ──────────────────────────────────
    html += this._renderHouseholdImpact(normalized, alerts);

    // ── 7-day forecast ─────────────────────────────────────────
    html += `
      <div class="card">
        <h3 class="text-2xl font-bold mb-4">7-Day Forecast</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
    `;
    normalized.forecast.forEach((day, i) => {
      const date    = new Date(day.date);
      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' :
                      date.toLocaleDateString('en-US', { weekday: 'short' });
      html += `
        <div class="bg-gray-800 rounded-lg p-4 text-center hover:bg-gray-700 transition">
          <p class="font-medium mb-2">${dayName}</p>
          <div class="text-4xl mb-2">${day.icon}</div>
          <p class="text-xl font-bold">${day.high_f}°</p>
          <p class="text-sm text-gray-400">${day.low_f}°</p>
          <p class="text-xs text-blue-400 mt-2">💧 ${day.precip}%</p>
        </div>
      `;
    });
    html += '</div></div>';

    // ── Source confidence meter ────────────────────────────────
    html += this._renderConfidence(aggregate?.confidence);

    // ── Weather.gov detailed forecast ─────────────────────────
    if (aggregate?.weatherGov?.forecast?.properties?.periods) {
      html += '<div class="card"><h3 class="text-2xl font-bold mb-4">📝 Detailed Forecast</h3><div class="space-y-3">';
      aggregate.weatherGov.forecast.properties.periods.slice(0, 6).forEach((p, i) => {
        html += `
          <div class="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition ${i === 0 ? 'border-2 border-blue-500' : ''}">
            <div class="flex items-center justify-between mb-2">
              <p class="text-lg font-bold">${Hub.utils.esc(p.name)}</p>
              <p class="text-2xl font-bold text-blue-400">${p.temperature}°F</p>
            </div>
            <p class="text-gray-300 text-sm">${Hub.utils.esc(p.detailedForecast)}</p>
          </div>
        `;
      });
      html += '</div></div>';
    }

    el.innerHTML = html;

    // Async-fill AI impact bullets (weather conditions) + AI alert summaries
    if (alerts?.length) {
      // Fill AI summaries into each alert row in the Household Impact card
      const ATHEME = {
        Extreme: { muted: 'text-red-300' }, Severe: { muted: 'text-orange-300' },
        Moderate: { muted: 'text-yellow-300' }, Minor: { muted: 'text-blue-300' },
        Unknown: { muted: 'text-gray-400' },
      };
      alerts.forEach((alert, i) => {
        const t = ATHEME[alert.severity] || ATHEME.Unknown;
      });
    }

    this.renderRainRadar();
  },

  // ── Near-term precipitation strip ────────────────────────────
  _renderNearTermPrecip(minutely15) {
    if (!minutely15?.length) return '';
    const slots = minutely15.slice(0, 8);
    const maxProb = Math.max(...slots.map(s => s.precip_prob ?? 0));

    // Only show this card if there's any notable chance in the next 2 hours
    if (maxProb < 5) return '';

    const bars = slots.map(s => {
      const prob = s.precip_prob ?? 0;
      const h    = Math.max(4, Math.round((prob / 100) * 40));
      const time = new Date(s.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const col  = prob >= 70 ? '#3b82f6' : prob >= 40 ? '#60a5fa' : '#93c5fd';
      return `<div class="flex flex-col items-center gap-1" style="min-width:36px;">
        <span class="text-xs text-gray-400">${prob}%</span>
        <div style="width:24px;height:${h}px;background:${col};border-radius:3px;transition:height .3s;"></div>
        <span class="text-xs text-gray-500" style="font-size:10px;">${time}</span>
      </div>`;
    }).join('');

    return `
      <div class="card">
        <h3 class="text-lg font-bold mb-3">🌂 Next 2 Hours — Precipitation Probability</h3>
        <div class="flex items-end gap-2 overflow-x-auto pb-1" style="scrollbar-width:none;">${bars}</div>
        <p class="text-xs text-gray-600 mt-2">Updates every 15 minutes · Source: Open-Meteo</p>
      </div>
    `;
  },

  // ── Time-to-impact card ───────────────────────────────────────
  _renderTimeToImpact(normalized, aggregate) {
    const lines = [];

    // Rain start — try 15-min first, fall back to hourly
    const rainStart15   = this._findRainStart(normalized.minutely15);
    const rainStartHrly = this._findRainStartHourly(normalized.hourly);
    const rainStart     = rainStart15 || rainStartHrly;

    if (rainStart) {
      const fmtTime = t => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const precision = rainStart15 ? '' : ' (estimated)';
      lines.push({ emoji: '🌧️', label: `Rain starts around ${fmtTime(rainStart.time)}${precision}`, detail: `${rainStart.prob ?? '?'}% chance` });
    } else if ((normalized.today?.precip_chance ?? 0) < 15) {
      lines.push({ emoji: '☀️', label: 'No rain expected today', detail: '' });
    }

    // Peak wind window
    const windPeak = this._findPeakWindWindow(normalized.hourly);
    if (windPeak) {
      const fmt = t => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
      lines.push({ emoji: '💨', label: `Peak wind ${fmt(windPeak.from)}–${fmt(windPeak.to)}`, detail: `${windPeak.mph} mph` });
    }

    // Best outdoor window
    const bestWindow = this._findBestOutdoorWindow(normalized.hourly);
    if (bestWindow) {
      const fmt = t => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
      lines.push({ emoji: '🐕', label: `Best dog-walk window: ${fmt(bestWindow.from)}–${fmt(bestWindow.to)}`, detail: `~${bestWindow.temp_f}°F` });
    }

    // Sunset
    if (normalized.today?.sunset) {
      const sunsetTime = new Date(normalized.today.sunset).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      lines.push({ emoji: '🌇', label: `Sunset at ${sunsetTime}`, detail: '' });
    }

    if (!lines.length) return '';

    const rows = lines.map(l => `
      <div class="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
        <div class="flex items-center gap-3">
          <span class="text-xl">${l.emoji}</span>
          <span class="text-sm text-gray-200">${Hub.utils.esc(l.label)}</span>
        </div>
        ${l.detail ? `<span class="text-xs text-blue-400 font-semibold">${Hub.utils.esc(l.detail)}</span>` : ''}
      </div>
    `).join('');

    return `
      <div class="card">
        <h3 class="text-lg font-bold mb-3">⏱️ Time-to-Impact</h3>
        ${rows}
      </div>
    `;
  },

  // ── Condition bullets (replaces AI-generated bullets) ──────────
  // Reads normalized weather + active alerts and returns ready-to-display
  // bullet objects: { emoji, text }
  _buildConditionBullets(normalized, alerts) {
    const c = normalized?.current || {};
    const t = normalized?.today   || {};
    const h = normalized?.hourly  || [];
    const bullets = [];

    // ── Active alerts first ───────────────────────────────────────
    if (alerts?.length) {
      const worst = alerts[0];
      const parsed = Hub.ai.parseNWSAlert(worst);
      // Key measurements from the worst alert
      parsed.keyNumbers.slice(0, 2).forEach(n => bullets.push({ emoji: null, text: n }));
      // Timing if present
      if (parsed.when) {
        bullets.push({ emoji: '🕐', text: parsed.when.trim() });
      }
    }

    // ── Temperature feel ─────────────────────────────────────────
    if (c.temp_f != null) {
      const feels = c.feels_like_f ?? c.temp_f;
      const diff  = Math.abs(Math.round(c.temp_f - feels));
      if (diff >= 5) {
        const dir = feels < c.temp_f ? 'colder' : 'warmer';
        bullets.push({ emoji: '🌡️', text: `Feels ${dir} than ${Math.round(c.temp_f)}°F — more like ${Math.round(feels)}°F outside.` });
      }
    }

    // ── Precipitation today ───────────────────────────────────────
    const precip = t.precip_chance ?? null;
    if (precip != null && precip >= 20) {
      const intensity = precip >= 70 ? 'Likely' : precip >= 40 ? 'Chance of' : 'Slight chance of';
      // Find first rain window from hourly
      const rainHour = h.find(hh => (hh.precip_prob ?? 0) >= 40);
      const when = rainHour
        ? ` starting around ${new Date(rainHour.time).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })}`
        : ' today';
      bullets.push({ emoji: '🌧️', text: `${intensity} rain${when} (${precip}% chance).` });
    }

    // ── Wind ─────────────────────────────────────────────────────
    if (c.wind_mph != null && c.wind_mph >= 15) {
      const gust = c.gusts_mph && c.gusts_mph > c.wind_mph ? `, gusts to ${Math.round(c.gusts_mph)} mph` : '';
      const adj  = c.wind_mph >= 30 ? 'Strong' : c.wind_mph >= 20 ? 'Breezy' : 'Windy';
      bullets.push({ emoji: '💨', text: `${adj} — ${Math.round(c.wind_mph)} mph winds${gust}. Secure loose outdoor items.` });
    }

    // ── Humidity / heat index ─────────────────────────────────────
    if (c.humidity != null && c.temp_f != null) {
      if (c.humidity >= 85 && c.temp_f >= 75) {
        bullets.push({ emoji: '😓', text: `High humidity (${c.humidity}%) makes it feel muggy. Stay hydrated.` });
      } else if (c.humidity <= 25) {
        bullets.push({ emoji: '🏜️', text: `Very dry air (${c.humidity}% humidity). Good day to moisturize and water plants.` });
      }
    }

    // ── Visibility ───────────────────────────────────────────────
    if (c.visibility_mi != null && c.visibility_mi < 3) {
      const desc = c.visibility_mi < 0.5 ? 'Dense fog' : 'Reduced visibility';
      bullets.push({ emoji: '🌫️', text: `${desc} — ${c.visibility_mi} mile(s). Allow extra travel time, use low beams.` });
    }

    // ── Sun/UV ───────────────────────────────────────────────────
    if (t.sunrise && t.sunset && !bullets.some(b => b.text.includes('rain'))) {
      if (c.condition?.toLowerCase().match(/clear|sunny|fair/)) {
        bullets.push({ emoji: '☀️', text: `Clear skies today. Sunrise ${t.sunrise}, sunset ${t.sunset}.` });
      }
    }

    // ── High / low ───────────────────────────────────────────────
    if (t.high_f != null && t.low_f != null) {
      const label = t.high_f >= 90 ? '🥵 Hot day' : t.high_f <= 32 ? '🥶 Freezing today' : `📊 Today`;
      bullets.push({ emoji: null, text: `${label}: High ${Math.round(t.high_f)}°F, Low ${Math.round(t.low_f)}°F.` });
    }

    return bullets.slice(0, 5); // max 5 bullets
  },

  // ── Household impact mode ─────────────────────────────────────
  // Three sections rendered in order:
  //   1. NWS-parsed condition bullets (built synchronously from normalized data)
  //   2. Active alert rows (each with its own AI summary + "Full alert" drawer)
  //   3. Rules-based static condition rows (umbrella, wind, etc.) as fallback context
  _renderHouseholdImpact(normalized, alerts) {
    const impacts = this._buildImpacts(normalized, alerts);

    const priorityColors = {
      critical: 'border-red-500 bg-red-900/20',
      high:     'border-orange-400 bg-orange-900/10',
      medium:   'border-blue-500 bg-blue-900/10',
      low:      'border-gray-600 bg-gray-800/60'
    };

    // ── Section 1: NWS-parsed conditions bullets ──────────────────
    // Built inline from normalized weather data — no AI, no network call
    const conditionBullets = this._buildConditionBullets(normalized, alerts);
    const aiBulletsSection = conditionBullets.length
      ? `<div class="space-y-2">
          ${conditionBullets.map(b => `
            <div class="flex items-start gap-3 px-4 py-3 rounded-lg border border-gray-700 bg-gray-800/60">
              ${b.emoji ? `<span class="text-xl flex-shrink-0">${b.emoji}</span>` : '<span class="text-xl flex-shrink-0 opacity-0">•</span>'}
              <span class="text-sm text-gray-200 leading-snug">${Hub.utils.esc(b.text)}</span>
            </div>`).join('')}
        </div>`
      : '';

    // ── Section 2: Alert rows with AI summary + full drawer ───────
    const alertRows = (alerts || []).map((a, i) => {
      const THEME = {
        Extreme: 'border-red-500 bg-red-900/20',
        Severe:  'border-orange-500 bg-orange-900/10',
        Moderate:'border-yellow-500 bg-yellow-900/10',
        Minor:   'border-blue-400 bg-blue-900/10',
      };
      const cls = THEME[a.severity] || 'border-gray-500 bg-gray-800/60';
      const icon = a.severity === 'Extreme' ? '🚨' : a.severity === 'Severe' ? '⚠️' : a.severity === 'Moderate' ? '🌦️' : 'ℹ️';
      const expiresStr = a.expires
        ? `Until ${new Date(a.expires).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
        : '';
      const hasFullText = !!(a.description || a.instruction);
      return `
        <div class="rounded-lg border ${cls} px-4 py-3">
          <div class="flex items-center justify-between gap-2 mb-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-lg">${icon}</span>
              <span class="font-semibold text-sm text-white">${Hub.utils.esc(a.event || 'Weather Alert')}</span>
              ${expiresStr ? `<span class="text-xs text-gray-400">${Hub.utils.esc(expiresStr)}</span>` : ''}
            </div>
            ${hasFullText ? `
              <button onclick="Hub.weather._toggleFullAlert(${i})"
                id="alertToggleBtn_${i}"
                class="text-xs text-blue-400 hover:text-blue-200 flex-shrink-0 whitespace-nowrap">
                View full ↓
              </button>` : ''}
          </div>
          <p class="text-sm text-gray-300 leading-snug">
            ${Hub.utils.esc(Hub.ai.alertSummary(a))}
          </p>
          <div id="impactAlertFull_${i}" class="hidden mt-3 pt-3 border-t border-gray-700 space-y-2">
            ${a.description ? `<p class="text-xs text-gray-400 leading-relaxed whitespace-pre-line">${Hub.utils.esc(a.description)}</p>` : ''}
            ${a.instruction ? `<p class="text-xs text-yellow-300/80 leading-relaxed"><span class="font-semibold text-white">What to do: </span>${Hub.utils.esc(a.instruction)}</p>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // ── Section 3: Rules-based static rows ────────────────────────
    const staticRows = impacts
      .filter(imp => !imp.isAlert)
      .map(imp => `
        <div class="flex items-center gap-3 px-4 py-3 rounded-lg border ${priorityColors[imp.priority] || 'border-gray-700'} bg-gray-800/60">
          <span class="text-xl">${imp.emoji}</span>
          <span class="text-sm text-gray-200">${Hub.utils.esc(imp.text)}</span>
        </div>
      `).join('');

    return `
      <div class="card" id="householdImpactCard">
        <h3 class="text-lg font-bold mb-3">🏠 Household Impact</h3>
        <div class="space-y-3">
          ${aiBulletsSection}
          ${alertRows ? `<div class="space-y-2">${alertRows}</div>` : ''}
          ${staticRows ? `
            <details class="group">
              <summary class="text-xs text-gray-500 cursor-pointer hover:text-gray-300 select-none list-none flex items-center gap-1">
                <span class="group-open:rotate-90 transition-transform inline-block">▶</span>
                Rules-based checks
              </summary>
              <div class="space-y-2 mt-2">${staticRows}</div>
            </details>` : ''}
        </div>
      </div>
    `;
  },

/** Toggle full NWS text drawer for an alert row in the impact card */
  _toggleFullAlert(idx) {
    const el  = document.getElementById(`impactAlertFull_${idx}`);
    const btn = document.getElementById(`alertToggleBtn_${idx}`);
    if (!el) return;
    const nowHidden = el.classList.toggle('hidden');
    if (btn) btn.textContent = nowHidden ? 'View full ↓' : 'Hide ↑';
  },



  // ── Source confidence meter ───────────────────────────────────
  _renderConfidence(confidence) {
    if (!confidence || confidence.sourcesActive < 2) return '';

    const agreementColor = { high: 'text-green-400', medium: 'text-yellow-400', low: 'text-red-400', unknown: 'text-gray-400' };
    const agreementLabel = { high: 'Sources agree ✓', medium: 'Minor spread', low: 'Sources disagree ⚠️', unknown: 'Insufficient sources' };

    const sourceRows = (confidence.tempSources || []).map(s =>
      `<span class="text-xs bg-gray-700 rounded px-2 py-0.5">${Hub.utils.esc(s.source)}: ${s.value}°F</span>`
    ).join('');

    const spreadText = confidence.tempSpread_f != null
      ? `${confidence.tempSpread_f}°F spread across ${confidence.sourcesActive} source${confidence.sourcesActive !== 1 ? 's' : ''}`
      : 'Only one source available';

    return `
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-bold">📊 Source Confidence</h3>
          <span class="text-sm font-semibold ${agreementColor[confidence.agreement] || 'text-gray-400'}">${agreementLabel[confidence.agreement] || ''}</span>
        </div>
        <p class="text-sm text-gray-400 mb-3">${spreadText}</p>
        <div class="flex flex-wrap gap-2">${sourceRows}</div>
        ${confidence.tempSpread_f >= 8 ? '<p class="text-xs text-yellow-400 mt-3">⚠️ Large temperature disagreement between sources — actual conditions may differ from forecast. Treat any single source with caution.</p>' : ''}
      </div>
    `;
  },

  // ── Alert banner — all severity levels ───────────────────────
  // Shows ALL active NWS alerts (Warnings, Watches, Advisories,
  // Special Weather Statements, etc.), sorted by priority.
  // Banner shell renders immediately; Gemini AI summary fills in async.
  async _renderAlertBanner(alerts) {
    // Kill the old CSS ticker — we own all alert display now
    Hub.ui?.hideBanner?.();

    // Remove any existing banner
    const existing = document.getElementById('severeWeatherBanner');
    if (existing) existing.remove();

    // Suppress the global CSS ticker on the weather page — our rich banner
    // replaces it here. It will be restored when leaving the weather page.
    Hub.ui?.hideBanner?.();

    const active = (alerts || []).filter(a => a.event);
    if (!active.length) return;

    // ── Priority sort: Extreme → Severe → Moderate → Minor → Unknown ──
    const SEVERITY_ORDER = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
    const sorted = [...active].sort((a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5)
    );
    const top = sorted[0];
    const extras = sorted.slice(1);

    // ── Per-severity visual theme ──────────────────────────────
    const THEME = {
      Extreme:  { bg: 'bg-red-950',    border: 'border-red-500',   pill: 'bg-red-600 text-white',    text: 'text-red-200',   muted: 'text-red-300',   icon: '🚨', pulse: true  },
      Severe:   { bg: 'bg-orange-950', border: 'border-orange-500',pill: 'bg-orange-500 text-white', text: 'text-orange-200',muted: 'text-orange-300',icon: '⚠️', pulse: true  },
      Moderate: { bg: 'bg-yellow-950', border: 'border-yellow-500',pill: 'bg-yellow-500 text-black', text: 'text-yellow-100',muted: 'text-yellow-300',icon: '🌦️', pulse: false },
      Minor:    { bg: 'bg-blue-950',   border: 'border-blue-500',  pill: 'bg-blue-500 text-white',   text: 'text-blue-200',  muted: 'text-blue-300',  icon: 'ℹ️', pulse: false },
      Unknown:  { bg: 'bg-gray-900',   border: 'border-gray-500',  pill: 'bg-gray-500 text-white',   text: 'text-gray-200',  muted: 'text-gray-400',  icon: '📢', pulse: false },
    };
    const t = THEME[top.severity] || THEME.Unknown;

    const expiresStr = top.expires
      ? `Until ${new Date(top.expires).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
      : '';

    // Extra alert pills — plain display, details are in the Household Impact card
    const extraPills = extras.map(a => {
      const et = THEME[a.severity] || THEME.Unknown;
      return `<span class="text-xs px-2 py-0.5 rounded-full font-semibold ${et.pill} opacity-80">
        ${Hub.utils.esc(a.event)}
      </span>`;
    }).join('');

    // ── Banner shell ───────────────────────────────────────────
    const banner = document.createElement('div');
    banner.id        = 'severeWeatherBanner';
    banner.className = `fixed top-0 left-0 right-0 z-50 ${t.bg} ${t.border} border-b-2 shadow-lg`;

    // Store alerts on banner for expand button
    banner._allAlerts = sorted;

    banner.innerHTML = `
      <div class="flex items-start gap-3 px-5 py-3 max-w-5xl mx-auto">
        <span class="text-2xl mt-0.5 flex-shrink-0 ${t.pulse ? 'animate-pulse' : ''}">${t.icon}</span>
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span class="font-bold text-white text-sm">${Hub.utils.esc(top.event || 'Weather Alert')}</span>
            <span class="text-xs px-2 py-0.5 rounded-full font-semibold ${t.pill}">${Hub.utils.esc(top.severity)}</span>
            ${expiresStr ? `<span class="text-xs ${t.muted}">${Hub.utils.esc(expiresStr)}</span>` : ''}
            ${top.area ? `<span class="text-xs ${t.muted} truncate max-w-xs">${Hub.utils.esc(top.area)}</span>` : ''}
          </div>
          <p id="alertSummaryText" class="${t.text} text-sm leading-snug">
            ${Hub.utils.esc(Hub.ai.alertSummary(top))}
          </p>
          <div class="flex flex-wrap items-center gap-3 mt-1.5">
            ${extras.length ? `
              <span class="text-xs ${t.muted}">Also active:</span>
              ${extraPills}` : ''}
            ${(top.description || top.instruction) ? `
              <button onclick="Hub.weather._toggleBannerFullAlert()"
                class="text-xs underline ${t.muted} hover:text-white transition" id="alertViewFullBtn">
                View full →
              </button>` : ''}
          </div>
          <div id="alertFullText" class="hidden mt-3 pt-3 border-t ${t.border} border-opacity-30 space-y-2">
            ${top.description ? `<p class="${t.text} text-xs leading-relaxed whitespace-pre-line">${Hub.utils.esc(top.description)}</p>` : ''}
            ${top.instruction ? `<p class="${t.muted} text-xs leading-relaxed"><span class="font-semibold text-white">What to do: </span>${Hub.utils.esc(top.instruction)}</p>` : ''}
          </div>
        </div>
        <button
          onclick="Hub.weather._dismissAlertBanner()"
          class="${t.muted} hover:text-white text-xl px-1 flex-shrink-0 leading-none mt-0.5"
          aria-label="Dismiss">×</button>
      </div>
    `;

    // Always insert directly into document.body.
    document.body.insertBefore(banner, document.body.firstChild);

    // ── Sync bannerSpacer so page content is never hidden under the banner ──
    // rAF ensures the banner has actually rendered before measuring offsetHeight.
    const spacer = document.getElementById('bannerSpacer');
    if (spacer) {
      const syncSpacer = () => {
        const b = document.getElementById('severeWeatherBanner');
        spacer.style.height = b ? b.offsetHeight + 'px' : '0';
      };
      requestAnimationFrame(() => {
        syncSpacer();
        if (window.ResizeObserver) {
          const ro = new ResizeObserver(syncSpacer);
          ro.observe(banner);
          banner._spacerRO = ro;
        }
      });
    }

    // Auto-navigate to weather page on Extreme alerts
    if (top.severity === 'Extreme' && Hub.router?.navigate) {
      Hub.router.navigate('weather');
    }

    // ── Async: fetch Gemini summary ────────────────────────────
    // NWS text summary is built synchronously by Hub.ai.alertSummary()
  },

  /** Dismiss the alert banner and reset the content spacer */
  _dismissAlertBanner() {
    const banner = document.getElementById('severeWeatherBanner');
    if (banner) {
      banner._spacerRO?.disconnect();
      banner.remove();
    }
    const spacer = document.getElementById('bannerSpacer');
    if (spacer) spacer.style.height = '0';
  },

  /** Toggle the full NWS text drawer inside the banner */
  _toggleBannerFullAlert() {
    const drawer = document.getElementById('alertFullText');
    const btn    = document.getElementById('alertViewFullBtn');
    if (!drawer) return;
    const open = drawer.classList.toggle('hidden');
    if (btn) btn.textContent = open ? 'View full →' : 'Hide ↑';
  },



  // ── RainViewer radar ──────────────────────────────────────────

  async renderRainRadar() {
    const el = Hub.utils.$('rainRadar');
    if (!el) return;

    el.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">Loading radar...</p>';

    const rainData = await this.fetchRainViewerData();
    if (!rainData?.radar?.past?.length) {
      el.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">Radar data unavailable</p>';
      return;
    }

    this._radarFrames = rainData.radar.past;
    this._radarIndex  = this._radarFrames.length - 1;

    // Use host from API response — do NOT hardcode tilecache.rainviewer.com
    const radarHost = rainData.host || 'https://tilecache.rainviewer.com';

    const loc = Hub.utils.getLocation();

    el.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <div>
          <p class="text-lg font-bold">🌧️ Rain Radar</p>
          <p class="text-xs text-gray-400">Past 2 hrs · 10-min intervals · 📍 ${loc.name || 'Home'}</p>
        </div>
        <span id="radarTime" class="text-gray-300 text-sm font-mono bg-black bg-opacity-50 px-2 py-1 rounded"></span>
      </div>
      <div id="radarMap" style="width:100%;height:420px;border-radius:.75rem;overflow:hidden;background:#1a2235;"></div>
      <div class="flex items-center gap-3 mt-3">
        <button id="radarPlayPause" class="btn btn-primary px-5 py-2">▶ Play</button>
        <input id="radarScrubber" type="range" min="0" max="${this._radarFrames.length - 1}"
          value="${this._radarIndex}" class="flex-1" style="accent-color:#3b82f6;">
        <span id="radarFrameInfo" class="text-gray-400 text-sm w-20 text-right"></span>
      </div>
      <p class="text-xs text-gray-600 mt-2 text-right">Source: <a href="https://rainviewer.com" target="_blank" class="text-blue-500">RainViewer</a></p>
    `;

    await this._ensureLeaflet();

    if (this._radarMap) {
      try { this._radarMap.remove(); } catch (_) {}
      this._radarMap  = null;
      this._radarLayer = null;
    }

    // Initial zoom capped at 7 — RainViewer radar tile max zoom is 7
    const map = window.L.map('radarMap', {
      center: [loc.lat, loc.lon],
      zoom: 7,
      zoomControl: true,
      attributionControl: false,
    });

    // Base tile layer goes up to zoom 12 (street detail) but radar tiles cap at 7
    window.L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { subdomains: 'abcd', maxZoom: 12, detectRetina: true }
    ).addTo(map);

    window.L.circleMarker([loc.lat, loc.lon], {
      radius: 8, color: '#1d4ed8', fillColor: '#60a5fa',
      fillOpacity: 0.9, weight: 2,
    }).addTo(map).bindPopup('📍 ' + (loc.name || 'Home'));

    this._radarMap = map;

    this._radarVisHandler = () => {
      if (!document.hidden && this._radarInterval) {
        this._radarIndex = (this._radarIndex + 1) % this._radarFrames.length;
        updateFrame();
      }
    };
    document.addEventListener('visibilitychange', this._radarVisHandler);

    const updateFrame = () => {
      const frame = this._radarFrames[this._radarIndex];
      // Use radarHost from API response, cap maxZoom at 7 for radar layer
      const tileUrl = `${radarHost}${frame.path}/256/{z}/{x}/{y}/6/1_1.png`;

      if (this._radarLayer) {
        this._radarLayer.setUrl(tileUrl);
      } else {
        this._radarLayer = window.L.tileLayer(tileUrl, {
          opacity: 0.72,
          maxZoom: 7,   // RainViewer radar tile zoom max = 7
          tileSize: 256,
        }).addTo(map);
      }

      const timeEl = Hub.utils.$('radarTime');
      if (timeEl) {
        const d = new Date(frame.time * 1000);
        timeEl.textContent = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
      const infoEl = Hub.utils.$('radarFrameInfo');
      if (infoEl) infoEl.textContent = `${this._radarIndex + 1}/${this._radarFrames.length}`;
      const scrubber = Hub.utils.$('radarScrubber');
      if (scrubber) scrubber.value = this._radarIndex;
    };

    updateFrame();

    const scrubber = Hub.utils.$('radarScrubber');
    if (scrubber) {
      scrubber.oninput = () => {
        this._radarIndex = parseInt(scrubber.value);
        updateFrame();
      };
    }

    const playBtn = Hub.utils.$('radarPlayPause');
    if (playBtn) {
      playBtn.onclick = () => {
        if (this._radarInterval) {
          clearInterval(this._radarInterval);
          this._radarInterval = null;
          playBtn.textContent = '▶ Play';
        } else {
          playBtn.textContent = '⏸ Pause';
          this._radarInterval = setInterval(() => {
            if (document.hidden) return;
            this._radarIndex = (this._radarIndex + 1) % this._radarFrames.length;
            updateFrame();
          }, 1400);
        }
      };
    }
  },

  async _ensureLeaflet() {
    if (window.L) return;
    await new Promise((resolve, reject) => {
      const link  = document.createElement('link');
      link.rel    = 'stylesheet';
      link.href   = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(link);
      const script   = document.createElement('script');
      script.src     = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      script.onload  = resolve;
      script.onerror = () => reject(new Error('Leaflet failed to load'));
      document.head.appendChild(script);
    });
  },

  // Legacy stubs — kept for backward compat
  _updateRadarFrame() {},
  _toggleRadarAnimation() {},

  stopRadarAnimation() {
    if (this._radarInterval) {
      clearInterval(this._radarInterval);
      this._radarInterval = null;
    }
    if (this._radarVisHandler) {
      document.removeEventListener('visibilitychange', this._radarVisHandler);
      this._radarVisHandler = null;
    }
    if (this._radarMap) {
      try { this._radarMap.remove(); } catch (_) {}
      this._radarMap   = null;
      this._radarLayer = null;
    }
    const container = document.getElementById('radarMap');
    if (container && container._leaflet_id) delete container._leaflet_id;

    // Remove alert banner when leaving weather page (re-rendered on landing page)
    this._dismissAlertBanner();

    // Re-render the unified AI banner on whatever page the user lands on
    Hub.weather.fetchAlerts().then(alerts => {
      if (alerts?.length) Hub.weather._renderAlertBanner(alerts);
    }).catch(() => {});
  },

  onLeave() {
    this.stopRadarAnimation();
  }
};
