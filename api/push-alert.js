// /api/push-alert.js — Send push notification to all household subscribers
// Called internally when a severe weather alert fires (or can be triggered manually)
import webpush from 'web-push';

const VAPID_PUBLIC  = 'BDTOG1Io2qVKPDuDOV-aat7wlTow6_I004jpwcNpwX4YRrglV1To2AaWlT3YyY9lZcuKZWdHrVa28QWKeQxS-4o';
const VAPID_PRIVATE = 'P1ZHN_yaZnkJDsGBW_YwUvCxagyjW4tJUKKleXkKl5w';

webpush.setVapidDetails('mailto:will@homehub.local', VAPID_PUBLIC, VAPID_PRIVATE);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const SB_URL = process.env.SUPABASE_URL;
  const SB_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB_URL || !SB_SVC) return res.status(500).json({ error: 'Missing env' });

  const { household_id, title, body, severity } = req.body || {};
  if (!household_id || !title) return res.status(400).json({ error: 'Missing household_id or title' });

  // Fetch all subscriptions for this household
  const subsResp = await fetch(
    `${SB_URL}/rest/v1/push_subscriptions?household_id=eq.${household_id}&select=endpoint,p256dh,auth`,
    { headers: { apikey: SB_SVC, Authorization: `Bearer ${SB_SVC}` } }
  );
  const subs = await subsResp.json();
  if (!subs?.length) return res.status(200).json({ sent: 0, message: 'No subscribers' });

  const payload = JSON.stringify({
    title,
    body:    body || '',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    tag:     'weather-alert',
    data:    { severity, url: '/#/weather' },
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
      // 404/410 = subscription expired — mark for removal
      if (e.statusCode === 404 || e.statusCode === 410) {
        stale.push(sub.endpoint);
      }
    }
  }));

  // Remove stale subscriptions
  if (stale.length) {
    for (const ep of stale) {
      await fetch(
        `${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`,
        { method: 'DELETE', headers: { apikey: SB_SVC, Authorization: `Bearer ${SB_SVC}` } }
      ).catch(() => {});
    }
  }

  return res.status(200).json({ sent, failed, staleRemoved: stale.length });
}
