// cloudflare/src/routes/logs.js — D1 event log API
// POST /logs       — write a log event
// POST /logs/query — query log events (auth required)

import { authGuard } from '../middleware.js';

export async function handleLogs(request, env, url) {
  if (request.method === 'POST' && url.pathname === '/logs') {
    return writeLog(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/logs/query') {
    await authGuard(request, env);
    return queryLogs(request, env);
  }
  return json({ error: 'Not found' }, 404);
}

async function writeLog(request, env) {
  const body = await request.json().catch(() => ({}));
  const { source = 'client', service, status = 'ok', message, latency_ms } = body;

  if (!service) return json({ error: 'Missing service' }, 400);

  await env.DB.prepare(
    'INSERT INTO event_log (source, service, status, message, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(source, service, status, message || null, latency_ms || null, new Date().toISOString()).run();

  return json({ logged: true });
}

async function queryLogs(request, env) {
  const { service, status, since, limit = 100 } = await request.json().catch(() => ({}));

  let q    = 'SELECT * FROM event_log WHERE 1=1';
  const b  = [];
  if (service) { q += ' AND service = ?'; b.push(service); }
  if (status)  { q += ' AND status = ?';  b.push(status); }
  if (since)   { q += ' AND created_at >= ?'; b.push(since); }
  q += ` ORDER BY created_at DESC LIMIT ${Math.min(parseInt(limit), 500)}`;

  const result = await env.DB.prepare(q).bind(...b).all();
  return json({ logs: result.results, count: result.results.length });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
