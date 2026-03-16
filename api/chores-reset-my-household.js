// ============================================================
// /api/chores-reset-my-household.js — Manual + auto chore reset
//
// ROOT CAUSE OF 403:
//   The endpoint was using SUPABASE_SERVICE_ROLE_KEY as the Bearer
//   token for REST queries. If that env var is missing/wrong, the
//   token is not a real service-role JWT, RLS kicks in, and
//   auth.jwt()->>'email' returns NULL → household_members returns
//   0 rows → "No household membership found" 403.
//
// FIX:
//   Use the USER'S OWN BEARER TOKEN for household_members SELECT
//   and chores PATCH. The RLS policies are already written to
//   allow this:
//     household_members: email = auth.jwt()->>'email'      ← user's JWT has this
//     chores UPDATE:     household_id IN (user's household) ← also works
//   Only the households stamp needs service role (best-effort, won't
//   break reset if it fails).
//
// OTHER BUGS FIXED:
//   BUG 1 — encodeURIComponent double-encoded ilike % wildcard → %25
//   BUG 2 — Prefer:return=representation on 0-row PATCH returns 200 (silent no-op)
//   BUG 5 — status=in.(done,skipped) misses stuck chores → use neq.pending
// ============================================================

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

    const SB_URL    = process.env.SUPABASE_URL;
    const SB_SVC    = process.env.SUPABASE_SERVICE_ROLE_KEY; // optional — only used for stamp
    const SB_ANON   = process.env.SUPABASE_ANON_KEY;         // fallback apikey

    // We need at minimum the URL and some key for the apikey header
    const SB_APIKEY = SB_ANON || SB_SVC;
    if (!SB_URL || !SB_APIKEY) {
      return res.status(500).json({ error: 'Missing SUPABASE_URL or anon/service key' });
    }

    const auth  = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Bearer token' });

    const tz    = req.body?.tz     ? String(req.body.tz)   : (process.env.HOMEHUB_TZ || 'America/New_York');
    const force = !!(req.body?.force);

    // ── Helper: REST fetch using USER'S token as auth ──────────────────────
    // This is exactly how the Supabase JS client works on the frontend.
    // The user's JWT satisfies all the RLS policies which check auth.jwt()->>'email'.
    async function userFetch(path, method = 'GET', body = null, extraHeaders = {}) {
      const headers = {
        apikey:         SB_APIKEY,   // anon key is fine for apikey header
        Authorization:  `Bearer ${token}`,  // user's JWT for RLS
        'Content-Type': 'application/json',
        ...extraHeaders,
      };
      const opts = { method, headers };
      if (body != null) opts.body = JSON.stringify(body);
      const r = await fetch(`${SB_URL}/rest/v1/${path}`, opts);

      let rowsUpdated = null;
      const cr = r.headers.get('content-range') || '';
      const m  = cr.match(/\/(\d+)$/);
      if (m) rowsUpdated = parseInt(m[1], 10);

      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(`${method} /rest/v1/${path} → HTTP ${r.status}: ${t.slice(0, 200)}`);
      }
      const ct   = r.headers.get('content-type') || '';
      const data = ct.includes('json') ? await r.json() : null;
      return { ok: true, status: r.status, rowsUpdated, data };
    }

    // ── Helper: service-role fetch — only for household stamp ─────────────
    async function svcFetch(path, method = 'GET', body = null) {
      if (!SB_SVC) return { ok: false, status: 0, error: 'no service key' };
      const headers = {
        apikey:         SB_SVC,
        Authorization:  `Bearer ${SB_SVC}`,
        'Content-Type': 'application/json',
        Prefer:         'return=minimal',
      };
      const opts = { method, headers };
      if (body != null) opts.body = JSON.stringify(body);
      const r = await fetch(`${SB_URL}/rest/v1/${path}`, opts);
      return { ok: r.ok, status: r.status };
    }

    // ── 1) Resolve user from their session token ───────────────────────────
    const userResp = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_APIKEY, Authorization: `Bearer ${token}` }
    });
    if (!userResp.ok) {
      return res.status(401).json({ error: 'Invalid session', detail: (await userResp.text()).slice(0, 200) });
    }
    const user = await userResp.json();
    if (!user?.id && !user?.email) {
      return res.status(401).json({ error: 'Could not resolve user from token' });
    }

    // ── 2) Membership lookup using the USER'S token ────────────────────────
    // RLS: household_members SELECT policy = email = auth.jwt()->>'email'
    // The user's JWT has their email → this always returns their own row.
    const memResult = await userFetch('household_members?select=household_id,role&limit=1');
    const mem       = memResult.data?.[0];
    if (!mem?.household_id) {
      // Fallback: try explicit email filter in case RLS is misconfigured
      const fallback = await userFetch(
        `household_members?select=household_id,role&email=eq.${encodeURIComponent(user.email || '')}&limit=1`
      ).catch(() => ({ data: null }));
      const mem2 = fallback.data?.[0];
      if (!mem2?.household_id) {
        return res.status(403).json({
          error:  'No household membership found for this user',
          userId: user.id,
          email:  user.email,
          hint:   'Check that the user\'s email matches a row in household_members'
        });
      }
      Object.assign(mem, mem2);
    }
    const householdId = mem.household_id;

    // ── 3) Timezone + day-of-week ──────────────────────────────────────────
    const now      = new Date();
    const today    = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
    const wkShort  = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
    const wkMap    = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow      = wkMap[wkShort] ?? now.getDay();
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayName  = dayNames[dow];

    // ── 4) Idempotency check ───────────────────────────────────────────────
    if (!force) {
      try {
        const hhResult = await userFetch(`households?select=last_chore_reset_date&id=eq.${householdId}&limit=1`);
        const hh       = hhResult.data?.[0] || {};
        if (hh.last_chore_reset_date === today) {
          return res.status(200).json({ ok: true, didReset: false, reason: 'already_reset_today', today, tz });
        }
      } catch (_) { /* skip idempotency on error, still reset */ }
    }

    // ── 5) Smart OR filter — un-encoded % for ilike wildcard ──────────────
    // BUG 1 FIX: encodeURIComponent('%') → '%25' breaks PostgREST ilike.
    const raw      = `(category.eq.Daily,day_of_week.eq.${dow},category.ilike.${dayName}%)`;
    const orFilter = encodeURIComponent(raw).replace(/%25/g, '%');

    const resetBody    = { status: 'pending', completed_by_name: null };
    const countHeaders = { Prefer: 'count=exact' };  // BUG 2 FIX: detects 0-row matches
    const log          = [];
    let resetOk        = false;
    let rowsUpdated    = 0;

    // ── 5a) Smart reset (Daily + today's weekday category) ────────────────
    // BUG 5 FIX: status=neq.pending catches any stuck non-pending state
    try {
      const r = await userFetch(
        `chores?household_id=eq.${householdId}&status=neq.pending&or=${orFilter}`,
        'PATCH', resetBody, countHeaders
      );
      rowsUpdated = r.rowsUpdated ?? 0;
      resetOk     = true;
      log.push(`smart reset (${rowsUpdated} rows)`);
    } catch (e) {
      log.push('smart reset failed: ' + e.message);
    }

    // ── 5b) Blanket fallback ───────────────────────────────────────────────
    if (!resetOk) {
      try {
        const r = await userFetch(
          `chores?household_id=eq.${householdId}&status=neq.pending`,
          'PATCH', { status: 'pending' }, countHeaders
        );
        rowsUpdated = r.rowsUpdated ?? 0;
        resetOk     = true;
        log.push(`blanket reset (${rowsUpdated} rows)`);
      } catch (e) {
        log.push('blanket reset failed: ' + e.message);
      }
    }

    if (!resetOk) {
      return res.status(500).json({ error: 'All reset attempts failed', log });
    }

    // ── 6) Stamp reset date (service role, best-effort) ───────────────────
    // households has no UPDATE RLS policy so we need service role.
    // If service role key isn't set, we skip silently — the reset still happened.
    try {
      await svcFetch(`households?id=eq.${householdId}`, 'PATCH', { last_chore_reset_date: today });
    } catch (e) {
      log.push('household stamp skipped (non-critical): ' + e.message);
    }

    return res.status(200).json({ ok: true, didReset: true, today, tz, dow, dayName, householdId, rowsUpdated, log });

  } catch (e) {
    console.error('[ResetMyHousehold] error:', e);
    return res.status(500).json({ error: 'Reset failed', detail: e?.message });
  }
}
