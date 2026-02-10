// ============================================================
// assets/supabase.js — Supabase auth + DB helpers (v4)
//
// Fixes in v4:
//   - Removed Immich settings fields
//   - Cleaner timeout helper
// ============================================================
window.Hub = window.Hub || {};

(function () {
  const CFG = window.HOME_HUB_CONFIG || {};
  const SB_URL = CFG.supabaseUrl || CFG.supabase?.url || '';
  const SB_KEY = CFG.supabaseAnonKey || CFG.supabase?.anonKey || '';

  const sb = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      autoRefreshToken: true,
      persistSession: true
    }
  });

  Hub.sb = sb;

  // Boot: log session state (non-blocking)
  sb.auth.getSession().then(({ data }) => {
    console.log('[Boot] session:', data.session ? data.session.user.email : 'none');
  }).catch(e => console.warn('[Boot] getSession err:', e.message));

  // ── Helper: DB query with timeout ──
  function timed(queryBuilder, ms) {
    ms = ms || 6000;
    return Promise.race([
      queryBuilder,
      new Promise((_, rej) => setTimeout(() => rej(new Error('DB query timeout (' + ms + 'ms)')), ms))
    ]);
  }

  Hub.auth = {
    async signInGoogle() {
      console.log('[Auth] signInGoogle (PKCE) with Calendar scopes');
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/#/',
          scopes: 'email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events'
        }
      });
      if (error) console.error('[Auth] OAuth error:', error);
    },

    async signOut() {
      Hub.app._loggedIn = false;
      Hub.app._loginInProgress = false;
      Hub.app._authHandled = false;
      Hub.state.user = null;
      Hub.state.user_id = null;
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
        console.warn('[Auth] getSession err:', e.message);
        return null;
      }
    },

    async checkAccess(user) {
      try {
        const { data, error } = await timed(
          sb.from('household_members')
            .select('household_id, role')
            .eq('email', user.email)
            .limit(1)
            .maybeSingle()
        );
        if (error || !data) return false;

        const { data: ae, error: aeErr } = await timed(
          sb.from('allowed_emails')
            .select('id')
            .eq('email', user.email)
            .limit(1)
            .maybeSingle()
        );
        if (aeErr || !ae) return false;

        Hub.state.household_id = data.household_id;
        Hub.state.userRole = data.role;
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

  // ── Debug tool ─────────────────────────────────────────────
  Hub.debug = {
    async checkSupabase() {
      const out = [];
      const log = (m) => { out.push(m); console.log('[Debug]', m); };
      const el = document.getElementById('debugOutput');
      if (el) { el.style.display = 'block'; el.textContent = 'Running…\n'; }

      log('═══ Supabase Diagnostics ═══');
      log('URL: ' + (SB_URL || 'MISSING'));
      log('Key: ' + (SB_KEY.length > 20 ? 'yes' : 'MISSING'));
      log('Page: ' + window.location.href);
      log('');

      try {
        const { data: { session }, error } = await sb.auth.getSession();
        if (error) log('getSession error: ' + error.message);
        else if (session) {
          log('✓ Session: ' + session.user.email);
          log('  ID: ' + session.user.id);
          log('  Expires: ' + new Date(session.expires_at * 1000).toLocaleString());
        } else log('✗ No session');
      } catch (e) { log('getSession exception: ' + e.message); }
      log('');

      try {
        const { data: { user }, error } = await sb.auth.getUser();
        if (error) log('getUser error: ' + error.message);
        else if (user) log('✓ getUser: ' + user.email);
        else log('✗ getUser: null');
      } catch (e) { log('getUser exception: ' + e.message); }
      log('');

      try {
        log('DB: household_members…');
        const t = Date.now();
        const { data, error } = await timed(sb.from('household_members').select('household_id, email, role').limit(5));
        log('  ' + (Date.now() - t) + 'ms');
        if (error) log('✗ ' + error.message);
        else log('✓ ' + JSON.stringify(data));
      } catch (e) { log('✗ ' + e.message); }

      if (el) el.textContent = out.join('\n');
      return out;
    }
  };

  // ── DB helpers (all with timeout) ──────────────────────────
  Hub.db = {
    async loadSettings(userId) {
      const { data } = await timed(sb.from('user_settings').select('*').eq('user_id', userId).maybeSingle());
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
        selected_calendars: settings.selected_calendars || ['primary'],
        updated_at: new Date().toISOString()
      };
      const { data, error } = await timed(sb.from('user_settings').upsert(payload, { onConflict: 'user_id' }).select().single());
      if (error) throw error;
      return data;
    },

    async loadChores(householdId) {
      const { data, error } = await timed(sb.from('chores').select('*').eq('household_id', householdId).order('created_at', { ascending: false }));
      if (error) throw error;
      return data || [];
    },

    async loadChoresWithCompleters(householdId) {
      const { data: chores, error } = await timed(
        sb.from('chores').select('*').eq('household_id', householdId).order('created_at', { ascending: false })
      );
      if (error) throw error;
      if (!chores) return [];

      // Chores with completed_by_name already have the info we need
      return chores;
    },

    async addChore(chore) {
      const { data, error } = await timed(sb.from('chores').insert(chore).select().single());
      if (error) throw error;
      return data;
    },

    async updateChore(id, updates) {
      const { error } = await timed(sb.from('chores').update(updates).eq('id', id));
      if (error) throw error;
    },

    async deleteChore(id) {
      // Delete logs first (foreign key), then chore
      await timed(sb.from('chore_logs').delete().eq('chore_id', id));
      const { error } = await timed(sb.from('chores').delete().eq('id', id));
      if (error) throw error;
    },

    async logChoreCompletion(choreId, householdId, userId, notes) {
      const { error } = await timed(sb.from('chore_logs').insert({ chore_id: choreId, household_id: householdId, completed_by: userId, notes }));
      if (error) throw error;
    },

    async markChoreDone(choreId, userId, personName) {
      const { error: updateError } = await timed(
        sb.from('chores')
          .update({ status: 'done', completed_by_name: personName })
          .eq('id', choreId)
      );
      if (updateError) throw updateError;

      const { data: chore } = await timed(sb.from('chores').select('household_id').eq('id', choreId).single());
      if (chore) {
        await this.logChoreCompletion(choreId, chore.household_id, userId, 'Completed by ' + personName);
      }
    },

    async markAlertSeen(userId, alertId, severity) {
      await timed(sb.from('seen_alerts').upsert({ user_id: userId, alert_id: alertId, severity, seen_at: new Date().toISOString() }, { onConflict: 'user_id,alert_id' }));
    },

    async isAlertSeen(userId, alertId) {
      const { data } = await timed(sb.from('seen_alerts').select('id').eq('user_id', userId).eq('alert_id', alertId).maybeSingle());
      return !!data;
    },

    async logSystem(source, service, status, message, latencyMs) {
      await timed(sb.from('system_logs').insert({ source, service, status, message, latency_ms: latencyMs }).select());
    }
  };
})();
