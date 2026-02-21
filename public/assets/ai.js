// ============================================================
// assets/ai.js — AI weather summary (calls /api/weather-ai)
// ============================================================
window.Hub = window.Hub || {};

Hub.ai = {
  _cache: null,
  _cacheTime: 0,
  CACHE_TTL: 300000, // 5 min

  /** Call the AI weather endpoint */
  async getSummary(aggregate) {
    const now = Date.now();
    if (this._cache && (now - this._cacheTime) < this.CACHE_TTL) return this._cache;

    const loc = Hub.utils.getLocation();
    const base = Hub.utils.apiBase();

    try {
      const resp = await fetch(`${base}/api/weather-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: loc,
          aggregate: aggregate,
          previousSummary: this._cache || null
        })
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      this._cache = data;
      this._cacheTime = now;
      return data;
    } catch (e) {
      console.error('AI summary error:', e);
      return this._buildFallback(aggregate);
    }
  },

  /** Deterministic fallback when AI is unavailable */
  _buildFallback(agg) {
    const n = Hub.weather.normalize(agg);
    return {
      headline: n?.current?.description || 'Weather data available',
      summary: 'AI summary is currently unavailable. Showing raw data.',
      confidence: 40,
      hazards: [],
      today: {
        high_f: n?.today?.high_f ?? null,
        low_f: n?.today?.low_f ?? null,
        precip_chance_pct: n?.today?.precip_chance ?? null,
        snow_chance_pct: null,
        key_window: null
      },
      tomorrow: {
        high_f: n?.tomorrow?.high_f ?? null,
        low_f: n?.tomorrow?.low_f ?? null,
        precip_chance_pct: n?.tomorrow?.precip_chance ?? null,
        snow_chance_pct: null,
        key_window: null
      },
      alerts: { active: false, banner_text: null, severity: 'none', expires_at: null },
      source_disagreements: [],
      actions: []
    };
  }
};
