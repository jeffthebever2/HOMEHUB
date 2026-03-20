// ============================================================
// cloudflare/src/index.js — HomeHub Cloudflare Worker entry point
//
// Routes:
//   /media/photos          GET  — list photos from R2
//   /media/photos/:key     GET  — serve a single photo from R2
//   /media/upload          POST — upload photo to R2 (auth required)
//   /media/delete/:key     DELETE — remove photo (auth required)
//   /cache/:key            GET/PUT/DELETE — KV cache operations
//   /flags                 GET  — feature flags from KV
//   /flags/:flag           GET/PUT — single feature flag
//   /logs                  POST — write event to D1
//   /logs/query            POST — query D1 logs (admin only)
//   /health                GET  — service health check
//
// All config via wrangler.toml bindings — nothing hardcoded.
// Secrets (TURNSTILE_SECRET, UPLOAD_TOKEN) set via wrangler secret.
// ============================================================

import { handlePhotos }  from './routes/photos.js';
import { handleCache }   from './routes/cache.js';
import { handleFlags }   from './routes/flags.js';
import { handleLogs }    from './routes/logs.js';
import { handleCron }    from './cron.js';
import { processQueue }  from './queues/processor.js';
import { cors, authGuard, turnstileGuard } from './middleware.js';

export default {
  // ── HTTP request handler ──────────────────────────────────
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }), env);
    }

    try {
      let response;

      // ── Route dispatch ──────────────────────────────────────
      if (path === '/health') {
        response = await handleHealth(env);

      } else if (path.startsWith('/media/')) {
        response = await handlePhotos(request, env, ctx);

      } else if (path.startsWith('/cache/')) {
        // Cache reads are public; writes require auth
        if (method !== 'GET') await authGuard(request, env);
        response = await handleCache(request, env, url);

      } else if (path.startsWith('/flags')) {
        // Flag reads are public; writes require auth
        if (method !== 'GET') await authGuard(request, env);
        response = await handleFlags(request, env, url);

      } else if (path.startsWith('/logs')) {
        response = await handleLogs(request, env, url);

      } else {
        response = new Response(JSON.stringify({ error: 'Not found', path }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return cors(response, env);

    } catch (e) {
      const status = e.status || 500;
      return cors(
        new Response(JSON.stringify({ error: e.message || 'Internal error' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
        env
      );
    }
  },

  // ── Queue consumer ────────────────────────────────────────
  async queue(batch, env) {
    await processQueue(batch, env);
  },

  // ── Cron handler ──────────────────────────────────────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleCron(event.cron, env));
  },
};

async function handleHealth(env) {
  const checks = {};

  // Check R2
  try {
    await env.MEDIA.list({ limit: 1 });
    checks.r2 = 'ok';
  } catch (e) { checks.r2 = 'error: ' + e.message; }

  // Check D1
  try {
    await env.DB.prepare('SELECT 1').first();
    checks.d1 = 'ok';
  } catch (e) { checks.d1 = 'error: ' + e.message; }

  // Check KV
  try {
    await env.CACHE.put('__health__', '1', { expirationTtl: 10 });
    checks.kv_cache = 'ok';
  } catch (e) { checks.kv_cache = 'error: ' + e.message; }

  const allOk = Object.values(checks).every(v => v === 'ok');
  return new Response(
    JSON.stringify({ status: allOk ? 'ok' : 'degraded', checks, ts: new Date().toISOString() }),
    { status: allOk ? 200 : 207, headers: { 'Content-Type': 'application/json' } }
  );
}
