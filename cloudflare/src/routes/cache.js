// cloudflare/src/routes/cache.js — KV cache + feature flags API
// GET    /cache/:key           — read a value
// PUT    /cache/:key           — write (auth required)
// DELETE /cache/:key           — delete (auth required)

export async function handleCache(request, env, url) {
  const key = url.pathname.replace('/cache/', '').trim();
  if (!key) return json({ error: 'Missing key' }, 400);

  if (request.method === 'GET') {
    const val = await env.CACHE.get(key, 'json');
    if (val === null) return json({ found: false, key }, 404);
    return json({ found: true, key, value: val });
  }

  if (request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    const ttl  = parseInt(url.searchParams.get('ttl') || '0') || undefined;
    await env.CACHE.put(key, JSON.stringify(body), ttl ? { expirationTtl: ttl } : undefined);
    return json({ written: true, key });
  }

  if (request.method === 'DELETE') {
    await env.CACHE.delete(key);
    return json({ deleted: true, key });
  }

  return json({ error: 'Method not allowed' }, 405);
}

export async function handleFlags(request, env, url) {
  const flag = url.pathname.replace('/flags', '').replace(/^\//, '').trim();

  if (request.method === 'GET') {
    if (flag) {
      const val = await env.FLAGS.get(flag, 'json');
      return json({ flag, value: val ?? null, enabled: val === true || val?.enabled === true });
    }
    // List all flags
    const list = await env.FLAGS.list();
    const flags = {};
    await Promise.all(
      (list.keys || []).map(async k => {
        flags[k.name] = await env.FLAGS.get(k.name, 'json');
      })
    );
    return json({ flags });
  }

  if (request.method === 'PUT' && flag) {
    const body = await request.json().catch(() => null);
    await env.FLAGS.put(flag, JSON.stringify(body));
    return json({ written: true, flag, value: body });
  }

  return json({ error: 'Method not allowed' }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
