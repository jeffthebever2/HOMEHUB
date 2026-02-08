// ============================================================
// assets/supabase.js — Supabase auth + DB helpers
// ============================================================
window.Hub = window.Hub || {};

(function () {
  const CFG = window.HOME_HUB_CONFIG || {};

  // Create client with auth options for OAuth redirect handling
  const sb = window.supabase.createClient(
    CFG.supabaseUrl || CFG.supabase?.url || '',
    CFG.supabaseAnonKey || CFG.supabase?.anonKey || '',
    {
      auth: {
        detectSessionInUrl: true,
        flowType: 'implicit',
        autoRefreshToken: true,
        persistSession: true
      }
    }
  );

  Hub.sb = sb;

  Hub.auth = {
    /** Sign in with Google via Supabase */
    async signInGoogle() {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      if (error) console.error('Login error:', error);
    },

    /** Sign out */
    async signOut() {
      await sb.auth.signOut();
      Hub.state.user = null;
      Hub.state.household_id = null;
      Hub.router.showScreen('login');
    },

    /** Get current session */
    async getSession() {
      try {
        const { data: { session } } = await sb.auth.getSession();
        return session;
      } catch (e) {
        console.warn('[Auth] getSession error (may be normal after redirect):', e.message);
        return null;
      }
    },

    /** Check if user is allowed (email in allowed_emails + household_members) */
    async checkAccess(user) {
      try {
        console.log('[Auth] Checking access for:', user.email);
        const { data, error } = await sb.from('household_members')
          .select('household_id, role')
          .eq('email', user.email)
          .limit(1)
          .maybeSingle();

        console.log('[Auth] household_members result:', { data, error: error?.message });
        if (error || !data) return false;

        // Also verify email is in allowed_emails
        const { data: ae, error: aeErr } = await sb.from('allowed_emails')
          .select('id')
          .eq('email', user.email)
          .limit(1)
          .maybeSingle();

        console.log('[Auth] allowed_emails result:', { ae, error: aeErr?.message });
        if (aeErr || !ae) return false;

        Hub.state.household_id = data.household_id;
        Hub.state.userRole = data.role;
        console.log('[Auth] Access granted, household:', data.household_id);
        return true;
      } catch (e) {
        console.error('[Auth] Access check error:', e);
        return false;
      }
    },

    /** Listen for auth state changes */
    onAuthChange(cb) {
      sb.auth.onAuthStateChange((event, session) => cb(event, session));
    }
  };

  // --- Settings helpers ---
  Hub.db = {
    /** Load user settings from Supabase */
    async loadSettings(userId) {
      const { data } = await sb.from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      return data;
    },

    /** Save user settings (upsert) */
    async saveSettings(userId, householdId, settings) {
      const payload = {
        user_id: userId,
        household_id: householdId,
        location_name: settings.location_name,
        location_lat: settings.location_lat,
        location_lon: settings.location_lon,
        standby_timeout_min: settings.standby_timeout_min,
        quiet_hours_start: settings.quiet_hours_start,
        quiet_hours_end: settings.quiet_hours_end,
        immich_base_url: settings.immich_base_url,
        immich_api_key: settings.immich_api_key,
        immich_album_id: settings.immich_album_id,
        calendar_url: settings.calendar_url,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await sb.from('user_settings').upsert(payload, { onConflict: 'user_id' }).select().single();
      if (error) throw error;
      return data;
    },

    /** Load chores for household */
    async loadChores(householdId) {
      const { data, error } = await sb.from('chores')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    /** Insert chore */
    async addChore(chore) {
      const { data, error } = await sb.from('chores').insert(chore).select().single();
      if (error) throw error;
      return data;
    },

    /** Update chore */
    async updateChore(id, updates) {
      const { error } = await sb.from('chores').update(updates).eq('id', id);
      if (error) throw error;
    },

    /** Delete chore */
    async deleteChore(id) {
      const { error } = await sb.from('chores').delete().eq('id', id);
      if (error) throw error;
    },

    /** Log chore completion */
    async logChoreCompletion(choreId, householdId, userId, notes) {
      const { error } = await sb.from('chore_logs').insert({
        chore_id: choreId,
        household_id: householdId,
        completed_by: userId,
        notes
      });
      if (error) throw error;
    },

    /** Upsert seen alert */
    async markAlertSeen(userId, alertId, severity) {
      await sb.from('seen_alerts').upsert(
        { user_id: userId, alert_id: alertId, severity, seen_at: new Date().toISOString() },
        { onConflict: 'user_id,alert_id' }
      );
    },

    /** Check if alert was seen */
    async isAlertSeen(userId, alertId) {
      const { data } = await sb.from('seen_alerts')
        .select('id')
        .eq('user_id', userId)
        .eq('alert_id', alertId)
        .maybeSingle();
      return !!data;
    },

    /** Log system status */
    async logSystem(source, service, status, message, latencyMs) {
      await sb.from('system_logs').insert({ source, service, status, message, latency_ms: latencyMs }).select();
    }
  };
})();
