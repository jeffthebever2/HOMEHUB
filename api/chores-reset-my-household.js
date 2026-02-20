// Client fallback: reset chores for the signed-in user's household (idempotent)
// Requires: Authorization: Bearer <user access token>

export default async function handler(req, res) {
  try {
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

    // 1) Resolve user via Supabase Auth
    const userResp = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${token}`
      }
    });

    if (!userResp.ok) {
      const t = await userResp.text();
      return res.status(401).json({ error: 'Invalid session', detail: t });
    }

    const user = await userResp.json();
    const email = user?.email;
    if (!email) return res.status(401).json({ error: 'No email in session' });

    // 2) Confirm household membership (service role query)
    const memResp = await fetch(`${SB_URL}/rest/v1/household_members?select=household_id,role&email=eq.${encodeURIComponent(email)}&limit=1`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`
      }
    });

    if (!memResp.ok) {
      const t = await memResp.text();
      return res.status(500).json({ error: 'Membership lookup failed', detail: t });
    }

    const mem = (await memResp.json())[0];
    if (!mem?.household_id) return res.status(403).json({ error: 'No household membership' });

    const householdId = mem.household_id;

    // 3) Determine "today" in tz
    const now = new Date();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

    const weekdayShort = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
    const wkMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = wkMap[weekdayShort] ?? now.getDay();
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayName = dayNames[dow];

    // 4) Check household last reset date
    const hhResp = await fetch(`${SB_URL}/rest/v1/households?select=last_chore_reset_date&id=eq.${householdId}&limit=1`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`
      }
    });

    if (!hhResp.ok) {
      const t = await hhResp.text();
      return res.status(500).json({ error: 'Household lookup failed', detail: t });
    }

    const hh = (await hhResp.json())[0] || {};
    if (hh.last_chore_reset_date === today) {
      return res.status(200).json({ ok: true, didReset: false, reason: 'already_reset_today', today, tz });
    }

    // 5) Reset chores for household
    const or = encodeURIComponent(`(category.eq.Daily,day_of_week.eq.${dow},category.ilike.${dayName}%)`);
    const patchResp = await fetch(`${SB_URL}/rest/v1/chores?household_id=eq.${householdId}&status=in.(done,skipped)&or=${or}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        status: 'pending',
        completed_by_name: null,
        completer_email: null
      })
    });

    if (!patchResp.ok) {
      const t = await patchResp.text();
      return res.status(500).json({ error: 'Chore reset failed', detail: t });
    }

    // 6) Mark household reset date
    const hhPatch = await fetch(`${SB_URL}/rest/v1/households?id=eq.${householdId}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ last_chore_reset_date: today })
    });

    if (!hhPatch.ok) {
      const t = await hhPatch.text();
      return res.status(500).json({ error: 'Failed updating household reset date', detail: t });
    }

    return res.status(200).json({
      ok: true,
      didReset: true,
      today,
      tz,
      dow,
      dayName,
      householdId
    });

  } catch (e) {
    console.error('[ResetMyHousehold] error:', e);
    return res.status(500).json({ error: 'Reset failed', detail: e?.message });
  }
}
