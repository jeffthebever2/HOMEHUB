// /api/weather-ai.js — Vercel Serverless Function
// POST /api/weather-ai

const GENAI_URL = 'https://genaiapi.cloudsway.net/v1/ai/zWwyutGgvEGWwzSa/chat/completions';
const MODEL = 'MaaS_4.1';

const SYSTEM_PROMPT = `You are a weather briefing assistant. You receive aggregated weather data from multiple APIs (Open-Meteo, Weather.gov, Weatherbit, Tomorrow.io, Visual Crossing, Pirate Weather).

RULES:
- Use ONLY the provided data. Never invent numbers.
- Prioritize Weather.gov for alerts.
- If any Weather.gov alerts are active, set alerts.active=true and include actions show_red_banner and show_popup.
- If sources disagree significantly (>5°F temp, >30% precip), reduce confidence and explain in source_disagreements.
- Output ONLY valid JSON matching the schema below. No markdown, no explanation, just JSON.

REQUIRED OUTPUT SCHEMA:
{
  "headline": "string (8-15 words)",
  "summary": "string (2-3 sentences)",
  "confidence": 0-100,
  "hazards": ["string array"],
  "today": {
    "high_f": number or null,
    "low_f": number or null,
    "precip_chance_pct": number or null,
    "snow_chance_pct": number or null,
    "key_window": "string or null"
  },
  "tomorrow": {
    "high_f": number or null,
    "low_f": number or null,
    "precip_chance_pct": number or null,
    "snow_chance_pct": number or null,
    "key_window": "string or null"
  },
  "alerts": {
    "active": boolean,
    "banner_text": "string <=80 chars" or null,
    "severity": "none" | "advisory" | "watch" | "warning",
    "expires_at": "ISO 8601 string" or null
  },
  "source_disagreements": [{"topic":"string","details":"string"}],
  "actions": [{"type":"none"|"show_red_banner"|"show_popup","reason":"string"}]
}`;

async function callGenAI(aggregate, location) {
  const resp = await fetch(GENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            'Interpret this aggregated weather JSON and output the required schema. Data: ' +
            JSON.stringify({ location, aggregate })
        }
      ]
    })
  });
  if (!resp.ok) throw new Error('GenAI failed: ' + resp.status);
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? '{}';
  const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

function mapSeverity(s) {
  if (!s) return 'none';
  const l = s.toLowerCase();
  if (l.includes('warning') || l === 'extreme' || l === 'severe') return 'warning';
  if (l.includes('watch') || l === 'moderate') return 'watch';
  if (l.includes('advisory') || l === 'minor') return 'advisory';
  return 'none';
}

function buildFallback(aggregate, location) {
  const result = {
    headline: 'Weather data available',
    summary: 'AI interpretation unavailable. Showing data from available sources.',
    confidence: 35,
    hazards: [],
    today: { high_f: null, low_f: null, precip_chance_pct: null, snow_chance_pct: null, key_window: null },
    tomorrow: { high_f: null, low_f: null, precip_chance_pct: null, snow_chance_pct: null, key_window: null },
    alerts: { active: false, banner_text: null, severity: 'none', expires_at: null },
    source_disagreements: [],
    actions: [{ type: 'none', reason: 'AI fallback' }]
  };

  // Open-Meteo daily
  const daily = aggregate?.openMeteo?.daily || aggregate?.sources?.openMeteo?.data?.daily;
  if (daily) {
    if (daily.temperature_2m_max?.[0] != null) result.today.high_f = Math.round(daily.temperature_2m_max[0]);
    if (daily.temperature_2m_min?.[0] != null) result.today.low_f = Math.round(daily.temperature_2m_min[0]);
    if (daily.precipitation_probability_max?.[0] != null) result.today.precip_chance_pct = daily.precipitation_probability_max[0];
    if (daily.temperature_2m_max?.[1] != null) result.tomorrow.high_f = Math.round(daily.temperature_2m_max[1]);
    if (daily.temperature_2m_min?.[1] != null) result.tomorrow.low_f = Math.round(daily.temperature_2m_min[1]);
    if (daily.precipitation_probability_max?.[1] != null) result.tomorrow.precip_chance_pct = daily.precipitation_probability_max[1];
  }

  // Weather.gov description
  const wgForecast = aggregate?.weatherGov?.forecast || aggregate?.sources?.weatherGov?.data?.forecast;
  if (wgForecast?.properties?.periods?.[0]) {
    result.headline = wgForecast.properties.periods[0].shortForecast || result.headline;
  }

  // Weather.gov alerts
  const wgAlerts = aggregate?.weatherGov?.alerts || aggregate?.sources?.weatherGov?.data?.alerts;
  if (wgAlerts?.features?.length > 0) {
    const top = wgAlerts.features[0].properties;
    result.alerts.active = true;
    result.alerts.banner_text = (top.headline || top.event || 'Weather Alert').substring(0, 80);
    result.alerts.severity = mapSeverity(top.severity);
    result.alerts.expires_at = top.expires || null;
    result.hazards.push(top.event || 'Weather Alert');
    result.actions = [
      { type: 'show_red_banner', reason: top.event || 'Active alert' },
      { type: 'show_popup', reason: 'NWS alert active' }
    ];
  }

  return result;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { location, aggregate, previousSummary } = req.body || {};

    if (!aggregate) {
      return res.status(400).json({ error: 'Missing aggregate data' });
    }

    let result;
    try {
      result = await callGenAI(aggregate, location || {});
    } catch (aiErr) {
      console.error('AI call failed, using fallback:', aiErr.message);
      result = buildFallback(aggregate, location || {});
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');
    return res.status(200).json(result);
  } catch (e) {
    console.error('weather-ai error:', e);
    return res.status(500).json({
      headline: 'Error processing weather',
      summary: 'An error occurred.',
      confidence: 0,
      hazards: [],
      today: { high_f: null, low_f: null, precip_chance_pct: null, snow_chance_pct: null, key_window: null },
      tomorrow: { high_f: null, low_f: null, precip_chance_pct: null, snow_chance_pct: null, key_window: null },
      alerts: { active: false, banner_text: null, severity: 'none', expires_at: null },
      source_disagreements: [],
      actions: [{ type: 'none', reason: 'Server error' }]
    });
  }
}
