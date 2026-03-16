// ============================================================
// /api/chores-reset-my-household.js — Manual chore reset
//
// BUGS FIXED (deep audit):
//
// BUG 1 — encodeURIComponent double-encoded the ilike % wildcard.
//   Fix: manually un-encode %25 → % after encodeURIComponent.
//
// BUG 2 — Prefer:return=representation on 0-row PATCH returns HTTP 200.
//   Fix: Prefer:return=minimal (204) + count=exact for row count.
//
// BUG 3 — Membership lookup queried household_members by `email` column
//   that does not exist in that table. The user's email lives in auth.users;
//   household_members stores user_id (UUID).
//   Fix: resolve user id from /auth/v1/user, then query by user_id.
//
// BUG 5 — status=in.(done,skipped) misses stuck chores.
//   Fix: status=neq.pending.
// ============================================================

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

    const SB_URL = process.env.SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SB_URL || !SB_KEY) {
      return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
    }

    const auth  = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Bearer token' });

    const tz    = (req.body?.tz) ? String(req.body.tz) : (process.env.HOMEHUB_TZ || 'America/New_York');
    const force = !!(req.body?.force);

    // ── 1) Resolve user id from session token ──────────────────────────────
    const userResp = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` }
    });
    if (!userResp.ok) {
      return res.status(401).json({ error: 'Invalid session', detail: (await userResp.text()).slice(0, 200) });
    }
    const user = await userResp.json();
    if (!user?.id) return res.status(401).json({ error: 'No user id in session' });

    // ── 2) Resolve household — query by user_id (NOT email) ───────────────
    // BUG 3 FIX: household_members has user_id UUID, not an email column.
    const memResp = await fetch(
      `${SB_URL}/rest/v1/household_members?select=household_id,role&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!memResp.ok) {
      const detail = await memResp.text().catch(() => '');
      return res.status(500).json({ error: 'Membership lookup failed', detail: detail.slice(0, 200) });
    }
    const members = await memResp.json();
    const mem     = members?.[0];
    if (!mem?.household_id) {
      return res.status(403).json({ error: 'No household membership found for this user' });
    }
    const householdId = mem.household_id;

    // ── 3) Date + day-of-week in the correct timezone ──────────────────────
    const now        = new Date();
    const today      = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
    const wkShort    = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
    const wkMap      = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow        = wkMap[wkShort] ?? now.getDay();
    const dayNames   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayName    = dayNames[dow];

    // ── 4) Idempotency check ────────────────────────────────────────────────
    if (!force) {
      try {
        const hhResp = await fetch(
          `${SB_URL}/rest/v1/households?select=last_chore_reset_date&id=eq.${householdId}&limit=1`,
          { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
        );
        if (hhResp.ok) {
          const hh = (await hhResp.json())?.[0] || {};
          if (hh.last_chore_reset_date === today) {
            return res.status(200).json({ ok: true, didReset: false, reason: 'already_reset_today', today, tz });
          }
        }
        // If column missing or query fails, proceed anyway
      } catch (_) { /* skip idempotency, still reset */ }
    }

    // ── 5) Build smart OR filter — un-encoded % for ilike ─────────────────
    // BUG 1 FIX: encodeURIComponent('%') → '%25' breaks PostgREST ilike wildcards.
    const raw       = `(category.eq.Daily,day_of_week.eq.${dow},category.ilike.${dayName}%)`;
    const orFilter  = encodeURIComponent(raw).replace(/%25/g, '%');

    const patchHeaders = {
      apikey:         SB_KEY,
      Authorization:  `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'count=exact',        // BUG 2 FIX: lets us detect 0-row matches
    };
    const resetBody = { status: 'pending', completed_by_name: null };
    const log       = [];
    let resetOk     = false;
    let rowsUpdated = 0;

    // ── 5a) Smart reset ─────────────────────────────────────────────────────
    // BUG 5 FIX: status=neq.pending catches any stuck non-pending state.
    try {
      const patchResp = await fetch(
        `${SB_URL}/rest/v1/chores?household_id=eq.${householdId}&status=neq.pending&or=${orFilter}`,
        { method: 'PATCH', headers: patchHeaders, body: JSON.stringify(resetBody) }
      );
      if (patchResp.ok) {
        const cr    = patchResp.headers.get('content-range') || '';
        const match = cr.match(/\/(\d+)$/);
        rowsUpdated = match ? parseInt(match[1], 10) : 0;
        resetOk     = true;
        log.push(`smart reset (${rowsUpdated} rows)`);
      } else {
        const t = await patchResp.text().catch(() => '');
        log.push(`smart reset HTTP ${patchResp.status}: ${t.slice(0, 150)}`);
      }
    } catch (e) {
      log.push('smart reset exception: ' + e.message);
    }

    // ── 5b) Blanket fallback ────────────────────────────────────────────────
    if (!resetOk) {
      try {
        const blankResp = await fetch(
          `${SB_URL}/rest/v1/chores?household_id=eq.${householdId}&status=neq.pending`,
          { method: 'PATCH', headers: patchHeaders, body: JSON.stringify({ status: 'pending' }) }
        );
        if (blankResp.ok) {
          const cr    = blankResp.headers.get('content-range') || '';
          const match = cr.match(/\/(\d+)$/);
          rowsUpdated = match ? parseInt(match[1], 10) : 0;
          resetOk     = true;
          log.push(`blanket reset (${rowsUpdated} rows)`);
        } else {
          const t = await blankResp.text().catch(() => '');
          log.push(`blanket reset failed HTTP ${blankResp.status}: ${t.slice(0, 150)}`);
        }
      } catch (e) {
        log.push('blanket reset exception: ' + e.message);
      }
    }

    if (!resetOk) {
      return res.status(500).json({ error: 'All reset attempts failed', log });
    }

    // ── 6) Stamp reset date ─────────────────────────────────────────────────
    try {
      await fetch(`${SB_URL}/rest/v1/households?id=eq.${householdId}`, {
        method: 'PATCH',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
                   'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ last_chore_reset_date: today })
      });
    } catch (e) {
      log.push('household date update failed (non-critical): ' + e.message);
    }

    return res.status(200).json({ ok: true, didReset: true, today, tz, dow, dayName, householdId, rowsUpdated, log });

  } catch (e) {
    console.error('[ResetMyHousehold] error:', e);
    return res.status(500).json({ error: 'Reset failed', detail: e?.message });
  }
}
