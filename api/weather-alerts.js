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
    const alerts = (data.features || []).map(f => {
      const p = f.properties || {};
      return {
        id: p.id || f.id,
        headline: p.headline || p.event,
        event: p.event,
        severity: p.severity,
        urgency: p.urgency,
        certainty: p.certainty,
        expires: p.expires,
        area: p.areaDesc,
        description: p.description,
        instruction: p.instruction
      };
    });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
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
