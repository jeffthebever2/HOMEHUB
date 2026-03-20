// cloudflare/src/cron.js — Cron trigger handler
//
// Cron schedule (defined in wrangler.toml):
//   "0 5 * * *"    — 5am UTC daily
//   "0 * * * *"    — every hour
//   "*/15 * * * *" — every 15 minutes

export async function handleCron(cron, env) {
  console.log('[Cron]', cron, 'fired at', new Date().toISOString());

  try {
    if (cron === '0 5 * * *') {
      await dailyMaintenance(env);
    } else if (cron === '0 * * * *') {
      await hourlyRefresh(env);
    } else if (cron === '*/15 * * * *') {
      await quarterlyCheck(env);
    }
  } catch (e) {
    console.error('[Cron] Error:', e.message);
    // Log to D1
    await env.DB?.prepare(
      'INSERT INTO event_log (source, service, status, message, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind('cron', cron, 'error', e.message, new Date().toISOString()).run().catch(() => {});
  }
}

async function dailyMaintenance(env) {
  // 1. Purge stale photo list caches
  await env.JOBS.send({ type: 'purge_cache', prefix: 'photo_list:' });

  // 2. Sync R2 → D1 metadata (catch any missing rows)
  await env.JOBS.send({ type: 'sync_metadata' });

  // 3. Trim old D1 event_log rows (keep 30 days)
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  await env.DB.prepare('DELETE FROM event_log WHERE created_at < ?').bind(cutoff).run();

  // 4. Store last-successful-maintenance timestamp in KV
  await env.CACHE.put('last_maintenance', new Date().toISOString(), { expirationTtl: 86400 * 7 });

  console.log('[Cron] Daily maintenance complete');
}

async function hourlyRefresh(env) {
  // Refresh feature flags from KV into CACHE for fast reads
  const flags = await env.FLAGS.list();
  const snapshot = {};
  await Promise.all(
    (flags.keys || []).map(async k => {
      snapshot[k.name] = await env.FLAGS.get(k.name, 'json');
    })
  );
  await env.CACHE.put('flags_snapshot', JSON.stringify(snapshot), { expirationTtl: 7200 });

  console.log(`[Cron] Hourly refresh — ${Object.keys(snapshot).length} flags cached`);
}

async function quarterlyCheck(env) {
  // Lightweight health ping — writes a heartbeat to KV
  await env.CACHE.put('worker_heartbeat', new Date().toISOString(), { expirationTtl: 1800 });
}
