import { getAuthUser, restSelect } from './supabase.js';

function getBearerToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
}

export async function getRequestContext(req, { requireAuth = false } = {}) {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    if (requireAuth) {
      const error = new Error('Authentication required');
      error.statusCode = 401;
      throw error;
    }
    return {
      accessToken: null,
      user: null,
      householdId: null,
      role: 'guest',
      googleProviderToken: req.headers['x-homehub-google-token'] || '',
    };
  }

  const user = await getAuthUser(accessToken);
  if (!user?.email) {
    const error = new Error('Invalid session');
    error.statusCode = 401;
    throw error;
  }

  const membership = await restSelect(
    'household_members',
    `select=household_id,role,email&email=eq.${encodeURIComponent(user.email)}&limit=1`
  );
  const householdMember = membership?.[0] || null;

  if (!householdMember && requireAuth) {
    const error = new Error('No household membership');
    error.statusCode = 403;
    throw error;
  }

  return {
    accessToken,
    user,
    householdId: householdMember?.household_id || null,
    role: householdMember?.role || 'member',
    googleProviderToken: req.headers['x-homehub-google-token'] || '',
  };
}

export function requireAdmin(context, req) {
  const adminToken = process.env.ADMIN_TOKEN || '';
  const providedToken = req.headers['x-homehub-admin-token'] || '';
  const hasRole = context.role === 'admin';
  const hasToken = !adminToken || providedToken === adminToken;
  if (!hasRole || !hasToken) {
    const error = new Error('Admin access required');
    error.statusCode = 403;
    throw error;
  }
}
