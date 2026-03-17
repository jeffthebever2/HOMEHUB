// /api/push-notifications.js — Unified push notification endpoint
// POST with action in body:
//   action: "subscribe"   — save a browser push subscription
//   action: "unsubscribe" — remove a subscription
//   action: "send"        — fire notification to all household subscribers
//
// Merged from push-subscribe.js + push-alert.js to stay within
// Vercel Hobby's 12 serverless function limit.

import webpush from 'web-push';

const VAPID_PUBLIC  = 'BDTOG1Io2qVKPDuDOV-aat7wlTow6_I004jpwcNpwX4YRrglV1To2AaWlT3YyY9lZcuKZWdHrVa28QWKeQxS-4o';
const VAPID_PRIVATE = 'P1ZHN_yaZnkJDsGBW_YwUvCxagyjW4tJUKKleXkKl5w';
webpush.setVapidDetails('mailto:will@homehub.local', VAPID_PUBLIC, VAPID_PRIVATE);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const SB_URL  = process.env.SUPABASE_URL;
  const SB_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SB_ANON = process.env.SUPABASE_ANON_KEY;
  if (!SB_URL || !SB_SVC) return res.status(500).json({ error: 'Missing env' });

  const { action } = req.body || {};

  // ── Subscribe / Unsubscribe ────────────────────────────────────────────
  if (action === 'subscribe' || action === 'unsubscribe') {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const apikey = SB_ANON || SB_SVC;
    const userResp = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey, Authorization: `Bearer ${token}` },
    });
    if (!userResp.ok) return res.status(401).json({ error: 'Invalid session' });
    const user = await userResp.json();

    const memResp = await fetch(
      `${SB_URL}/rest/v1/household_members?select=household_id&email=eq.${encodeURIComponent(user.email)}&limit=1`,
      { headers: { apikey, Authorization: `Bearer ${token}` } }
    );
    const mem = (await memResp.json())?.[0];
    if (!mem?.household_id) return res.status(403).json({ error: 'No household' });

    const { subscription } = req.body;
    const endpoint = subscription?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'Missing subscription endpoint' });

    if (action === 'unsubscribe') {
      await fetch(
        `${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${user.id}`,
        { method: 'DELETE', headers: { apikey: SB_SVC, Authorization: `Bearer ${SB_SVC}` } }
      ).catch(() => {});
      return res.status(200).json({ ok: true });
    }

    // subscribe — upsert
    await fetch(`${SB_URL}/rest/v1/push_subscriptions`, {
      method:  'POST',
      headers: {
        apikey:         SB_SVC,
        Authorization:  `Bearer ${SB_SVC}`,
        'Content-Type': 'application/json',
        Prefer:         'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id:      user.id,
        household_id: mem.household_id,
        endpoint,
        p256dh:       subscription.keys?.p256dh,
        auth:         subscription.keys?.auth,
      }),
    });
    return res.status(200).json({ ok: true });
  }

  // ── Send notification ──────────────────────────────────────────────────
  if (action === 'send') {
    const { household_id, title, body, severity } = req.body;
    if (!household_id || !title) return res.status(400).json({ error: 'Missing household_id or title' });

    const subsResp = await fetch(
      `${SB_URL}/rest/v1/push_subscriptions?household_id=eq.${household_id}&select=endpoint,p256dh,auth`,
      { headers: { apikey: SB_SVC, Authorization: `Bearer ${SB_SVC}` } }
    );
    const subs = await subsResp.json();
    if (!subs?.length) return res.status(200).json({ sent: 0, message: 'No subscribers' });

    const payload = JSON.stringify({
      title, body: body || '',
      icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      tag: 'weather-alert', data: { severity, url: '/#/weather' },
    });

    let sent = 0, failed = 0;
    const stale = [];

    await Promise.allSettled(subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (e) {
        failed++;
        if (e.statusCode === 404 || e.statusCode === 410) stale.push(sub.endpoint);
      }
    }));

    for (const ep of stale) {
      await fetch(
        `${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`,
        { method: 'DELETE', headers: { apikey: SB_SVC, Authorization: `Bearer ${SB_SVC}` } }
      ).catch(() => {});
    }

    return res.status(200).json({ sent, failed, staleRemoved: stale.length });
  }

  return res.status(400).json({ error: 'Missing or invalid action. Use: subscribe, unsubscribe, send' });
}
