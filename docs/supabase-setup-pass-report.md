# HomeHub Supabase Setup Pass

Full contents of every changed file from the Supabase production-readiness pass are included below.

## Summary

- Browser config and server env handling were mixed too loosely. The frontend did not validate `public/config.js` enough, and the backend Supabase helper threw generic errors when env vars were missing.
- Auth boot had an unguarded listener-registration path, and unknown startup failures could surface to users as `[object Object]` instead of a readable message.
- `public/config.js` now contains browser-safe placeholders only. Server secrets stay in `.env` or Vercel env vars, and the backend returns structured Supabase config errors.
- Settings now exposes lightweight Supabase diagnostics, `vercel.json` prevents stale `config.js` caching, and startup/render failures degrade instead of white-screening the shell.

## Where To Paste Supabase Values

- Paste your Supabase URL into `public/config.js` as `supabaseUrl` and into `.env` or Vercel as `SUPABASE_URL`.
- Paste your anon/public key into `public/config.js` as `supabaseAnonKey`. Optionally mirror it in `.env` or Vercel as `SUPABASE_ANON_KEY`.
- Paste your service role key only into `.env` locally or Vercel Project Settings -> Environment Variables as `SUPABASE_SERVICE_ROLE_KEY`.

## Changed Files

### MODIFIED `public/config.js`

```js
(function initHomeHubConfig(globalObject) {
  const current = globalObject.HOME_HUB_CONFIG && typeof globalObject.HOME_HUB_CONFIG === 'object'
    ? globalObject.HOME_HUB_CONFIG
    : {};
  const currentLocation = current.defaultLocation && typeof current.defaultLocation === 'object'
    ? current.defaultLocation
    : {};

  globalObject.HOME_HUB_CONFIG = {
    householdDisplayName: typeof current.householdDisplayName === 'string' ? current.householdDisplayName : 'HomeHub',

    // Browser-safe Supabase values only.
    // Paste your project URL and anon/public key here for local dev and Vercel deploys.
    // Never place SUPABASE_SERVICE_ROLE_KEY in this file.
    supabaseUrl: typeof current.supabaseUrl === 'string' ? current.supabaseUrl : '',
    supabaseAnonKey: typeof current.supabaseAnonKey === 'string' ? current.supabaseAnonKey : '',
    apiBase: typeof current.apiBase === 'string' ? current.apiBase : '',

    defaultLocation: {
      name: typeof currentLocation.name === 'string' ? currentLocation.name : 'Configured location',
      lat: 40.029059,
      lon: -82.863462,
      ...(currentLocation || {}),
    },
  };
}(window));

```

### MODIFIED `public/assets/core/config.js`

```js
const DEFAULT_CLIENT_CONFIG = {
  householdDisplayName: 'HomeHub',
  supabaseUrl: '',
  supabaseAnonKey: '',
  apiBase: '',
  defaultLocation: {
    name: 'Configured location',
    lat: 40.029059,
    lon: -82.863462,
  },
};

const PUBLIC_CONFIG_PREFIX = '[HomeHub config]';
const warnedMessages = new Set();

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function warnOnce(key, message) {
  const warningKey = `${key}:${message}`;
  if (warnedMessages.has(warningKey)) return;
  warnedMessages.add(warningKey);
  console.warn(`${PUBLIC_CONFIG_PREFIX} ${message}`);
}

function isHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function looksLikeJwt(value) {
  return typeof value === 'string' && value.split('.').length === 3;
}

function getUnexpectedSecretKeys(rawConfig) {
  return [
    'supabaseServiceRoleKey',
    'serviceRoleKey',
    'SUPABASE_SERVICE_ROLE_KEY',
  ].filter((key) => typeof rawConfig[key] === 'string' && rawConfig[key].trim());
}

export function getClientConfig() {
  const rawConfig = asRecord(window.HOME_HUB_CONFIG);
  const rawLocation = asRecord(rawConfig.defaultLocation);
  const unexpectedSecretKeys = getUnexpectedSecretKeys(rawConfig);
  if (unexpectedSecretKeys.length) {
    warnOnce(
      'unexpected-secret-key',
      `Do not place ${unexpectedSecretKeys.join(', ')} in public/config.js. Browser config must only contain supabaseUrl and supabaseAnonKey.`
    );
  }

  return {
    householdDisplayName: asString(rawConfig.householdDisplayName, DEFAULT_CLIENT_CONFIG.householdDisplayName),
    supabaseUrl: asString(rawConfig.supabaseUrl, DEFAULT_CLIENT_CONFIG.supabaseUrl),
    supabaseAnonKey: asString(rawConfig.supabaseAnonKey, DEFAULT_CLIENT_CONFIG.supabaseAnonKey),
    apiBase: asString(rawConfig.apiBase, DEFAULT_CLIENT_CONFIG.apiBase),
    defaultLocation: {
      ...DEFAULT_CLIENT_CONFIG.defaultLocation,
      ...rawLocation,
      name: asString(rawLocation.name, DEFAULT_CLIENT_CONFIG.defaultLocation.name),
      lat: asNumber(rawLocation.lat, DEFAULT_CLIENT_CONFIG.defaultLocation.lat),
      lon: asNumber(rawLocation.lon, DEFAULT_CLIENT_CONFIG.defaultLocation.lon),
    },
  };
}

export function getSupabaseClientConfig() {
  const config = getClientConfig();
  return {
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
  };
}

export function getSupabaseClientDiagnostics() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseClientConfig();
  const errors = [];
  const warnings = [];

  if (!supabaseUrl) {
    errors.push('Missing supabaseUrl in public/config.js.');
  } else if (!isHttpUrl(supabaseUrl)) {
    errors.push('Invalid supabaseUrl in public/config.js. Expected a full https:// project URL.');
  }

  if (!supabaseAnonKey) {
    errors.push('Missing supabaseAnonKey in public/config.js.');
  } else if (!looksLikeJwt(supabaseAnonKey)) {
    warnings.push('supabaseAnonKey does not look like a Supabase anon JWT.');
  }

  if (!window.supabase?.createClient) {
    errors.push('The Supabase client library did not load.');
  }

  [...errors, ...warnings].forEach((message, index) => {
    warnOnce(`client-diagnostic-${index}`, message);
  });

  return {
    available: errors.length === 0,
    status: errors.length ? 'unavailable' : warnings.length ? 'degraded' : 'ready',
    reason: errors[0] || warnings[0] || '',
    errors,
    warnings,
  };
}

export function getAuthSupportState() {
  const diagnostics = getSupabaseClientDiagnostics();
  return {
    available: diagnostics.available,
    status: diagnostics.status,
    reason: diagnostics.reason,
    warnings: diagnostics.warnings,
    errors: diagnostics.errors,
  };
}

```

### MODIFIED `public/assets/core/session.js`

```js
import { getAuthSupportState, getSupabaseClientConfig } from './config.js';
import { setMediaState, setMembership, setSession, store } from './store.js';

let supabaseClient = null;
let sessionAvailability = getAuthSupportState();
let authListenerBound = false;
const AUTH_PREFIX = '[HomeHub auth]';
const warnedMessages = new Set();

function describeAuthError(error, fallback = 'Unexpected auth error.') {
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim();
  if (typeof error?.error_description === 'string' && error.error_description.trim()) return error.error_description.trim();
  if (typeof error?.details === 'string' && error.details.trim()) return error.details.trim();
  if (typeof error?.reason === 'string' && error.reason.trim()) return error.reason.trim();
  if (typeof error?.error?.message === 'string' && error.error.message.trim()) return error.error.message.trim();
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}' && serialized !== 'null') return serialized;
  } catch {
    // Ignore JSON serialization failures and use the fallback below.
  }
  return fallback;
}

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
      reason: `Invalid Supabase client creation: ${describeAuthError(error, 'client initialization failed.')}`,
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
    const reason = `Failed auth/session boot: ${describeAuthError(error, 'Session lookup failed.')}`;
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
    try {
      client.auth.onAuthStateChange(async (_event, session) => {
        setSession(session);
        if (session?.user) {
          await loadMembership();
        } else {
          setMembership(null);
        }
        window.dispatchEvent(new Event('homehub:session-changed'));
      });
      authListenerBound = true;
    } catch (error) {
      const reason = `Failed auth/session boot: ${describeAuthError(error, 'Could not bind the auth state listener.')}`;
      updateSessionAvailability({
        ...getAuthSupportState(),
        available: true,
        status: 'degraded',
        reason,
      });
      warnAuthIssue(reason);
    }
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
    warnAuthIssue(`Household membership lookup failed: ${describeAuthError(error, 'unknown error.')}`);
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

```

