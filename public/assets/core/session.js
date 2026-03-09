import { getAuthSupportState, getSupabaseClientConfig } from './config.js';
import { setMediaState, setMembership, setSession, store } from './store.js';

let supabaseClient = null;
let sessionAvailability = getAuthSupportState();
let authListenerBound = false;
const AUTH_PREFIX = '[HomeHub auth]';
const warnedMessages = new Set();

function updateSessionAvailability(nextState) {
  sessionAvailability = {
    available: Boolean(nextState?.available),
    status: nextState?.status || (nextState?.available ? 'ready' : 'unavailable'),
    reason: nextState?.reason || '',
    warnings: Array.isArray(nextState?.warnings) ? nextState.warnings : [],
    errors: Array.isArray(nextState?.errors) ? nextState.errors : [],
  };
}

function warnAuthIssue(message) {
  const normalized = String(message || '').trim();
  if (!normalized || warnedMessages.has(normalized)) return;
  warnedMessages.add(normalized);
  console.warn(`${AUTH_PREFIX} ${normalized}`);
}

function getClient() {
  if (supabaseClient) return supabaseClient;

  const authSupport = getAuthSupportState();
  updateSessionAvailability(authSupport);
  if (!authSupport.available) return null;

  const config = getSupabaseClientConfig();
  try {
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        autoRefreshToken: true,
        persistSession: true,
      },
    });
    updateSessionAvailability({
      ...authSupport,
      available: true,
      status: 'ready',
      reason: '',
    });
  } catch (error) {
    updateSessionAvailability({
      available: false,
      status: 'unavailable',
      reason: `Invalid Supabase client creation: ${error.message || 'client initialization failed.'}`,
    });
    warnAuthIssue(sessionAvailability.reason);
    supabaseClient = null;
  }

  return supabaseClient;
}

export async function initSession() {
  const client = getClient();
  if (!client) {
    setSession(null);
    setMembership(null);
    return store.session;
  }

  try {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    setSession(data.session || null);
    if (data.session?.user) {
      await loadMembership();
    } else {
      setMembership(null);
    }
  } catch (error) {
    const reason = `Failed auth/session boot: ${error.message || 'Session lookup failed.'}`;
    updateSessionAvailability({
      ...getAuthSupportState(),
      available: true,
      status: 'degraded',
      reason,
    });
    warnAuthIssue(reason);
    setSession(null);
    setMembership(null);
    return store.session;
  }

  if (!authListenerBound) {
    authListenerBound = true;
    client.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        await loadMembership();
      } else {
        setMembership(null);
      }
      window.dispatchEvent(new Event('homehub:session-changed'));
    });
  }

  return store.session;
}

export async function loadMembership() {
  const client = getClient();
  const email = store.session?.user?.email;
  if (!client || !email) {
    setMembership(null);
    return null;
  }

  try {
    const { data, error } = await client
      .from('household_members')
      .select('household_id, role, email')
      .eq('email', email)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    setMembership(data || null);
    return data || null;
  } catch (error) {
    warnAuthIssue(`Household membership lookup failed: ${error.message || 'unknown error.'}`);
    setMembership(null);
    return null;
  }
}

export async function signInWithGoogle() {
  const client = getClient();
  if (!client) {
    throw new Error(sessionAvailability.reason || 'Sign-in is currently unavailable.');
  }
  await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/#/home',
      scopes: [
        'email',
        'profile',
        'https://www.googleapis.com/auth/calendar.readonly',
      ].join(' '),
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
      },
    },
  });
}

export async function signOut() {
  const client = getClient();
  try {
    sessionStorage.removeItem('hh_admin_token');
    sessionStorage.removeItem('hh_mock');
  } catch {
    // Ignore sessionStorage failures and continue clearing local state.
  }
  setMediaState({
    nowPlaying: {
      state: 'idle',
      sourceType: null,
      title: null,
      subtitle: null,
      startedAt: null,
    },
  });
  setSession(null);
  setMembership(null);
  if (client) {
    await client.auth.signOut({ scope: 'global' });
  }
}

export function getAccessToken() {
  return store.session?.access_token || null;
}

export function getGoogleProviderToken() {
  return store.session?.provider_token || null;
}

export function getSessionAvailability() {
  return {
    ...sessionAvailability,
  };
}
