// ============================================================
// assets/supabase.js — Supabase auth + DB helpers  (v8 — google-token-stale-fix)
//
// v8 fixes (Google Stay-Logged-In Fix):
//   - onAuthChange: only cache provider_token on SIGNED_IN event.
//     Previously cached on every event (INITIAL_SESSION, TOKEN_REFRESHED)
//     which kept re-caching the ORIGINAL Google access token (stale past
//     1 hour) with a fresh 55-min TTL, preventing /api/token-refresh from
//     ever running.
//   - getGoogleAccessToken: server-side /api/token-refresh is now the
//     PRIMARY path. session.provider_token is only a fallback (with short
//     5-min TTL) for cases where the server refresh is unavailable.
//     This is what actually makes "stay logged in" work on the kiosk.
//
// v7 fixes (OAuth Logout Fix):
//   - REFRESH_UNKNOWN sentinel: _refreshIfNeeded distinguishes transient
//     errors (network, timing) from confirmed absent sessions
//   - Watchdog: confirms session absence with recheck + grace period
//     before logging out; ignores REFRESH_UNKNOWN
//   - Wake handler: skips refresh when offline; ignores transient errors
//   - _saveGoogleRefreshToken: resolves household_id from DB if Hub.state
//     isn't ready yet (fixes upsert failures on first login)
//   - ensureFreshSession: normalizes REFRESH_UNKNOWN → null for callers
//   - Online handler: 1.5s delay to let network stabilize
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
  WAKE_DEBOUNCE_MS:                2000,
  SIGNED_OUT_RECHECK_MS:           3000,   // grace period before confirming logout
  MAX_WATCHDOG_RETRIES:            2       // retries before treating null as real logout
};

