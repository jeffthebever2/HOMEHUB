// ============================================================
// assets/supabase.js — Supabase auth + DB helpers
//
// CRITICAL FIX: flowType changed from 'implicit' → 'pkce'
//   Supabase GoTrue returns ?code= on OAuth callback.
//   With implicit, the JS client never generates a code_verifier,
//   so the ?code= is silently ignored → no session → login loop.
//   With pkce, the client stores a code_verifier, then exchanges
//   the ?code= for a real session on redirect back.
//
// ALSO: added boot diagnostics + "Check Supabase" debug tool
// ============================================================
window.Hub = window.Hub || {};

(function () {
  const CFG = window.HOME_HUB_CONFIG || {};
  const SB_URL = CFG.supabaseUrl || CFG.supabase?.url || '';
  const SB_KEY = CFG.supabaseAnonKey || CFG.supabase?.anonKey || '';

  // ── Boot diagnostics ──────────────────────────────────────
  console.log('[Boot] href:', window.location.href);
  console.log('[Boot] has ?code=', window.location.search.includes('code='));
  console.log('[Boot] has #access_token=', window.location.hash.includes('access_token'));
  console.log('[Boot] Supabase URL:', SB_URL ? 'configured' : 'MISSING');
  console.log('[Boot] Supabase Key:', SB_KEY.length > 20 ? 'present' : 'MISSING');

  // ── Create client — PKCE flow (MUST be explicit for JS v2) ─
  const sb = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: {
      flowType: 'pkce',            // ← THE FIX: was 'implicit'
      detectSessionInUrl: true,     // auto-exchange ?code= on redirect
      autoRefreshToken: true,
      persistSession: true
    }
  });

  Hub.sb = sb;

  // Log session state after client init (non-blocking)
  (async () => {
    try {
      const { data: { session } } = await sb.auth.getSession();
      console.log('[Boot] getSession →', session ? session.user.email : 'null (no session)');
      if (session) {
        console.log('[Boot]   expires_at:', new Date(session.expires_at * 1000).toISOString());
      }
    } catch (e) { console.warn('[Boot] getSession error:', e.message); }
    try {
      const { data: { user } } = await sb.auth.getUser();
      console.log('[Boot] getUser →', user ? user.email : 'null');
    } catch (e) { console.warn('[Boot] getUser error:', e.message); }
  })();

  // ── Auth helpers ───────────────────────────────────────────
  Hub.auth = {
    async signInGoogle() {
      console.log('[Auth] Starting Google OAuth (PKCE)…');
      const redirectTo = window.location.origin + '/#/';
      console.log('[Auth] redirectTo:', redirectTo);
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo }
      });
      if (error) console.error('[Auth] signInWithOAuth error:', error);
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
        console.log('[Auth] checkAccess: querying household_members for', user.email);
        const t0 = Date.now();
        const { data, error } = await sb.from('household_members')
          .select('household_id, role')
          .eq('email', user.email)
          .limit(1)
          .maybeSingle();
        console.log('[Auth] household_members (' + (Date.now() - t0) + 'ms):',
          JSON.stringify({ data, err: error?.message }));
        if (error || !data) return false;

        const t1 = Date.now();
        const { data: ae, error: aeErr } = await sb.from('allowed_emails')
          .select('id')
          .eq('email', user.email)
          .limit(1)
          .maybeSingle();
        console.log('[Auth] allowed_emails (' + (Date.now() - t1) + 'ms):',
          JSON.stringify({ ae, err: aeErr?.message }));
        if (aeErr || !ae) return false;

        Hub.state.household_id = data.household_id;
        Hub.state.userRole = data.role;
        console.log('[Auth] ✓ Access granted — household:', data.household_id, 'role:', data.role);
        return true;
      } catch (e) {
        console.error('[Auth] checkAccess exception:', e);
        return false;
      }
    },

    onAuthChange(cb) {
      sb.auth.onAuthStateChange((event, session) => cb(event, session));
    }
  };

  // ── Debug tool — "Check Supabase" button ───────────────────
  Hub.debug = {
    async checkSupabase() {
      const out = [];
      const log = (msg) => { out.push(msg); console.log('[Debug]', msg); };
      const el = document.getElementById('debugOutput');
      if (el) { el.style.display = 'block'; el.textContent = 'Running diagnostics…\n'; }

      log('══════ Supabase Diagnostics ══════');
      log('URL: ' + (SB_URL || '⚠ MISSING'));
      log('Key: ' + (SB_KEY.length > 20 ? '✓ present (' + SB_KEY.substring(0, 20) + '…)' : '⚠ MISSING'));
      log('Page: ' + window.location.href);
      log('Has ?code=: ' + window.location.search.includes('code='));
      log('Has #access_token=: ' + window.location.hash.includes('access_token'));
      log('');

      // 1. getSession
      try {
        log('── getSession() ──');
        const { data: { session }, error } = await sb.auth.getSession();
        if (error) { log('⚠ Error: ' + error.message); }
        else if (session) {
          log('✓ Session EXISTS');
          log('  Email: ' + session.user.email);
          log('  User ID: ' + session.user.id);
          log('  Provider: ' + (session.user.app_metadata?.provider || '?'));
          log('  Expires: ' + new Date(session.expires_at * 1000).toLocaleString());
          log('  Token (first 40): ' + session.access_token.substring(0, 40) + '…');
        } else {
          log('✗ No session — NOT logged in');
          log('  (This is the bug — OAuth redirect did not create a session)');
        }
      } catch (e) { log('⚠ Exception: ' + e.message); }
      log('');

      // 2. getUser (server-side token validation)
      try {
        log('── getUser() ──');
        const { data: { user }, error } = await sb.auth.getUser();
        if (error) { log('⚠ Error: ' + error.message); }
        else if (user) { log('✓ Server confirmed: ' + user.email); }
        else { log('✗ Server returned null user'); }
      } catch (e) { log('⚠ Exception: ' + e.message); }
      log('');

      // 3. DB query — household_members
      try {
        log('── DB: household_members ──');
        const t = Date.now();
        const { data, error } = await sb.from('household_members')
          .select('household_id, email, role')
          .limit(5);
        log('  Response in ' + (Date.now() - t) + 'ms');
        if (error) {
          log('✗ Error: ' + error.message + ' [code: ' + (error.code || '?') + ']');
          if (error.message.includes('permission denied')) {
            log('  → RLS is blocking. You need a valid session first.');
          }
        } else {
          log('✓ Returned ' + (data?.length || 0) + ' rows');
          if (data) data.forEach(r => log('  ' + JSON.stringify(r)));
        }
      } catch (e) { log('⚠ Exception: ' + e.message); }
      log('');

      // 4. DB query — allowed_emails
      try {
        log('── DB: allowed_emails ──');
        const t = Date.now();
        const { data, error } = await sb.from('allowed_emails')
          .select('email')
          .limit(5);
        log('  Response in ' + (Date.now() - t) + 'ms');
        if (error) { log('✗ Error: ' + error.message); }
        else {
          log('✓ Returned ' + (data?.length || 0) + ' rows');
          if (data) data.forEach(r => log('  ' + JSON.stringify(r)));
        }
      } catch (e) { log('⚠ Exception: ' + e.message); }
      log('');

      // 5. Server-side diagnostics
      try {
        log('── Server: /api/supabase-check ──');
        const session = (await sb.auth.getSession()).data?.session;
        if (session) {
          const resp = await fetch('/api/supabase-check', {
            headers: { 'Authorization': 'Bearer ' + session.access_token }
          });
          const json = await resp.json();
          log('  HTTP ' + resp.status);
          log('  ' + JSON.stringify(json, null, 2));
        } else {
          log('  Skipped — no session token available');
        }
      } catch (e) { log('⚠ Fetch error: ' + e.message); }

      log('');
      log('══════ End Diagnostics ══════');
      if (el) el.textContent = out.join('\n');
      return out;
    }
  };

  // ── DB helpers ─────────────────────────────────────────────
  Hub.db = {
    async loadSettings(userId) {
      const { data } = await sb.from('user_settings')
        .select('*').eq('user_id', userId).maybeSingle();
      return data;
    },

    async saveSettings(userId, householdId, settings) {
      const payload = {
        user_id: userId, household_id: householdId,
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
      const { data, error } = await sb.from('user_settings')
        .upsert(payload, { onConflict: 'user_id' }).select().single();
      if (error) throw error;
      return data;
    },

    async loadChores(householdId) {
      const { data, error } = await sb.from('chores')
        .select('*').eq('household_id', householdId)
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
        chore_id: choreId, household_id: householdId,
        completed_by: userId, notes
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
        .select('id').eq('user_id', userId).eq('alert_id', alertId).maybeSingle();
      return !!data;
    },

    async logSystem(source, service, status, message, latencyMs) {
      await sb.from('system_logs')
        .insert({ source, service, status, message, latency_ms: latencyMs }).select();
    }
  };
})();
