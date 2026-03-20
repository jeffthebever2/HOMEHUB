// ============================================================
// assets/ai.js — Deterministic weather summary + NWS text parser
//
// No AI calls. Builds structured summaries directly from:
//   1. Normalized weather aggregate data
//   2. NWS alert description/instruction text
//
// Hub.ai.getSummary(aggregate)  → structured summary object
// Hub.ai.parseNWSAlert(alert)   → { what, where, when, impacts, instruction, bullets[] }
// Hub.ai.alertSummary(alert)    → 2-sentence plain-language summary string
// ============================================================
window.Hub = window.Hub || {};

Hub.ai = {
  _cache:     null,
  _cacheTime: 0,
  CACHE_TTL:  300000, // 5 min

  // ── Main summary (used by standby + dashboard) ─────────────────

  async getSummary(aggregate) {
    const now = Date.now();
    if (this._cache && (now - this._cacheTime) < this.CACHE_TTL) return this._cache;
    const result = this._buildFallback(aggregate);
    this._cache     = result;
    this._cacheTime = now;
    return result;
  },

  _buildFallback(agg) {
    const n = Hub.weather?.normalize?.(agg) || {};
    const c = n.current || {};
    const t = n.today   || {};
    const m = n.tomorrow || {};

    // Build headline from conditions
    const temp   = c.temp_f != null ? Math.round(c.temp_f) + '°F' : null;
    const cond   = c.condition || c.description || null;
    const high   = t.high_f  != null ? Math.round(t.high_f)  : null;
    const low    = t.low_f   != null ? Math.round(t.low_f)   : null;
    const precip = t.precip_chance != null ? Math.round(t.precip_chance) : null;

    let headline = '';
    if (cond && temp)       headline = `${cond}, ${temp}`;
    else if (cond)          headline = cond;
    else if (high && low)   headline = `High ${high}°, Low ${low}°`;
    else                    headline = 'Weather data available';

    if (high && low && !headline.includes('°')) {
      headline += ` — High ${high}°, Low ${low}°`;
    }

    // Build 2-sentence summary
    const parts = [];
    if (cond && temp) parts.push(`Currently ${cond} at ${temp}.`);
    if (high && low)  parts.push(`Today's forecast: high of ${high}°F, low of ${low}°F.`);
    if (precip && precip >= 20) parts.push(`${precip}% chance of precipitation today.`);
    const summary = parts.slice(0, 3).join(' ') || 'Check the forecast for details.';

    return {
      headline,
      summary,
      confidence: 80,
      hazards: [],
      today: {
        high_f:            high,
        low_f:             low,
        precip_chance_pct: precip,
        snow_chance_pct:   null,
        key_window:        null,
      },
      tomorrow: {
        high_f:            m.high_f  != null ? Math.round(m.high_f)  : null,
        low_f:             m.low_f   != null ? Math.round(m.low_f)   : null,
        precip_chance_pct: m.precip_chance != null ? Math.round(m.precip_chance) : null,
        snow_chance_pct:   null,
        key_window:        null,
      },
      alerts: { active: false, banner_text: null, severity: 'none', expires_at: null },
      source_disagreements: [],
      actions: [],
    };
  },

  // ── NWS alert text parser ───────────────────────────────────────
  //
  // NWS description text is structured with uppercase section labels:
  //   WHAT...text   WHERE...text   WHEN...text   IMPACTS...text
  //   ADDITIONAL DETAILS...text   * bullet items
  //
  // instruction field contains the "protective action" steps.

  /**
   * Parse a raw NWS alert into structured sections.
   * @param {object} alert  — { event, severity, description, instruction, area, expires, headline }
   * @returns {{ what, where, when, impacts, additional, instruction, bullets, keyNumbers }}
   */
  parseNWSAlert(alert) {
    const desc  = (alert.description  || '').trim();
    const instr = (alert.instruction  || '').trim();

    const result = {
      what:        null,
      where:       null,
      when:        null,
      impacts:     null,
      additional:  null,
      instruction: instr || null,
      bullets:     [],       // parsed action bullets ready to display
      keyNumbers:  [],       // extracted measurements (e.g. "8-12 inches", "60 mph")
    };

    if (!desc) return result;

    // ── Section extraction ───────────────────────────────────────
    // NWS uses "SECTION..." (all caps, followed by ...) as section headers
    const SECTION_RE = /\n?(WHAT|WHERE|WHEN|IMPACTS|ADDITIONAL DETAILS|PRECAUTIONARY\/PREPAREDNESS ACTIONS)\.\.\./gi;
    const sections = {};
    let last = null, lastIdx = 0;

    // Find all section headers
    const matches = [...desc.matchAll(SECTION_RE)];
    for (let i = 0; i < matches.length; i++) {
      const m    = matches[i];
      const end  = i + 1 < matches.length ? matches[i + 1].index : desc.length;
      const key  = m[1].toLowerCase().replace(/[^a-z]/g, '_').replace(/_+/g, '_');
      sections[key] = desc.slice(m.index + m[0].length, end).trim();
    }

    // If no sections found, treat the whole description as WHAT
    if (!Object.keys(sections).length) {
      sections.what = desc;
    }

    result.what       = sections.what       || null;
    result.where      = sections.where      || null;
    result.when       = sections.when       || null;
    result.impacts    = sections.impacts    || null;
    result.additional = sections.additional_details || null;

    // ── Extract key numbers ──────────────────────────────────────
    // Look for measurement patterns in WHAT and IMPACTS
    const measureText = [result.what, result.impacts].filter(Boolean).join(' ');
    result.keyNumbers = this._extractMeasurements(measureText);

    // ── Build action bullets ─────────────────────────────────────
    result.bullets = this._buildAlertBullets(alert, result);

    return result;
  },

  /** Extract structured measurements from NWS text */
  _extractMeasurements(text) {
    if (!text) return [];
    const nums = [];

    const patterns = [
      // Snow/ice accumulation
      { re: /(\d+(?:\s*to\s*\d+)?)\s*inches?\s*of\s*(snow|ice|sleet|freezing rain)/gi,
        fmt: m => `❄️ ${m[1]} inch${m[1].includes('to') ? 'es' : ''} of ${m[2]}` },
      // Wind speeds
      { re: /winds?\s*(?:gusting|up to|as high as|near)?\s*(\d+(?:\s*to\s*\d+)?)\s*mph/gi,
        fmt: m => `💨 Winds up to ${m[1]} mph` },
      // Temperature extremes
      { re: /(?:as low as|temperatures?(?:\s*falling)?\s*(?:to|around|near)?)\s*(-?\d+)\s*(?:degrees?|°)/gi,
        fmt: m => `🌡️ Temperatures near ${m[1]}°F` },
      // Visibility
      { re: /visibility\s*(?:reduced to|below|near|as low as)?\s*(\d+(?:\.\d+)?)\s*(?:mile|mi)/gi,
        fmt: m => `🌫️ Visibility near ${m[1]} mile${parseFloat(m[1]) !== 1 ? 's' : ''}` },
      // Rainfall
      { re: /(\d+(?:\s*to\s*\d+)?)\s*inches?\s*of\s*rain/gi,
        fmt: m => `🌧️ ${m[1]} inch${m[1].includes('to') ? 'es' : ''} of rainfall` },
      // Storm surge
      { re: /storm surge\s*(?:of|up to|near)?\s*(\d+(?:\s*to\s*\d+)?)\s*(?:feet|ft)/gi,
        fmt: m => `🌊 Storm surge ${m[1]} feet` },
    ];

    const seen = new Set();
    for (const { re, fmt } of patterns) {
      for (const m of text.matchAll(re)) {
        const bullet = fmt(m);
        if (!seen.has(bullet)) { seen.add(bullet); nums.push(bullet); }
      }
    }
    return nums;
  },

  /** Build display-ready bullet array from parsed NWS sections */
  _buildAlertBullets(alert, parsed) {
    const bullets = [];
    const sev     = alert.severity || '';
    const event   = alert.event    || 'Weather Alert';

    // ── Bullet 1: What is happening ─────────────────────────────
    if (parsed.what) {
      // First sentence only — NWS WHAT sections can be long
      const first = parsed.what.split(/\.(?:\s|$)/)[0].trim();
      if (first) bullets.push({ emoji: this._severityEmoji(sev), text: first + '.' });
    }

    // ── Bullet 2: Key measurements ───────────────────────────────
    parsed.keyNumbers.slice(0, 3).forEach(n => bullets.push({ emoji: null, text: n }));

    // ── Bullet 3: Timing window ──────────────────────────────────
    if (parsed.when) {
      const when = parsed.when.replace(/\s+/g, ' ').trim();
      bullets.push({ emoji: '🕐', text: when });
    }

    // ── Bullet 4: Impacts ────────────────────────────────────────
    if (parsed.impacts) {
      // Split on sentence boundaries or bullet asterisks
      const impactLines = parsed.impacts
        .split(/(?:\.\s+|\n\*\s*)/)
        .map(s => s.replace(/^\*\s*/, '').trim())
        .filter(s => s.length > 10)
        .slice(0, 3);
      impactLines.forEach(l => bullets.push({ emoji: '⚡', text: l.endsWith('.') ? l : l + '.' }));
    }

    // ── Bullet 5: What to do (instruction field) ─────────────────
    if (parsed.instruction) {
      // Take first 2 meaningful instructions
      const steps = parsed.instruction
        .split(/\n|\.\s+/)
        .map(s => s.replace(/^\*\s*/, '').trim())
        .filter(s => s.length > 10 && !s.match(/^(National Weather Service|NWS)/i))
        .slice(0, 2);
      steps.forEach(s => bullets.push({ emoji: '✅', text: s.endsWith('.') ? s : s + '.' }));
    }

    // ── Fallback: use headline ────────────────────────────────────
    if (!bullets.length && alert.headline) {
      bullets.push({ emoji: this._severityEmoji(sev), text: alert.headline });
    }

    return bullets;
  },

  /**
   * Build a clean 2-sentence plain summary from an alert.
   * Sentence 1: what + key measurement. Sentence 2: action from instruction.
   */
  alertSummary(alert) {
    const parsed = this.parseNWSAlert(alert);

    // Sentence 1: lead with WHAT, add first key measurement if available
    let s1 = '';
    if (parsed.what) {
      s1 = parsed.what.split(/\.(?:\s|$)/)[0].trim();
      if (parsed.keyNumbers[0]) {
        s1 += ' — ' + parsed.keyNumbers[0].replace(/^[^\s]+\s/, ''); // strip emoji
      }
      if (!s1.endsWith('.')) s1 += '.';
    } else if (alert.headline) {
      s1 = alert.headline;
    } else {
      s1 = `A ${alert.event || 'weather alert'} is in effect.`;
    }

    // Sentence 2: first clear instruction, or WHEN
    let s2 = '';
    if (parsed.instruction) {
      const step = parsed.instruction
        .split(/\n|\.\s+/)
        .map(s => s.replace(/^\*\s*/, '').trim())
        .find(s => s.length > 15 && !s.match(/^(National Weather Service|NWS|For your)/i));
      if (step) s2 = step.endsWith('.') ? step : step + '.';
    }
    if (!s2 && parsed.when) {
      s2 = `Alert in effect: ${parsed.when.trim()}.`;
    }
    if (!s2) s2 = `Check local conditions and follow official guidance.`;

    return s1 + ' ' + s2;
  },

  _severityEmoji(sev) {
    const m = { Extreme: '🚨', Severe: '⚠️', Moderate: '🌦️', Minor: 'ℹ️' };
    return m[sev] || '📢';
  },
};
