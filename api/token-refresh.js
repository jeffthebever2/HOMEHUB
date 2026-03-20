// /api/token-refresh.js — Server-side Google OAuth2 token refresh
//
// The Pi runs 24/7. Google access tokens expire after 1 hour.
// This endpoint exchanges the stored Google refresh token for a fresh
// access token, so Calendar (and any other Google API) stays alive
// across reboots and long idle periods without user re-authentication.
//
// POST /api/token-refresh
//   Authorization: Bearer <supabase_access_token>
//   → { access_token, expires_in, cached: false }
//
// Required Vercel env vars:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

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

  const userResp = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SB_ANON || SB_SVC, Authorization: `Bearer ${token}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
  const user = await userResp.json();

  // ── Look up stored refresh token ────────────────────────────────────────
  const settingsResp = await fetch(
    `${SB_URL}/rest/v1/user_settings?user_id=eq.${user.id}&select=google_refresh_token,google_token_updated_at&limit=1`,
    { headers: { apikey: SB_SVC, Authorization: `Bearer ${SB_SVC}` } }
  );
  const settings = (await settingsResp.json())?.[0];
  const refreshToken = settings?.google_refresh_token;

  if (!refreshToken) {
    return res.status(404).json({
      error: 'No Google refresh token stored. User must sign in once more to grant offline access.',
      action: 'reauth_required',
    });
  }

  // ── Exchange refresh token for new access token ─────────────────────────
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GG_ID,
      client_secret: GG_SEC,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });

  if (!tokenResp.ok) {
    const err = await tokenResp.json().catch(() => ({}));
    // refresh_token invalid (user revoked access) — clear the stored token
    if (err.error === 'invalid_grant') {
      await fetch(
        `${SB_URL}/rest/v1/user_settings?user_id=eq.${user.id}`,
        {
          method:  'PATCH',
          headers: { apikey: SB_SVC, Authorization: `Bearer ${SB_SVC}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ google_refresh_token: null, google_token_updated_at: null }),
        }
      ).catch(() => {});
      return res.status(401).json({ error: 'Google refresh token revoked. Please sign in again.', action: 'reauth_required' });
    }
    return res.status(502).json({ error: `Google token exchange failed: ${err.error || tokenResp.status}` });
  }

  const { access_token, expires_in } = await tokenResp.json();

  // Cache for slightly less than expires_in to avoid edge-of-expiry issues
  const ttl = (expires_in || 3600) - 60;
  res.setHeader('Cache-Control', `private, max-age=${ttl}`);
  return res.status(200).json({ access_token, expires_in: expires_in || 3600 });
}
