// /api/immich-album.js — Vercel Serverless Function
// GET /api/immich-album?baseUrl=..&key=..&albumId=..

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const baseUrl = req.query.baseUrl || process.env.IMMICH_BASE_URL || '';
  const key = req.query.key || process.env.IMMICH_SHARED_ALBUM_TOKEN || '';
  const albumId = req.query.albumId || process.env.IMMICH_ALBUM_ID || '';

  if (!baseUrl || !key || !albumId) {
    return res.status(200).json({ images: [], error: 'Missing baseUrl, key, or albumId' });
  }

  try {
    const albumUrl = `${baseUrl.replace(/\/$/, '')}/api/albums/${albumId}`;
    const resp = await fetch(albumUrl, {
      headers: { 'x-api-key': key }
    });

    if (!resp.ok) {
      return res.status(200).json({ images: [], error: `Immich returned ${resp.status}` });
    }

    const album = await resp.json();
    const images = (album.assets || [])
      .filter(a => a.type === 'IMAGE')
      .map(a => `${baseUrl.replace(/\/$/, '')}/api/assets/${a.id}/thumbnail?size=preview&key=${key}`);

    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(200).json({
      images,
      albumName: album.albumName || 'Shared Album',
      count: images.length,
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ images: [], error: e.message });
  }
}