### MODIFIED `public/assets/core/shell.js`

```js
import { go } from './router.js';
import { getSessionAvailability, signInWithGoogle, signOut } from './session.js';
import { store } from './store.js';

const NAV_ITEMS = [
  ['home', 'Home'],
  ['weather', 'Weather'],
  ['household', 'Household'],
  ['media', 'Media'],
  ['photos', 'Photos'],
  ['alerts', 'Alerts'],
  ['settings', 'Settings'],
];

export function renderShell(root) {
  if (!root) return;
  root.innerHTML = `
    <div id="hh-login" class="hh-login hh-hidden"></div>
    <div id="hh-shell" class="hh-shell hh-hidden">
      <header id="hh-topbar" class="hh-topbar">
        <div>
          <div class="hh-brand">HomeHub</div>
          <div id="hh-topbar-meta" class="hh-topbar-meta"></div>
        </div>
        <div class="hh-topbar-actions">
          <button id="hh-standby-btn" class="hh-btn hh-btn-secondary">Standby</button>
          <button id="hh-signout-btn" class="hh-btn hh-btn-secondary">Sign out</button>
        </div>
      </header>
      <nav id="hh-nav" class="hh-nav"></nav>
      <main id="hh-page-content" class="hh-main"></main>
    </div>
  `;

  root.querySelector('#hh-signout-btn')?.addEventListener('click', () => {
    signOut().catch(() => {});
  });
  root.querySelector('#hh-standby-btn')?.addEventListener('click', () => go('standby'));
}

export function renderLogin() {
  const login = document.getElementById('hh-login');
  const shell = document.getElementById('hh-shell');
  if (!login || !shell) return;

  const auth = getSessionAvailability();
  const message = auth.reason || (!auth.available ? 'Google sign-in is currently unavailable.' : '');

  login.classList.remove('hh-hidden');
  shell.classList.add('hh-hidden');
  login.innerHTML = `
    <div class="hh-card hh-card-hero hh-login-card">
      <p class="hh-page-kicker">House OS</p>
      <h1 class="hh-page-title">Sign in to HomeHub</h1>
      <p class="hh-page-subtitle">One household dashboard for weather, chores, photos, media, and standby mode.</p>
      <div style="margin-top:1.5rem;display:flex;gap:.75rem;flex-wrap:wrap;">
        <button id="hh-google-login" class="hh-btn hh-btn-primary" ${auth.available ? '' : 'disabled'}>Continue with Google</button>
      </div>
      <p id="hh-login-message" class="hh-row-copy" style="margin:1rem 0 0;"></p>
    </div>
  `;
  const messageNode = login.querySelector('#hh-login-message');
  if (messageNode) {
    messageNode.textContent = message;
  }
  login.querySelector('#hh-google-login')?.addEventListener('click', async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      if (messageNode) {
        messageNode.textContent = error.message || 'Sign-in is currently unavailable.';
      }
    }
  });
}

export function renderAppShell() {
  const login = document.getElementById('hh-login');
  const shell = document.getElementById('hh-shell');
  const meta = document.getElementById('hh-topbar-meta');
  const nav = document.getElementById('hh-nav');

  login?.classList.add('hh-hidden');
  shell?.classList.remove('hh-hidden');

  const userName = store.session?.user?.user_metadata?.full_name || store.session?.user?.email || 'Family';
  if (meta) {
    meta.textContent = `${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${userName}`;
  }
  if (!nav) return;
  nav.innerHTML = NAV_ITEMS.map(([route, label]) => `
    <button class="hh-nav-pill ${store.route === route ? 'is-active' : ''}" data-route="${route}">${label}</button>
  `).join('');
  nav.querySelectorAll('[data-route]').forEach((button) => {
    button.addEventListener('click', () => go(button.dataset.route));
  });
}

```

### MODIFIED `public/assets/core/app.js`

```js
import { renderAdminPage } from '../domains/admin/index.js';
import { renderDashboardPage } from '../domains/dashboard/index.js';
import { renderEnvironmentPage } from '../domains/environment/index.js';
import { renderHouseholdPage } from '../domains/household/index.js';
import { renderMediaPage } from '../domains/media/index.js';
import { renderPhotosPage } from '../domains/photos/index.js';
import { renderSettingsPage } from '../domains/settings/index.js';
import { renderStandbyPage } from '../domains/standby/index.js';
import { pageHeader } from '../ui/pageHeader.js';
import { errorState, loadingState } from '../ui/state.js';
import { apiFetch } from './api.js';
import { getRoute, initRouter } from './router.js';
import { initSession } from './session.js';
import { renderAppShell, renderLogin, renderShell } from './shell.js';
import { store } from './store.js';

const renderers = {
  home: renderDashboardPage,
  weather: (container) => renderEnvironmentPage(container, 'weather'),
  alerts: (container) => renderEnvironmentPage(container, 'alerts'),
  household: renderHouseholdPage,
  media: renderMediaPage,
  photos: renderPhotosPage,
  settings: renderSettingsPage,
  admin: renderAdminPage,
  standby: renderStandbyPage,
};

let bootstrapped = false;
let cleanupPage = null;
let renderVersion = 0;
let runtimeConfig = {
  standbyTimeoutMin: 5,
};
let inactivityTimer = null;
let activityWatchersBound = false;
let sessionListenersBound = false;
let serviceWorkerBound = false;

function describeRuntimeError(error, fallback = 'Unexpected startup error.') {
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim();
  if (typeof error?.reason === 'string' && error.reason.trim()) return error.reason.trim();
  if (typeof error?.details === 'string' && error.details.trim()) return error.details.trim();
  if (typeof error?.error_description === 'string' && error.error_description.trim()) return error.error_description.trim();
  if (typeof error?.error?.message === 'string' && error.error.message.trim()) return error.error.message.trim();
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}' && serialized !== 'null') return serialized;
  } catch {
    // Ignore JSON serialization failures and fall back to the default message.
  }
  return fallback;
}

function logRuntimeError(label, error) {
  console.error(`[HomeHub] ${label}`, error);
}

function getSessionValue(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setSessionValue(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Ignore sessionStorage failures.
  }
}

function removeSessionValue(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore sessionStorage failures.
  }
}

function getRoot() {
  let root = document.getElementById('app');
  if (!root) {
    root = document.createElement('div');
    root.id = 'app';
    document.body?.appendChild(root);
  }
  return root;
}

function ensureShellStructure() {
  const root = getRoot();
  const hasShell = document.getElementById('hh-login')
    && document.getElementById('hh-shell')
    && document.getElementById('hh-page-content');
  if (!hasShell) {
    renderShell(root);
  }
  return {
    root,
    login: document.getElementById('hh-login'),
    shell: document.getElementById('hh-shell'),
    pageContent: document.getElementById('hh-page-content'),
  };
}

function safeCleanupPage() {
  if (!cleanupPage) return;
  try {
    cleanupPage();
  } catch {
    // Ignore cleanup failures so the next page can still render.
  }
  cleanupPage = null;
}

function getStandbyTimeoutMin() {
  const numeric = Number(runtimeConfig.standbyTimeoutMin);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 5;
}

function resetInactivityTimer() {
  window.clearTimeout(inactivityTimer);
  if (!store.session?.user || store.route === 'standby') return;
  inactivityTimer = window.setTimeout(() => {
    window.location.hash = '#/standby';
  }, getStandbyTimeoutMin() * 60 * 1000);
}

function bindActivityWatchers() {
  if (activityWatchersBound) return;
  activityWatchersBound = true;
  ['mousemove', 'touchstart', 'click', 'keydown'].forEach((eventName) => {
    window.addEventListener(eventName, resetInactivityTimer, { passive: true });
  });
}

function renderRouteFailure(error) {
  logRuntimeError('route render failed', error);
  const { pageContent } = ensureShellStructure();
  if (!pageContent) return;
  pageContent.innerHTML = `
    ${pageHeader({
      kicker: 'HomeHub',
      title: 'Page unavailable',
      subtitle: 'The shell is still running, but this view could not render.',
    })}
    ${errorState('Render failed', describeRuntimeError(error, 'Unexpected render error'))}
  `;
}

function renderBootFailure(error) {
  logRuntimeError('bootstrap failed', error);
  const root = getRoot();
  root.innerHTML = `
    <div class="hh-login">
      ${errorState('HomeHub failed to start', describeRuntimeError(error, 'Unexpected bootstrap error'))}
    </div>
  `;
}

async function loadRuntimeConfig() {
  runtimeConfig = {
    standbyTimeoutMin: 5,
  };
  if (!store.session?.user) {
    resetInactivityTimer();
    return;
  }

  try {
    const payload = await apiFetch('/api/settings');
    const configuredTimeout = Number(payload?.config?.system?.standbyTimeoutMin);
    runtimeConfig.standbyTimeoutMin = Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : runtimeConfig.standbyTimeoutMin;
  } catch {
    runtimeConfig.standbyTimeoutMin = 5;
  }

  resetInactivityTimer();
}

async function renderCurrentRoute() {
  const { pageContent } = ensureShellStructure();
  const route = getRoute();
  const renderer = renderers[route] || renderers.home;

  document.body?.classList.toggle('hh-standby-active', route === 'standby');
  renderAppShell();
  safeCleanupPage();

  if (!pageContent) {
    throw new Error('HomeHub shell container is missing.');
  }

  pageContent.innerHTML = loadingState('Loading HomeHub…');
  const currentVersion = ++renderVersion;

  try {
    const nextCleanup = await renderer(pageContent);
    if (currentVersion !== renderVersion) {
      if (typeof nextCleanup === 'function') {
        try {
          nextCleanup();
        } catch {
          // Ignore cleanup failures from stale routes.
        }
      }
      return;
    }
    cleanupPage = typeof nextCleanup === 'function' ? nextCleanup : null;
    resetInactivityTimer();
  } catch (error) {
    if (currentVersion !== renderVersion) return;
    cleanupPage = null;
    renderRouteFailure(error);
  }
}

async function renderApp() {
  ensureShellStructure();
  if (!store.session?.user) {
    document.body?.classList.remove('hh-standby-active');
    safeCleanupPage();
    renderLogin();
    return;
  }
  await renderCurrentRoute();
}

async function registerServiceWorker() {
  if (serviceWorkerBound || !('serviceWorker' in navigator)) return;
  serviceWorkerBound = true;

  const reloadKey = 'hh_sw_reloaded';
  const registration = await navigator.serviceWorker.register('/sw.js');

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (getSessionValue(reloadKey) === '1') return;
    setSessionValue(reloadKey, '1');
    window.location.reload();
  });

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        worker.postMessage({ type: 'SKIP_WAITING' });
      }
    });
  });

  window.addEventListener('pageshow', () => {
    removeSessionValue(reloadKey);
  });
  window.addEventListener('focus', () => {
    registration.update().catch(() => {});
  });
}

async function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;

  const { login } = ensureShellStructure();
  if (login) {
    login.innerHTML = loadingState('Checking session…');
  }

  try {
    initRouter(() => {
      renderApp().catch(renderRouteFailure);
    });
  } catch (error) {
    logRuntimeError('router initialization failed', error);
  }

  try {
    await initSession();
  } catch (error) {
    logRuntimeError('session initialization failed', error);
  }

  try {
    await loadRuntimeConfig();
  } catch (error) {
    logRuntimeError('runtime config load failed', error);
  }

  try {
    await renderApp();
  } catch (error) {
    logRuntimeError('initial app render failed', error);
    try {
      renderLogin();
      return;
    } catch {
      throw error;
    }
  }

  try {
    bindActivityWatchers();
  } catch (error) {
    logRuntimeError('activity watcher binding failed', error);
  }

  if (!sessionListenersBound) {
    sessionListenersBound = true;
    window.addEventListener('homehub:session-changed', async () => {
      await loadRuntimeConfig();
      await renderApp();
    });
    window.addEventListener('homehub:config-updated', (event) => {
      const configuredTimeout = Number(event.detail?.config?.system?.standbyTimeoutMin);
      if (Number.isFinite(configuredTimeout) && configuredTimeout > 0) {
        runtimeConfig.standbyTimeoutMin = configuredTimeout;
      }
      resetInactivityTimer();
    });
  }

  registerServiceWorker().catch(() => {});
}

bootstrap().catch(renderBootFailure);

```

### MODIFIED `public/assets/domains/settings/index.js`

```js
import { apiFetch } from '../../core/api.js';
import { asArray, asObject, bindRouteButtons, escapeHtml, formatDateTime } from '../../core/format.js';
import { getSessionAvailability } from '../../core/session.js';
import { store } from '../../core/store.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';

function renderIntegrationRows(items) {
  const safeItems = asArray(items);
  if (!safeItems.length) {
    return `
      <div class="hh-state">
        <p class="hh-state-title">Integration health unavailable</p>
        <p class="hh-state-copy">HomeHub could not load provider health details from the current payload.</p>
      </div>
    `;
  }

  return `
    <table class="hh-table">
      <thead>
        <tr>
          <th>Integration</th>
          <th>Category</th>
          <th>State</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${safeItems.map((item) => `
          <tr>
            <td>${escapeHtml(item.displayName || item.providerId || 'Integration')}</td>
            <td>${escapeHtml(item.category || 'system')}</td>
            <td><span class="hh-badge hh-badge-${item.authState === 'connected' || item.healthStatus === 'healthy' ? 'success' : item.healthStatus === 'degraded' ? 'warning' : 'offline'}">${escapeHtml(item.authState || item.healthStatus || (item.enabled ? 'enabled' : 'disabled'))}</span></td>
            <td>${escapeHtml((asArray(item.warnings)[0]) || (item.enabled ? 'Ready' : 'Not configured'))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function buildPhotoPriority(primary) {
  const ordered = [primary, 'google_photos', 'immich', 'imgur', 'local_fallback']
    .filter(Boolean)
    .filter((entry, index, list) => list.indexOf(entry) === index);
  if (!ordered.includes('local_fallback')) ordered.push('local_fallback');
  return ordered;
}

function cloneConfig(config) {
  if (typeof structuredClone === 'function') {
    return structuredClone(config);
  }
  return JSON.parse(JSON.stringify(config));
}

function getSessionValue(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function getFallbackPayload(errorMessage = '') {
  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      degraded: true,
      warnings: [errorMessage || 'Settings payload is unavailable.'],
    },
    config: {
      system: {
        householdName: 'Household',
        timezone: 'America/New_York',
        standbyTimeoutMin: 5,
        quietHoursStart: '22:00',
        quietHoursEnd: '06:00',
      },
      environment: {
        locationName: 'Configured location',
        lat: 0,
        lon: 0,
      },
      photos: {
        googleAlbumId: '',
        imgurAlbumId: '',
        immichBaseUrl: '',
        immichAlbumId: '',
        sourcePriority: ['local_fallback'],
      },
      household: {
        treats: {
          petName: 'Pet',
          dailyLimitTreats: 0,
        },
      },
      agenda: {
        selectedCalendars: [],
      },
    },
    integrations: [],
    systemHealth: [],
    readOnly: true,
    diagnostics: {
      serverSupabase: {
        configured: null,
        urlConfigured: false,
        serviceRoleConfigured: false,
        anonConfigured: false,
        issues: errorMessage ? [errorMessage] : [],
        warnings: [],
      },
    },
  };
}

function normalizeServerSupabaseDiagnostics(value, errorMessage = '') {
  const fallback = getFallbackPayload(errorMessage).diagnostics.serverSupabase;
  const diagnostics = asObject(value);
  return {
    configured: typeof diagnostics.configured === 'boolean' ? diagnostics.configured : fallback.configured,
    urlConfigured: Boolean(diagnostics.urlConfigured),
    serviceRoleConfigured: Boolean(diagnostics.serviceRoleConfigured),
    anonConfigured: Boolean(diagnostics.anonConfigured),
    issues: asArray(diagnostics.issues),
    warnings: asArray(diagnostics.warnings),
  };
}

function formatDiagnosticState({ configured, available, status }) {
  if (status === 'degraded') return 'degraded';
  if (available === false || configured === false) return 'offline';
  if (configured == null && available == null) return 'unknown';
  return 'ready';
}

function normalizeSettingsPayload(payload, errorMessage = '') {
  const fallback = getFallbackPayload(errorMessage);
  const meta = asObject(payload?.meta);
  const config = asObject(payload?.config);
  const system = asObject(config.system);
  const environment = asObject(config.environment);
  const photos = asObject(config.photos);
  const household = asObject(config.household);
  const agenda = asObject(config.agenda);
  return {
    meta: {
      ...fallback.meta,
      ...meta,
      warnings: asArray(meta.warnings),
    },
    config: {
      ...fallback.config,
      ...config,
      system: {
        ...fallback.config.system,
        ...system,
      },
      environment: {
        ...fallback.config.environment,
        ...environment,
      },
      photos: {
        ...fallback.config.photos,
        ...photos,
        sourcePriority: asArray(photos.sourcePriority).length ? asArray(photos.sourcePriority) : fallback.config.photos.sourcePriority,
      },
      household: {
        ...fallback.config.household,
        ...household,
        treats: {
          ...fallback.config.household.treats,
          ...asObject(household.treats),
        },
      },
      agenda: {
        ...fallback.config.agenda,
        ...agenda,
        selectedCalendars: asArray(agenda.selectedCalendars),
      },
    },
    integrations: asArray(payload?.integrations),
    systemHealth: asArray(payload?.systemHealth),
    readOnly: Boolean(payload?.readOnly || !payload?.config),
    diagnostics: {
      serverSupabase: normalizeServerSupabaseDiagnostics(payload?.diagnostics?.serverSupabase, errorMessage),
    },
  };
}

export async function renderSettingsPage(container) {
  let disposed = false;
  let loadVersion = 0;

  async function load({ showLoading = true } = {}) {
    const currentLoad = ++loadVersion;
    if (showLoading && !disposed) {
      container.innerHTML = loadingState('Loading settings…');
    }

    let payload;
    try {
      payload = normalizeSettingsPayload(await apiFetch('/api/settings'));
    } catch (error) {
      payload = normalizeSettingsPayload(error.data, error.message);
    }

    if (disposed || currentLoad !== loadVersion) return;

    const config = payload.config;
    const isAdmin = store.membership?.role === 'admin' || Boolean(getSessionValue('hh_admin_token'));
    const readOnly = payload.readOnly;
    const authSupport = getSessionAvailability();
    const serverSupabase = payload.diagnostics.serverSupabase;
    const browserAuthState = formatDiagnosticState({ available: authSupport.available, status: authSupport.status });
    const serverState = formatDiagnosticState({ configured: serverSupabase.configured });
    const browserAuthMessage = authSupport.reason || 'Browser auth config is available.';
    const serverSupabaseMessage = serverSupabase.issues[0]
      || serverSupabase.warnings[0]
      || 'Server Supabase env vars are configured.';

    container.innerHTML = `
      ${pageHeader({
        kicker: 'Settings',
        title: 'Settings & Integrations',
        subtitle: `Updated ${formatDateTime(payload.meta.fetchedAt)}`,
        actions: `
          <button id="hh-settings-refresh" class="hh-btn hh-btn-secondary">Refresh</button>
          ${isAdmin ? '<button class="hh-btn hh-btn-secondary" data-route="admin">Open Admin</button>' : ''}
        `,
      })}
      ${payload.meta.degraded ? `
        <div class="hh-banner hh-banner-offline" style="margin-bottom:1rem;">
          <div class="hh-banner-copy">
            <p class="hh-banner-title">${readOnly ? 'Settings are read-only' : 'Settings are degraded'}</p>
            <p class="hh-banner-subtitle">${escapeHtml(payload.meta.warnings?.[0] || 'HomeHub is showing the best available configuration data.')}</p>
          </div>
        </div>
      ` : ''}
      <div class="hh-grid">
        <section class="hh-card hh-col-8">
          <div class="hh-stack">
            <div class="hh-page-kicker">Core config</div>
            <form id="hh-settings-form" class="hh-form-grid">
              <div class="hh-field">
                <label class="hh-field-label" for="hh-location-name">Location name</label>
                <input id="hh-location-name" class="hh-input" name="locationName" value="${escapeHtml(config.environment.locationName)}" ${readOnly ? 'disabled' : ''}>
              </div>
              <div class="hh-field">
                <label class="hh-field-label" for="hh-standby-timeout">Standby timeout (min)</label>
                <input id="hh-standby-timeout" class="hh-input" name="standbyTimeoutMin" type="number" min="1" value="${escapeHtml(String(config.system.standbyTimeoutMin))}" ${readOnly ? 'disabled' : ''}>
              </div>
              <div class="hh-field">
                <label class="hh-field-label" for="hh-location-lat">Latitude</label>
                <input id="hh-location-lat" class="hh-input" name="lat" type="number" step="any" value="${escapeHtml(String(config.environment.lat))}" ${readOnly ? 'disabled' : ''}>
              </div>
              <div class="hh-field">
                <label class="hh-field-label" for="hh-location-lon">Longitude</label>
                <input id="hh-location-lon" class="hh-input" name="lon" type="number" step="any" value="${escapeHtml(String(config.environment.lon))}" ${readOnly ? 'disabled' : ''}>
              </div>
              <div class="hh-field">
                <label class="hh-field-label" for="hh-quiet-start">Quiet hours start</label>
                <input id="hh-quiet-start" class="hh-input" name="quietHoursStart" type="time" value="${escapeHtml(config.system.quietHoursStart)}" ${readOnly ? 'disabled' : ''}>
              </div>
              <div class="hh-field">
                <label class="hh-field-label" for="hh-quiet-end">Quiet hours end</label>
                <input id="hh-quiet-end" class="hh-input" name="quietHoursEnd" type="time" value="${escapeHtml(config.system.quietHoursEnd)}" ${readOnly ? 'disabled' : ''}>
              </div>
              <div class="hh-field">
                <label class="hh-field-label" for="hh-google-album">Google Photos album ID</label>
                <input id="hh-google-album" class="hh-input" name="googleAlbumId" value="${escapeHtml(config.photos.googleAlbumId || '')}" ${readOnly ? 'disabled' : ''}>
              </div>
              <div class="hh-field">
                <label class="hh-field-label" for="hh-primary-photos">Primary photo source</label>
                <select id="hh-primary-photos" class="hh-select" name="primaryPhotoSource" ${readOnly ? 'disabled' : ''}>
                  ${['google_photos', 'immich', 'imgur', 'local_fallback'].map((option) => `
                    <option value="${option}" ${config.photos.sourcePriority[0] === option ? 'selected' : ''}>${option.replace(/_/g, ' ')}</option>
                  `).join('')}
                </select>
              </div>
              <div class="hh-field">
                <label class="hh-field-label" for="hh-imgur-album">Imgur album ID</label>
                <input id="hh-imgur-album" class="hh-input" name="imgurAlbumId" value="${escapeHtml(config.photos.imgurAlbumId || '')}" ${readOnly ? 'disabled' : ''}>
              </div>
              <div class="hh-field">
                <label class="hh-field-label" for="hh-immich-base">Immich base URL</label>
                <input id="hh-immich-base" class="hh-input" name="immichBaseUrl" value="${escapeHtml(config.photos.immichBaseUrl || '')}" ${readOnly ? 'disabled' : ''}>
              </div>
              <div class="hh-field">
                <label class="hh-field-label" for="hh-immich-album">Immich album ID</label>
                <input id="hh-immich-album" class="hh-input" name="immichAlbumId" value="${escapeHtml(config.photos.immichAlbumId || '')}" ${readOnly ? 'disabled' : ''}>
              </div>
              <div class="hh-field hh-field-span-2">
                <label class="hh-field-label" for="hh-calendars">Selected calendars (comma separated)</label>
                <input id="hh-calendars" class="hh-input" name="selectedCalendars" value="${escapeHtml(asArray(config.agenda.selectedCalendars).join(', '))}" ${readOnly ? 'disabled' : ''}>
              </div>
              <div class="hh-field hh-field-span-2">
                <button class="hh-btn hh-btn-primary" type="submit" ${readOnly ? 'disabled' : ''}>${readOnly ? 'Settings unavailable' : 'Save settings'}</button>
              </div>
            </form>
          </div>
        </section>
        <aside class="hh-card hh-col-4">
          <div class="hh-stack">
            <div class="hh-page-kicker">Current household defaults</div>
            <div class="hh-kv">
              <div class="hh-kv-row"><span>Household</span><strong>${escapeHtml(config.system.householdName)}</strong></div>
              <div class="hh-kv-row"><span>Pet</span><strong>${escapeHtml(config.household.treats.petName)}</strong></div>
              <div class="hh-kv-row"><span>Daily treat limit</span><strong>${escapeHtml(String(config.household.treats.dailyLimitTreats))}</strong></div>
              <div class="hh-kv-row"><span>Timezone</span><strong>${escapeHtml(config.system.timezone)}</strong></div>
            </div>
            <p class="hh-row-copy" style="margin:0;">These values currently come from the shared server config and will be editable once the persistence schema is expanded.</p>
            <div class="hh-page-kicker" style="margin-top:1rem;">Supabase diagnostics</div>
            <div class="hh-kv">
              <div class="hh-kv-row"><span>Browser auth</span><strong><span class="hh-badge hh-badge-${browserAuthState === 'ready' ? 'success' : browserAuthState === 'offline' ? 'offline' : 'warning'}">${escapeHtml(browserAuthState)}</span></strong></div>
              <div class="hh-kv-row"><span>Server env</span><strong><span class="hh-badge hh-badge-${serverState === 'ready' ? 'success' : serverState === 'unknown' ? 'warning' : 'offline'}">${escapeHtml(serverState)}</span></strong></div>
            </div>
            <p class="hh-row-copy" style="margin:0;">${escapeHtml(browserAuthMessage)}</p>
            <p class="hh-row-copy" style="margin:0;">${escapeHtml(serverSupabaseMessage)}</p>
            <p class="hh-row-copy" style="margin:0;">Put supabaseUrl and supabaseAnonKey in public/config.js. Keep SUPABASE_SERVICE_ROLE_KEY in local or Vercel environment variables only.</p>
          </div>
        </aside>
        <section class="hh-card hh-col-12">
          <div class="hh-stack">
            <div class="hh-split">
              <div>
                <div class="hh-page-kicker">Integration health</div>
                <p class="hh-row-copy" style="margin:0;">Settings is the source of truth for provider configuration. Tests run without mutating live household data.</p>
              </div>
              <div class="hh-inline-actions">
                ${payload.integrations.map((integration) => `
                  <button class="hh-btn hh-btn-secondary" data-test-provider="${escapeHtml(integration.providerId)}" ${readOnly ? 'disabled' : ''}>Test ${escapeHtml(integration.displayName || integration.providerId)}</button>
                `).join('')}
              </div>
            </div>
            ${renderIntegrationRows(payload.integrations)}
          </div>
        </section>
      </div>
    `;

    bindRouteButtons(container);
    container.querySelector('#hh-settings-refresh')?.addEventListener('click', async () => {
      pushToast('Refreshing settings…');
      await load({ showLoading: false });
    });
    container.querySelector('#hh-settings-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (readOnly) return;
      const formData = new FormData(event.currentTarget);
      const nextConfig = cloneConfig(config);
      nextConfig.environment.locationName = String(formData.get('locationName') || '').trim();
      nextConfig.environment.lat = Number(formData.get('lat') || config.environment.lat);
      nextConfig.environment.lon = Number(formData.get('lon') || config.environment.lon);
      nextConfig.system.standbyTimeoutMin = Number(formData.get('standbyTimeoutMin') || config.system.standbyTimeoutMin);
      nextConfig.system.quietHoursStart = String(formData.get('quietHoursStart') || config.system.quietHoursStart);
      nextConfig.system.quietHoursEnd = String(formData.get('quietHoursEnd') || config.system.quietHoursEnd);
      nextConfig.photos.googleAlbumId = String(formData.get('googleAlbumId') || '').trim();
      nextConfig.photos.imgurAlbumId = String(formData.get('imgurAlbumId') || '').trim();
      nextConfig.photos.immichBaseUrl = String(formData.get('immichBaseUrl') || '').trim();
      nextConfig.photos.immichAlbumId = String(formData.get('immichAlbumId') || '').trim();
      nextConfig.photos.sourcePriority = buildPhotoPriority(String(formData.get('primaryPhotoSource') || 'google_photos'));
      nextConfig.agenda.selectedCalendars = String(formData.get('selectedCalendars') || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

      try {
        await apiFetch('/api/settings', {
          method: 'POST',
          body: {
            action: 'save_config',
            payload: nextConfig,
          },
        });
        window.dispatchEvent(new CustomEvent('homehub:config-updated', { detail: { config: nextConfig } }));
        pushToast('Settings saved.');
        await load({ showLoading: false });
      } catch (error) {
        pushToast(error.message || 'Could not save settings.');
      }
    });
    container.querySelectorAll('[data-test-provider]').forEach((button) => {
      button.addEventListener('click', async () => {
        const providerId = button.dataset.testProvider;
        try {
          const result = await apiFetch('/api/settings', {
            method: 'POST',
            body: {
              action: 'test_integration',
              providerId,
            },
          });
          pushToast(result?.message || `Tested ${providerId}`);
        } catch (error) {
          pushToast(error.message || `Could not test ${providerId}`);
        }
      });
    });
  }

  await load();
  return () => {
    disposed = true;
    loadVersion += 1;
  };
}

```

### MODIFIED `lib/server/supabase.js`

```js
import { fetchJson } from './fetch.js';

function normalizeEnvValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function createSupabaseConfigError(message, details = {}) {
  const error = new Error(message);
  error.statusCode = 500;
  error.code = 'SUPABASE_CONFIG_ERROR';
  error.details = details;
  return error;
}

function createSupabaseRequestError(message, details = {}) {
  const error = new Error(message);
  error.statusCode = details.statusCode || 502;
  error.code = 'SUPABASE_REQUEST_ERROR';
  error.details = details;
  return error;
}

function getSupabaseEnvSnapshot() {
  return {
    url: normalizeEnvValue(process.env.SUPABASE_URL),
    serviceRoleKey: normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY),
    anonKey: normalizeEnvValue(process.env.SUPABASE_ANON_KEY),
  };
}

function validateSupabaseConfig({
  requireServiceRole = true,
  requireAnonKey = false,
} = {}) {
  const { url, serviceRoleKey, anonKey } = getSupabaseEnvSnapshot();
  const missing = [];

  if (!url) {
    missing.push('SUPABASE_URL');
  }
  if (requireServiceRole && !serviceRoleKey) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  if (requireAnonKey && !anonKey) {
    missing.push('SUPABASE_ANON_KEY');
  }

  if (missing.length) {
    throw createSupabaseConfigError(
      `Server Supabase configuration is incomplete: missing ${missing.join(', ')}.`,
      { missing }
    );
  }

  if (!isHttpUrl(url)) {
    throw createSupabaseConfigError(
      'Server Supabase configuration is invalid: SUPABASE_URL must be a full http(s) URL.',
      { invalid: ['SUPABASE_URL'] }
    );
  }

  return { url, serviceRoleKey, anonKey };
}

function getResponseMessage(data, fallback) {
  if (data && typeof data === 'object') {
    if (typeof data.message === 'string' && data.message) return data.message;
    if (typeof data.error?.message === 'string' && data.error.message) return data.error.message;
    if (typeof data.error_description === 'string' && data.error_description) return data.error_description;
    if (typeof data.hint === 'string' && data.hint) return data.hint;
    if (typeof data.details === 'string' && data.details) return data.details;
  }
  if (typeof data === 'string' && data.trim()) return data.trim();
  return fallback;
}

export function getServerSupabaseDiagnostics() {
  const { url, serviceRoleKey, anonKey } = getSupabaseEnvSnapshot();
  const issues = [];
  const warnings = [];

  if (!url) {
    issues.push('Missing SUPABASE_URL.');
  } else if (!isHttpUrl(url)) {
    issues.push('SUPABASE_URL must be a full http(s) URL.');
  }

  if (!serviceRoleKey) {
    issues.push('Missing SUPABASE_SERVICE_ROLE_KEY.');
  }
  if (!anonKey) {
    warnings.push('SUPABASE_ANON_KEY is not set on the server. Browser auth can still work, but anon-key server fallbacks are unavailable.');
  }

  return {
    configured: issues.length === 0,
    urlConfigured: Boolean(url),
    serviceRoleConfigured: Boolean(serviceRoleKey),
    anonConfigured: Boolean(anonKey),
    issues,
    warnings,
  };
}

export async function getAuthUser(accessToken) {
  if (!accessToken) return null;
  const { url, serviceRoleKey } = validateSupabaseConfig();
  const response = await fetchJson(`${url}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw createSupabaseRequestError(
      `Supabase auth lookup failed (${response.status}): ${getResponseMessage(response.data, 'Could not validate the current session.')}`,
      {
        statusCode: response.status === 401 ? 401 : 502,
        operation: 'auth.getUser',
      }
    );
  }
  return response.data || null;
}

export async function restSelect(table, query, { accessToken, useServiceRole = true } = {}) {
  const { url, serviceRoleKey, anonKey } = validateSupabaseConfig({
    requireServiceRole: useServiceRole,
    requireAnonKey: !useServiceRole,
  });
  const key = useServiceRole ? serviceRoleKey : anonKey;
  const bearerToken = useServiceRole ? serviceRoleKey : (accessToken || anonKey);
  const response = await fetchJson(`${url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${bearerToken}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw createSupabaseRequestError(
      `Supabase GET ${table} failed (${response.status}): ${getResponseMessage(response.data, 'The requested data could not be loaded from Supabase.')}`,
      {
        statusCode: response.status,
        table,
        method: 'GET',
      }
    );
  }
  return response.data;
}

export async function restMutate(table, query, method, payload, { prefer = 'return=representation' } = {}) {
  const { url, serviceRoleKey } = validateSupabaseConfig();
  const response = await fetchJson(`${url}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw createSupabaseRequestError(
      `Supabase ${method} ${table} failed (${response.status}): ${getResponseMessage(response.data, 'The write operation could not be completed.')}`,
      {
        statusCode: response.status,
        table,
        method,
      }
    );
  }
  return response.data;
}

```

### MODIFIED `lib/server/auth.js`

```js
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

```

### MODIFIED `api/settings.js`

```js
import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { getEnvironmentHealth } from '../lib/server/domains/environment/service.js';
import { getHouseholdHealth } from '../lib/server/domains/household/service.js';
import { getMediaHealth } from '../lib/server/domains/media/service.js';
import { getPhotosHealth } from '../lib/server/domains/photos/service.js';
import { createMeta, parseJsonBody, sendError } from '../lib/server/http.js';
import { getAgendaHealth } from '../lib/server/integrations/agenda/service.js';
import { getServerSupabaseDiagnostics, restMutate } from '../lib/server/supabase.js';

function mapConfigPayloadToRow(payload = {}) {
  return {
    location_name: payload.environment?.locationName,
    location_lat: payload.environment?.lat,
    location_lon: payload.environment?.lon,
    standby_timeout_min: payload.system?.standbyTimeoutMin,
    quiet_hours_start: payload.system?.quietHoursStart,
    quiet_hours_end: payload.system?.quietHoursEnd,
    immich_base_url: payload.photos?.immichBaseUrl,
    immich_album_id: payload.photos?.immichAlbumId,
    imgur_album_id: payload.photos?.imgurAlbumId,
    google_photos_album_id: payload.photos?.googleAlbumId,
    selected_calendars: payload.agenda?.selectedCalendars,
    photo_provider: payload.photos?.sourcePriority?.[0],
    updated_at: new Date().toISOString(),
  };
}

function healthFallback(providerId, message) {
  return {
    providerId,
    status: 'error',
    healthStatus: 'error',
    authState: 'unknown',
    warnings: [message],
  };
}

function mergeIntegrationHealth(integration, healthByProvider) {
  const health = healthByProvider.get(integration.providerId);
  return health ? { ...integration, ...health } : integration;
}

function buildSettingsDiagnostics() {
  return {
    serverSupabase: getServerSupabaseDiagnostics(),
  };
}

function readOnlySettingsFallback(message = 'Settings payload is unavailable.') {
  return {
    meta: createMeta({
      degraded: true,
      warnings: [message],
    }),
    config: null,
    integrations: [],
    systemHealth: [],
    readOnly: true,
    diagnostics: buildSettingsDiagnostics(),
  };
}

function settingsMutationFallback(message = 'Settings action failed.') {
  return {
    meta: createMeta({
      degraded: true,
      warnings: [message],
    }),
    success: false,
    message,
    diagnostics: buildSettingsDiagnostics(),
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    const loaded = await loadConfig(context);
    const { config, integrations } = loaded;

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (body.action === 'save_config') {
        const row = mapConfigPayloadToRow(body.payload || {});
        row.user_id = context.user.id;
        row.household_id = context.householdId;
        await restMutate('user_settings', 'on_conflict=user_id', 'POST', row, { prefer: 'resolution=merge-duplicates,return=representation' });
        applyCacheProfile(res, 'settings');
        return res.status(200).json({
          meta: createMeta(),
          success: true,
          message: 'Settings saved.',
        });
      }
      if (body.action === 'test_integration') {
        applyCacheProfile(res, 'settings');
        return res.status(200).json({
          meta: createMeta(),
          testResult: 'success',
          message: `Tested ${body.providerId || 'integration'} with current configuration.`,
        });
      }
      if (body.action === 'disconnect_provider') {
        applyCacheProfile(res, 'settings');
        return res.status(200).json({
          meta: createMeta(),
          success: true,
          message: 'Disconnect flow is provider-specific and should be completed via OAuth revoke or settings cleanup.',
        });
      }
      const error = new Error('Unknown settings action');
      error.statusCode = 400;
      throw error;
    }

    const agendaHealth = getAgendaHealth(context);
    const [environmentHealth, householdHealth, mediaHealth, photosHealth] = await Promise.allSettled([
      getEnvironmentHealth(config),
      getHouseholdHealth(config, context),
      getMediaHealth(config, req),
      getPhotosHealth(config),
    ]);

    const systemHealth = [
      environmentHealth.status === 'fulfilled' ? environmentHealth.value : healthFallback('environment', environmentHealth.reason?.message || 'Environment health check failed.'),
      householdHealth.status === 'fulfilled' ? householdHealth.value : healthFallback('household', householdHealth.reason?.message || 'Household health check failed.'),
      mediaHealth.status === 'fulfilled' ? mediaHealth.value : healthFallback('media', mediaHealth.reason?.message || 'Media health check failed.'),
      photosHealth.status === 'fulfilled' ? photosHealth.value : healthFallback('google_photos', photosHealth.reason?.message || 'Photos health check failed.'),
      agendaHealth,
    ];

    const healthByProvider = new Map([
      ['google_calendar', agendaHealth],
      ['google_photos', systemHealth[3]],
    ]);

    const warnings = systemHealth.flatMap((entry) => entry.warnings || []);
    const degraded = systemHealth.some((entry) => entry.status === 'degraded' || entry.status === 'error' || entry.healthStatus === 'missing');

    applyCacheProfile(res, 'settings');
    return res.status(200).json({
      meta: createMeta({
        degraded,
        warnings,
      }),
      config,
      integrations: integrations.map((integration) => mergeIntegrationHealth(integration, healthByProvider)),
      systemHealth,
      readOnly: false,
      diagnostics: buildSettingsDiagnostics(),
    });
  } catch (error) {
    return sendError(
      res,
      error,
      500,
      req.method === 'POST'
        ? settingsMutationFallback(error.message || 'Settings action failed.')
        : readOnlySettingsFallback(error.message || 'Settings payload is unavailable.')
    );
  }
}

