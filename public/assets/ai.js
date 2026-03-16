// ============================================================
// assets/ai.js — AI weather summary
//
// Cascade:
//  1) /api/weather-ai  (server, GenAI endpoint)
//  2) Puter.ai         (client-side, free, no key)
//  3) Deterministic fallback
// ============================================================
window.Hub = window.Hub || {};

Hub.ai = {
  _cache:     null,
  _cacheTime: 0,
  CACHE_TTL:  300000, // 5 min

  // Required output schema (used to validate both server + Puter responses)
  _SCHEMA_KEYS: ['headline','summary','confidence','hazards','today','tomorrow','alerts'],

  async getSummary(aggregate) {
    const now = Date.now();
    if (this._cache && (now - this._cacheTime) < this.CACHE_TTL) return this._cache;

    const loc  = Hub.utils.getLocation();
    const base = Hub.utils.apiBase();

    // ── 1) Try server endpoint ─────────────────────────
    try {
      const resp = await fetch(`${base}/api/weather-ai`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ location: loc, aggregate, previousSummary: this._cache || null })
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (this._validate(data)) {
        this._cache     = data;
        this._cacheTime = now;
        return data;
      }
      throw new Error('Server response failed schema validation');
    } catch (e) {
      console.warn('[AI] Server endpoint failed:', e.message, '— trying Puter.ai fallback');
    }

    // ── 2) Try Puter.ai (free, no key) ────────────────
    try {
      const puterResult = await this._tryPuter(aggregate, loc);
      if (puterResult) {
        this._cache     = puterResult;
        this._cacheTime = now;
        return puterResult;
      }
    } catch (e) {
      console.warn('[AI] Puter.ai failed:', e.message);
    }

    // ── 3) Deterministic fallback ─────────────────────
    console.log('[AI] Using deterministic fallback');
    return this._buildFallback(aggregate);
  },

  async _tryPuter(aggregate, loc) {
    // Load Puter SDK if not already present
    if (!window.puter) {
      await this._loadPuter();
    }
    if (!window.puter?.ai?.chat) {
      throw new Error('Puter SDK not available');
    }

    // Minimal context — only current + today data to keep prompt small
    const miniContext = this._buildMiniContext(aggregate);

    const prompt = `You are a weather assistant. Output ONLY valid JSON, no markdown, matching this exact schema:
{"headline":"string 8-15 words","summary":"string 2-3 sentences","confidence":0-100,"hazards":[],"today":{"high_f":number|null,"low_f":number|null,"precip_chance_pct":number|null,"snow_chance_pct":number|null,"key_window":null},"tomorrow":{"high_f":number|null,"low_f":number|null,"precip_chance_pct":number|null,"snow_chance_pct":number|null,"key_window":null},"alerts":{"active":false,"banner_text":null,"severity":"none","expires_at":null},"source_disagreements":[],"actions":[]}

Weather data for ${loc.name}: ${JSON.stringify(miniContext)}

Respond ONLY with the JSON object.`;

    const response = await Promise.race([
      window.puter.ai.chat(prompt, { model: 'gpt-4o-mini' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Puter timeout')), 12000))
    ]);

    const text = typeof response === 'string' ? response
               : response?.message?.content || response?.content || '';

    // Strip markdown fences if present
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(clean); // throws if invalid JSON

    if (!this._validate(parsed)) throw new Error('Puter response schema invalid');
    console.log('[AI] Puter.ai success — headline:', parsed.headline);
    return parsed;
  },

  _loadPuter() {
    return new Promise((resolve, reject) => {
      if (document.getElementById('puter-sdk')) { resolve(); return; }
      const s = document.createElement('script');
      s.id  = 'puter-sdk';
      s.src = 'https://js.puter.com/v2/';
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Puter SDK load failed'));
      document.head.appendChild(s);
    });
  },

  _buildMiniContext(agg) {
    const daily = agg?.openMeteo?.daily || agg?.sources?.openMeteo?.data?.daily;
    const wg    = agg?.weatherGov?.forecast?.properties?.periods || [];
    return {
      todayHigh:    daily?.temperature_2m_max?.[0] ?? null,
      todayLow:     daily?.temperature_2m_min?.[0] ?? null,
      todayPrecip:  daily?.precipitation_probability_max?.[0] ?? null,
      tomorrowHigh: daily?.temperature_2m_max?.[1] ?? null,
      tomorrowLow:  daily?.temperature_2m_min?.[1] ?? null,
      description:  wg[0]?.shortForecast || null
    };
  },

  _validate(data) {
    if (!data || typeof data !== 'object') return false;
    return this._SCHEMA_KEYS.every(k => k in data);
  },

  _buildFallback(agg) {
    const n = Hub.weather?.normalize?.(agg) || {};
    return {
      headline: n?.current?.description || 'Weather data available',
      summary:  'AI summary is currently unavailable. Showing raw data.',
      confidence: 40,
      hazards: [],
      today: {
        high_f:            n?.today?.high_f            ?? null,
        low_f:             n?.today?.low_f             ?? null,
        precip_chance_pct: n?.today?.precip_chance     ?? null,
        snow_chance_pct:   null,
        key_window:        null
      },
      tomorrow: {
        high_f:            n?.tomorrow?.high_f          ?? null,
        low_f:             n?.tomorrow?.low_f           ?? null,
        precip_chance_pct: n?.tomorrow?.precip_chance   ?? null,
        snow_chance_pct:   null,
        key_window:        null
      },
      alerts: { active: false, banner_text: null, severity: 'none', expires_at: null },
      source_disagreements: [],
      actions: []
    };
  }
};
