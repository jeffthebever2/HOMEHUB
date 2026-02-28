// ============================================================
// /api/cron-chores-reset.js  (v3 — column-resilient)
//
// Called hourly by Vercel Cron. Idempotent per-household reset.
// NEVER stops on one household error — processes all, reports summary.
// Works even if optional columns (last_chore_reset_date,
// completed_by_name, category, day_of_week) are missing.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }

  const TZ  = process.env.HOMEHUB_TZ || 'America/New_York';
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
  const wkShort  = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
  const wkMap    = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow      = wkMap[wkShort] ?? now.getDay();
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayName  = dayNames[dow];

  console.log(`[Cron] date=${today} dow=${dow} (${dayName}) tz=${TZ}`);

  // ── Helper: Supabase REST fetch ────────────────────────────
  async function sbFetch(path, method, body) {
    const opts = {
      method: method || 'GET',
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
      throw new Error(`${method || 'GET'} /rest/v1/${path} → HTTP ${r.status}: ${t.slice(0,200)}`);
    }
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? r.json() : null;
  }

  // ── 1) Fetch all households ────────────────────────────────
  // Try with last_chore_reset_date filter; fall back to all households
  let households;
  let hasResetColumn = true;

  try {
    const hhPath = `households?select=id,name,last_chore_reset_date`
      + `&or=(last_chore_reset_date.is.null,last_chore_reset_date.neq.${today})`;
    households = await sbFetch(hhPath);
  } catch (e) {
    console.warn('[Cron] Filtered household query failed:', e.message, '— trying all households');
    hasResetColumn = false;
    try {
      households = await sbFetch('households?select=id,name');
    } catch (e2) {
      console.error('[Cron] Households fetch failed completely:', e2.message);
      return res.status(500).json({ error: 'Cannot fetch households', detail: e2.message });
    }
  }

  if (!households?.length) {
    return res.status(200).json({
      message: 'No households need reset',
      date: today,
      householdsProcessed: 0,
      householdsReset: 0,
      errors: []
    });
  }

  console.log(`[Cron] ${households.length} household(s) to process`);

  const results = [];

  for (const hh of households) {
    const hhLog = [];
    try {
      // ── 2) Reset chores — smart filter first, then blanket fallback ──
      let resetOk = false;
      const resetBody = { status: 'pending', completed_by_name: null };

      // 2a) Smart reset: category/day_of_week aware
      try {
        const or = encodeURIComponent(`(category.eq.Daily,day_of_week.eq.${dow},category.ilike.${dayName}%)`);
        const choreFilter = `chores?household_id=eq.${hh.id}&status=in.(done,skipped)&or=${or}`;
        await sbFetch(choreFilter, 'PATCH', resetBody);
        resetOk = true;
        hhLog.push('smart reset');
      } catch (smartErr) {
        hhLog.push('smart reset failed: ' + smartErr.message);
      }

      // 2b) Fallback: blanket reset
      if (!resetOk) {
        try {
          await sbFetch(
            `chores?household_id=eq.${hh.id}&status=in.(done,skipped)`,
            'PATCH',
            { status: 'pending' }
          );
          resetOk = true;
          hhLog.push('blanket reset');
        } catch (blankErr) {
          hhLog.push('blanket reset failed: ' + blankErr.message);
        }
      }

      if (!resetOk) {
        throw new Error('All reset strategies failed');
      }

      // ── 3) Mark household reset date (best-effort) ──────────
      if (hasResetColumn) {
        try {
          await sbFetch(`households?id=eq.${hh.id}`, 'PATCH', { last_chore_reset_date: today });
        } catch (e) {
          hhLog.push('date update skipped: ' + e.message);
        }
      }

      // ── 4) Log it (best-effort) ────────────────────────────
      try {
        await sbFetch('system_logs', 'POST', {
          source: 'cron', service: 'chore-reset', status: 'ok',
          message: `Reset ${hh.name} on ${today} (${dayName}) [${hhLog.join(', ')}]`
        });
      } catch (logErr) {
        // Non-critical
      }

      console.log(`[Cron] ✓ ${hh.name}: ${hhLog.join(', ')}`);
      results.push({ household: hh.name, success: true, strategy: hhLog });

    } catch (err) {
      console.error(`[Cron] ✗ ${hh.name}:`, err.message);
      results.push({ household: hh.name, success: false, error: err.message, log: hhLog });
    }
  }

  return res.status(200).json({
    message:            `Processed ${households.length} household(s)`,
    date:               today,
    dayOfWeek:          dow,
    dayName,
    householdsProcessed: households.length,
    householdsReset:     results.filter(r => r.success).length,
    errors:              results.filter(r => !r.success),
    results
  });
}