```

### MODIFIED `.env.example`

```text
# Browser-safe Supabase values do NOT go in this file.
# Put these in public/config.js instead:
# - supabaseUrl
# - supabaseAnonKey
#
# Secret server-side Supabase values belong here or in Vercel Project Settings.

# Required server environment variables
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Optional server-side anon key mirror.
# Useful for diagnostics and future non-privileged server requests.
SUPABASE_ANON_KEY=your-browser-safe-supabase-anon-key

# Recommended production environment variables
ADMIN_TOKEN=replace-with-a-long-random-admin-token
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REFRESH_TOKEN=your-google-oauth-refresh-token
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com

# Optional photo provider environment variables
GOOGLE_PHOTOS_ALBUM_ID=
IMGUR_ALBUM_ID=
IMGUR_CLIENT_ID=
IMMICH_BASE_URL=
IMMICH_ALBUM_ID=
IMMICH_SHARED_ALBUM_TOKEN=

# Optional shared household configuration overrides
SPOTIFY_EMBED_URL=https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M
HOMEHUB_HOUSEHOLD_NAME=Scott family
HOMEHUB_LOCATION_NAME=Gahanna, Ohio
HOMEHUB_LAT=40.029059
HOMEHUB_LON=-82.863462
HOMEHUB_TZ=America/New_York
HOMEHUB_STANDBY_TIMEOUT_MIN=5
HOMEHUB_QUIET_HOURS_START=22:00
HOMEHUB_QUIET_HOURS_END=06:00
HOMEHUB_MINIMAL_NIGHT_MODE=false
HOMEHUB_FAMILY_MEMBERS=Will,Lyla,Mom,Dad,Scott
HOMEHUB_TREAT_PET_NAME=Barker
HOMEHUB_TREAT_PET_EMOJI=🐕
HOMEHUB_TREAT_DAILY_LIMIT=6

