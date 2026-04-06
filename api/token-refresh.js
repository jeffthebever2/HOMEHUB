// /api/token-refresh.js — Server-side Google OAuth2 token refresh
//
// The Pi runs 24/7. Google access tokens expire after 1 hour.
// This endpoint exchanges the stored Google refresh token for a fresh
// access token, so Calendar (and any other Google API) stays alive
// across reboots and long idle periods without user re-authentication.
//
// POST /api/token-refresh
//   Authorization: Bearer <supabase_access_token>
//   → { access_token, expires_in }
//
// Required Vercel env vars:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

const GOOGLE_TOKEN_URL      = 'https://oauth2.googleapis.com/token';
const FETCH_TIMEOUT_MS      = 10000;  // 10s timeout for external requests
const GOOGLE_RETRY_ATTEMPTS = 2;

/** Fetch with AbortController timeout */
async function fetchWithTimeout(url, opts, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const SB_URL  = process.env.SUPABASE_URL;
  const SB_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SB_ANON = process.env.SUPABASE_ANON_KEY;
  const GG_ID   = process.env.GOOGLE_CLIENT_ID;
  const GG_SEC  = process.env.GOOGLE_CLIENT_SECRET;

  if (!SB_URL || !SB_SVC) return res.status(500).json({ error: 'Missing Supabase env' });
  if (!GG_ID || !GG_SEC)  return res.status(500).json({ error: 'Missing Google OAuth env vars (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)' });

  // ── Identify the caller ─────────────────────────────────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' });

  let user;
  try {
    const userResp = await fetchWithTimeout(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON || SB_SVC, Authorization: `Bearer ${token}` },
    });
    if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
    user = await userResp.json();
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Supabase auth timeout' : e.message;
    return res.status(502).json({ error: `Auth verification failed: ${msg}` });
  }

  // ── Look up stored refresh token ────────────────────────────────────────
  let settings, settingsError;
  try {
    const settingsResp = await fetchWithTimeout(
      `${SB_URL}/rest/v1/user_settings?user_id=eq.${user.id}&select=google_refresh_token,google_token_updated_at,household_id&limit=1`,
      { headers: { apikey: SB_SVC, Authorization: `Bearer ${SB_SVC}` } }
    );
    if (!settingsResp.ok) {
      settingsError = `user_settings query failed: ${settingsResp.status}`;
    } else {
      const rows = await settingsResp.json();
      settings = rows?.[0];
    }
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'DB query timeout' : e.message;
    settingsError = `user_settings fetch error: ${msg}`;
  }

  if (settingsError) {
    console.error('[token-refresh]', settingsError);
    return res.status(500).json({
      error: settingsError,
      hint: 'Check that user_settings table exists and has google_refresh_token column. Run migration if needed.',
    });
  }

  const refreshToken = settings?.google_refresh_token;

  if (!refreshToken) {
    const diag = {
      user_id:       user.id,
      has_settings:  !!settings,
      columns_found: settings ? Object.keys(settings) : [],
      updated_at:    settings?.google_token_updated_at || null,
    };
    console.warn('[token-refresh] No refresh token found:', JSON.stringify(diag));
    return res.status(404).json({
      error: 'No Google refresh token stored. User must sign in once more to grant offline access.',
      action: 'reauth_required',
      diagnostics: diag,
    });
  }

  // ── Exchange refresh token for new access token (with retry) ────────────
  let lastError = null;
  for (let attempt = 1; attempt <= GOOGLE_RETRY_ATTEMPTS; attempt++) {
    try {
      const tokenResp = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     GG_ID,
          client_secret: GG_SEC,
          refresh_token: refreshToken,
          grant_type:    'refresh_token',
        }),
      });

      if (tokenResp.ok) {
        const { access_token, expires_in } = await tokenResp.json();
        const ttl = (expires_in || 3600) - 60;
        res.setHeader('Cache-Control', `private, max-age=${ttl}`);
        return res.status(200).json({ access_token, expires_in: expires_in || 3600 });
      }

      // Non-OK response from Google
      const err = await tokenResp.json().catch(() => ({}));

      // Permanent failure: refresh_token revoked — clear it and stop retrying
      if (err.error === 'invalid_grant') {
        await fetchWithTimeout(
          `${SB_URL}/rest/v1/user_settings?user_id=eq.${user.id}`,
          {
            method:  'PATCH',
            headers: { apikey: SB_SVC, Authorization: `Bearer ${SB_SVC}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ google_refresh_token: null, google_token_updated_at: null }),
          }
        ).catch(() => {});
        return res.status(401).json({ error: 'Google refresh token revoked. Please sign in again.', action: 'reauth_required' });
      }

      // Transient Google error (rate limit, server error) — retry
      if (attempt < GOOGLE_RETRY_ATTEMPTS && (tokenResp.status >= 500 || tokenResp.status === 429)) {
        console.warn(`[token-refresh] Google returned ${tokenResp.status}, retrying (${attempt}/${GOOGLE_RETRY_ATTEMPTS})…`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }

      // Non-retryable error
      return res.status(502).json({
        error: `Google token exchange failed: ${err.error || tokenResp.status}`,
        error_description: err.error_description || null,
        token_updated_at: settings?.google_token_updated_at || null,
      });

    } catch (e) {
      lastError = e;
      const msg = e.name === 'AbortError' ? 'Google API timeout' : e.message;
      console.warn(`[token-refresh] Attempt ${attempt} error: ${msg}`);
      if (attempt < GOOGLE_RETRY_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }
    }
  }

  // All retries exhausted
  return res.status(502).json({
    error: `Google token exchange failed after ${GOOGLE_RETRY_ATTEMPTS} attempts: ${lastError?.message || 'unknown'}`,
  });
}
