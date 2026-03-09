import { getAuthUser, restSelect } from './supabase.js';

function getBearerToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
}

function createAuthError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = statusCode === 401 ? 'AUTH_REQUIRED' : 'AUTH_FORBIDDEN';
  return error;
}

function createGuestContext(req, authWarning = '') {
  return {
    accessToken: null,
    user: null,
    householdId: null,
    role: 'guest',
    googleProviderToken: req.headers['x-homehub-google-token'] || '',
    authWarning,
  };
}

export async function getRequestContext(req, { requireAuth = false } = {}) {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    if (requireAuth) {
      throw createAuthError('Authentication required', 401);
    }
    return createGuestContext(req);
  }

  let user;
  try {
    user = await getAuthUser(accessToken);
  } catch (error) {
    if (!requireAuth) {
      return createGuestContext(req, error.message || 'Failed auth/session boot.');
    }
    if (Number(error?.statusCode || error?.status) === 401) {
      throw createAuthError('Invalid session', 401);
    }
    throw error;
  }

  if (!user?.email) {
    if (!requireAuth) {
      return createGuestContext(req, 'Failed auth/session boot: invalid session.');
    }
    throw createAuthError('Invalid session', 401);
  }

  let membership;
  try {
    membership = await restSelect(
      'household_members',
      `select=household_id,role,email&email=eq.${encodeURIComponent(user.email)}&limit=1`
    );
  } catch (error) {
    if (!requireAuth) {
      return createGuestContext(req, error.message || 'Household membership lookup failed.');
    }
    throw error;
  }
  const householdMember = membership?.[0] || null;

  if (!householdMember && requireAuth) {
    throw createAuthError('No household membership', 403);
  }

  return {
    accessToken,
    user,
    householdId: householdMember?.household_id || null,
    role: householdMember?.role || (requireAuth ? 'member' : 'guest'),
    googleProviderToken: req.headers['x-homehub-google-token'] || '',
    authWarning: '',
  };
}

export function requireAdmin(context, req) {
  const adminToken = process.env.ADMIN_TOKEN || '';
  const providedToken = req.headers['x-homehub-admin-token'] || '';
  const hasRole = context.role === 'admin';
  const hasToken = Boolean(adminToken) && providedToken === adminToken;
  if (!hasRole && !hasToken) {
    const error = new Error('Admin access required');
    error.statusCode = 403;
    throw error;
  }
}
