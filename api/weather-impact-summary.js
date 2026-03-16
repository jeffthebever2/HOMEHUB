// /api/weather-impact-summary.js — Vercel Serverless Function
// POST /api/weather-impact-summary
//
// Takes normalized current conditions + active alerts and returns
// a short AI-written household impact paragraph via Gemini.

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_KEY   = 'AIzaSyDbcnFnuhrvNk9azqtlLmZUXwvzYYfMzyI';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  const { current, today, hourly, alerts } = req.body || {};

  if (!current && !today) {
    return res.status(400).json({ error: 'Missing weather data' });
  }

  // ── Build a tight weather snapshot for Gemini ──────────────────────────
  const lines = [];

  if (current?.temp_f       != null) lines.push(`Temperature: ${current.temp_f}°F (feels like ${current.feels_like_f ?? '?'}°F)`);
  if (current?.condition)            lines.push(`Condition: ${current.condition}`);
  if (current?.wind_mph     != null) lines.push(`Wind: ${current.wind_mph} mph${current.gusts_mph ? `, gusts to ${current.gusts_mph} mph` : ''}`);
  if (current?.humidity     != null) lines.push(`Humidity: ${current.humidity}%`);
  if (today?.high_f         != null) lines.push(`Today's high: ${today.high_f}°F, low: ${today.low_f ?? '?'}°F`);
  if (today?.precip_chance  != null) lines.push(`Rain chance: ${today.precip_chance}%`);
  if (today?.sunrise)                lines.push(`Sunrise: ${today.sunrise}   Sunset: ${today.sunset ?? '?'}`);

  // Upcoming precip from hourly
  if (hourly?.length) {
    const rainHours = hourly.filter(h => (h.precip_prob ?? 0) >= 40);
    if (rainHours.length) {
      const firstRain = new Date(rainHours[0].time)
        .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      lines.push(`Precipitation likely starting around ${firstRain}`);
    }
  }

  // Active alerts summary
  if (alerts?.length) {
    const alertSummary = alerts.map(a => `${a.event} (${a.severity})`).join(', ');
    lines.push(`Active NWS alerts: ${alertSummary}`);
  }

  const weatherSnapshot = lines.join('\n');

  const prompt = `You are a practical home assistant giving a family their daily weather briefing on a household kiosk.

Based on this weather data:
${weatherSnapshot}

Write 3–5 short, specific action-oriented bullet points telling the household what this weather actually means for them today. Cover things like:
- What to wear or bring (umbrella, layers, sunscreen)
- Outdoor activity windows (yard work, walking the dog, outdoor chores)
- Home prep (leave early, charge devices, close windows, cover plants)  
- Pet considerations if weather is extreme
- School or commute notes if rain/wind/ice is involved

Rules:
- Start each bullet with a relevant emoji
- Each bullet is ONE sentence, under 20 words
- Plain language, no jargon, no ALL CAPS
- Be specific to the actual conditions — no generic filler bullets
- If conditions are mild and pleasant, say so and keep it brief (2 bullets)
- Return ONLY the bullet lines, no intro text, no header`;

  try {
    const geminiResp = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     0.4,
          maxOutputTokens: 200,
          stopSequences:   []
        }
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!geminiResp.ok) {
      const err = await geminiResp.text().catch(() => '');
      console.error('[impact-summary] Gemini error', geminiResp.status, err.slice(0, 200));
      return res.status(200).json({ bullets: null, error: `Gemini ${geminiResp.status}` });
    }

    const data    = await geminiResp.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;

    let bullets = null;
    if (rawText) {
      // Parse lines starting with emoji or bullet chars
      bullets = rawText
        .split('\n')
        .map(l => l.replace(/^[-*•]\s*/, '').trim())
        .filter(l => l.length > 0);
    }

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
    return res.status(200).json({ bullets });

  } catch (e) {
    console.error('[impact-summary] error:', e.message);
    return res.status(200).json({ bullets: null, error: e.message });
  }
}
