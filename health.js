/**
 * Cron endpoint: Reset chores daily
 * Pure fetch implementation - no external imports
 */

export default async function handler(req, res) {
  // Allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase config' });
  }

  try {
    // Compute "today" in America/New_York timezone
    const nyDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const nyNow = new Date(nyDate);
    const today = nyNow.toISOString().split('T')[0]; // YYYY-MM-DD
    const weekday = nyNow.getDay(); // 0=Sunday, 6=Saturday

    console.log(`[Cron] Today in NY: ${today}, weekday: ${weekday}`);

    // Fetch all households
    const householdsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/households?select=id,last_chore_reset_date`,
      {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!householdsRes.ok) {
      throw new Error(`Failed to fetch households: ${householdsRes.statusText}`);
    }

    const households = await householdsRes.json();
    console.log(`[Cron] Found ${households.length} households`);

    let checkedCount = 0;
    let resetCount = 0;

    for (const household of households) {
      checkedCount++;

      // Skip if already reset today
      if (household.last_chore_reset_date === today) {
        console.log(`[Cron] Household ${household.id} already reset today`);
        continue;
      }

      console.log(`[Cron] Resetting household ${household.id}...`);

      // Reset chores: Daily OR weekly matching today's weekday
      const resetRes = await fetch(
        `${SUPABASE_URL}/rest/v1/chores?household_id=eq.${household.id}&status=eq.done&or=(category.eq.Daily,day_of_week.eq.${weekday})`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            status: 'pending',
            completed_by_name: null
          })
        }
      );

      if (!resetRes.ok) {
        console.error(`[Cron] Failed to reset chores for ${household.id}: ${resetRes.statusText}`);
        continue;
      }

      // Update household's last_chore_reset_date
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/households?id=eq.${household.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            last_chore_reset_date: today
          })
        }
      );

      if (!updateRes.ok) {
        console.error(`[Cron] Failed to update household ${household.id}: ${updateRes.statusText}`);
        continue;
      }

      resetCount++;
      console.log(`[Cron] ✓ Reset household ${household.id}`);
    }

    console.log(`[Cron] Complete: checked ${checkedCount}, reset ${resetCount}`);

    return res.status(200).json({
      ok: true,
      checked: checkedCount,
      reset: resetCount,
      today: today,
      weekday: weekday
    });

  } catch (error) {
    console.error('[Cron] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
