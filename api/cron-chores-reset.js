// ============================================================
// /api/cron-chores-reset.js
// Automatic Daily Chore Reset Endpoint
// Called by Vercel Cron (hourly) + client fallback
// Resets chores for households where the date has changed
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export default async function handler(req, res) {
  // Allow GET for easy testing, but primarily expects POST from cron
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Supabase with service role key (bypasses RLS)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Cron Reset] Missing Supabase credentials');
      return res.status(500).json({ 
        error: 'Server configuration error',
        processed: 0
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // Get current date in America/New_York timezone
    const today = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const [month, day, year] = today.split('/');
    const todayDate = `${year}-${month}-${day}`; // YYYY-MM-DD format

    // Get current day of week in America/New_York (0=Sunday, 6=Saturday)
    const todayDayOfWeek = new Date(todayDate + 'T12:00:00').getDay();

    console.log(`[Cron Reset] Running for date: ${todayDate}, day of week: ${todayDayOfWeek}`);

    // Fetch all households that need reset
    const { data: households, error: fetchError } = await supabase
      .from('households')
      .select('id, name, last_chore_reset_date')
      .or(`last_chore_reset_date.is.null,last_chore_reset_date.neq.${todayDate}`);

    if (fetchError) {
      console.error('[Cron Reset] Error fetching households:', fetchError);
      return res.status(500).json({ 
        error: 'Database error',
        details: fetchError.message 
      });
    }

    if (!households || households.length === 0) {
      console.log('[Cron Reset] No households need reset');
      return res.status(200).json({ 
        message: 'No households need reset',
        date: todayDate,
        processed: 0
      });
    }

    console.log(`[Cron Reset] Found ${households.length} household(s) to process`);

    const results = [];

    for (const household of households) {
      try {
        // Reset chores for this household
        // Daily chores: reset if status = 'done'
        // Weekly chores: reset if status = 'done' AND day_of_week matches today
        const { data: resetChores, error: resetError } = await supabase
          .from('chores')
          .update({ status: 'pending' })
          .eq('household_id', household.id)
          .eq('status', 'done')
          .or(`category.eq.Daily,day_of_week.eq.${todayDayOfWeek}`);

        if (resetError) {
          console.error(`[Cron Reset] Error resetting chores for ${household.name}:`, resetError);
          results.push({
            household: household.name,
            success: false,
            error: resetError.message
          });
          continue;
        }

        // Update last_chore_reset_date
        const { error: updateError } = await supabase
          .from('households')
          .update({ last_chore_reset_date: todayDate })
          .eq('id', household.id);

        if (updateError) {
          console.error(`[Cron Reset] Error updating reset date for ${household.name}:`, updateError);
        }

        // Log to system_logs
        await supabase.from('system_logs').insert({
          source: 'server',
          service: 'chore-reset',
          status: 'ok',
          message: `Automatic reset for ${household.name} on ${todayDate}`
        });

        console.log(`[Cron Reset] ✓ Reset chores for ${household.name}`);
        results.push({
          household: household.name,
          success: true,
          date: todayDate
        });

      } catch (err) {
        console.error(`[Cron Reset] Exception for ${household.name}:`, err);
        results.push({
          household: household.name,
          success: false,
          error: err.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    return res.status(200).json({
      message: `Processed ${households.length} household(s)`,
      date: todayDate,
      dayOfWeek: todayDayOfWeek,
      processed: successCount,
      results
    });

  } catch (error) {
    console.error('[Cron Reset] Fatal error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
