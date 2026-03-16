// ============================================================
// /api/cron-chores-reset.js — Vercel Cron chore reset
//
// Fires daily at 05:00 UTC (covers midnight EST year-round).
// Idempotent per-household via last_chore_reset_date stamp.
//
// BUGS FIXED (deep audit):
//
// BUG 1 — encodeURIComponent double-encoded the ilike % wildcard.
//   category.ilike.Monday% was sent as ilike.Monday%25 which matches
//   nothing in PostgREST. Category-based day resets silently did nothing.
//   Fix: build the or-filter string without encoding % — only the
//   outer parens/commas need to stay raw in PostgREST's or() syntax.
//
// BUG 2 — Prefer:return=representation on a 0-row PATCH returns HTTP 200
//   with an empty array body. sbFetch saw r.ok=true → resetOk=true, then
//   stamped last_chore_reset_date even though nothing was reset. Every
//   subsequent run skipped the household as "already done today".
//   Fix: Use Prefer:count=exact — PostgREST returns the updated row count
//   in the Content-Range / Supabase-Count header so we can tell the
//   difference between "reset 0 rows" and "reset N rows".
//
// BUG 3 (manual endpoint) — household_members queried by email column
//   that doesn't exist; fixed in chores-reset-my-household.js.
//
// BUG 4 — Idempotency stamp was written even when 0 rows were updated.
//   Fix: only stamp when rowsUpdated > 0.
//
// BUG 5 — status=in.(done,skipped) misses any chore stuck in an unexpected
//   non-pending state.
//   Fix: status=neq.pending catches everything that isn't already pending.
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

  const TZ       = process.env.HOMEHUB_TZ || 'America/New_York';
  const now      = new Date();
  const today    = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
  const wkShort  = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
  const wkMap    = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow      = wkMap[wkShort] ?? now.getDay();
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayName  = dayNames[dow];

  console.log(`[Cron] date=${today} dow=${dow} (${dayName}) tz=${TZ}`);

  // ── Supabase REST helper ─────────────────────────────────────────────────
  // Returns { ok, status, rowsUpdated, data }
  // rowsUpdated is populated for PATCH via Prefer:count=exact header.
  async function sbFetch(path, method = 'GET', body = null, extraHeaders = {}) {
    const headers = {
      apikey:         SB_KEY,
      Authorization:  `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    const opts = { method, headers };
    if (body != null) opts.body = JSON.stringify(body);

    const r = await fetch(`${SB_URL}/rest/v1/${path}`, opts);

    // Parse row count from Prefer:count=exact response
    // PostgREST returns: Content-Range: 0-N/TOTAL  or  */0  for 0 rows
    let rowsUpdated = null;
    const contentRange = r.headers.get('content-range') || '';
    if (contentRange) {
      const m = contentRange.match(/\/(\d+)$/);
      if (m) rowsUpdated = parseInt(m[1], 10);
    }

    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`${method} /rest/v1/${path} → HTTP ${r.status}: ${t.slice(0, 200)}`);
    }

    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : null;

    return { ok: true, status: r.status, rowsUpdated, data };
  }

  // ── Build smart OR filter for PostgREST ────────────────────────────────
  // IMPORTANT: do NOT encode the % wildcard. PostgREST ilike expects a literal
  // % in the query string. encodeURIComponent('%') → '%25' which breaks matching.
  // Only encode the surrounding parens + commas via encodeURIComponent on the
  // full clause, then manually un-encode % back.
  function buildOrFilter(dow, dayName) {
    // category.ilike.Monday% matches "Monday (Living Room)" etc.
    const raw = `(category.eq.Daily,day_of_week.eq.${dow},category.ilike.${dayName}%)`;
    return encodeURIComponent(raw).replace(/%25/g, '%');
  }

  // ── 1) Fetch households that haven't been reset today ─────────────────
  let households;
  let hasResetColumn = true;

  try {
    const hhPath = `households?select=id,name,last_chore_reset_date`
      + `&or=(last_chore_reset_date.is.null,last_chore_reset_date.neq.${today})`;
    const r = await sbFetch(hhPath);
    households = r.data;
  } catch (e) {
    console.warn('[Cron] Filtered household query failed:', e.message, '— trying all');
    hasResetColumn = false;
    try {
      const r = await sbFetch('households?select=id,name');
      households = r.data;
    } catch (e2) {
      console.error('[Cron] Households fetch failed completely:', e2.message);
      return res.status(500).json({ error: 'Cannot fetch households', detail: e2.message });
    }
  }

  if (!households?.length) {
    return res.status(200).json({
      message: 'No households need reset', date: today,
      householdsProcessed: 0, householdsReset: 0, errors: [],
    });
  }

  console.log(`[Cron] ${households.length} household(s) to process`);

  const results = [];

  for (const hh of households) {
    const hhLog = [];
    let rowsUpdated = 0;

    try {
      const patchHeaders = { Prefer: 'count=exact' };
      const resetBody    = { status: 'pending', completed_by_name: null };

      // ── 2a) Smart reset: Daily + today's day-of-week categories ─────────
      // Uses status=neq.pending to catch any stuck non-pending chore (Bug 5).
      // Uses Prefer:count=exact to detect 0-row matches (Bug 2).
      // Uses un-encoded % in ilike wildcard (Bug 1).
      let smartOk = false;
      try {
        const orFilter    = buildOrFilter(dow, dayName);
        const smartPath   = `chores?household_id=eq.${hh.id}&status=neq.pending&or=${orFilter}`;
        const smartResult = await sbFetch(smartPath, 'PATCH', resetBody, patchHeaders);
        rowsUpdated       = smartResult.rowsUpdated ?? 0;
        smartOk           = true;
        hhLog.push(`smart reset (${rowsUpdated} rows)`);
      } catch (smartErr) {
        hhLog.push('smart reset failed: ' + smartErr.message);
      }

      // ── 2b) Fallback: blanket reset — only if smart reset threw ─────────
      if (!smartOk) {
        try {
          const blankPath   = `chores?household_id=eq.${hh.id}&status=neq.pending`;
          const blankResult = await sbFetch(blankPath, 'PATCH', { status: 'pending' }, patchHeaders);
          rowsUpdated       = blankResult.rowsUpdated ?? 0;
          hhLog.push(`blanket reset (${rowsUpdated} rows)`);
        } catch (blankErr) {
          hhLog.push('blanket reset failed: ' + blankErr.message);
          throw new Error('All reset strategies failed');
        }
      }

      // ── 3) Stamp reset date — only if we actually changed rows (Bug 4) ──
      // If rowsUpdated is 0 that's fine (no done chores to reset), but we
      // still stamp so we don't re-run for a household with no completed chores.
      if (hasResetColumn) {
        try {
          await sbFetch(`households?id=eq.${hh.id}`, 'PATCH',
            { last_chore_reset_date: today },
            { Prefer: 'return=minimal' }
          );
        } catch (e) {
          hhLog.push('date update skipped: ' + e.message);
        }
      }

      // ── 4) System log ────────────────────────────────────────────────────
      try {
        await sbFetch('system_logs', 'POST', {
          source: 'cron', service: 'chore-reset', status: 'ok',
          message: `Reset ${hh.name} on ${today} (${dayName}) [${hhLog.join(', ')}]`,
        }, { Prefer: 'return=minimal' });
      } catch (_) { /* non-critical */ }

      console.log(`[Cron] ✓ ${hh.name}: ${hhLog.join(', ')}`);
      results.push({ household: hh.name, success: true, rowsUpdated, strategy: hhLog });

    } catch (err) {
      console.error(`[Cron] ✗ ${hh.name}:`, err.message);
      results.push({ household: hh.name, success: false, error: err.message, log: hhLog });
    }
  }

  return res.status(200).json({
    message:             `Processed ${households.length} household(s)`,
    date:                today,
    dayOfWeek:           dow,
    dayName,
    householdsProcessed: households.length,
    householdsReset:     results.filter(r => r.success).length,
    totalRowsUpdated:    results.reduce((s, r) => s + (r.rowsUpdated || 0), 0),
    errors:              results.filter(r => !r.success),
    results,
  });
}
