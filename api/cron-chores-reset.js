// ============================================================
// /api/cron-chores-reset.js  (v2)
// Called hourly by Vercel Cron. Idempotent per-household reset.
// Refactored:
//   - No esm.sh import — pure fetch REST
//   - America/New_York timezone-robust via Intl.DateTimeFormat
//   - Resets done + skipped → pending
//   - Clears completed_by_name / completer_email
//   - Supports weekly chores by category NAME when day_of_week is null
// ============================================================

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!SB_URL || !SB_KEY) {
    const missing = [];
    if (!SB_URL) missing.push('SUPABASE_URL');
    if (!SB_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Missing env vars', missing });
  }

  // ── Timezone-safe date helpers ─────────────────────────
  const TZ  = 'America/New_York';
  const now = new Date();

  // "2025-12-31" in Eastern time
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);

  // Day-of-week 0=Sun..6=Sat in Eastern time
  const wkShort  = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
  const wkMap    = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow      = wkMap[wkShort] ?? now.getDay();
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayName  = dayNames[dow]; // e.g. "Monday"

  console.log(`[Cron] date=${today} dow=${dow} (${dayName}) tz=${TZ}`);

  // ── Helper: Supabase REST fetch ────────────────────────
  async function sbFetch(path, method = 'GET', body) {
    const opts = {
      method,
      headers: {
        apikey:         SB_KEY,
        Authorization:  `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=representation'
      }
    };
    if (body != null) opts.body = JSON.stringify(body);
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, opts);
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`${method} /rest/v1/${path} → HTTP ${r.status}: ${t.slice(0,200)}`);
    }
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? r.json() : null;
  }

  // ── 1) Fetch households that haven't reset today ──────
  const hhPath = `households?select=id,name,last_chore_reset_date`
    + `&or=(last_chore_reset_date.is.null,last_chore_reset_date.neq.${today})`;
  let households;
  try {
    households = await sbFetch(hhPath);
  } catch (e) {
    console.error('[Cron] Households fetch failed:', e.message);
    return res.status(500).json({ error: 'DB error', details: e.message });
  }

  if (!households?.length) {
    return res.status(200).json({ message: 'No households need reset', date: today, processed: 0 });
  }

  console.log(`[Cron] ${households.length} household(s) to process`);

  const results = [];

  for (const hh of households) {
    try {
      // ── 2) Reset chores for this household ────────────
      //  Match if:
      //    a) category = 'Daily'   (always)
      //    b) day_of_week = dow    (numeric match)
      //    c) category starts with day name (e.g. "Monday (Kitchen)")
      //  AND status is done or skipped
      //  PATCH: set status=pending, clear completer fields
      const choreFilter = `household_id=eq.${hh.id}`
        + `&status=in.(done,skipped)`
        + `&or=(category.eq.Daily,day_of_week.eq.${dow},category.ilike.${encodeURIComponent(dayName + '%')})`;

      await sbFetch(`chores?${choreFilter}`, 'PATCH', {
        status:             'pending',
        completed_by_name:  null,
        completer_email:    null
      });

      // ── 3) Mark household reset date ─────────────────
      await sbFetch(`households?id=eq.${hh.id}`, 'PATCH', {
        last_chore_reset_date: today
      });

      // ── 4) Log it ─────────────────────────────────────
      try {
        await sbFetch('system_logs', 'POST', {
          source:  'cron',
          service: 'chore-reset',
          status:  'ok',
          message: `Auto-reset ${hh.name} on ${today} (${dayName})`
        });
      } catch (logErr) {
        console.warn('[Cron] Log insert failed (non-critical):', logErr.message);
      }

      console.log(`[Cron] ✓ Reset chores for ${hh.name}`);
      results.push({ household: hh.name, success: true, date: today });

    } catch (err) {
      console.error(`[Cron] ✗ ${hh.name}:`, err.message);
      results.push({ household: hh.name, success: false, error: err.message });
    }
  }

  return res.status(200).json({
    message:    `Processed ${households.length} household(s)`,
    date:       today,
    dayOfWeek:  dow,
    dayName,
    processed:  results.filter(r => r.success).length,
    results
  });
}
