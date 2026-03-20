// ============================================================
// cloudflare/src/routes/photos.js — R2 photo API
//
// GET  /media/photos            — list photos (with KV cache)
// GET  /media/photos/:key       — serve photo bytes from R2
// POST /media/upload            — upload photo to R2 (auth required)
// DELETE /media/delete/:key     — delete from R2 + D1 metadata (auth required)
// POST /media/process/:key      — enqueue image processing job
//
// R2 object keys are stored in D1 for metadata queries.
// KV caches the photo list to avoid repeated R2 list calls.
// ============================================================

import { authGuard } from '../middleware.js';

const CACHE_KEY   = 'photo_list';
const CACHE_TTL   = parseInt(env?.PHOTO_CACHE_TTL || '3600');   // 1hr default
const MAX_UPLOAD  = parseInt(env?.MAX_UPLOAD_MB   || '25') * 1024 * 1024;

export async function handlePhotos(request, env, ctx) {
  const url    = new URL(request.url);
  const parts  = url.pathname.split('/').filter(Boolean); // ['media', 'photos', ...]
  const action = parts[1]; // 'photos', 'upload', 'delete', 'process'
  const key    = parts.slice(2).join('/');                // rest of path

  if (action === 'photos' && request.method === 'GET') {
    if (key) return serveSinglePhoto(key, env);
    return listPhotos(url, env);
  }

  if (action === 'upload' && request.method === 'POST') {
    await authGuard(request, env);
    return uploadPhoto(request, env, ctx);
  }

  if (action === 'delete' && request.method === 'DELETE' && key) {
    await authGuard(request, env);
    return deletePhoto(key, env);
  }

  if (action === 'process' && request.method === 'POST' && key) {
    await authGuard(request, env);
    return enqueueProcessing(key, env);
  }

  return new Response(JSON.stringify({ error: 'Unknown media route' }), {
    status: 404, headers: { 'Content-Type': 'application/json' },
  });
}

// ── List photos ───────────────────────────────────────────────

async function listPhotos(url, env) {
  const album  = url.searchParams.get('album') || 'default';
  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  const cursor = url.searchParams.get('cursor') || undefined;
  const noCache = url.searchParams.get('nocache') === '1';

  const cacheKey = `${CACHE_KEY}:${album}:${limit}:${cursor || 'start'}`;

  // Try KV cache first
  if (!noCache) {
    const cached = await env.CACHE.get(cacheKey, 'json');
    if (cached) {
      return json({ ...cached, cached: true });
    }
  }

  // List from R2 with prefix
  const prefix = album === 'default' ? 'photos/' : `albums/${album}/`;
  const listed = await env.MEDIA.list({ prefix, limit, cursor });

  const photos = listed.objects.map(obj => ({
    key:          obj.key,
    url:          `/media/photos/${obj.key}`,
    size:         obj.size,
    uploaded:     obj.uploaded,
    httpEtag:     obj.httpEtag,
    customMetadata: obj.customMetadata || {},
  }));

  const result = {
    photos,
    count:     photos.length,
    truncated: listed.truncated,
    cursor:    listed.cursor || null,
    album,
  };

  // Store in KV cache
  await env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL });

  return json(result);
}

// ── Serve single photo from R2 ────────────────────────────────

async function serveSinglePhoto(key, env) {
  const object = await env.MEDIA.get(key);
  if (!object) {
    return new Response(JSON.stringify({ error: 'Photo not found', key }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const contentType = object.httpMetadata?.contentType || 'image/jpeg';
  return new Response(object.body, {
    headers: {
      'Content-Type':  contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'ETag':          object.httpEtag,
    },
  });
}

// ── Upload photo to R2 ────────────────────────────────────────

async function uploadPhoto(request, env, ctx) {
  const contentType = request.headers.get('Content-Type') || '';
  const album       = request.headers.get('X-Album') || 'default';
  const filename    = request.headers.get('X-Filename') || `${Date.now()}.jpg`;

  if (!contentType.startsWith('image/')) {
    return json({ error: 'Only image uploads supported' }, 400);
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_UPLOAD) {
    return json({ error: `File exceeds ${env.MAX_UPLOAD_MB || 25}MB limit` }, 413);
  }

  // Build R2 key: photos/<album>/<timestamp>-<filename>
  const prefix = album === 'default' ? 'photos' : `albums/${album}`;
  const key    = `${prefix}/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  await env.MEDIA.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: { album, originalName: filename, uploadedAt: new Date().toISOString() },
  });

  // Write metadata to D1
  await env.DB.prepare(
    'INSERT INTO photo_metadata (key, album, filename, size_bytes, content_type, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(key, album, filename, body.byteLength, contentType, new Date().toISOString()).run();

  // Invalidate KV cache for this album
  ctx.waitUntil(invalidatePhotoCache(album, env));

  // Enqueue thumbnail generation
  ctx.waitUntil(env.JOBS.send({ type: 'generate_thumbnail', key, album }));

  return json({ key, url: `/media/photos/${key}`, size: body.byteLength }, 201);
}

// ── Delete photo ──────────────────────────────────────────────

async function deletePhoto(key, env) {
  await env.MEDIA.delete(key);
  await env.DB.prepare('DELETE FROM photo_metadata WHERE key = ?').bind(key).run();
  return json({ deleted: true, key });
}

// ── Enqueue processing job ────────────────────────────────────

async function enqueueProcessing(key, env) {
  await env.JOBS.send({ type: 'process_photo', key, ts: Date.now() });
  return json({ queued: true, key });
}

// ── Helpers ───────────────────────────────────────────────────

async function invalidatePhotoCache(album, env) {
  const prefix = `${CACHE_KEY}:${album}:`;
  // KV doesn't support prefix delete; we delete the most common variants
  const keys = await env.CACHE.list({ prefix });
  await Promise.all((keys.keys || []).map(k => env.CACHE.delete(k.name)));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
