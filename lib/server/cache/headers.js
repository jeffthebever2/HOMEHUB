export const cacheProfiles = {
  dashboard: 'private, no-store',
  environment: 'public, max-age=0, s-maxage=60, stale-while-revalidate=120, stale-if-error=86400',
  household: 'private, no-store',
  media: 'private, no-store',
  photos: 'public, max-age=0, s-maxage=2700, stale-while-revalidate=300, stale-if-error=86400',
  settings: 'private, no-store',
  standby: 'private, no-store',
  admin: 'private, no-store',
};

export function applyCacheProfile(res, profileName, { privateResponse = false, vary = [] } = {}) {
  res.setHeader('Cache-Control', privateResponse ? 'private, no-store' : cacheProfiles[profileName] || 'private, no-store');

  const nextVary = [...new Set(vary.filter(Boolean))];
  if (!nextVary.length) return;

  const existing = String(res.getHeader('Vary') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  res.setHeader('Vary', [...new Set([...existing, ...nextVary])].join(', '));
}
