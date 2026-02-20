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

  /** Fetch RainViewer radar data */
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

  /** Normalize weather data */
  normalize(agg) {
    if (!agg) return null;
    const result = { current: {}, today: {}, tomorrow: {}, forecast: [] };

    // Open-Meteo current
    if (agg.openMeteo?.current) {
      result.current.temp_f = Math.round(agg.openMeteo.current.temperature_2m);
      result.current.feels_like_f = Math.round(agg.openMeteo.current.apparent_temperature || agg.openMeteo.current.temperature_2m);
      result.current.wind_mph = Math.round(agg.openMeteo.current.windspeed_10m);
      result.current.humidity = agg.openMeteo.current.relative_humidity_2m;
      result.current.condition = this._getConditionFromCode(agg.openMeteo.current.weathercode);
      result.current.icon = this._getWeatherIcon(agg.openMeteo.current.weathercode);
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
      
      // 7-day forecast
      for (let i = 0; i < 7 && i < d.time.length; i++) {
        result.forecast.push({
          date: d.time[i],
          high_f: Math.round(d.temperature_2m_max[i]),
          low_f: Math.round(d.temperature_2m_min[i]),
          precip: d.precipitation_probability_max?.[i] || 0,
          icon: this._getWeatherIcon(d.weathercode?.[i] || 0)
        });
      }
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

  /** Get weather condition from WMO code */
  _getConditionFromCode(code) {
    const conditions = {
      0: 'Clear Sky',
      1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Rime Fog',
      51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
      61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
      71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow',
      80: 'Light Showers', 81: 'Showers', 82: 'Heavy Showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with Hail', 99: 'Severe Thunderstorm'
    };
    return conditions[code] || 'Unknown';
  },

  /** Get weather emoji icon */
  _getWeatherIcon(code) {
    if (code === 0) return '☀️';
    if (code >= 1 && code <= 3) return '⛅';
    if (code >= 45 && code <= 48) return '🌫️';
    if (code >= 51 && code <= 55) return '🌦️';
    if (code >= 61 && code <= 65) return '🌧️';
    if (code >= 71 && code <= 75) return '❄️';
    if (code >= 80 && code <= 82) return '🌧️';
    if (code >= 95) return '⛈️';
    return '🌤️';
  },

  /** Render dashboard weather widget */
  async renderDashboard() {
    const el = Hub.utils.$('dashboardWeather');
    if (!el) return;
    el.innerHTML = '<p class="text-gray-400 text-sm">Loading...</p>';

    const aggregate = await this.fetchAggregate();
    const normalized = this.normalize(aggregate);

    if (normalized?.current) {
      el.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="text-6xl">${normalized.current.icon}</div>
            <div>
              <p class="text-4xl font-bold">${normalized.current.temp_f}°F</p>
              <p class="text-gray-400">${Hub.utils.esc(normalized.current.condition)}</p>
            </div>
          </div>
          <div class="text-right text-sm text-gray-400">
            <p>Feels like ${normalized.current.feels_like_f}°F</p>
            <p>💨 ${normalized.current.wind_mph} mph</p>
            <p>💧 ${normalized.current.humidity}%</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-700">
          <div>
            <p class="text-gray-400 text-sm">Today</p>
            <p class="text-xl font-bold">${normalized.today?.high_f ?? '--'}° / ${normalized.today?.low_f ?? '--'}°</p>
            <p class="text-sm text-gray-400">💧 ${normalized.today?.precip_chance ?? 0}% rain</p>
          </div>
          <div>
            <p class="text-gray-400 text-sm">Tomorrow</p>
            <p class="text-xl font-bold">${normalized.tomorrow?.high_f ?? '--'}° / ${normalized.tomorrow?.low_f ?? '--'}°</p>
            <p class="text-sm text-gray-400">💧 ${normalized.tomorrow?.precip_chance ?? 0}% rain</p>
          </div>
        </div>
      `;
      return;
    }

    el.innerHTML = '<p class="text-yellow-400">Unable to load weather. Check settings or API keys.</p>';
  },

  /** Render full weather page */
  async renderWeatherPage() {
    const el = Hub.utils.$('weatherContent');
    if (!el) return;

    const aggregate = await this.fetchAggregate();
    const normalized = this.normalize(aggregate);
    
    if (!normalized) {
      el.innerHTML = '<p class="text-yellow-400">Unable to load weather data.</p>';
      return;
    }

    let html = '';

    // Current conditions - Big hero section
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
              <p class="text-xs text-gray-400">mph</p>
            </div>
            <div class="bg-gray-800 rounded-lg p-4">
              <p class="text-gray-400 text-sm mb-1">Rain Chance</p>
              <p class="text-3xl font-bold">${normalized.today?.precip_chance ?? 0}%</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // 7-day forecast
    html += `
      <div class="card">
        <h3 class="text-2xl font-bold mb-4">7-Day Forecast</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
    `;
    
    normalized.forecast.forEach((day, i) => {
      const date = new Date(day.date);
      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short' });
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

    // Weather.gov detailed forecast
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

    // Load and render radar
    this.renderRainRadar();
  },

  /** Render RainViewer animated radar */
  /** Render RainViewer animated radar using Leaflet — proper tile coordinates */
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

    // Load Leaflet on demand
    await this._ensureLeaflet();

    // Create map
    const map = window.L.map('radarMap', {
      center: [loc.lat, loc.lon],
      zoom: 7,
      zoomControl: true,
      attributionControl: false,
    });

    // Dark base layer
    window.L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { subdomains: 'abcd', maxZoom: 12, detectRetina: true }
    ).addTo(map);

    // Blue dot for home location
    window.L.circleMarker([loc.lat, loc.lon], {
      radius: 8, color: '#1d4ed8', fillColor: '#60a5fa',
      fillOpacity: 0.9, weight: 2,
    }).addTo(map).bindPopup('📍 ' + (loc.name || 'Home'));

    // Store map ref for cleanup
    this._radarMap = map;

    const updateFrame = () => {
      const frame = this._radarFrames[this._radarIndex];
      // Correct RainViewer tile URL: {path}/{size}/{z}/{x}/{y}/{color}/{options}.png
      const tileUrl = `https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/6/1_1.png`;

      if (this._radarLayer) { map.removeLayer(this._radarLayer); }
      this._radarLayer = window.L.tileLayer(tileUrl, {
        opacity: 0.72, maxZoom: 12, tileSize: 256,
      }).addTo(map);

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

    // Scrubber
    const scrubber = Hub.utils.$('radarScrubber');
    if (scrubber) {
      scrubber.oninput = () => {
        this._radarIndex = parseInt(scrubber.value);
        updateFrame();
      };
    }

    // Play/Pause
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
            this._radarIndex = (this._radarIndex + 1) % this._radarFrames.length;
            updateFrame();
          }, 600);
        }
      };
    }
  },

  /** Load Leaflet CSS+JS on demand */
  async _ensureLeaflet() {
    if (window.L) return;
    await new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel  = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src  = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      script.onload  = resolve;
      script.onerror = () => reject(new Error('Leaflet failed to load'));
      document.head.appendChild(script);
    });
  },

  // Legacy stub — kept for compat
  _updateRadarFrame() {},
  _toggleRadarAnimation() {},

  /** Stop radar animation (called when leaving weather page) */
  stopRadarAnimation() {
    if (this._radarInterval) {
      clearInterval(this._radarInterval);
      this._radarInterval = null;
    }
    if (this._radarMap) {
      this._radarMap.remove();
      this._radarMap = null;
    }
  }
};
