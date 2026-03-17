// /api/push-subscribe.js — Save or delete a browser push subscription
// POST { subscription: PushSubscription, action: 'subscribe'|'unsubscribe' }
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const SB_URL    = process.env.SUPABASE_URL;
  const SB_ANON   = process.env.SUPABASE_ANON_KEY;
  if (!SB_URL || !SB_ANON) return res.status(500).json({ error: 'Missing env' });

  // Resolve user
  const userResp = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` }
  });
  if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
  const user = await userResp.json();

  // Resolve household
  const memResp = await fetch(
    `${SB_URL}/rest/v1/household_members?select=household_id&email=eq.${encodeURIComponent(user.email)}&limit=1`,
    { headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` } }
  );
  const mem = (await memResp.json())?.[0];
  if (!mem?.household_id) return res.status(403).json({ error: 'No household' });

  const { subscription, action } = req.body || {};
  const endpoint = subscription?.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'Missing subscription endpoint' });

  if (action === 'unsubscribe') {
    await fetch(
      `${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${user.id}`,
      { method: 'DELETE', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    return res.status(200).json({ ok: true });
  }

  // Upsert subscription
  const row = {
    user_id:      user.id,
    household_id: mem.household_id,
    endpoint,
    p256dh:       subscription.keys?.p256dh,
    auth:         subscription.keys?.auth,
  };
  await fetch(`${SB_URL}/rest/v1/push_subscriptions`, {
    method:  'POST',
    headers: {
      apikey:          process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:   `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  });
  return res.status(200).json({ ok: true });
}
