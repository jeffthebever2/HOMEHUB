// ============================================================
// assets/supabase.js — Supabase auth + DB helpers
// ============================================================
window.Hub = window.Hub || {};

(function () {
  const CFG = window.HOME_HUB_CONFIG || {};

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

  // Helper: wrap a promise with a timeout
  function withTimeout(promise, ms = 8000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), ms))
    ]);
  }

  Hub.auth = {
    async signInGoogle() {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      if (error) console.error('Login error:', error);
    },

    async signOut() {
      Hub.app._loggedIn = false;
      Hub.state.user = null;
      Hub.state.household_id = null;
      Hub.state.userRole = null;
      await sb.auth.signOut();
      Hub.router.showScreen('login');
    },

    async getSession() {
      try {
        const { data: { session } } = await sb.auth.getSession();
        return session;
      } catch (e) {
        console.warn('[Auth] getSession error:', e.message);
        return null;
      }
    },

    async checkAccess(user) {
      try {
        console.log('[Auth] Querying household_members...');
        const { data, error } = await withTimeout(
          sb.from('household_members')
            .select('household_id, role')
            .eq('email', user.email)
            .limit(1)
            .maybeSingle()
        );

        console.log('[Auth] household_members:', { data, error: error?.message });
        if (error || !data) return false;

        console.log('[Auth] Querying allowed_emails...');
        const { data: ae, error: aeErr } = await withTimeout(
          sb.from('allowed_emails')
            .select('id')
            .eq('email', user.email)
            .limit(1)
            .maybeSingle()
        );

        console.log('[Auth] allowed_emails:', { ae, error: aeErr?.message });
        if (aeErr || !ae) return false;

        Hub.state.household_id = data.household_id;
        Hub.state.userRole = data.role;
        console.log('[Auth] Access granted, household:', data.household_id);
        return true;
      } catch (e) {
        console.error('[Auth] checkAccess error:', e.message);
        return false;
      }
    },

    onAuthChange(cb) {
      sb.auth.onAuthStateChange((event, session) => cb(event, session));
    }
  };

  Hub.db = {
    async loadSettings(userId) {
      const { data } = await sb.from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      return data;
    },

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

    async loadChores(householdId) {
      const { data, error } = await sb.from('chores')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async addChore(chore) {
      const { data, error } = await sb.from('chores').insert(chore).select().single();
      if (error) throw error;
      return data;
    },

    async updateChore(id, updates) {
      const { error } = await sb.from('chores').update(updates).eq('id', id);
      if (error) throw error;
    },

    async deleteChore(id) {
      const { error } = await sb.from('chores').delete().eq('id', id);
      if (error) throw error;
    },

    async logChoreCompletion(choreId, householdId, userId, notes) {
      const { error } = await sb.from('chore_logs').insert({
        chore_id: choreId,
        household_id: householdId,
        completed_by: userId,
        notes
      });
      if (error) throw error;
    },

    async markAlertSeen(userId, alertId, severity) {
      await sb.from('seen_alerts').upsert(
        { user_id: userId, alert_id: alertId, severity, seen_at: new Date().toISOString() },
        { onConflict: 'user_id,alert_id' }
      );
    },

    async isAlertSeen(userId, alertId) {
      const { data } = await sb.from('seen_alerts')
        .select('id')
        .eq('user_id', userId)
        .eq('alert_id', alertId)
        .maybeSingle();
      return !!data;
    },

    async logSystem(source, service, status, message, latencyMs) {
      await sb.from('system_logs').insert({ source, service, status, message, latency_ms: latencyMs }).select();
    }
  };
})();
