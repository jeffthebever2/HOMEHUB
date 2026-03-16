// /api/weather-alerts.js — Vercel Serverless Function
// GET /api/weather-alerts?lat=..&lon=..

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'Missing lat/lon' });

  try {
    const resp = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, {
      headers: { 'User-Agent': 'HomeHub/1.0 (contact: Will)' }
    });

    if (!resp.ok) {
      return res.status(200).json({ active: false, alerts: [], error: `Weather.gov returned ${resp.status}` });
    }

    const data = await resp.json();
    const now = Date.now();

    const alerts = (data.features || [])
      .filter(f => {
        const p = f.properties || {};
        // Drop cancelled / test / expired status alerts immediately on the server
        const status = (p.status || '').toLowerCase();
        if (status === 'cancel' || status === 'test' || status === 'draft') return false;
        // Drop anything whose effective expiry is already in the past
        // NWS uses both `expires` and `ends` fields; check both
        const expiry = p.ends || p.expires;
        if (expiry && new Date(expiry).getTime() <= now) return false;
        return true;
      })
      .map(f => {
        const p = f.properties || {};
        return {
          id:          p.id || f.id,
          headline:    p.headline || p.event,
          event:       p.event,
          severity:    p.severity,
          urgency:     p.urgency,
          certainty:   p.certainty,
          status:      p.status,
          expires:     p.ends || p.expires,   // normalise to a single field
          area:        p.areaDesc,
          description: p.description,
          instruction: p.instruction
        };
      });

    res.setHeader('Cache-Control', 'no-store'); // alerts must always be fresh — no stale data
    return res.status(200).json({
      active: alerts.length > 0,
      alerts,
      count: alerts.length,
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ active: false, alerts: [], error: e.message });
  }
}
