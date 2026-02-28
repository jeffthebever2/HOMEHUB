// ============================================================
// /api/chores-reset-my-household.js — Manual chore reset (v3)
//
// Column-resilient: works even if optional columns
// (last_chore_reset_date, completed_by_name, completer_email,
//  category, day_of_week) are missing from the schema.
// ============================================================

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const SB_URL = process.env.SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SB_URL || !SB_KEY) {
      return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
    }

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
    if (!token) return res.status(401).json({ error: 'Missing Bearer token' });

    const tz = (req.body && req.body.tz) ? String(req.body.tz) : (process.env.HOMEHUB_TZ || 'America/New_York');

    // 1) Resolve user
    const userResp = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` }
    });
    if (!userResp.ok) {
      return res.status(401).json({ error: 'Invalid session', detail: (await userResp.text()).slice(0, 200) });
    }
    const user = await userResp.json();
    if (!user?.email) return res.status(401).json({ error: 'No email in session' });

    // 2) Confirm household membership
    const memResp = await fetch(
      `${SB_URL}/rest/v1/household_members?select=household_id,role&email=eq.${encodeURIComponent(user.email)}&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!memResp.ok) {
      return res.status(500).json({ error: 'Membership lookup failed' });
    }
    const mem = (await memResp.json())[0];
    if (!mem?.household_id) return res.status(403).json({ error: 'No household membership' });
    const householdId = mem.household_id;

    // 3) Compute today + day-of-week in timezone
    const now = new Date();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const weekdayShort = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
    const wkMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = wkMap[weekdayShort] ?? now.getDay();
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayName = dayNames[dow];

    // 4) Idempotency check (skip if column doesn't exist)
    const force = !!(req.body && req.body.force);
    let skipIdempotency = force;

    if (!skipIdempotency) {
      try {
        const hhResp = await fetch(
          `${SB_URL}/rest/v1/households?select=last_chore_reset_date&id=eq.${householdId}&limit=1`,
          { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
        );
        if (hhResp.ok) {
          const hh = (await hhResp.json())[0] || {};
          if (hh.last_chore_reset_date === today) {
            return res.status(200).json({ ok: true, didReset: false, reason: 'already_reset_today', today, tz });
          }
        } else {
          // Column likely doesn't exist — skip idempotency, still reset
          console.warn('[Reset] Household query returned', hhResp.status, '— skipping idempotency');
          skipIdempotency = true;
        }
      } catch (e) {
        console.warn('[Reset] Idempotency check failed:', e.message, '— proceeding with reset');
        skipIdempotency = true;
      }
    }

    // 5) Reset chores — try smart filter first, fallback to blanket reset
    let resetOk = false;
    const resetBody = { status: 'pending', completed_by_name: null };
    const log = [];

    // 5a) Try category/day_of_week aware reset
    try {
      const or = encodeURIComponent(`(category.eq.Daily,day_of_week.eq.${dow},category.ilike.${dayName}%)`);
      const patchResp = await fetch(
        `${SB_URL}/rest/v1/chores?household_id=eq.${householdId}&status=in.(done,skipped)&or=${or}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
            'Content-Type': 'application/json', Prefer: 'return=minimal'
          },
          body: JSON.stringify(resetBody)
        }
      );
      if (patchResp.ok) {
        resetOk = true;
        log.push('Smart reset succeeded');
      } else {
        const t = await patchResp.text();
        log.push(`Smart reset HTTP ${patchResp.status}: ${t.slice(0, 150)}`);
        // If it fails (missing columns), try blanket reset
      }
    } catch (e) {
      log.push('Smart reset exception: ' + e.message);
    }

    // 5b) Fallback: blanket reset all done/skipped chores
    if (!resetOk) {
      try {
        const blankResp = await fetch(
          `${SB_URL}/rest/v1/chores?household_id=eq.${householdId}&status=in.(done,skipped)`,
          {
            method: 'PATCH',
            headers: {
              apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
              'Content-Type': 'application/json', Prefer: 'return=minimal'
            },
            body: JSON.stringify({ status: 'pending' })
          }
        );
        if (blankResp.ok) {
          resetOk = true;
          log.push('Blanket reset succeeded');
        } else {
          const t = await blankResp.text();
          log.push(`Blanket reset failed HTTP ${blankResp.status}: ${t.slice(0, 150)}`);
        }
      } catch (e) {
        log.push('Blanket reset exception: ' + e.message);
      }
    }

    if (!resetOk) {
      return res.status(500).json({ error: 'All reset attempts failed', log });
    }

    // 6) Update household reset date (best-effort)
    try {
      await fetch(`${SB_URL}/rest/v1/households?id=eq.${householdId}`, {
        method: 'PATCH',
        headers: {
          apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify({ last_chore_reset_date: today })
      });
    } catch (e) {
      log.push('Household date update failed (non-critical): ' + e.message);
    }

    return res.status(200).json({
      ok: true, didReset: true, today, tz, dow, dayName, householdId, log
    });

  } catch (e) {
    console.error('[ResetMyHousehold] error:', e);
    return res.status(500).json({ error: 'Reset failed', detail: e?.message });
  }
}
