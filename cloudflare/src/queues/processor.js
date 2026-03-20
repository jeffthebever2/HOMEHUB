// cloudflare/src/queues/processor.js — Queue consumer
//
// Handles background jobs sent to the homehub-jobs queue.
// Job types:
//   generate_thumbnail — resize photo from R2, store back to R2
//   process_photo      — run any post-upload processing
//   notify_push        — send Web Push notification
//   purge_cache        — delete stale KV cache entries
//   sync_metadata      — rebuild D1 metadata from R2 list (recovery)

export async function processQueue(batch, env) {
  for (const message of batch.messages) {
    try {
      await processJob(message.body, env);
      message.ack();
    } catch (e) {
      console.error('[Queue]', message.body?.type, 'failed:', e.message);
      // Retry up to max_retries (set in wrangler.toml); then goes to DLQ
      message.retry();
    }
  }
}

async function processJob(job, env) {
  console.log('[Queue] Processing:', job.type, job.key || '');

  switch (job.type) {
    case 'generate_thumbnail':
      await generateThumbnail(job, env);
      break;

    case 'process_photo':
      await processPhoto(job, env);
      break;

    case 'purge_cache':
      await purgeCache(job, env);
      break;

    case 'sync_metadata':
      await syncMetadata(job, env);
      break;

    default:
      console.warn('[Queue] Unknown job type:', job.type);
  }
}

// ── Job implementations ───────────────────────────────────────

async function generateThumbnail(job, env) {
  // Retrieve original from R2
  const obj = await env.MEDIA.get(job.key);
  if (!obj) { console.warn('[Queue] Object not found for thumbnail:', job.key); return; }

  // Use Cloudflare Images transform (requires Images product)
  // For now, store a flag in KV that thumbnail is pending
  // This is where you'd integrate @cloudflare/images or Sharp via Wasm
  const thumbKey = job.key.replace(/^(photos|albums)\//, 'thumbs/');
  await env.CACHE.put(`thumb_status:${job.key}`, JSON.stringify({
    status:    'pending',
    sourceKey: job.key,
    thumbKey,
    queued_at: new Date().toISOString(),
  }), { expirationTtl: 86400 });

  // Update D1
  await env.DB.prepare(
    'UPDATE photo_metadata SET thumb_key = ?, thumb_status = ? WHERE key = ?'
  ).bind(thumbKey, 'pending', job.key).run();
}

async function processPhoto(job, env) {
  // Update last-processed timestamp in D1
  await env.DB.prepare(
    'UPDATE photo_metadata SET processed_at = ? WHERE key = ?'
  ).bind(new Date().toISOString(), job.key).run();

  // Clear the photo list cache so the next list request picks up the new photo
  const listed = await env.CACHE.list({ prefix: 'photo_list:' });
  await Promise.all((listed.keys || []).map(k => env.CACHE.delete(k.name)));
}

async function purgeCache(job, env) {
  const prefix = job.prefix || '';
  const listed = await env.CACHE.list({ prefix });
  const deletions = (listed.keys || []).map(k => env.CACHE.delete(k.name));
  await Promise.all(deletions);
  console.log(`[Queue] Purged ${deletions.length} cache entries with prefix "${prefix}"`);
}

async function syncMetadata(job, env) {
  // Walk all R2 objects and ensure D1 has a row for each
  let cursor;
  let synced = 0;
  do {
    const listed = await env.MEDIA.list({ prefix: 'photos/', cursor, limit: 100 });
    for (const obj of listed.objects) {
      const existing = await env.DB.prepare(
        'SELECT key FROM photo_metadata WHERE key = ?'
      ).bind(obj.key).first();
      if (!existing) {
        await env.DB.prepare(
          'INSERT INTO photo_metadata (key, album, filename, size_bytes, uploaded_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(
          obj.key,
          obj.customMetadata?.album || 'default',
          obj.key.split('/').pop(),
          obj.size,
          obj.uploaded?.toISOString() || new Date().toISOString()
        ).run();
        synced++;
      }
    }
    cursor = listed.cursor;
  } while (cursor);
  console.log(`[Queue] Sync complete: ${synced} new metadata rows`);
}