# Optional local smoke-test variables
HOMEHUB_BASE_URL=http://localhost:3000
HOMEHUB_BEARER_TOKEN=
HOMEHUB_ADMIN_TOKEN=

```

### MODIFIED `vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": null,
  "outputDirectory": "public",
  "cleanUrls": false,
  "headers": [
    {
      "source": "/config.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-store, max-age=0"
        }
      ]
    }
  ]
}

```

### MODIFIED `README.md`

```md
# HomeHub

HomeHub is a mounted household dashboard and kiosk app for one shared home surface.

It has four experience layers:

- `Home`: the summary dashboard
- `Domain pages`: deeper Weather, Alerts, Household, Media, Photos, and Settings views
- `Admin`: protected diagnostics, mock scenarios, and maintenance actions
- `Standby`: a photo-first ambient mode with a shared alert override

## Architecture

HomeHub ships with `6 business domains`, `1 internal integration`, and `2 aggregate read models`.

- `Environment`: weather + alerts
- `Household`: chores + treat tracker
- `Media`: music + radio state
- `Photos`: slideshow source selection and queue
- `Settings`: configuration + integration state
- `Admin`: diagnostics and guarded operations
- `Agenda`: internal calendar helper only
- `Dashboard`: aggregate read model for Home
- `Standby`: lightweight aggregate read model for kiosk mode

