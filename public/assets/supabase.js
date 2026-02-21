// ============================================================
// assets/supabase.js — Supabase auth + DB helpers  (v5)
//
// v5 changes:
//   - Robust session watchdog (every 6 min): re-calls _onLogin if
//     session exists but app thinks it's logged out
//   - visibilitychange / focus / pageshow → ensureFreshSession
//   - signInGoogle: extended scopes (Photos readonly, Calendar),
//     access_type=offline, prompt=consent, include_granted_scopes=true
//   - No aggressive fallback timers that wrongly show login
// ============================================================
window.Hub = window.Hub || {};

const SUPABASE_CONFIG = {
  DB_QUERY_TIMEOUT_MS:             6000,
  KEEPALIVE_MINUTES:               6,      // watchdog interval
  REFRESH_IF_EXPIRES_IN_SECONDS:   20 * 60 // refresh if < 20 min left
};

(function () {
  const CFG    = window.HOME_HUB_CONFIG || {};
  const SB_URL = CFG.supabaseUrl   || CFG.supabase?.url     || '';
  const SB_KEY = CFG.supabaseAnonKey || CFG.supabase?.anonKey || '';

  console.log('[Boot] href:', window.location.href);
  console.log('[Boot] ?code=', window.location.search.includes('code='));

  const sb = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: {
      flowType:          'pkce',
      detectSessionInUrl: true,
      autoRefreshToken:   true,
      persistSession:     true
    }
  });

  Hub.sb = sb;

  // ── Session refresh helper ──────────────────────────────────
  async function _refreshIfNeeded(reason) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return null;

      const expiresAt   = session.expires_at ? session.expires_at * 1000 : null;
      const secondsLeft = expiresAt ? Math.floor((expiresAt - Date.now()) / 1000) : Infinity;

      if (secondsLeft > SUPABASE_CONFIG.REFRESH_IF_EXPIRES_IN_SECONDS) return session;

      console.log(`[Auth] Refreshing (${reason}) — ${secondsLeft}s left`);
      const { data, error } = await sb.auth.refreshSession();
      if (error) { console.warn('[Auth] refreshSession error:', error.message); return session; }
      return data?.session || session;
    } catch (e) {
      console.warn('[Auth] refreshIfNeeded exception:', e.message);
      return null;
    }
  }

  // ── Keep-alive + watchdog ────────────────────────────────────
  let _keepAliveStarted = false;

  function _startKeepAlive() {
    if (_keepAliveStarted) return;
    _keepAliveStarted = true;

    try { sb.auth.startAutoRefresh?.(); } catch (e) {}

    // Periodic watchdog: refresh token AND re-login app if needed
    setInterval(async () => {
      const session = await _refreshIfNeeded('watchdog');
      if (session?.user && !Hub.app?._loggedIn) {
        console.warn('[Auth] Watchdog: session exists but app thinks logged out — re-login');
        try { await Hub.app?._onLogin?.(session.user); } catch (e) {}
      }
      if (!session && Hub.app?._loggedIn) {
        // Session truly gone (very rare) — show login once cleanly
        console.warn('[Auth] Watchdog: session lost while logged in');
        Hub.app._loggedIn = false;
        Hub.router?.showScreen?.('login');
      }
    }, SUPABASE_CONFIG.KEEPALIVE_MINUTES * 60 * 1000);

    // Restore session when tab re-focuses
    const onWake = async () => {
      const session = await _refreshIfNeeded('wake');
      if (session?.user && !Hub.app?._loggedIn) {
        try { await Hub.app?._onLogin?.(session.user); } catch (e) {}
      }
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) onWake(); });
    window.addEventListener('focus',    onWake);
    window.addEventListener('pageshow', onWake);
    window.addEventListener('online',   () => _refreshIfNeeded('online'));
  }

  _startKeepAlive();

  // ── Helper: DB query with timeout ──────────────────────────
  function timed(queryBuilder) {
    return Promise.race([
      queryBuilder,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`DB timeout (${SUPABASE_CONFIG.DB_QUERY_TIMEOUT_MS}ms)`)),
                   SUPABASE_CONFIG.DB_QUERY_TIMEOUT_MS))
    ]);
  }

  // ── Auth API ───────────────────────────────────────────────
  Hub.auth = {
    async signInGoogle() {
      console.log('[Auth] signInGoogle (PKCE) — extended scopes + offline access');
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/#/',
          scopes: [
            'email',
            'profile',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/photoslibrary.readonly'
          ].join(' '),
          queryParams: {
            access_type:             'offline',
            prompt:                  'consent',
            include_granted_scopes:  'true'
          }
        }
      });
      if (error) console.error('[Auth] OAuth error:', error);
    },

    async signOut() {
      console.log('[Auth] signOut()');
      Hub.app._loggedIn      = false;
      Hub.app._loginInProgress = false;
      Hub.app._authHandled   = false;
      Hub.state.user         = null;
      Hub.state.household_id = null;
      Hub.state.userRole     = null;
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

    async ensureFreshSession(reason = 'manual') {
      return _refreshIfNeeded(reason);
    },

    async checkAccess(user) {
      try {
        console.log('[Auth] checkAccess:', user.email);
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
        Hub.state.userRole     = data.role;
        console.log('[Auth] ✓ Granted — household:', data.household_id);
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

  // ── Debug ──────────────────────────────────────────────────
  Hub.debug = {
    async checkSupabase() {
      const out = [];
      const log = m => { out.push(m); console.log('[Debug]', m); };
      const el  = document.getElementById('debugOutput');
      if (el) { el.style.display = 'block'; el.textContent = 'Running…\n'; }

      log('═══ Supabase Diagnostics ═══');
      log('URL: ' + (SB_URL || 'MISSING'));
      log('Key: ' + (SB_KEY.length > 20 ? 'yes' : 'MISSING'));

      try {
        const { data: { session }, error } = await sb.auth.getSession();
        if (error) log('getSession error: ' + error.message);
        else if (session) {
          log('✓ Session: ' + session.user.email);
          log('  Expires: ' + new Date(session.expires_at * 1000).toLocaleString());
        } else log('✗ No session');
      } catch (e) { log('getSession exception: ' + e.message); }

      try {
        const { data, error } = await timed(sb.from('household_members').select('household_id,email,role').limit(5));
        if (error) log('✗ household_members: ' + error.message);
        else log('✓ household_members: ' + JSON.stringify(data));
      } catch (e) { log('✗ ' + e.message); }

      if (el) el.textContent = out.join('\n');
      return out;
    }
  };

  // ── DB helpers ─────────────────────────────────────────────
  Hub.db = {
    async loadSettings(userId) {
      const { data } = await timed(sb.from('user_settings').select('*').eq('user_id', userId).maybeSingle());
      return data;
    },

    async saveSettings(userId, householdId, settings) {
      const payload = {
        user_id:              userId,
        household_id:         householdId,
        location_name:        settings.location_name,
        location_lat:         settings.location_lat,
        location_lon:         settings.location_lon,
        standby_timeout_min:  settings.standby_timeout_min,
        quiet_hours_start:    settings.quiet_hours_start,
        quiet_hours_end:      settings.quiet_hours_end,
        immich_base_url:      settings.immich_base_url,
        immich_api_key:       settings.immich_api_key,
        immich_album_id:      settings.immich_album_id,
        selected_calendars:   settings.selected_calendars   || ['primary'],
        // Photo provider settings (persisted in localStorage for now;
        // DB columns added via migration snippet — save if present)
        photo_provider:             settings.photo_provider            || null,
        google_photos_album_id:     settings.google_photos_album_id   || null,
        google_photos_album_title:  settings.google_photos_album_title || null,
        imgur_album_id:             settings.imgur_album_id            || null,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await timed(
        sb.from('user_settings').upsert(payload, { onConflict: 'user_id' }).select().single()
      );
      if (error) {
        // If new columns don't exist yet, retry without them
        if (error.message?.includes('photo_provider') || error.message?.includes('google_photos')) {
          const { photo_provider, google_photos_album_id, google_photos_album_title, imgur_album_id, ...safePayload } = payload;
          const { data: d2, error: e2 } = await timed(
            sb.from('user_settings').upsert(safePayload, { onConflict: 'user_id' }).select().single()
          );
          if (e2) throw e2;
          return d2;
        }
        throw error;
      }
      return data;
    },

    async loadChores(householdId) {
      const { data, error } = await timed(
        sb.from('chores').select('*').eq('household_id', householdId).order('created_at', { ascending: false })
      );
      if (error) throw error;
      return data || [];
    },

    async loadChoresWithCompleters(householdId) {
      const { data: chores, error } = await timed(
        sb.from('chores').select('*').eq('household_id', householdId).order('created_at', { ascending: false })
      );
      if (error) throw error;
      if (!chores) return [];

      const needsLookup = chores.filter(c => c.status === 'done' && !c.completed_by_name);
      if (needsLookup.length === 0) return chores;

      try {
        const doneIds = needsLookup.map(c => c.id);
        const { data: logs } = await timed(
          sb.from('chore_logs').select('chore_id, notes').in('chore_id', doneIds).order('completed_at', { ascending: false })
        );
        if (logs?.length) {
          const notesMap = {};
          logs.forEach(l => { if (!notesMap[l.chore_id] && l.notes) notesMap[l.chore_id] = l.notes; });
          return chores.map(c => {
            if (c.status === 'done' && !c.completed_by_name && notesMap[c.id]) {
              const m = notesMap[c.id].match(/Completed by (.+)/);
              return { ...c, completed_by_name: m ? m[1] : null };
            }
            return c;
          });
        }
      } catch (e) { console.warn('[DB] Completer lookup failed:', e.message); }
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
      await timed(sb.from('chore_logs').delete().eq('chore_id', id));
      const { error } = await timed(sb.from('chores').delete().eq('id', id));
      if (error) throw error;
    },

    async logChoreCompletion(choreId, householdId, userId, notes) {
      const { error } = await timed(
        sb.from('chore_logs').insert({ chore_id: choreId, household_id: householdId, completed_by: userId, notes })
      );
      if (error) throw error;
    },

    async loadChoreLogs(householdId, sinceIso) {
      let q = sb.from('chore_logs').select('completed_at, notes').eq('household_id', householdId)
               .order('completed_at', { ascending: false }).limit(1000);
      if (sinceIso) q = q.gte('completed_at', sinceIso);
      const { data, error } = await timed(q);
      if (error) throw error;
      return data || [];
    },

    async markChoreDone(choreId, userId, personName) {
      try {
        const { error } = await timed(
          sb.from('chores').update({ status: 'done', completed_by_name: personName }).eq('id', choreId)
        );
        if (error) {
          console.warn('[DB] completed_by_name update failed, trying status only:', error.message);
          const { error: e2 } = await timed(sb.from('chores').update({ status: 'done' }).eq('id', choreId));
          if (e2) throw e2;
        }
      } catch (e) {
        const { error } = await timed(sb.from('chores').update({ status: 'done' }).eq('id', choreId));
        if (error) throw error;
      }
      try {
        const { data: chore } = await timed(sb.from('chores').select('household_id').eq('id', choreId).single());
        if (chore) await this.logChoreCompletion(choreId, chore.household_id, userId, 'Completed by ' + personName);
      } catch (e) { console.warn('[DB] Completion log failed:', e.message); }
    },

    async loadSiteControlSettings(householdId, siteName) {
      const { data, error } = await timed(
        sb.from('site_control_settings').select('*').eq('household_id', householdId).eq('site_name', siteName).maybeSingle()
      );
      if (error) throw error;
      return data;
    },

    async saveSiteControlSettings(householdId, siteName, userId, payload) {
      const row = { ...payload, household_id: householdId, site_name: siteName, updated_by: userId || null, updated_at: new Date().toISOString() };
      const { data, error } = await timed(
        sb.from('site_control_settings').upsert(row, { onConflict: 'household_id,site_name' }).select().single()
      );
      if (error) throw error;
      return data;
    },

    async markAlertSeen(userId, alertId, severity) {
      await timed(sb.from('seen_alerts').upsert({ user_id: userId, alert_id: alertId, severity, seen_at: new Date().toISOString() }, { onConflict: 'user_id,alert_id' }));
    },

    async isAlertSeen(userId, alertId) {
      const { data } = await timed(sb.from('seen_alerts').select('id').eq('user_id', userId).eq('alert_id', alertId).maybeSingle());
      return !!data;
    },

    // ── Grocery ──────────────────────────────────────────────
    async getGroceryItems(householdId) {
      const { data, error } = await timed(
        sb.from('grocery_items').select('*').eq('household_id', householdId)
          .order('position', { ascending: true }).order('created_at', { ascending: false })
      );
      if (error) throw error;
      return data || [];
    },

    async addGroceryItem(householdId, text) {
      const { data, error } = await timed(
        sb.from('grocery_items').insert({
          household_id:  householdId,
          text:          text.trim(),
          done:          false,
          added_by:      Hub.state?.user?.id || null,
          added_by_name: Hub.utils?.getUserFirstName?.() || null,
          position:      0
        }).select().single()
      );
      if (error) throw error;
      return data;
    },

    async toggleGroceryItem(id, done) {
      const { data, error } = await timed(sb.from('grocery_items').update({ done }).eq('id', id).select().single());
      if (error) throw error;
      return data;
    },

    async deleteGroceryItem(id) {
      const { error } = await timed(sb.from('grocery_items').delete().eq('id', id));
      if (error) throw error;
    },

    async clearCompletedGroceryItems(householdId) {
      const { error } = await timed(sb.from('grocery_items').delete().eq('household_id', householdId).eq('done', true));
      if (error) throw error;
    },

    async clearAllGroceryItems(householdId) {
      const { error } = await timed(sb.from('grocery_items').delete().eq('household_id', householdId));
      if (error) throw error;
    },

    subscribeToGrocery(householdId, callback) {
      return sb.channel('grocery:' + householdId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_items',
            filter: `household_id=eq.${householdId}` }, callback)
        .subscribe();
    },

    async logSystem(source, service, status, message, latencyMs) {
      await timed(sb.from('system_logs').insert({ source, service, status, message, latency_ms: latencyMs }).select());
    }
  };
})();
