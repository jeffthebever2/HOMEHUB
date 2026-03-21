// ============================================================
// cloudflare/src/routes/photos.js — R2 photo API
//
// GET    /media/photos          — list photos from R2
// GET    /media/photos/:key     — serve photo bytes from R2
// POST   /media/upload          — upload photo (auth required)
// DELETE /media/delete/:key     — delete from R2 (auth required)
// ============================================================

import { authGuard } from '../middleware.js';

export async function handlePhotos(request, env) {
  const url    = new URL(request.url);
  const parts  = url.pathname.split('/').filter(Boolean);
  const action = parts[1];
  const key    = parts.slice(2).join('/');

  if (action === 'photos' && request.method === 'GET') {
    if (key) return serveSinglePhoto(key, env);
    return listPhotos(url, env);
  }

  if (action === 'upload' && request.method === 'POST') {
    await authGuard(request, env);
    return uploadPhoto(request, env);
  }

  if (action === 'delete' && request.method === 'DELETE' && key) {
    await authGuard(request, env);
    return deletePhoto(key, env);
  }

  return json({ error: 'Unknown media route' }, 404);
}

async function listPhotos(url, env) {
  const album  = url.searchParams.get('album') || 'default';
  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
  const cursor = url.searchParams.get('cursor') || undefined;
  const prefix = album === 'default' ? 'photos/' : `albums/${album}/`;
  const listed = await env.MEDIA.list({ prefix, limit, cursor });

  return json({
    photos: listed.objects.map(obj => ({
      key:      obj.key,
      url:      `/media/photos/${obj.key}`,
      size:     obj.size,
      uploaded: obj.uploaded,
      etag:     obj.httpEtag,
      meta:     obj.customMetadata || {},
    })),
    count:     listed.objects.length,
    truncated: listed.truncated,
    cursor:    listed.cursor || null,
    album,
  });
}

async function serveSinglePhoto(key, env) {
  const object = await env.MEDIA.get(key);
  if (!object) return json({ error: 'Photo not found', key }, 404);
  return new Response(object.body, {
    headers: {
      'Content-Type':  object.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'ETag':          object.httpEtag,
    },
  });
}

async function uploadPhoto(request, env) {
  const contentType = request.headers.get('Content-Type') || '';
  const album       = request.headers.get('X-Album')    || 'default';
  const filename    = request.headers.get('X-Filename') || `${Date.now()}.jpg`;

  if (!contentType.startsWith('image/')) return json({ error: 'Images only' }, 400);

  const maxBytes = parseInt(env.MAX_UPLOAD_MB || '25') * 1024 * 1024;
  const body     = await request.arrayBuffer();
  if (body.byteLength > maxBytes) return json({ error: `Exceeds ${env.MAX_UPLOAD_MB || 25}MB limit` }, 413);

  const prefix = album === 'default' ? 'photos' : `albums/${album}`;
  const key    = `${prefix}/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  await env.MEDIA.put(key, body, {
    httpMetadata:   { contentType },
    customMetadata: { album, originalName: filename, uploadedAt: new Date().toISOString() },
  });

  return json({ key, url: `/media/photos/${key}`, size: body.byteLength }, 201);
}

async function deletePhoto(key, env) {
  await env.MEDIA.delete(key);
  return json({ deleted: true, key });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
