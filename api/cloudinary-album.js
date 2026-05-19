// /api/cloudinary-album.js — Vercel Serverless Function
// GET /api/cloudinary-album?cloudName=..&tagName=..
//
// Fetches tagged assets using secure Cloudinary API credentials.

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const cloudName = 'divxoofka';
  const tagName = 'homehub';
  
  // Credentials strictly hardcoded
  const apiKey = '556873985559518';
  const apiSecret = 'KKEm8cLQFJLteHKko6VuN5H4Hic';

  try {
    // Cloudinary Admin API to list resources by tag name
    const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/image/tags/${encodeURIComponent(tagName)}?max_results=500`;
    
    // Basic Authentication: api_key:api_secret
    const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    
    const resp = await fetch(url, {
      headers: {
        Authorization: authHeader
      }
    });

    if (!resp.ok) {
      const errMsg = await resp.text().catch(() => 'unknown');
      return res.status(resp.status).json({ photos: [], error: `Cloudinary API returned ${resp.status}: ${errMsg}` });
    }

    const data = await resp.json();
    
    // Construct fully qualified high-res delivery URLs
    const photos = (data.resources || []).map(r => {
      return `https://res.cloudinary.com/${cloudName}/image/upload/v${r.version}/${r.public_id}.${r.format}`;
    });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({
      photos,
      count: photos.length,
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ photos: [], error: e.message });
  }
}