## Deployed API Surface

HomeHub is intentionally capped at `8` serverless endpoints to stay well inside the Vercel Hobby limit of `12`.

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/dashboard` | `GET` | Home summary aggregate |
| `/api/environment` | `GET` | Weather + alerts |
| `/api/household` | `GET, POST` | Chores + treat tracker |
| `/api/media` | `GET, POST` | Music + radio state |
| `/api/photos` | `GET` | Photo queue and source fallback |
| `/api/settings` | `GET, POST` | Config + integration state |
| `/api/standby` | `GET` | Lightweight kiosk payload |
| `/api/admin` | `GET, POST` | Admin diagnostics and actions |

Do not add route-per-card, route-per-provider, or mock-only endpoints.

## Frontend Structure

The frontend stays intentionally simple:

- HTML shell in [`public/index.html`](./public/index.html)
- shared runtime in [`public/assets/core`](./public/assets/core)
- shared UI system in [`public/assets/ui`](./public/assets/ui)
- domain page modules in [`public/assets/domains`](./public/assets/domains)

The UI is built from one shell, one token system, one status language, and one page-template vocabulary.

## Repo Layout

```text
api/                  deployed API routes
docs/                 architecture, contracts, operations, and contributor docs
lib/server/           shared backend services, config, integrations, cache helpers
public/               shell HTML, static assets, fallback photos
scripts/              repo guardrails and verification helpers
```

## Supabase setup

HomeHub uses two different Supabase credential surfaces:

- `public/config.js` is browser-visible and must only contain browser-safe values.
- `.env` locally and Vercel Project Settings -> Environment Variables hold server-only secrets.

### `public/config.js`

Paste these browser-safe values into [`public/config.js`](./public/config.js):

- `supabaseUrl`
- `supabaseAnonKey`
- `apiBase`

For same-origin local dev and Vercel deployments, keep `apiBase` as an empty string.

Safe for browser use:

- `supabaseUrl`
- `supabaseAnonKey`

Never put this in `public/config.js`:

- `SUPABASE_SERVICE_ROLE_KEY`

### Local `.env`

Copy [`.env.example`](./.env.example) to `.env` and set:

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional but supported:

- `SUPABASE_ANON_KEY`
- `ADMIN_TOKEN`
- provider-specific integration variables from `.env.example`

`SUPABASE_URL` in `.env` should match `supabaseUrl` in `public/config.js`.

### Vercel environment variables

Set these in Vercel Project Settings -> Environment Variables:

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `SUPABASE_ANON_KEY`
- `ADMIN_TOKEN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `FIREBASE_DATABASE_URL`
- any provider or household overrides from `.env.example`

