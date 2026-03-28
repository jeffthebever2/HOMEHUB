// ============================================================
// assets/supabase.js — Supabase auth + DB helpers  (v6 — stabilized)
//
// v6 fixes:
//   - _startKeepAlive deferred to app.init() — no early listeners
//   - Wake handler debounced (2s) to prevent double-fire
//   - getGoogleAccessToken: removed dead refreshSession() step
//   - _saveGoogleRefreshToken: uses upsert (works for new users)
//   - _googleAuthExpired flag cleared on successful token fetch
//   - onAuthChange captures provider_refresh_token before app callback
// ============================================================
window.Hub = window.Hub || {};

const SUPABASE_CONFIG = {
  DB_QUERY_TIMEOUT_MS:             6000,
  KEEPALIVE_MINUTES:               4,
  REFRESH_IF_EXPIRES_IN_SECONDS:   30 * 60,
  WAKE_DEBOUNCE_MS:                2000
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
  let _wakeDebounceTimer = null;

  function _startKeepAlive() {
    if (_keepAliveStarted) return;
    _keepAliveStarted = true;

    try { sb.auth.startAutoRefresh?.(); } catch (e) {}

    // ── Periodic token watchdog (every 4 min) ──────────────────
    // ── Supabase JWT watchdog (every 4 min) ─────────────────
    setInterval(async () => {
      const session = await _refreshIfNeeded('watchdog');

      // App thinks it's logged out but session still exists → re-login ONCE
      if (session?.user && !Hub.app?._loggedIn) {
        console.warn('[Auth] Watchdog: session exists but app thinks logged out — re-login');
        try { await Hub.app?._onLogin?.(session.user); } catch (e) {}
        return;
      }

      // Session truly gone while logged in → show login
      if (!session && Hub.app?._loggedIn) {
        console.warn('[Auth] Watchdog: session expired — showing login');
        Hub.app._loggedIn = false;
        Hub.router?.showScreen?.('login');
      }
    }, SUPABASE_CONFIG.KEEPALIVE_MINUTES * 60 * 1000);

    // ── Google access token proactive refresh (every 50 min) ─
    // Google tokens expire after 1 hour. Pre-empt expiry so Calendar
    // never gets a 401 during active use on the kiosk.
    setInterval(async () => {
      if (!Hub.app?._loggedIn) return;
      try {
        // Clear cached token to force a fresh fetch
        localStorage.removeItem('hub_google_token');
        localStorage.removeItem('hub_google_token_exp');
        const token = await Hub.auth?.getGoogleAccessToken?.();
        if (token) {
          console.log('[Auth] Google token proactively refreshed ✓');
        }
      } catch (e) {
        console.warn('[Auth] Proactive Google refresh failed:', e.message);
      }
    }, 50 * 60 * 1000); // 50 minutes

    // ── Wake / visibility restore (DEBOUNCED) ─────────────────
    // visibilitychange + focus often fire simultaneously; debounce prevents
    // double _onLogin and duplicate fetch storms.
    const onWake = () => {
      clearTimeout(_wakeDebounceTimer);
      _wakeDebounceTimer = setTimeout(async () => {
        const session = await _refreshIfNeeded('wake');
        if (!session) return; // truly no session — watchdog will handle showing login

        // Capture provider_refresh_token on wake if available
        if (session.provider_refresh_token && session.user?.id) {
          Hub.auth._saveGoogleRefreshToken(session.user.id, session.provider_refresh_token).catch(() => {});
        }

        if (Hub.app?._loggedIn) {
          Hub.app?._onWakeRefresh?.();
          return;
        }

        // Was logged out in memory but session still valid → full re-login
        try { await Hub.app?._onLogin?.(session.user); } catch (e) {}
      }, SUPABASE_CONFIG.WAKE_DEBOUNCE_MS);
    };

    document.addEventListener('visibilitychange', () => { if (!document.hidden) onWake(); });
    window.addEventListener('focus',    onWake);
    window.addEventListener('pageshow', (e) => { if (e.persisted) onWake(); }); // bfcache restore only
    window.addEventListener('online',   () => _refreshIfNeeded('online'));
  }

  // Exposed so app.init() can start keepalive AFTER DOM + modules are ready
  Hub._startKeepAlive = _startKeepAlive;

  // ── Helper: DB query with timeout ──────────────────────────
  function timed(queryBuilder) {
    return Promise.race([
      queryBuilder,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`DB timeout (${SUPABASE_CONFIG.DB_QUERY_TIMEOUT_MS}ms)`)),
                   SUPABASE_CONFIG.DB_QUERY_TIMEOUT_MS))
    ]);
  }

  function _cacheGoogleToken(token, ttlSeconds = 3300) {
    try {
      localStorage.setItem('hub_google_token', token);
      localStorage.setItem('hub_google_token_exp', String(Date.now() + ttlSeconds * 1000));
    } catch (_) {}
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
            // photoslibrary.readonly REMOVED — Google shut down Library API
            // read/browse access for normal user albums on March 31, 2025.
            // Photos slideshow now uses Imgur or Immich instead.
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
      console.log('[Auth] signOut() — full provider logout');
      Hub.app._loggedIn      = false;
      Hub.app._loginInProgress = false;
      Hub.app._authHandled   = false;
      Hub.state.user         = null;
      Hub.state.household_id = null;
      Hub.state.userRole     = null;

      // Hide bottom navigation
      document.body.classList.remove('show-nav', 'standby-mode');

      // 1) Try to revoke Google provider token
      try {
        const { data: { session } } = await sb.auth.getSession();
        const providerToken = session?.provider_token;
        if (providerToken) {
          console.log('[Auth] Revoking Google provider token');
          fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(providerToken), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          }).catch(e => console.warn('[Auth] Google revoke failed (non-critical):', e.message));
        }
      } catch (e) {
        console.warn('[Auth] Could not get session for revoke:', e.message);
      }

      // 2) Sign out of Supabase globally
      try {
        await sb.auth.signOut({ scope: 'global' });
      } catch (e) {
        console.warn('[Auth] Global signOut error, trying local:', e.message);
        try { await sb.auth.signOut(); } catch (e2) {}
      }

      // 3) Clear all storage
      try { localStorage.clear(); } catch (e) {}
      try { sessionStorage.clear(); } catch (e) {}

      // 4) Hard navigate to login
      console.log('[Auth] Storage cleared — redirecting to login');
      window.location.href = window.location.origin + '/#/';
      window.location.reload();
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
      sb.auth.onAuthStateChange((event, session) => {
        // ALWAYS capture Google tokens when available — even if already logged in.
        // TOKEN_REFRESHED fires periodically; the provider_refresh_token must be
        // persisted to DB every time we see one, otherwise /api/token-refresh fails.
        if (session?.provider_refresh_token && session?.user?.id) {
          Hub.auth._saveGoogleRefreshToken(session.user.id, session.provider_refresh_token).catch(() => {});
        }
        // Cache provider_token whenever Supabase gives us one (right after OAuth)
        if (session?.provider_token) {
          _cacheGoogleToken(session.provider_token);
        }
        cb(event, session);
      });
    },

    /** Persist Google refresh token to user_settings for server-side use.
     *  Uses Supabase client upsert (not raw PATCH) so it works even if no
     *  user_settings row exists yet (first login). */
    async _saveGoogleRefreshToken(userId, refreshToken) {
      if (!refreshToken || !userId) return;
      try {
        const { error } = await timed(
          sb.from('user_settings').upsert({
            user_id:                 userId,
            google_refresh_token:    refreshToken,
            google_token_updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
        );
        if (error) {
          // Fallback: columns might not exist — try raw PATCH
          console.warn('[Auth] Upsert refresh token failed, trying PATCH:', error.message);
          const sess = (await sb.auth.getSession()).data.session;
          await fetch(`${SB_URL}/rest/v1/user_settings?user_id=eq.${userId}`, {
            method:  'PATCH',
            headers: {
              apikey:          SB_KEY,
              Authorization:   `Bearer ${sess?.access_token || ''}`,
              'Content-Type':  'application/json',
            },
            body: JSON.stringify({
              google_refresh_token:    refreshToken,
              google_token_updated_at: new Date().toISOString(),
            }),
          });
        }
        console.log('[Auth] Google refresh token persisted ✓');
      } catch (e) {
        console.warn('[Auth] Failed to persist refresh token:', e.message);
      }
    },

    /**
     * Get a valid Google access token, refreshing via server if needed.
     * Tries: localStorage cache → session.provider_token → /api/token-refresh
     * Caches in localStorage with 55-minute TTL.
     *
     * NOTE: sb.auth.refreshSession() does NOT return a new Google provider_token,
     * only a refreshed Supabase JWT. Skipping it saves ~500ms of dead latency.
     */
    async getGoogleAccessToken() {
      const CACHE_KEY = 'hub_google_token';
      const CACHE_EXP = 'hub_google_token_exp';

      // 1. Check localStorage cache (valid for 55 min to avoid 1hr edge)
      try {
        const cached  = localStorage.getItem(CACHE_KEY);
        const expiry  = parseInt(localStorage.getItem(CACHE_EXP) || '0', 10);
        if (cached && expiry > Date.now()) {
          return cached;
        }
      } catch (_) {}

      // 2. Try the current session's provider_token (only present right after OAuth sign-in)
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.provider_token) {
          _cacheGoogleToken(session.provider_token);
          Hub.state._googleAuthExpired = false;
          return session.provider_token;
        }
      } catch (_) {}

      // 3. Server-side exchange: use the stored Google refresh token.
      //    This is the PRIMARY long-term path for kiosk operation.
      //    Supabase refreshSession() does NOT return new Google tokens.
      try {
        const { data: { session } } = await sb.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) return null;

        const base = Hub.utils?.apiBase?.() || '';
        const resp = await fetch(`${base}/api/token-refresh`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          if (err.action === 'reauth_required') {
            console.warn('[Auth] Google refresh token invalid — user must re-authenticate');
            Hub.state._googleAuthExpired = true;
          }
          return null;
        }
        const { access_token, expires_in } = await resp.json();
        if (access_token) {
          // Clear the expired flag — we successfully got a token
          Hub.state._googleAuthExpired = false;
          _cacheGoogleToken(access_token, (expires_in || 3600) - 300);
          return access_token;
        }
      } catch (e) {
        console.warn('[Auth] Server token refresh failed:', e.message);
      }

      return null;
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
        sb.from('site_controls').select('*').eq('household_id', householdId).eq('site_name', siteName).maybeSingle()
      );
      if (error) throw error;
      return data;
    },

    async saveSiteControlSettings(householdId, siteName, userId, payload) {
      const row = { ...payload, household_id: householdId, site_name: siteName, updated_at: new Date().toISOString() };
      const { data, error } = await timed(
        sb.from('site_controls').upsert(row, { onConflict: 'household_id,site_name' }).select().single()
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

    async addGroceryItem(householdId, text, requestedBy) {
      const payload = {
        household_id:  householdId,
        text:          text.trim(),
        done:          false,
        added_by:      Hub.state?.user?.id || null,
        added_by_name: requestedBy || Hub.utils?.getUserFirstName?.() || null,
        position:      0
      };
      // Try with requested_by column first; fall back without it if column doesn't exist
      try {
        payload.requested_by = requestedBy || null;
        const { data, error } = await timed(
          sb.from('grocery_items').insert(payload).select().single()
        );
        if (error) throw error;
        return data;
      } catch (e) {
        if (e.message?.includes('requested_by')) {
          delete payload.requested_by;
          const { data, error } = await timed(
            sb.from('grocery_items').insert(payload).select().single()
          );
          if (error) throw error;
          return data;
        }
        throw e;
      }
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

    /** Load chore completion leaderboard for last N days */
    async loadChoreLeaderboard(householdId, days = 7) {
      const { data, error } = await timed(
        sb.rpc('get_chore_leaderboard', { p_household_id: householdId, p_days: days })
      );
      if (error) throw error;
      return (data || []).map(r => ({ name: r.name, count: Number(r.count) }));
    },

    /** Load member names from DB (used to keep config.js in sync) */
    async loadMemberNames(householdId) {
      // Uses SECURITY DEFINER function to bypass RLS and return all household members.
      // Direct household_members query with eq(household_id) is blocked by RLS
      // which only returns the calling user's own row.
      const { data, error } = await timed(
        sb.rpc('get_household_members', { p_household_id: householdId })
      );
      if (error) throw error;
      return data || [];
    },

    /** Update grocery item position (for drag reorder) */
    async updateGroceryPositions(updates) {
      // updates: [{id, position}]
      await Promise.all(updates.map(({ id, position }) =>
        timed(sb.from('grocery_items').update({ position }).eq('id', id))
      ));
    },

    async logSystem(source, service, status, message, latencyMs) {
      await timed(sb.from('system_logs').insert({ source, service, status, message, latency_ms: latencyMs }).select());
    }
  };
})();
