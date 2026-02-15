// Vercel Cron: resets chores once per day per household (safe + idempotent)
// Schedule configured in vercel.json

export default async function handler(req, res) {
  try {
    const SB_URL = process.env.SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SB_URL || !SB_KEY) {
      return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
    }

    const tz = process.env.HOMEHUB_TZ || 'America/New_York';

    const now = new Date();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

    const weekdayShort = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
    const wkMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = wkMap[weekdayShort] ?? now.getDay();

    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayName = dayNames[dow];

    // Fetch households
    const householdsResp = await fetch(`${SB_URL}/rest/v1/households?select=id,last_chore_reset_date`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`
      }
    });

    if (!householdsResp.ok) {
      const t = await householdsResp.text();
      return res.status(500).json({ error: 'Failed to load households', detail: t });
    }

    const households = await householdsResp.json();
    let did = 0;
    let skipped = 0;

    for (const h of households) {
      const last = h.last_chore_reset_date || null;
      if (last === today) { skipped++; continue; }

      // Reset daily + today's weekly chores (supports old schema categories too)
      const or = encodeURIComponent(`(category.eq.Daily,day_of_week.eq.${dow},category.eq.${dayName})`);
      const patchResp = await fetch(`${SB_URL}/rest/v1/chores?household_id=eq.${h.id}&status=in.(done,skipped)&or=${or}`, {
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
        // Don't fail the whole cron; log and continue
        const t = await patchResp.text();
        console.warn('[CronReset] patch chores failed:', h.id, t);
        continue;
      }

      // Mark household as reset today
      const hhResp = await fetch(`${SB_URL}/rest/v1/households?id=eq.${h.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ last_chore_reset_date: today })
      });

      if (!hhResp.ok) {
        const t = await hhResp.text();
        console.warn('[CronReset] patch household failed:', h.id, t);
      } else {
        did++;
      }
    }

    return res.status(200).json({
      ok: true,
      tz,
      today,
      dow,
      dayName,
      households: households.length,
      didReset: did,
      skipped
    });
  } catch (e) {
    console.error('[CronReset] error:', e);
    return res.status(500).json({ error: 'Cron reset failed', detail: e?.message });
  }
}