// Sentinel: _refreshIfNeeded returns this instead of null when the failure
// is transient (network error, timing gap) vs. a confirmed absent session.
const REFRESH_UNKNOWN = Symbol('REFRESH_UNKNOWN');

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
  // Returns: session object | null (confirmed no session) | REFRESH_UNKNOWN (transient error)
  async function _refreshIfNeeded(reason) {
    try {
      const { data: { session }, error: getErr } = await sb.auth.getSession();

      // Distinguish "no session" from "error getting session"
      if (getErr) {
        console.warn(`[Auth] getSession error (${reason}):`, getErr.message);
        return REFRESH_UNKNOWN;     // transient — don't treat as logout
      }
      if (!session) return null;    // confirmed: no session exists

      const expiresAt   = session.expires_at ? session.expires_at * 1000 : null;
      const secondsLeft = expiresAt ? Math.floor((expiresAt - Date.now()) / 1000) : Infinity;

      if (secondsLeft > SUPABASE_CONFIG.REFRESH_IF_EXPIRES_IN_SECONDS) return session;

      console.log(`[Auth] Refreshing (${reason}) — ${secondsLeft}s left`);
      const { data, error } = await sb.auth.refreshSession();
      if (error) { console.warn('[Auth] refreshSession error:', error.message); return session; }
      return data?.session || session;
    } catch (e) {
      console.warn('[Auth] refreshIfNeeded exception:', e.message);
      // Network error / offline — NOT a real logout
      return REFRESH_UNKNOWN;
    }
  }

  // ── Keep-alive + watchdog ────────────────────────────────────
  let _keepAliveStarted = false;
  let _wakeDebounceTimer = null;

  function _startKeepAlive() {
    if (_keepAliveStarted) return;
    _keepAliveStarted = true;

    try { sb.auth.startAutoRefresh?.(); } catch (e) {}

    // ── Supabase JWT watchdog (every 4 min) ─────────────────
    setInterval(async () => {
      const session = await _refreshIfNeeded('watchdog');

      // Transient error — skip this cycle, don't touch login state
      if (session === REFRESH_UNKNOWN) {
        console.log('[Auth] Watchdog: transient error — skipping');
        return;
      }

      // App thinks it's logged out but session still exists → re-login ONCE
      if (session?.user && !Hub.app?._loggedIn) {
        console.warn('[Auth] Watchdog: session exists but app thinks logged out — re-login');
        try { await Hub.app?._onLogin?.(session.user); } catch (e) {}
        return;
      }

      // Session appears gone while logged in → CONFIRM before logout
      if (!session && Hub.app?._loggedIn) {
        // ⚠️ NEVER automatically sign out unless explicitSignOut is true!
        if (!Hub.auth?._explicitSignOut) {
          console.log('[Auth] Watchdog: session appears gone but explicit sign out is false. Keeping user logged in.');
          return;
        }
        console.warn('[Auth] Watchdog: session appears gone — rechecking…');
        // Wait a beat, then do a fresh getSession() to confirm
        await new Promise(r => setTimeout(r, SUPABASE_CONFIG.SIGNED_OUT_RECHECK_MS));
        try {
          const { data: { session: recheck } } = await sb.auth.getSession();
          if (recheck?.user) {
            console.log('[Auth] Watchdog: recheck found session — false alarm');
            return;
          }
        } catch (e) {
          console.warn('[Auth] Watchdog: recheck failed — keeping session:', e.message);
          return;  // error during recheck = transient, don't logout
        }
        // Confirmed: session truly gone
        console.warn('[Auth] Watchdog: session confirmed expired — showing login');
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
        // Skip wake refresh if offline — no point hitting the network
        if (!navigator.onLine) {
          console.log('[Auth] Wake: offline — skipping refresh');
          return;
        }

        const session = await _refreshIfNeeded('wake');

        // Transient error — don't touch anything, watchdog will catch up
        if (session === REFRESH_UNKNOWN) {
          console.log('[Auth] Wake: transient error — skipping');
          return;
        }

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
    window.addEventListener('online',   () => {
      // Delay slightly — 'online' fires before network is truly ready
      setTimeout(() => _refreshIfNeeded('online'), 1500);
    });
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
    _explicitSignOut: false,

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
      Hub.auth._explicitSignOut = true;
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
      const result = await _refreshIfNeeded(reason);
      // Normalize: callers should never see the internal sentinel
      return (result === REFRESH_UNKNOWN) ? null : result;
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
        // ALWAYS persist provider_refresh_token to DB when present.
        // It can appear on SIGNED_IN (fresh from OAuth) and sometimes
        // TOKEN_REFRESHED. We need it in DB for /api/token-refresh to work.
        if (session?.provider_refresh_token && session?.user?.id) {
          Hub.auth._saveGoogleRefreshToken(session.user.id, session.provider_refresh_token).catch(() => {});
        }
        // ⚠️ Only cache provider_token on SIGNED_IN — this is the ONLY event
        // where Supabase guarantees a freshly-issued Google access token.
        //
        // On INITIAL_SESSION / TOKEN_REFRESHED events, session.provider_token
        // is whatever was persisted in localStorage from the ORIGINAL OAuth
        // exchange. Supabase does NOT refresh Google tokens — it only refreshes
        // its own JWT. So that token is stale after 1 hour, and caching it
        // with a fresh 55min TTL prevents /api/token-refresh from ever being
        // called. That's what broke "stay logged in" on the kiosk.
        if (event === 'SIGNED_IN' && session?.provider_token) {
          _cacheGoogleToken(session.provider_token);
        }
        cb(event, session);
      });
    },

    /** Persist Google refresh token to user_settings for server-side use.
     *  Uses Supabase client upsert (not raw PATCH) so it works even if no
     *  user_settings row exists yet (first login).
     *  Resolves household_id from DB if Hub.state isn't ready yet.
     *  Aborts gracefully if household_id can't be resolved (NOT NULL column). */
    async _saveGoogleRefreshToken(userId, refreshToken) {
      if (!refreshToken || !userId) return;

      // 🛡️ Store a local backup of the refresh token in localStorage in case the DB gets cleared
      try {
        localStorage.setItem(`hub_google_refresh_token_${userId}`, refreshToken);
      } catch (_) {}

      try {
        // Resolve household_id — required NOT NULL column on user_settings
        let householdId = Hub.state?.household_id;
        if (!householdId) {
          try {
            const { data } = await timed(
              sb.from('household_members').select('household_id').eq('user_id', userId).limit(1).maybeSingle()
            );
            householdId = data?.household_id || null;
          } catch (_) {}
        }

        // Attempt 1: Supabase upsert (preferred — works for new + existing rows)
        if (householdId) {
          const { error } = await timed(
            sb.from('user_settings').upsert({
              user_id:                 userId,
              household_id:            householdId,
              google_refresh_token:    refreshToken,
              google_token_updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })
          );
          if (!error) {
            console.log('[Auth] Google refresh token persisted ✓ (upsert)');
            return;
          }
          console.warn('[Auth] Upsert refresh token failed:', error.message);
        }

        // Attempt 2: PATCH (only updates existing row — works without household_id)
        try {
          const sess = (await sb.auth.getSession()).data.session;
          if (!sess?.access_token) {
            console.warn('[Auth] No session for PATCH fallback — skipping refresh token save');
            return;
          }
          const patchResp = await fetch(`${SB_URL}/rest/v1/user_settings?user_id=eq.${userId}`, {
            method:  'PATCH',
            headers: {
              apikey:          SB_KEY,
              Authorization:   `Bearer ${sess.access_token}`,
              'Content-Type':  'application/json',
              Prefer:          'return=minimal',
            },
            body: JSON.stringify({
              google_refresh_token:    refreshToken,
              google_token_updated_at: new Date().toISOString(),
            }),
          });
          if (patchResp.ok) {
            console.log('[Auth] Google refresh token persisted ✓ (PATCH)');
          } else {
            const detail = await patchResp.text().catch(() => '');
            console.warn(`[Auth] PATCH refresh token failed: ${patchResp.status} ${detail}`);
          }
        } catch (e) {
          console.warn('[Auth] PATCH fallback error:', e.message);
        }
      } catch (e) {
        console.warn('[Auth] Failed to persist refresh token:', e.message);
      }
    },

    /**
     * Get a valid Google access token, refreshing via server if needed.
     * Tries: localStorage cache → /api/token-refresh (stored refresh_token)
     *        → session.provider_token (fallback only — stale past 1hr)
     * Caches in localStorage with 55-min TTL on server refresh, 5-min on fallback.
     *
     * NOTE: Supabase stores session.provider_token in localStorage indefinitely
     * and NEVER refreshes it against Google. So it is only trustworthy right
     * after SIGNED_IN. That's why the server-side refresh (which uses the
     * stored refresh_token) is the primary path for long-running kiosk use.
     *
     * Mutex: prevents duplicate /api/token-refresh calls when multiple callers
     * (Calendar, proactive refresh) fire simultaneously.
     */
    _googleRefreshInFlight: null,  // mutex promise

    async getGoogleAccessToken() {
      const CACHE_KEY = 'hub_google_token';
      const CACHE_EXP = 'hub_google_token_exp';

      // 1. Check localStorage cache (55-min TTL — Google tokens live 60min).
      //    Populated by SIGNED_IN event and by successful /api/token-refresh.
      try {
        const cached  = localStorage.getItem(CACHE_KEY);
        const expiry  = parseInt(localStorage.getItem(CACHE_EXP) || '0', 10);
        if (cached && expiry > Date.now()) {
          return cached;
        }
      } catch (_) {}

      // 2. Need the Supabase access_token to call /api/token-refresh.
      let session = null;
      try {
        const { data } = await sb.auth.getSession();
        session = data?.session;
      } catch (_) {}

      // 3. PRIMARY path: server-side exchange of stored Google refresh_token
      //    for a fresh access_token. This is the only path that works
      //    long-term on the kiosk, because session.provider_token goes stale
      //    after 1 hour and Supabase never refreshes it.
      const supabaseJwt = session?.access_token;
      if (supabaseJwt) {
        // Mutex so Calendar + proactive-refresh don't race
        if (this._googleRefreshInFlight) {
          try {
            const t = await this._googleRefreshInFlight;
            if (t) return t;
          } catch (_) {}
        } else {
          this._googleRefreshInFlight = this._fetchGoogleTokenFromServer(supabaseJwt);
          try {
            const t = await this._googleRefreshInFlight;
            if (t) return t;
          } finally {
            this._googleRefreshInFlight = null;
          }
        }
      }

      // 4. FALLBACK: session.provider_token.
      //    Only used when server refresh failed AND we still have a session
      //    with a provider_token (e.g. first-time user right after OAuth
      //    whose refresh_token hasn't been persisted to DB yet, or
      //    /api/token-refresh is temporarily unreachable). May be stale past
      //    the first hour — callers (calendar.js) handle 401 by clearing
      //    the cache and retrying, which will force another refresh attempt.
      if (session?.provider_token) {
        console.log('[Auth] Server refresh unavailable — falling back to session.provider_token');
        // Short TTL (5 min) because we don't trust its freshness.
        _cacheGoogleToken(session.provider_token, 5 * 60);
        return session.provider_token;
      }

      return null;
    },

    /** Internal: fetch Google token from /api/token-refresh with 1 retry */
    async _fetchGoogleTokenFromServer(supabaseAccessToken) {
      const base = Hub.utils?.apiBase?.() || '';
      const MAX_ATTEMPTS = 2;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

          const resp = await fetch(`${base}/api/token-refresh`, {
            method:  'POST',
            headers: { Authorization: `Bearer ${supabaseAccessToken}` },
            signal:  controller.signal,
          });
          clearTimeout(timeout);

          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            if (err.action === 'reauth_required') {
              console.warn('[Auth] Google refresh token invalid — checking for local backups...');
              
              // 🛡️ Self-healing backup restore mechanism!
              // If the DB lost or cleared the refresh token (404), but we still have a local backup in
              // localStorage, silently restore it to the DB and perform one automatic retry.
              const userId = (await sb.auth.getSession()).data.session?.user?.id;
              if (userId) {
                try {
                  const localBackup = localStorage.getItem(`hub_google_refresh_token_${userId}`);
                  if (localBackup) {
                    console.info('[Auth] Found local backup of Google refresh token — attempting self-healing DB restore...');
                    
                    // Temporarily remove to avoid any infinite loop if the token is truly revoked by Google
                    localStorage.removeItem(`hub_google_refresh_token_${userId}`);
                    
                    await Hub.auth._saveGoogleRefreshToken(userId, localBackup);
                    Hub.state._googleAuthExpired = false;
                    
                    // Silent retry
                    return await this._fetchGoogleTokenFromServer(supabaseAccessToken);
                  }
                } catch (backupErr) {
                  console.warn('[Auth] Self-healing restore failed:', backupErr.message);
                }
              }

              console.warn('[Auth] No local backup found or restore failed — user must re-authenticate');
              Hub.state._googleAuthExpired = true;
              return null;  // no point retrying — token is permanently invalid
            }
            // Transient server error — retry if we have attempts left
            if (attempt < MAX_ATTEMPTS && resp.status >= 500) {
              console.warn(`[Auth] Server token refresh failed (${resp.status}), retrying…`);
              await new Promise(r => setTimeout(r, 1000 * attempt));
              continue;
            }
            console.warn(`[Auth] Server token refresh failed: ${resp.status}`, err);
            return null;
          }

          const { access_token, expires_in } = await resp.json();
          if (access_token) {
            Hub.state._googleAuthExpired = false;
            _cacheGoogleToken(access_token, (expires_in || 3600) - 300);
            return access_token;
          }
          return null;
        } catch (e) {
          if (e.name === 'AbortError') {
            console.warn(`[Auth] Token refresh timed out (attempt ${attempt})`);
          } else {
            console.warn(`[Auth] Token refresh error (attempt ${attempt}):`, e.message);
          }
          if (attempt < MAX_ATTEMPTS) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
            continue;
          }
          return null;
        }
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
