// /api/weather-alert-summary.js — Vercel Serverless Function
// POST /api/weather-alert-summary
//
// Accepts a NWS alert object and returns a concise household-friendly
// AI summary via Google Gemini, tuned per alert type:
//   - Warnings/Extreme/Severe  → urgent action language
//   - Watches                  → preparedness language
//   - Advisories/Statements    → awareness + main hazard language

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_KEY   = 'AIzaSyDbcnFnuhrvNk9azqtlLmZUXwvzYYfMzyI';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  const { event, severity, urgency, area, description, instruction, expires } = req.body || {};

  if (!event && !description) {
    return res.status(400).json({ error: 'Missing alert data' });
  }

  // ── Choose tone based on alert type ────────────────────────────────────
  const eventLower = (event || '').toLowerCase();
  const isWarning  = eventLower.includes('warning') || ['Extreme', 'Severe'].includes(severity);
  const isWatch    = eventLower.includes('watch');
  const isStatement = eventLower.includes('statement');
  // Everything else (Advisory, Outlook, etc.) gets the advisory tone

  const toneGuide = isWarning
    ? 'This is an active WARNING. Use urgent but calm language. Household should act now.'
    : isWatch
    ? 'This is a WATCH — conditions may develop. Use preparedness language. Household should be ready.'
    : isStatement
    ? 'This is a Special Weather Statement. Focus on the specific hazard, timing, and who is affected.'
    : 'This is an advisory or informational alert. Use awareness language — notable but not panic-worthy.';

  // ── Build raw NWS text block ────────────────────────────────────────────
  const rawText = [
    event       ? `Alert type: ${event}`       : null,
    severity    ? `Severity: ${severity}`       : null,
    urgency     ? `Urgency: ${urgency}`         : null,
    area        ? `Area: ${area}`               : null,
    expires     ? `Expires: ${expires}`         : null,
    description ? `\nNWS Description:\n${description}` : null,
    instruction ? `\nNWS Instructions:\n${instruction}` : null,
  ].filter(Boolean).join('\n');

  const prompt = `You are a concise home assistant summarizing a weather alert for a family kiosk display.

Tone guidance: ${toneGuide}

Write EXACTLY 2 sentences:
- Sentence 1: What is the main hazard, how intense is it, and when/where does it affect us? Pull out specific details like temperatures, wind speeds, visibility, accumulation amounts, or timing if present in the NWS text.
- Sentence 2: What should the household do right now? Be specific to this alert type (e.g. for fog: slow down and use low beams; for freeze: cover plants and bring pets in; for storm: stay indoors and away from windows).

Rules:
- Plain conversational language, no ALL CAPS, no bullet points, no markdown
- Keep each sentence under 35 words
- Do not start sentence 1 with the alert type name or "This alert" or "A"
- Do not start sentence 2 with "You should" — vary the phrasing

NWS Alert:
${rawText}`;

  try {
    const geminiResp = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     0.2,   // keep it factual and consistent
          maxOutputTokens: 150,   // enough for 2 meaty sentences
          stopSequences:   []
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
      }),
      signal: AbortSignal.timeout(9000)
    });

    if (!geminiResp.ok) {
      const errBody = await geminiResp.text().catch(() => '');
      console.error('[alert-summary] Gemini error', geminiResp.status, errBody.slice(0, 200));
      return res.status(200).json({ summary: null, error: `Gemini ${geminiResp.status}` });
    }

    const geminiData = await geminiResp.json();
    const summary = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;

    // Cache for 5 min — NWS alert text doesn't change that fast
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({ summary });

  } catch (e) {
    console.error('[alert-summary] fetch error:', e.message);
    return res.status(200).json({ summary: null, error: e.message });
  }
}
