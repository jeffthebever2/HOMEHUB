// ============================================================
// cloudflare/src/index.js — HomeHub Cloudflare Worker
//
// R2 photo API only. No queues, no cron, no D1, no KV.
//
// Routes:
//   GET    /media/photos        — list photos from R2
//   GET    /media/photos/:key   — serve a single photo from R2
//   POST   /media/upload        — upload photo (X-Upload-Token required)
//   DELETE /media/delete/:key   — delete photo (X-Upload-Token required)
//   GET    /health              — R2 reachability check
//
// Bindings (wrangler.toml):
//   MEDIA — R2 bucket
//
// Secrets (npx wrangler secret put UPLOAD_TOKEN):
//   UPLOAD_TOKEN — authorizes upload and delete requests
// ============================================================

import { handlePhotos } from './routes/photos.js';
import { cors }         from './middleware.js';

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const method = request.method;

    if (method === 'OPTIONS') return cors(new Response(null, { status: 204 }), request, env);

    try {
      let response;

      if (url.pathname === '/health') {
        response = await handleHealth(env);
      } else if (url.pathname.startsWith('/media/')) {
        response = await handlePhotos(request, env);
      } else {
        response = new Response(
          JSON.stringify({ error: 'Not found', path: url.pathname }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return cors(response, request, env);
    } catch (e) {
      return cors(
        new Response(JSON.stringify({ error: e.message || 'Internal error' }), {
          status: e.status || 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        request,
        env
      );
    }
  },
};

async function handleHealth(env) {
  let r2 = 'ok';
  try { await env.MEDIA.list({ limit: 1 }); }
  catch (e) { r2 = 'error: ' + e.message; }
  return new Response(
    JSON.stringify({ status: r2 === 'ok' ? 'ok' : 'degraded', r2, ts: new Date().toISOString() }),
    { status: r2 === 'ok' ? 200 : 207, headers: { 'Content-Type': 'application/json' } }
  );
}
