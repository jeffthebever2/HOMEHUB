// ============================================================
// assets/supabase.js — Supabase auth + DB helpers  (v3)
//
// KEY CHANGES:
//   - flowType: 'pkce' (server uses PKCE)
//   - AbortController timeout on ALL DB queries (6s)
//   - Boot diagnostics + debug tool
// ============================================================
window.Hub = window.Hub || {};

(function () {
  const CFG = window.HOME_HUB_CONFIG || {};
  const SB_URL = CFG.supabaseUrl || CFG.supabase?.url || '';
  const SB_KEY = CFG.supabaseAnonKey || CFG.supabase?.anonKey || '';

  console.log('[Boot] href:', window.location.href);
  console.log('[Boot] has ?code=', window.location.search.includes('code='));
  console.log('[Boot] has #access_token=', window.location.hash.includes('access_token'));

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

  // ── Helper: DB query with 6s timeout ──
  function timed(queryBuilder) {
    return Promise.race([
      queryBuilder,
      new Promise((_, rej) => setTimeout(() => rej(new Error('DB query timeout (6s)')), 6000))
    ]);
  }

  Hub.auth = {
    async signInGoogle() {
      console.log('[Auth] signInGoogle (PKCE)');
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/#/' }
      });
      if (error) console.error('[Auth] OAuth error:', error);
    },

    async signOut() {
      console.log('[Auth] signOut()');
      Hub.app._loggedIn = false;
      Hub.app._loginInProgress = false;
      Hub.app._authHandled = false;
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
        console.warn('[Auth] getSession err:', e.message);
        return null;
      }
    },

    async checkAccess(user) {
      try {
        console.log('[Auth] checkAccess:', user.email);

        const t0 = Date.now();
        const { data, error } = await timed(
          sb.from('household_members')
            .select('household_id, role')
            .eq('email', user.email)
            .limit(1)
            .maybeSingle()
        );
        console.log('[Auth] household_members (' + (Date.now() - t0) + 'ms):', JSON.stringify({ data, err: error?.message }));
        
        if (error) {
          console.error('[Auth] household_members query error:', error);
          return false;
        }
        
        if (!data) {
          console.warn('[Auth] No household_members record found for:', user.email);
          return false;
        }

        const t1 = Date.now();
        const { data: ae, error: aeErr } = await timed(
          sb.from('allowed_emails')
            .select('id')
            .eq('email', user.email)
            .limit(1)
            .maybeSingle()
        );
        console.log('[Auth] allowed_emails (' + (Date.now() - t1) + 'ms):', JSON.stringify({ ae, err: aeErr?.message }));
        
        if (aeErr) {
          console.error('[Auth] allowed_emails query error:', aeErr);
          return false;
        }
        
        if (!ae) {
          console.warn('[Auth] No allowed_emails record found for:', user.email);
          return false;
        }

        Hub.state.household_id = data.household_id;
        Hub.state.userRole = data.role;
        console.log('[Auth] ✓ Granted — household:', data.household_id, 'role:', data.role);
        return true;
      } catch (e) {
        console.error('[Auth] checkAccess error:', e.message, e);
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
      log('');

      try {
        log('DB: allowed_emails…');
        const t = Date.now();
        const { data, error } = await timed(sb.from('allowed_emails').select('email').limit(5));
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
        user_id: userId, household_id: householdId,
        location_name: settings.location_name, location_lat: settings.location_lat,
        location_lon: settings.location_lon, standby_timeout_min: settings.standby_timeout_min,
        quiet_hours_start: settings.quiet_hours_start, quiet_hours_end: settings.quiet_hours_end,
        immich_base_url: settings.immich_base_url, immich_api_key: settings.immich_api_key,
        immich_album_id: settings.immich_album_id, calendar_url: settings.calendar_url,
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
      const { error } = await timed(sb.from('chores').delete().eq('id', id));
      if (error) throw error;
    },
    async logChoreCompletion(choreId, householdId, userId, notes) {
      const { error } = await timed(sb.from('chore_logs').insert({ chore_id: choreId, household_id: householdId, completed_by: userId, notes }));
      if (error) throw error;
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
