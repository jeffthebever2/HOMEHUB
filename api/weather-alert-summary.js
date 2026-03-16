// /api/weather-alert-summary.js — Vercel Serverless Function
// POST /api/weather-alert-summary
//
// Accepts a NWS alert object and returns a short household-friendly
// AI summary via Google Gemini. Keeps the key server-side.
//
// Env var required: GOOGLE_AI_KEY
// Set in Vercel Dashboard → Project → Settings → Environment Variables

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_KEY   = 'AIzaSyDbcnFnuhrvNk9azqtlLmZUXwvzYYfMzyI';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  const key = AIzaSyDbcnFnuhrvNk9azqtlLmZUXwvzYYfMzyI;

  const { event, severity, area, description, instruction, expires } = req.body || {};

  if (!event && !description) {
    return res.status(400).json({ error: 'Missing alert data' });
  }

  // Build the raw NWS text — Gemini will distil it
  const rawText = [
    event       ? `Alert type: ${event}`           : null,
    severity    ? `Severity: ${severity}`           : null,
    area        ? `Area: ${area}`                   : null,
    expires     ? `Expires: ${expires}`             : null,
    description ? `\nNWS Description:\n${description}` : null,
    instruction ? `\nNWS Instructions:\n${instruction}` : null,
  ].filter(Boolean).join('\n');

  const prompt = `You are a friendly home assistant summarizing a weather alert for a family kiosk. 
Write EXACTLY 2 short sentences (under 30 words each) that answer:
1. What is happening and how bad is it?
2. What should the household do right now?

Use plain conversational language — no jargon, no ALL CAPS, no bullet points.
Do not repeat the alert type name in the first word. Do not start with "This alert".

NWS Alert:
${rawText}`;

  try {
    const geminiResp = await fetch(`${GEMINI_URL}?key=${key}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     0.3,   // factual, not creative
          maxOutputTokens: 120,   // ~2 sentences ceiling
          stopSequences:   []
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!geminiResp.ok) {
      const errBody = await geminiResp.text().catch(() => '');
      console.error('[alert-summary] Gemini error', geminiResp.status, errBody.slice(0, 200));
      return res.status(200).json({ summary: null, error: `Gemini ${geminiResp.status}` });
    }

    const geminiData = await geminiResp.json();
    const summary = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;

    // Cache briefly — same alert won't change in 5 min
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({ summary });

  } catch (e) {
    console.error('[alert-summary] fetch error:', e.message);
    // Return null summary gracefully — banner falls back to NWS headline
    return res.status(200).json({ summary: null, error: e.message });
  }
}
