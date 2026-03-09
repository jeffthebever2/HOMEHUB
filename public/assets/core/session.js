import { setMediaState, setMembership, setSession, store } from './store.js';

let supabaseClient = null;

function getClient() {
  if (supabaseClient) return supabaseClient;
  const config = window.HOME_HUB_CONFIG || {};
  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      autoRefreshToken: true,
      persistSession: true,
    },
  });
  return supabaseClient;
}

export async function initSession() {
  const client = getClient();
  const { data } = await client.auth.getSession();
  setSession(data.session || null);
  if (data.session?.user) {
    await loadMembership();
  }
  client.auth.onAuthStateChange(async (_event, session) => {
    setSession(session);
    if (session?.user) {
      await loadMembership();
    } else {
      setMembership(null);
    }
    window.dispatchEvent(new Event('homehub:session-changed'));
  });
  return store.session;
}

export async function loadMembership() {
  const client = getClient();
  const email = store.session?.user?.email;
  if (!email) return null;
  const { data } = await client
    .from('household_members')
    .select('household_id, role, email')
    .eq('email', email)
    .limit(1)
    .maybeSingle();
  setMembership(data || null);
  return data || null;
}

export async function signInWithGoogle() {
  const client = getClient();
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
  sessionStorage.removeItem('hh_admin_token');
  sessionStorage.removeItem('hh_mock');
  setMediaState({
    nowPlaying: {
      state: 'idle',
      sourceType: null,
      title: null,
      subtitle: null,
      startedAt: null,
    },
  });
  await client.auth.signOut({ scope: 'global' });
}

export function getAccessToken() {
  return store.session?.access_token || null;
}

export function getGoogleProviderToken() {
  return store.session?.provider_token || null;
}
