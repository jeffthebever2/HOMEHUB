// Resolve HomeHub access for current signed-in user via service-role lookup.
// This bypasses client-side RLS/network flakiness for the initial login gate.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const fetchJson = async (url, opts = {}, timeoutMs = 12000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
    try {
      const resp = await fetch(url, { ...opts, signal: ctrl.signal });
      return resp;
    } finally {
      clearTimeout(t);
    }
  };

  try {
    const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!SB_URL || !SB_KEY) {
      return res.status(500).json({ error: 'Server missing Supabase env vars' });
    }

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const userResp = await fetchJson(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` }
    });
    if (!userResp.ok) {
      const detail = await userResp.text().catch(() => '');
      return res.status(401).json({ error: 'Invalid session', detail: detail.slice(0, 200) });
    }

    const user = await userResp.json();
    const email = String(user?.email || '').toLowerCase().trim();
    if (!email) return res.status(401).json({ error: 'User email missing in session' });

    const memberResp = await fetchJson(
      `${SB_URL}/rest/v1/household_members?select=household_id,role,email&email=ilike.${encodeURIComponent(email)}&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!memberResp.ok) {
      const detail = await memberResp.text().catch(() => '');
      return res.status(500).json({ error: 'Membership lookup failed', detail: detail.slice(0, 200) });
    }

    const allowedResp = await fetchJson(
      `${SB_URL}/rest/v1/allowed_emails?select=id,email&email=ilike.${encodeURIComponent(email)}&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!allowedResp.ok) {
      const detail = await allowedResp.text().catch(() => '');
      return res.status(500).json({ error: 'Allowed email lookup failed', detail: detail.slice(0, 200) });
    }

    const member = (await memberResp.json())[0] || null;
    const allowed = (await allowedResp.json())[0] || null;
    if (!member || !allowed) {
      return res.status(403).json({ error: 'Access not granted for this account', email });
    }

    return res.status(200).json({
      ok: true,
      email,
      household_id: member.household_id,
      role: member.role || 'member'
    });
  } catch (e) {
    return res.status(500).json({ error: 'Auth access check failed', detail: e?.message || String(e) });
  }
}

