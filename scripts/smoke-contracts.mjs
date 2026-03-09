import { access } from 'node:fs/promises';

const expectedRoutes = [
  'api/admin.js',
  'api/dashboard.js',
  'api/environment.js',
  'api/household.js',
  'api/media.js',
  'api/photos.js',
  'api/settings.js',
  'api/standby.js',
];

for (const route of expectedRoutes) {
  await access(new URL(`../${route}`, import.meta.url));
}

console.log('Static route presence check passed.');

const baseUrl = process.env.HOMEHUB_BASE_URL;
if (!baseUrl) {
  console.log('No HOMEHUB_BASE_URL set; skipping live HTTP contract smoke test.');
  process.exit(0);
}

const bearer = process.env.HOMEHUB_BEARER_TOKEN || '';
const adminToken = process.env.HOMEHUB_ADMIN_TOKEN || '';

const routeChecks = [
  { path: '/api/environment', keys: ['meta', 'summary', 'detail'] },
  { path: '/api/photos', keys: ['meta', 'summary', 'detail'] },
  { path: '/api/dashboard', keys: ['meta', 'hero', 'modules'], auth: true },
  { path: '/api/household', keys: ['meta', 'summary', 'detail'], auth: true },
  { path: '/api/media', keys: ['meta', 'summary', 'detail'], auth: true },
  { path: '/api/settings', keys: ['meta', 'config', 'integrations'], auth: true },
  { path: '/api/standby', keys: ['meta', 'ambientState', 'widgets'], auth: true },
  { path: '/api/admin', keys: ['meta', 'system', 'availableActions'], auth: true, admin: true },
];

for (const check of routeChecks) {
  const headers = {};
  if (check.auth && bearer) headers.Authorization = `Bearer ${bearer}`;
  if (check.admin && adminToken) headers['X-HomeHub-Admin-Token'] = adminToken;
  const response = await fetch(`${baseUrl}${check.path}`, { headers });
  if (!response.ok) {
    throw new Error(`${check.path} failed with status ${response.status}`);
  }
  const data = await response.json();
  for (const key of check.keys) {
    if (!(key in data)) {
      throw new Error(`${check.path} missing top-level key: ${key}`);
    }
  }
  console.log(`HTTP contract ok: ${check.path}`);
}
