// /api/health.js — Vercel Serverless Function
// GET /api/health — Returns status of all backend services

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const results = {};

  // 1. Supabase
  const sbStart = Date.now();
  try {
    const sbUrl = process.env.SUPABASE_URL;
    if (!sbUrl) throw new Error('SUPABASE_URL not set');
    const resp = await fetch(`${sbUrl}/rest/v1/`, {
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY || '',
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY || ''}`
      }
    });
    results.supabase = { status: resp.ok ? 'ok' : 'error', latency_ms: Date.now() - sbStart };
  } catch (e) {
    results.supabase = { status: 'error', error: e.message, latency_ms: Date.now() - sbStart };
  }

  // 2. Weather (Open-Meteo quick ping)
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

  // 3. AI endpoint
  const aiStart = Date.now();
  try {
    const resp = await fetch(
      'https://genaiapi.cloudsway.net/v1/ai/zWwyutGgvEGWwzSa/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'MaaS_4.1', messages: [{ role: 'user', content: 'ping' }] }),
        signal: AbortSignal.timeout(10000)
      }
    );
    results.ai = { status: resp.ok ? 'ok' : 'error', latency_ms: Date.now() - aiStart };
  } catch (e) {
    results.ai = { status: 'error', error: e.message, latency_ms: Date.now() - aiStart };
  }

  // 4. Immich
  results.immich = { status: 'ok', note: 'User-configured, proxied on demand' };

  return res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    services: results
  });
}
