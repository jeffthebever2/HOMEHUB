// ============================================================
// assets/weather.js — Weather data fetching & display
// ============================================================
window.Hub = window.Hub || {};

Hub.weather = {
  _cache: null,
  _cacheTime: 0,
  CACHE_TTL: 120000, // 2 min

  /** Fetch aggregated weather from our backend */
  async fetchAggregate() {
    const now = Date.now();
    if (this._cache && (now - this._cacheTime) < this.CACHE_TTL) return this._cache;

    const loc = Hub.utils.getLocation();
    const base = Hub.utils.apiBase();
    const url = `${base}/api/weather-aggregate?lat=${loc.lat}&lon=${loc.lon}`;

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

  /** Fetch weather alerts */
  async fetchAlerts() {
    const loc = Hub.utils.getLocation();
    const base = Hub.utils.apiBase();
    try {
      const resp = await fetch(`${base}/api/weather-alerts?lat=${loc.lat}&lon=${loc.lon}`);
      if (!resp.ok) return [];
      const data = await resp.json();
      return data.alerts || [];
    } catch (e) {
      console.error('Weather alerts error:', e);
      return [];
    }
  },

  /** Normalize weather data — best-effort extraction from aggregate */
  normalize(agg) {
    if (!agg) return null;
    const result = { current: {}, today: {}, tomorrow: {} };

    // Open-Meteo current
    if (agg.openMeteo?.current) {
      result.current.temp_f = agg.openMeteo.current.temperature_2m;
      result.current.wind_mph = agg.openMeteo.current.windspeed_10m;
    }

    // Open-Meteo daily
    if (agg.openMeteo?.daily) {
      const d = agg.openMeteo.daily;
      if (d.temperature_2m_max?.[0] != null) result.today.high_f = Math.round(d.temperature_2m_max[0]);
      if (d.temperature_2m_min?.[0] != null) result.today.low_f = Math.round(d.temperature_2m_min[0]);
      if (d.precipitation_probability_max?.[0] != null) result.today.precip_chance = d.precipitation_probability_max[0];
      if (d.temperature_2m_max?.[1] != null) result.tomorrow.high_f = Math.round(d.temperature_2m_max[1]);
      if (d.temperature_2m_min?.[1] != null) result.tomorrow.low_f = Math.round(d.temperature_2m_min[1]);
      if (d.precipitation_probability_max?.[1] != null) result.tomorrow.precip_chance = d.precipitation_probability_max[1];
    }

    // Weather.gov forecast for textual descriptions
    if (agg.weatherGov?.forecast?.properties?.periods) {
      const p = agg.weatherGov.forecast.properties.periods;
      if (p[0]) {
        result.current.description = p[0].shortForecast;
        if (p[0].temperature) result.current.temp_f = result.current.temp_f || p[0].temperature;
      }
    }

    return result;
  },

  /** Render weather summary on dashboard */
  renderDashboard(aiSummary, normalized) {
    const el = Hub.utils.$('dashboardWeather');
    if (!el) return;

    if (aiSummary) {
      const s = aiSummary;
      el.innerHTML = `
        <p class="text-lg font-medium text-blue-400 mb-2">${Hub.utils.esc(s.headline)}</p>
        <p class="text-gray-300 mb-4">${Hub.utils.esc(s.summary)}</p>
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-gray-900 rounded-lg p-4">
            <p class="text-gray-400 text-sm">Today</p>
            <p class="text-2xl font-bold">${s.today?.high_f ?? '--'}° / ${s.today?.low_f ?? '--'}°</p>
            <p class="text-sm text-gray-400">${s.today?.precip_chance_pct != null ? s.today.precip_chance_pct + '% precip' : ''}</p>
          </div>
          <div class="bg-gray-900 rounded-lg p-4">
            <p class="text-gray-400 text-sm">Tomorrow</p>
            <p class="text-2xl font-bold">${s.tomorrow?.high_f ?? '--'}° / ${s.tomorrow?.low_f ?? '--'}°</p>
            <p class="text-sm text-gray-400">${s.tomorrow?.precip_chance_pct != null ? s.tomorrow.precip_chance_pct + '% precip' : ''}</p>
          </div>
        </div>
        ${s.hazards?.length ? `<div class="mt-3"><p class="text-yellow-400 text-sm font-medium">⚠️ ${Hub.utils.esc(s.hazards.join(', '))}</p></div>` : ''}
        <p class="text-xs text-gray-500 mt-3">Confidence: ${s.confidence ?? '--'}% · ${s.source_disagreements?.length ? s.source_disagreements.length + ' source disagreement(s)' : 'Sources agree'}</p>
      `;
      return;
    }

    // Fallback to normalized
    if (normalized) {
      el.innerHTML = `
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-gray-900 rounded-lg p-4">
            <p class="text-gray-400 text-sm">Current</p>
            <p class="text-3xl font-bold">${normalized.current?.temp_f ?? '--'}°F</p>
            <p class="text-sm text-gray-400">${Hub.utils.esc(normalized.current?.description || '')}</p>
          </div>
          <div class="bg-gray-900 rounded-lg p-4">
            <p class="text-gray-400 text-sm">Today</p>
            <p class="text-2xl font-bold">${normalized.today?.high_f ?? '--'}° / ${normalized.today?.low_f ?? '--'}°</p>
          </div>
        </div>
      `;
      return;
    }

    el.innerHTML = '<p class="text-yellow-400">Unable to load weather. Check settings or API keys.</p>';
  },

  /** Render full weather page */
  renderWeatherPage(aiSummary, aggregate) {
    const el = Hub.utils.$('weatherContent');
    if (!el) return;

    let html = '';

    // AI Summary
    if (aiSummary) {
      html += `<div class="card">
        <h3 class="text-xl font-bold mb-3 text-blue-400">${Hub.utils.esc(aiSummary.headline)}</h3>
        <p class="text-gray-300 mb-4">${Hub.utils.esc(aiSummary.summary)}</p>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div class="bg-gray-800 rounded-lg p-3 text-center">
            <p class="text-xs text-gray-400">Today High</p>
            <p class="text-xl font-bold">${aiSummary.today?.high_f ?? '--'}°F</p>
          </div>
          <div class="bg-gray-800 rounded-lg p-3 text-center">
            <p class="text-xs text-gray-400">Today Low</p>
            <p class="text-xl font-bold">${aiSummary.today?.low_f ?? '--'}°F</p>
          </div>
          <div class="bg-gray-800 rounded-lg p-3 text-center">
            <p class="text-xs text-gray-400">Precip</p>
            <p class="text-xl font-bold">${aiSummary.today?.precip_chance_pct ?? '--'}%</p>
          </div>
          <div class="bg-gray-800 rounded-lg p-3 text-center">
            <p class="text-xs text-gray-400">Confidence</p>
            <p class="text-xl font-bold">${aiSummary.confidence ?? '--'}%</p>
          </div>
        </div>`;
      if (aiSummary.source_disagreements?.length) {
        html += '<div class="mt-3"><p class="text-sm font-medium text-yellow-400 mb-1">Source Disagreements:</p><ul class="text-sm text-gray-400 list-disc pl-5">';
        aiSummary.source_disagreements.forEach(d => {
          html += `<li>${Hub.utils.esc(d.topic || d)}: ${Hub.utils.esc(d.details || '')}</li>`;
        });
        html += '</ul></div>';
      }
      html += '</div>';
    }

    // Weather.gov forecast text
    if (aggregate?.weatherGov?.forecast?.properties?.periods) {
      html += '<div class="card"><h3 class="text-xl font-bold mb-3">Weather.gov Forecast</h3><div class="space-y-3">';
      aggregate.weatherGov.forecast.properties.periods.slice(0, 6).forEach(p => {
        html += `<div class="bg-gray-800 rounded-lg p-3">
          <p class="font-medium">${Hub.utils.esc(p.name)}</p>
          <p class="text-sm text-gray-400">${Hub.utils.esc(p.detailedForecast)}</p>
        </div>`;
      });
      html += '</div></div>';
    }

    // Source status
    html += '<div class="card"><h3 class="text-xl font-bold mb-3">Data Sources</h3><div class="grid grid-cols-2 md:grid-cols-3 gap-3">';
    const sources = ['openMeteo', 'weatherGov', 'weatherbit', 'tomorrow', 'visualCrossing', 'pirateWeather'];
    sources.forEach(s => {
      const ok = aggregate?.[s] != null;
      html += `<div class="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
        <span class="status-dot ${ok ? 'green' : 'red'}"></span>
        <span class="text-sm">${Hub.utils.esc(s)}</span>
      </div>`;
    });
    html += '</div></div>';

    el.innerHTML = html || '<p class="text-gray-400">No weather data available.</p>';

    // Rain radar
    Hub.weather.renderRainRadar(aggregate?.rainviewer);
  },

  /** Render RainViewer radar */
  renderRainRadar(rainviewer) {
    const el = Hub.utils.$('rainRadar');
    if (!el) return;
    if (!rainviewer?.radar?.past?.length) {
      el.innerHTML = '<p class="text-gray-400 text-sm">Radar data unavailable</p>';
      return;
    }
    const loc = Hub.utils.getLocation();
    const latest = rainviewer.radar.past[rainviewer.radar.past.length - 1];
    const tileUrl = `https://tilecache.rainviewer.com${latest.path}/256/6/${Math.floor(loc.lat)}/${Math.floor(loc.lon)}/2/1_1.png`;
    el.innerHTML = `
      <p class="text-sm text-gray-400 mb-2">Latest radar frame</p>
      <div class="relative bg-gray-900 rounded-lg overflow-hidden" style="max-width:600px;margin:0 auto;">
        <img src="${tileUrl}" alt="Rain radar" class="w-full" onerror="this.parentNode.innerHTML='<p class=\\'text-gray-500 p-4\\'>Radar image unavailable</p>'">
      </div>
      <p class="text-xs text-gray-500 mt-2">Source: RainViewer · Updated: ${new Date(latest.time * 1000).toLocaleTimeString()}</p>
    `;
  }
};