### Startup steps

1. Copy `.env.example` to `.env`.
2. Paste your Supabase project URL into `.env` as `SUPABASE_URL`.
3. Paste your Supabase service role key into `.env` as `SUPABASE_SERVICE_ROLE_KEY`.
4. Open [`public/config.js`](./public/config.js) and paste the same project URL into `supabaseUrl`.
5. Paste your Supabase anon/public key into `public/config.js` as `supabaseAnonKey`.
6. Run `npm run verify`.
7. Run `npm run dev`.

### Deploy steps

1. Deploy the repo root to Vercel with Framework Preset set to `Other`.
2. Keep `public/config.js` checked in or updated with the production `supabaseUrl` and `supabaseAnonKey`.
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel Project Settings -> Environment Variables.
4. Add any optional integration env vars needed for your deployment.
5. Deploy.
6. Run `HOMEHUB_BASE_URL=https://your-deployment-url npm run smoke` after deploy if you want a live contract check.

## Local Development

1. Complete the steps in [Supabase setup](#supabase-setup).
2. Run `npm run verify`.
3. Run `npm run dev` to start `vercel dev` from the repo root.
4. Sign in with Google through Supabase.

Recommended preflight checks:

```bash
npm run verify
```

If you have a local dev server running, you can also run:

```bash
HOMEHUB_BASE_URL=http://localhost:3000 npm run smoke
```

## Vercel Deployment

Deploy this repo from the repository root. Do not point Vercel at `public/`.

### Project Settings

- Framework Preset: `Other`
- Root Directory: repo root
- Build Command: leave blank
- Output Directory: leave blank in the dashboard; `vercel.json` pins it to `public`
- Install Command: default is fine
- Node.js: any supported Vercel Node runtime that satisfies `package.json` (`>=20`)

### Browser-Safe Frontend Config

This project is a static frontend plus native `api/*.js` Vercel Functions. The frontend reads its browser-safe Supabase config from `public/config.js`, so confirm these values before deploying:

- `supabaseUrl`
- `supabaseAnonKey`
- `apiBase`

For same-origin Vercel deployment, keep `apiBase` empty.

`SUPABASE_SERVICE_ROLE_KEY` must never go in `public/config.js`.

### Server Environment Variables

Set these in Vercel Project Settings -> Environment Variables.

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Recommended for production:

- `SUPABASE_ANON_KEY`
- `ADMIN_TOKEN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `FIREBASE_DATABASE_URL`

Optional provider and household overrides:

- `GOOGLE_PHOTOS_ALBUM_ID`
- `IMGUR_ALBUM_ID`
- `IMGUR_CLIENT_ID`
- `IMMICH_BASE_URL`
- `IMMICH_ALBUM_ID`
- `IMMICH_SHARED_ALBUM_TOKEN`
- `SPOTIFY_EMBED_URL`
- `HOMEHUB_HOUSEHOLD_NAME`
- `HOMEHUB_LOCATION_NAME`
- `HOMEHUB_LAT`
- `HOMEHUB_LON`
- `HOMEHUB_TZ`
- `HOMEHUB_STANDBY_TIMEOUT_MIN`
- `HOMEHUB_QUIET_HOURS_START`
- `HOMEHUB_QUIET_HOURS_END`
- `HOMEHUB_MINIMAL_NIGHT_MODE`
- `HOMEHUB_FAMILY_MEMBERS`
- `HOMEHUB_TREAT_PET_NAME`
- `HOMEHUB_TREAT_PET_EMOJI`
- `HOMEHUB_TREAT_DAILY_LIMIT`

Local smoke-test only:

- `HOMEHUB_BASE_URL`
- `HOMEHUB_BEARER_TOKEN`
- `HOMEHUB_ADMIN_TOKEN`

The complete variable list lives in `.env.example`.

## Vercel Deployment Checklist

- Deploy from the repo root.
- Keep the Framework Preset set to `Other`.
- Leave the Build Command blank.
- Confirm `public/config.js` points at the correct Supabase project and leaves `apiBase` empty.
- Set the required Vercel environment variables.
- Run `npm run verify` before shipping.
- Optionally run `HOMEHUB_BASE_URL=https://your-deployment-url npm run smoke` after deployment.

## Key Rules

- Settings is the only config source of truth after login.
- Dashboard and Standby reuse shared domain summaries; they do not fetch provider-specific data themselves.
- Admin/test behavior stays isolated behind admin auth and visible `isMock` markers.
- No client-side provider fetches belong in page modules.
- No internal server logic should call another HomeHub API route over HTTP.

## Docs

- [Architecture Overview](./docs/architecture-overview.md)
- [Domains and Data](./docs/domains-and-data.md)
- [Endpoints and Contracts](./docs/endpoints-and-contracts.md)
- [Frontend System](./docs/frontend-system.md)
- [Config and Integrations](./docs/config-and-integrations.md)
- [Admin and Operations](./docs/admin-and-operations.md)
- [Deployment and Hobby Limit](./docs/deployment-and-hobby-limit.md)
- [Testing and Quality](./docs/testing-and-quality.md)
- [Data Migrations](./docs/data-migrations.md)
- [Contributing](./docs/contributing.md)

```

### MODIFIED `scripts/verify-env.mjs`

```text
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const recommended = [
  'SUPABASE_ANON_KEY',
  'ADMIN_TOKEN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'FIREBASE_DATABASE_URL',
];

const optional = [
  'GOOGLE_PHOTOS_ALBUM_ID',
  'IMGUR_ALBUM_ID',
  'IMGUR_CLIENT_ID',
  'IMMICH_BASE_URL',
  'IMMICH_ALBUM_ID',
  'IMMICH_SHARED_ALBUM_TOKEN',
  'SPOTIFY_EMBED_URL',
  'HOMEHUB_HOUSEHOLD_NAME',
  'HOMEHUB_LOCATION_NAME',
  'HOMEHUB_LAT',
  'HOMEHUB_LON',
  'HOMEHUB_TZ',
  'HOMEHUB_STANDBY_TIMEOUT_MIN',
  'HOMEHUB_QUIET_HOURS_START',
  'HOMEHUB_QUIET_HOURS_END',
  'HOMEHUB_MINIMAL_NIGHT_MODE',
  'HOMEHUB_FAMILY_MEMBERS',
  'HOMEHUB_TREAT_PET_NAME',
  'HOMEHUB_TREAT_PET_EMOJI',
  'HOMEHUB_TREAT_DAILY_LIMIT',
];

const localOnly = [
  'HOMEHUB_BASE_URL',
  'HOMEHUB_BEARER_TOKEN',
  'HOMEHUB_ADMIN_TOKEN',
];

function readPublicConfigStatus() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const configPath = path.resolve(currentDir, '../public/config.js');
  const source = fs.readFileSync(configPath, 'utf8');
  const urlMatch = source.match(/supabaseUrl:\s*'([^']*)'/);
  const anonMatch = source.match(/supabaseAnonKey:\s*'([^']*)'/);
  const hasServiceRoleLeak = /(SUPABASE_SERVICE_ROLE_KEY|supabaseServiceRoleKey|serviceRoleKey)\s*:/.test(source);

  return {
    supabaseUrl: urlMatch?.[1] || '',
    supabaseAnonKey: anonMatch?.[1] || '',
    hasServiceRoleLeak,
  };
}

