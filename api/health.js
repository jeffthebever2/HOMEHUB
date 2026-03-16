// /api/health.js — Vercel Serverless Function
// GET /api/health — Returns status of backend services
//
// Design notes:
//   - Does NOT actively call the AI endpoint on every health check.
//     A "ping" POST to the AI API wastes quota and makes the whole dashboard
//     look degraded whenever AI is slow or rate-limited.
//   - AI status is reported as "configured" / "not configured" based on the
//     presence of the environment variable, not a live round-trip.

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const results = {};

  // 1. Supabase — lightweight REST root ping
  const sbStart = Date.now();
  try {
    const sbUrl = process.env.SUPABASE_URL;
    if (!sbUrl) throw new Error('SUPABASE_URL not set');
    const resp = await fetch(`${sbUrl}/rest/v1/`, {
      headers: {
        apikey:        process.env.SUPABASE_ANON_KEY || '',
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY || ''}`
      }
    });
    results.supabase = { status: resp.ok ? 'ok' : 'error', latency_ms: Date.now() - sbStart };
  } catch (e) {
    results.supabase = { status: 'error', error: e.message, latency_ms: Date.now() - sbStart };
  }

  // 2. Weather — Open-Meteo quick ping (free, no key needed)
  const wxStart = Date.now();
  try {
    const resp = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=40&longitude=-82&current=temperature_2m&timezone=auto',
      { signal: AbortSignal.timeout(8000) }
    );
    results.weather = { status: resp.ok ? 'ok' : 'error', latency_ms: Date.now() - wxStart };
  } catch (e) {
    results.weather = { status: 'error', error: e.message, latency_ms: Date.now() - wxStart };
  }

  // 3. AI — report configured/not-configured without live round-trip.
  //    Actively pinging the AI endpoint on every health check wastes quota
  //    and causes false "degraded" readings when the AI service is slow.
  const aiKeyPresent = !!(process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY);
  results.ai = {
    status: aiKeyPresent ? 'configured' : 'not_configured',
    note:   'AI endpoint is not live-checked to avoid quota consumption',
  };

  // 4. Immich — user-configured; proxied on demand
  results.immich = { status: 'ok', note: 'User-configured, proxied on demand' };

  return res.status(200).json({
    ok:        true,
    timestamp: new Date().toISOString(),
    services:  results,
  });
}
