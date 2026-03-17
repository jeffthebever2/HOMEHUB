// /api/weather-ai-summary.js — Unified Gemini AI summary endpoint
// POST /api/weather-ai-summary
//
// Handles two summary types, selected by req.body.type:
//
//   type: "alert"  — Summarize a NWS weather alert in 2 plain-language sentences
//   type: "impact" — Generate household action bullets from current conditions
//
// Merged from weather-alert-summary.js + weather-impact-summary.js
// to stay within Vercel Hobby's 12 serverless function limit.

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_KEY   = 'AIzaSyDbcnFnuhrvNk9azqtlLmZUXwvzYYfMzyI';

async function callGemini(prompt, temperature, maxTokens) {
  const resp = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens, stopSequences: [] },
      safetySettings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }],
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`Gemini ${resp.status}: ${err.slice(0, 100)}`);
  }
  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  const { type } = req.body || {};

  // ── Alert summary ──────────────────────────────────────────────────────
  if (type === 'alert') {
    const { event, severity, urgency, area, description, instruction, expires } = req.body;
    if (!event && !description) return res.status(400).json({ error: 'Missing alert data' });

    const eventLower  = (event || '').toLowerCase();
    const isWarning   = eventLower.includes('warning') || ['Extreme','Severe'].includes(severity);
    const isWatch     = eventLower.includes('watch');
    const isStatement = eventLower.includes('statement');

    const toneGuide = isWarning
      ? 'This is an active WARNING. Use urgent but calm language. Household should act now.'
      : isWatch
      ? 'This is a WATCH — conditions may develop. Use preparedness language. Household should be ready.'
      : isStatement
      ? 'This is a Special Weather Statement. Focus on the specific hazard, timing, and who is affected.'
      : 'This is an advisory or informational alert. Use awareness language — notable but not panic-worthy.';

    const rawText = [
      event       ? `Alert type: ${event}`           : null,
      severity    ? `Severity: ${severity}`           : null,
      urgency     ? `Urgency: ${urgency}`             : null,
      area        ? `Area: ${area}`                   : null,
      expires     ? `Expires: ${expires}`             : null,
      description ? `\nNWS Description:\n${description}` : null,
      instruction ? `\nNWS Instructions:\n${instruction}` : null,
    ].filter(Boolean).join('\n');

    const prompt = `You are a concise home assistant summarizing a weather alert for a family kiosk display.

Tone guidance: ${toneGuide}

Write EXACTLY 2 sentences:
- Sentence 1: What is the main hazard, how intense is it, and when/where does it affect us? Pull out specific details like temperatures, wind speeds, visibility, accumulation amounts, or timing if present in the NWS text.
- Sentence 2: What should the household do right now? Be specific to this alert type.

Rules:
- Plain conversational language, no ALL CAPS, no bullet points, no markdown
- Keep each sentence under 35 words
- Do not start sentence 1 with the alert type name or "This alert" or "A"
- Do not start sentence 2 with "You should"

NWS Alert:
${rawText}`;

    try {
      const summary = await callGemini(prompt, 0.2, 150);
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
      return res.status(200).json({ summary });
    } catch (e) {
      console.error('[ai-summary/alert]', e.message);
      return res.status(200).json({ summary: null, error: e.message });
    }
  }

  // ── Impact bullets ─────────────────────────────────────────────────────
  if (type === 'impact') {
    const { current, today, hourly, alerts } = req.body;
    if (!current && !today) return res.status(400).json({ error: 'Missing weather data' });

    const lines = [];
    if (current?.temp_f      != null) lines.push(`Temperature: ${current.temp_f}°F (feels like ${current.feels_like_f ?? '?'}°F)`);
    if (current?.condition)           lines.push(`Condition: ${current.condition}`);
    if (current?.wind_mph    != null) lines.push(`Wind: ${current.wind_mph} mph${current.gusts_mph ? `, gusts to ${current.gusts_mph} mph` : ''}`);
    if (current?.humidity    != null) lines.push(`Humidity: ${current.humidity}%`);
    if (today?.high_f        != null) lines.push(`Today's high: ${today.high_f}°F, low: ${today.low_f ?? '?'}°F`);
    if (today?.precip_chance != null) lines.push(`Rain chance: ${today.precip_chance}%`);
    if (today?.sunrise)               lines.push(`Sunrise: ${today.sunrise}   Sunset: ${today.sunset ?? '?'}`);

    if (hourly?.length) {
      const rainHours = hourly.filter(h => (h.precip_prob ?? 0) >= 40);
      if (rainHours.length) {
        const firstRain = new Date(rainHours[0].time)
          .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        lines.push(`Precipitation likely starting around ${firstRain}`);
      }
    }
    if (alerts?.length) {
      lines.push(`Active NWS alerts: ${alerts.map(a => `${a.event} (${a.severity})`).join(', ')}`);
    }

    const prompt = `You are a practical home assistant giving a family their daily weather briefing on a household kiosk.

Based on this weather data:
${lines.join('\n')}

Write 3–5 short, specific action-oriented bullet points telling the household what this weather means for them today.

Rules:
- Start each bullet with a relevant emoji
- Each bullet is ONE sentence, under 20 words
- Plain language, no jargon, no ALL CAPS
- Be specific to the actual conditions — no generic filler bullets
- If conditions are mild and pleasant, say so and keep it brief (2 bullets)
- Return ONLY the bullet lines, no intro text, no header`;

    try {
      const rawText = await callGemini(prompt, 0.4, 200);
      const bullets = rawText
        ? rawText.split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(l => l.length > 0)
        : null;
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
      return res.status(200).json({ bullets });
    } catch (e) {
      console.error('[ai-summary/impact]', e.message);
      return res.status(200).json({ bullets: null, error: e.message });
    }
  }

  return res.status(400).json({ error: 'Missing or invalid type. Use type: "alert" or "impact"' });
}