let failed = false;

console.log('Required environment variables:');
for (const key of required) {
  if (!process.env[key]) {
    console.error(`- missing ${key}`);
    failed = true;
  } else {
    console.log(`- ok ${key}`);
  }
}

console.log('\nRecommended environment variables:');
for (const key of recommended) {
  console.log(`- ${process.env[key] ? 'ok' : 'warn'} ${key}`);
}

console.log('\nOptional environment variables:');
for (const key of optional) {
  console.log(`- ${process.env[key] ? 'ok' : 'info'} ${key}`);
}

console.log('\nLocal smoke-test variables:');
for (const key of localOnly) {
  console.log(`- ${process.env[key] ? 'ok' : 'info'} ${key}`);
}

const publicConfig = readPublicConfigStatus();
console.log('\nBrowser-safe public/config.js values:');
console.log(`- ${publicConfig.supabaseUrl ? 'ok' : 'warn'} supabaseUrl`);
console.log(`- ${publicConfig.supabaseAnonKey ? 'ok' : 'warn'} supabaseAnonKey`);
console.log(`- ${publicConfig.hasServiceRoleLeak ? 'warn' : 'ok'} no service-role key in public/config.js`);

if (publicConfig.hasServiceRoleLeak) {
  console.warn('\npublic/config.js appears to reference a service-role key name. Remove it before deploying.');
}

if (failed) {
  process.exit(1);
}

```

