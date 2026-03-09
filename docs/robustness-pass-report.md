# HomeHub Robustness Pass

Full contents of every changed file from the production-hardening pass are included below.

## Bug Summary

- Frontend boot assumed required DOM nodes, config, session state, and JSON payloads always existed.
- Several page renderers dereferenced nested fields directly and could blank the page on partial or malformed data.
- Aggregate endpoints could fail hard when one upstream dependency failed, producing payload shapes the frontend could not safely render.
- Route/startup handling and service-worker caching could leave the app on invalid routes or stale broken shells.

## What Caused Blank Or Partial Rendering

- Missing `#app`, `#hh-login`, `#hh-shell`, or `#hh-page-content` nodes were not recovered at runtime.
- Auth/session boot could fail before the shell rendered when config or Supabase runtime pieces were partial.
- `apiFetch()` assumed every response body was valid JSON and non-empty.
- Page renderers assumed stable server payload shapes and threw on missing nested fields.
- Late async responses and timers could overwrite a newer route after navigation.

## What Was Done To Make The App Resilient

- Hardened shell/bootstrap, config normalization, route fallback, and per-route render isolation.
- Added defensive API parsing for malformed JSON, empty bodies, text errors, and network failures.
- Updated all requested page modules to render degraded cards/states instead of crashing on partial data.
- Standardized server error/meta handling and endpoint fallback payloads so the frontend always receives expected top-level keys.
- Changed dashboard/standby aggregation to tolerate partial upstream failures and fixed the admin-token auth logic.
- Tightened service-worker caching so deploys can refresh the shell/core assets cleanly.

## Remaining Non-Blocking Issues

- Live verification against real integrations still depends on project env vars such as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- `npm run smoke` passes static checks but skips live HTTP contract validation unless `HOMEHUB_BASE_URL` is set.
- This pass intentionally did not redesign the UI or change the app architecture.

## Changed Files

### NEW `public/assets/core/config.js`

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

export function getClientConfig() {
  const rawConfig = asRecord(window.HOME_HUB_CONFIG);
  const rawLocation = asRecord(rawConfig.defaultLocation);
  return {
    ...DEFAULT_CLIENT_CONFIG,
    ...rawConfig,
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

export function getAuthSupportState() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseClientConfig();
  if (!window.supabase?.createClient) {
    return {
      available: false,
      reason: 'The Supabase client library did not load.',
    };
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      available: false,
      reason: 'Runtime config is missing Supabase connection details.',
    };
  }
  return {
    available: true,
    reason: '',
  };
}

```

### MODIFIED `public/config.js`

```js
(function initHomeHubConfig(globalObject) {
  const current = globalObject.HOME_HUB_CONFIG && typeof globalObject.HOME_HUB_CONFIG === 'object'
    ? globalObject.HOME_HUB_CONFIG
    : {};

  globalObject.HOME_HUB_CONFIG = {
    householdDisplayName: 'Scott family',
    supabaseUrl: 'https://cmaefwhqoykittrwiobw.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtYWVmd2hxb3lraXR0cndpb2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjM1ODQsImV4cCI6MjA4NjEzOTU4NH0.rUub2PIr60w9InuA1zygE7l0OK6li_Un8WjpdcVg3ko',
    apiBase: '',
    defaultLocation: {
      name: 'Gahanna, Ohio',
      lat: 40.029059,
      lon: -82.863462,
    },
    ...current,
    defaultLocation: {
      name: 'Gahanna, Ohio',
      lat: 40.029059,
      lon: -82.863462,
      ...(current.defaultLocation && typeof current.defaultLocation === 'object' ? current.defaultLocation : {}),
    },
  };
}(window));

```

### MODIFIED `public/assets/core/format.js`

```js
import { go } from './router.js';

export function asObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDateTime(value, options = {}) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  });
}

export function formatDate(value, options = {}) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...options,
  });
}

export function formatTime(value, options = {}) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  });
}

export function bindRouteButtons(root) {
  root?.querySelectorAll?.('[data-route]').forEach((element) => {
    element.addEventListener('click', () => {
      if (element.dataset.route) go(element.dataset.route);
    });
  });
}

export function makeWarningBadges(warnings = []) {
  return warnings
    .filter(Boolean)
    .map((warning) => `<span class="hh-badge hh-badge-offline">${escapeHtml(warning)}</span>`)
    .join('');
}

```

### MODIFIED `public/assets/ui/cards.js`

```js
import { escapeHtml } from '../core/format.js';
import { badgeClass } from './status.js';

export function summaryCard(module = {}, options = {}) {
  const safeModule = module && typeof module === 'object' ? module : {};
  const status = options.status || safeModule.status || 'normal';
  const badges = (Array.isArray(safeModule.badges) ? safeModule.badges : [])
    .slice(0, 3)
    .map((badge) => `<span class="hh-badge hh-badge-neutral">${escapeHtml(badge)}</span>`)
    .join('');
  const cta = options.cta || safeModule.cta || null;
  const footer = options.footer || '';
  return `
    <article class="hh-card ${options.hero ? 'hh-card-hero' : ''} ${options.className || ''}">
      <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;">
        <div style="display:grid;gap:.55rem;">
          <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
            <span class="hh-badge ${badgeClass(status)}">${escapeHtml(status)}</span>
            ${badges}
          </div>
          <div class="hh-row-title" style="font-size:${options.hero ? '1.6rem' : '1.15rem'};">${escapeHtml(safeModule.headline || 'Untitled module')}</div>
          <p class="hh-row-copy" style="margin:0;">${escapeHtml(safeModule.supportingText || '')}</p>
        </div>
      </div>
      ${cta || footer ? `
        <div class="hh-card-actions">
          ${cta ? `<button class="hh-btn hh-btn-secondary" data-route="${String(cta.route || '').replace(/^#\//, '')}">${escapeHtml(cta.label)}</button>` : ''}
          ${footer}
        </div>
      ` : ''}
    </article>
  `;
}

```

### MODIFIED `public/assets/core/router.js`

```js
import { setRoute, store } from './store.js';

export const DEFAULT_ROUTE = 'home';

const VALID_ROUTES = ['home', 'weather', 'alerts', 'household', 'media', 'photos', 'settings', 'admin', 'standby'];
const validRoutes = new Set(VALID_ROUTES);

function normalizeRoute(route) {
  const raw = String(route || '')
    .replace(/^#\/?/, '')
    .trim()
    .toLowerCase();
  return validRoutes.has(raw) ? raw : DEFAULT_ROUTE;
}

function routeHash(route) {
  return `#/${normalizeRoute(route)}`;
}

export function getRoute() {
  return normalizeRoute(window.location.hash);
}

export function go(route) {
  const nextHash = routeHash(route);
  if (window.location.hash === nextHash) {
    setRoute(normalizeRoute(route));
    return store.route;
  }
  window.location.hash = nextHash;
  return normalizeRoute(route);
}

export function initRouter(onRouteChange) {
  const update = () => {
    setRoute(getRoute());
    const nextHash = routeHash(store.route);
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }
    onRouteChange(store.route);
  };
  window.addEventListener('hashchange', update);
  update();
}

```

### MODIFIED `public/assets/core/api.js`

```js
import { getClientConfig } from './config.js';
import { getAccessToken, getGoogleProviderToken } from './session.js';
import { store } from './store.js';

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getSessionValue(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function buildRequestBody(body, headers) {
  if (body == null) return undefined;
  if (typeof body === 'string'
    || body instanceof FormData
    || body instanceof URLSearchParams
    || body instanceof Blob
    || body instanceof ArrayBuffer
    || ArrayBuffer.isView(body)) {
    return body;
  }
  if (Array.isArray(body) || isPlainObject(body)) {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return JSON.stringify(body);
  }
  return body;
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) {
    return {
      data: null,
      text: '',
    };
  }

  const contentType = String(response.headers.get('content-type') || '');
  const looksJson = contentType.includes('application/json')
    || contentType.includes('+json')
    || /^[\s\n\r]*[{[]/.test(text);

  if (looksJson) {
    try {
      return {
        data: JSON.parse(text),
        text,
      };
    } catch {
      return {
        data: null,
        text,
      };
    }
  }

  return {
    data: text,
    text,
  };
}

function getErrorMessage(data, text, status) {
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string' && data.error) return data.error;
    if (typeof data.error?.message === 'string' && data.error.message) return data.error.message;
    if (typeof data.message === 'string' && data.message) return data.message;
  }
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (text && text.trim()) return text.trim();
  return `Request failed with status ${status}`;
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const apiBase = getClientConfig().apiBase || '';
  const accessToken = getAccessToken();
  const googleProviderToken = getGoogleProviderToken();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (googleProviderToken) headers.set('X-HomeHub-Google-Token', googleProviderToken);
  if (store.mediaState) headers.set('X-HomeHub-Media-State', JSON.stringify(store.mediaState));
  const adminToken = getSessionValue('hh_admin_token');
  if (adminToken) headers.set('X-HomeHub-Admin-Token', adminToken);
  const mock = getSessionValue('hh_mock');
  const hasAdminSession = store.membership?.role === 'admin' || Boolean(adminToken);
  if (mock && hasAdminSession) headers.set('X-HomeHub-Mock', mock);

  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
      body: buildRequestBody(options.body, headers),
    });
  } catch (error) {
    const networkError = new Error(`Network request failed for ${path}`);
    networkError.status = 0;
    networkError.cause = error;
    throw networkError;
  }

  const { data, text } = await parseResponseBody(response);

  if (!response.ok) {
    const error = new Error(getErrorMessage(data, text, response.status));
    error.status = response.status;
    error.data = data;
    error.bodyText = text;
    throw error;
  }
  return data;
}

```

### MODIFIED `public/assets/core/session.js`

```js
import { getAuthSupportState, getSupabaseClientConfig } from './config.js';
import { setMediaState, setMembership, setSession, store } from './store.js';

let supabaseClient = null;
let sessionAvailability = getAuthSupportState();
let authListenerBound = false;

function updateSessionAvailability(nextState) {
  sessionAvailability = nextState;
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
    updateSessionAvailability({ available: true, reason: '' });
  } catch (error) {
    updateSessionAvailability({
      available: false,
      reason: error.message || 'Auth client initialization failed.',
    });
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
    updateSessionAvailability({
      available: false,
      reason: error.message || 'Session lookup failed.',
    });
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
  } catch {
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
      <p id="hh-login-message" class="hh-row-copy" style="margin:1rem 0 0;">${auth.available ? '' : auth.reason}</p>
    </div>
  `;
  login.querySelector('#hh-google-login')?.addEventListener('click', async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      const message = login.querySelector('#hh-login-message');
      if (message) {
        message.textContent = error.message || 'Sign-in is currently unavailable.';
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
  const { pageContent } = ensureShellStructure();
  if (!pageContent) return;
  pageContent.innerHTML = `
    ${pageHeader({
      kicker: 'HomeHub',
      title: 'Page unavailable',
      subtitle: 'The shell is still running, but this view could not render.',
    })}
    ${errorState('Render failed', error.message || 'Unexpected render error')}
  `;
}

function renderBootFailure(error) {
  const root = getRoot();
  root.innerHTML = `
    <div class="hh-login">
      ${errorState('HomeHub failed to start', error.message || 'Unexpected bootstrap error')}
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

  initRouter(() => {
    renderApp().catch(renderRouteFailure);
  });

  await initSession();
  await loadRuntimeConfig();
  await renderApp();
  bindActivityWatchers();

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

### MODIFIED `public/sw.js`

```js
const VERSION = 'homehub-v6';
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;

const STATIC_URLS = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/fallback/photos/family-1.svg',
  '/fallback/photos/family-2.svg',
  '/fallback/photos/family-3.svg',
];

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function isBypassedRequest(url) {
  return url.pathname.startsWith('/api/')
    || url.hostname.includes('supabase.co')
    || url.hostname.includes('googleapis.com')
    || url.hostname.includes('photoslibrary')
    || url.hostname.includes('openmeteo')
    || url.hostname.includes('weather.gov');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

function isShellAsset(url) {
  return url.pathname === '/'
    || url.pathname === '/index.html'
    || url.pathname === '/config.js'
    || url.pathname.startsWith('/assets/core/')
    || url.pathname.startsWith('/assets/ui/')
    || url.pathname === '/manifest.webmanifest';
}

function isImageAsset(request, url) {
  return request.destination === 'image'
    || url.pathname.startsWith('/fallback/photos/')
    || url.pathname.startsWith('/icons/');
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => Promise.allSettled(
        STATIC_URLS.map((url) => cache.add(url))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => ![SHELL_CACHE, STATIC_CACHE].includes(key))
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('Network request failed');
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isBypassedRequest(url)) return;
  if (!isSameOrigin(url)) return;

  if (isNavigationRequest(request) || isShellAsset(url)) {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return cache.match('/index.html') || cache.match('/') || Response.error();
      })
    );
    return;
  }

  if (isImageAsset(request, url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
});

```

### MODIFIED `public/assets/domains/dashboard/index.js`

```js
import { apiFetch } from '../../core/api.js';
import { asArray, asObject, bindRouteButtons, escapeHtml, formatDateTime } from '../../core/format.js';
import { summaryCard } from '../../ui/cards.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';

function displayDegrees(value) {
  return value == null || value === '' ? '--' : escapeHtml(String(value));
}

function getFallbackPayload(errorMessage = '') {
  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      degraded: Boolean(errorMessage),
      isMock: false,
      warnings: errorMessage ? [errorMessage] : [],
    },
    hero: {
      status: 'info',
      eyebrow: 'Home',
      headline: 'HomeHub is running in degraded mode',
      supportingText: errorMessage || 'Some dashboard data is temporarily unavailable.',
      actions: [{ label: 'Open Settings', route: '#/settings' }],
    },
    modules: {
      agenda: {
        headline: 'Agenda unavailable',
        supportingText: 'Calendar data could not be loaded.',
        items: [],
        sections: {
          today: 0,
          tomorrow: 0,
        },
      },
      environment: {
        status: 'warning',
        headline: 'Weather unavailable',
        supportingText: 'Forecast data could not be loaded.',
        weather: {
          temp: null,
          high: null,
          low: null,
          condition: 'Unavailable',
          icon: '·',
        },
        risk: {
          headline: 'Weather unavailable',
        },
        activeAlertCount: 0,
      },
      household: {
        status: 'warning',
        headline: 'Household unavailable',
        supportingText: 'Chore and treat data could not be loaded.',
      },
      media: {
        status: 'normal',
        headline: 'Nothing playing right now',
        supportingText: 'Open Media to start playback.',
      },
      photos: {
        status: 'warning',
        headline: 'Photo queue unavailable',
        supportingText: 'Open Photos to retry the slideshow.',
      },
    },
  };
}

function normalizeDashboardPayload(payload, errorMessage = '') {
  const fallback = getFallbackPayload(errorMessage);
  const meta = asObject(payload?.meta);
  const hero = asObject(payload?.hero);
  const modules = asObject(payload?.modules);
  return {
    meta: {
      ...fallback.meta,
      ...meta,
      warnings: asArray(meta.warnings),
    },
    hero: {
      ...fallback.hero,
      ...hero,
      actions: asArray(hero.actions).map((action) => ({
        label: action?.label || 'Open',
        route: action?.route || '#/home',
      })),
    },
    modules: {
      agenda: {
        ...fallback.modules.agenda,
        ...asObject(modules.agenda),
        items: asArray(modules.agenda?.items),
        sections: {
          ...fallback.modules.agenda.sections,
          ...asObject(modules.agenda?.sections),
        },
      },
      environment: {
        ...fallback.modules.environment,
        ...asObject(modules.environment),
        weather: {
          ...fallback.modules.environment.weather,
          ...asObject(modules.environment?.weather),
        },
        risk: {
          ...fallback.modules.environment.risk,
          ...asObject(modules.environment?.risk),
        },
      },
      household: {
        ...fallback.modules.household,
        ...asObject(modules.household),
      },
      media: {
        ...fallback.modules.media,
        ...asObject(modules.media),
      },
      photos: {
        ...fallback.modules.photos,
        ...asObject(modules.photos),
      },
    },
  };
}

function renderBanner(payload) {
  if (!payload.meta.degraded && !payload.meta.isMock) return '';
  const statusClass = payload.meta.isMock ? 'hh-banner-warning' : 'hh-banner-offline';
  const title = payload.meta.isMock ? 'Test mode is active' : 'Some dashboard data is degraded';
  const subtitle = payload.meta.warnings?.[0] || 'HomeHub is showing the best available summary right now.';
  return `
    <div class="hh-banner ${statusClass}">
      <div class="hh-banner-copy">
        <p class="hh-banner-title">${escapeHtml(title)}</p>
        <p class="hh-banner-subtitle">${escapeHtml(subtitle)}</p>
      </div>
    </div>
  `;
}

function renderHero(hero) {
  const actions = asArray(hero.actions)
    .map((action) => `<button class="hh-btn hh-btn-secondary" data-route="${String(action.route || '').replace(/^#\//, '')}">${escapeHtml(action.label || 'Open')}</button>`)
    .join('');
  return `
    <section class="hh-card hh-card-hero hh-col-12">
      <div class="hh-stack">
        <div class="hh-pill-row">
          <span class="hh-badge hh-badge-${hero.status === 'danger' ? 'danger' : hero.status === 'urgent' ? 'urgent' : hero.status === 'warning' ? 'warning' : hero.status === 'info' ? 'info' : 'success'}">${escapeHtml(hero.eyebrow || 'Home')}</span>
        </div>
        <div>
          <h2 class="hh-page-title" style="font-size:clamp(2rem,4vw,3.4rem);margin-bottom:.75rem;">${escapeHtml(hero.headline || 'HomeHub')}</h2>
          <p class="hh-page-subtitle">${escapeHtml(hero.supportingText || '')}</p>
        </div>
        ${actions ? `<div class="hh-card-actions">${actions}</div>` : ''}
      </div>
    </section>
  `;
}

function renderAgendaCard(agenda) {
  const items = asArray(agenda.items).slice(0, 4);
  const sections = asObject(agenda.sections);
  return `
    <section class="hh-card hh-col-8">
      <div class="hh-stack">
        <div class="hh-split">
          <div>
            <div class="hh-page-kicker">Agenda</div>
            <div class="hh-row-title" style="font-size:1.35rem;">${escapeHtml(agenda.headline || 'Today')}</div>
            <p class="hh-row-copy" style="margin:.5rem 0 0;">${escapeHtml(agenda.supportingText || '')}</p>
          </div>
          <div class="hh-pill-row">
            <span class="hh-badge hh-badge-neutral">${escapeHtml(String(sections.today || 0))} today</span>
            <span class="hh-badge hh-badge-neutral">${escapeHtml(String(sections.tomorrow || 0))} tomorrow</span>
          </div>
        </div>
        ${items.length ? `
          <div class="hh-list">
            ${items.map((item) => `
              <div class="hh-list-row">
                <div class="hh-row-meta">
                  <div class="hh-row-title">${escapeHtml(item.summary || 'Upcoming event')}</div>
                  <div class="hh-row-copy">${escapeHtml(formatDateTime(item.start, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="hh-state">
            <p class="hh-state-title">Nothing scheduled soon</p>
            <p class="hh-state-copy">Connect Google Calendar in Settings to show today’s household schedule.</p>
          </div>
        `}
      </div>
    </section>
  `;
}

function renderEnvironmentAside(module) {
  return `
    <section class="hh-card hh-col-4">
      <div class="hh-stack">
        <div class="hh-page-kicker">Weather</div>
        <div class="hh-row-title" style="font-size:1.35rem;">${displayDegrees(module.weather?.temp)}° ${escapeHtml(module.weather?.icon || '·')}</div>
        <p class="hh-row-copy" style="margin:0;">${escapeHtml(module.weather?.condition || 'Unavailable')}</p>
        <div class="hh-kv">
          <div class="hh-kv-row"><span>High / Low</span><strong>${displayDegrees(module.weather?.high)}° / ${displayDegrees(module.weather?.low)}°</strong></div>
          <div class="hh-kv-row"><span>Risk</span><strong>${escapeHtml(module.risk?.headline || 'Calm')}</strong></div>
          <div class="hh-kv-row"><span>Alerts</span><strong>${escapeHtml(String(module.activeAlertCount || 0))}</strong></div>
        </div>
        <button class="hh-btn hh-btn-secondary" data-route="weather">Open Weather</button>
      </div>
    </section>
  `;
}

export async function renderDashboardPage(container) {
  let disposed = false;
  let loadVersion = 0;
  let intervalId = null;

  async function load({ showLoading = true } = {}) {
    const currentLoad = ++loadVersion;
    if (showLoading && !disposed) {
      container.innerHTML = loadingState('Loading dashboard…');
    }

    let payload;
    try {
      payload = normalizeDashboardPayload(await apiFetch('/api/dashboard'));
    } catch (error) {
      payload = normalizeDashboardPayload(null, error.message);
    }

    if (disposed || currentLoad !== loadVersion) return;

    container.innerHTML = `
      ${pageHeader({
        kicker: 'Home',
        title: 'Dashboard',
        subtitle: `Updated ${formatDateTime(payload.meta.fetchedAt)}`,
        actions: '<button id="hh-refresh-dashboard" class="hh-btn hh-btn-secondary">Refresh</button>',
      })}
      ${renderBanner(payload)}
      <div class="hh-grid">
        ${renderHero(payload.hero)}
        ${renderAgendaCard(payload.modules.agenda)}
        ${renderEnvironmentAside(payload.modules.environment)}
        <div class="hh-col-4">${summaryCard(payload.modules.household)}</div>
        <div class="hh-col-4">${summaryCard(payload.modules.media)}</div>
        <div class="hh-col-4">${summaryCard(payload.modules.photos)}</div>
      </div>
    `;

    bindRouteButtons(container);
    container.querySelector('#hh-refresh-dashboard')?.addEventListener('click', async () => {
      pushToast('Refreshing dashboard…');
      await load({ showLoading: false });
    });
  }

  await load();
  intervalId = window.setInterval(() => {
    load({ showLoading: false }).catch(() => {});
  }, 120000);
  return () => {
    disposed = true;
    loadVersion += 1;
    window.clearInterval(intervalId);
  };
}

```

### MODIFIED `public/assets/domains/environment/index.js`

```js
import { apiFetch } from '../../core/api.js';
import { asArray, asNumber, asObject, bindRouteButtons, formatDateTime } from '../../core/format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';
import { renderAlertsView } from './alertsView.js';
import { renderWeatherView } from './weatherView.js';

function getFallbackPayload(errorMessage = '') {
  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      degraded: Boolean(errorMessage),
      warnings: errorMessage ? [errorMessage] : [],
    },
    summary: {
      status: 'info',
      headline: 'Weather data unavailable',
      supportingText: errorMessage || 'HomeHub is showing the best available environment summary.',
      risk: {
        level: 0,
        headline: 'Weather data unavailable',
        summary: errorMessage || 'Forecast data is temporarily unavailable.',
        timeWindow: null,
      },
      weather: {
        temp: null,
        high: null,
        low: null,
        condition: 'Unavailable',
        icon: '·',
      },
      activeAlertCount: 0,
      ticker: 'Environment unavailable',
    },
    detail: {
      current: {
        feelsLike: null,
        humidity: null,
        windMph: null,
        gustMph: null,
      },
      hourly: [],
      daily: [],
      radar: {
        available: false,
        source: 'Unavailable',
      },
      alerts: {
        active: [],
        recentlyEnded: [],
      },
    },
  };
}

function normalizeEnvironmentPayload(payload, errorMessage = '') {
  const fallback = getFallbackPayload(errorMessage);
  const meta = asObject(payload?.meta);
  const summary = asObject(payload?.summary);
  const detail = asObject(payload?.detail);
  return {
    meta: {
      ...fallback.meta,
      ...meta,
      warnings: asArray(meta.warnings),
    },
    summary: {
      ...fallback.summary,
      ...summary,
      risk: {
        ...fallback.summary.risk,
        ...asObject(summary.risk),
      },
      weather: {
        ...fallback.summary.weather,
        ...asObject(summary.weather),
      },
    },
    detail: {
      ...fallback.detail,
      ...detail,
      current: {
        ...fallback.detail.current,
        ...asObject(detail.current),
      },
      hourly: asArray(detail.hourly),
      daily: asArray(detail.daily),
      radar: {
        ...fallback.detail.radar,
        ...asObject(detail.radar),
      },
      alerts: {
        ...fallback.detail.alerts,
        ...asObject(detail.alerts),
        active: asArray(detail.alerts?.active),
        recentlyEnded: asArray(detail.alerts?.recentlyEnded),
      },
    },
  };
}

export async function renderEnvironmentPage(container, mode = 'weather') {
  let disposed = false;
  let intervalId = null;
  let loadVersion = 0;

  async function load({ showLoading = true } = {}) {
    const currentLoad = ++loadVersion;
    if (showLoading && !disposed) {
      container.innerHTML = loadingState(mode === 'alerts' ? 'Loading alerts…' : 'Loading weather…');
    }

    let payload;
    try {
      payload = normalizeEnvironmentPayload(await apiFetch('/api/environment'));
    } catch (error) {
      payload = normalizeEnvironmentPayload(null, error.message);
    }

    if (disposed || currentLoad !== loadVersion) return;

    const title = mode === 'alerts' ? 'Alerts & Severe Weather' : 'Weather';
    const subtitle = `${mode === 'alerts' ? 'Threats and response guidance' : 'Forecast, radar, and impact outlook'} · Updated ${formatDateTime(payload.meta.fetchedAt)}`;
    container.innerHTML = `
      ${pageHeader({
        kicker: 'Environment',
        title,
        subtitle,
        actions: `
          <button id="hh-environment-refresh" class="hh-btn hh-btn-secondary">Refresh</button>
          <button class="hh-btn hh-btn-secondary" data-route="${mode === 'alerts' ? 'weather' : 'alerts'}">${mode === 'alerts' ? 'Open Weather' : 'Open Alerts'}</button>
        `,
      })}
      ${mode === 'alerts' ? renderAlertsView(payload) : renderWeatherView(payload)}
    `;

    bindRouteButtons(container);
    container.querySelector('#hh-environment-refresh')?.addEventListener('click', async () => {
      pushToast('Refreshing environment…');
      await load({ showLoading: false });
    });

    window.clearInterval(intervalId);
    const pollDelay = asNumber(payload.summary?.risk?.level, 0) >= 3 ? 60000 : 300000;
    intervalId = window.setInterval(() => {
      load({ showLoading: false }).catch(() => {});
    }, pollDelay);
  }

  await load();
  return () => {
    disposed = true;
    loadVersion += 1;
    window.clearInterval(intervalId);
  };
}

```

### MODIFIED `public/assets/domains/environment/weatherView.js`

```js
import { asArray, escapeHtml, formatDate, formatTime } from '../../core/format.js';

function bannerClass(status) {
  if (status === 'danger' || status === 'urgent') return 'hh-banner-danger';
  if (status === 'warning') return 'hh-banner-warning';
  return 'hh-banner-info';
}

function displayValue(value, suffix = '') {
  return value == null || value === '' ? `--${suffix}` : `${escapeHtml(String(value))}${suffix}`;
}

export function renderWeatherView(payload) {
  const alerts = asArray(payload.detail?.alerts?.active);
  const hourly = asArray(payload.detail?.hourly).slice(0, 8);
  const daily = asArray(payload.detail?.daily);
  const topAlert = alerts[0] || null;
  const warnings = asArray(payload.meta?.warnings);
  const showDegradedBanner = payload.meta?.degraded && !topAlert;

  return `
    ${topAlert ? `
      <div class="hh-banner ${bannerClass(payload.summary?.status)}">
        <div class="hh-banner-copy">
          <p class="hh-banner-title">${escapeHtml(topAlert.type || 'Weather alert')}</p>
          <p class="hh-banner-subtitle">${escapeHtml(topAlert.summary || 'Severe weather guidance is available.')}</p>
        </div>
        <button class="hh-btn hh-btn-secondary" data-route="alerts">Open Alerts</button>
      </div>
    ` : showDegradedBanner ? `
      <div class="hh-banner hh-banner-offline">
        <div class="hh-banner-copy">
          <p class="hh-banner-title">Weather data is degraded</p>
          <p class="hh-banner-subtitle">${escapeHtml(warnings[0] || 'HomeHub is showing the best available weather summary.')}</p>
        </div>
      </div>
    ` : ''}
    <div class="hh-grid">
      <section class="hh-card hh-card-hero hh-col-8">
        <div class="hh-stack">
          <div class="hh-pill-row">
            <span class="hh-badge hh-badge-${payload.summary?.status === 'success' ? 'success' : payload.summary?.status === 'warning' ? 'warning' : payload.summary?.status === 'urgent' ? 'urgent' : payload.summary?.status === 'danger' ? 'danger' : 'info'}">${escapeHtml(payload.summary?.risk?.headline || 'Weather')}</span>
            <span class="hh-badge hh-badge-neutral">${escapeHtml(payload.summary?.weather?.condition || 'Unavailable')}</span>
          </div>
          <div class="hh-split">
            <div>
              <div class="hh-row-title" style="font-size:3.5rem;line-height:1;">${displayValue(payload.summary?.weather?.temp, '°')} ${escapeHtml(payload.summary?.weather?.icon || '·')}</div>
              <p class="hh-row-copy" style="margin:.75rem 0 0;">${escapeHtml(payload.summary?.supportingText || 'Weather data is temporarily unavailable.')}</p>
            </div>
            <div class="hh-kv">
              <div class="hh-kv-row"><span>High / Low</span><strong>${displayValue(payload.summary?.weather?.high, '°')} / ${displayValue(payload.summary?.weather?.low, '°')}</strong></div>
              <div class="hh-kv-row"><span>Active alerts</span><strong>${escapeHtml(String(payload.summary?.activeAlertCount || 0))}</strong></div>
              <div class="hh-kv-row"><span>Ticker</span><strong>${escapeHtml(payload.summary?.ticker || 'No alerts')}</strong></div>
            </div>
          </div>
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">Current conditions</div>
          <div class="hh-metric-grid">
            <div class="hh-metric">
              <p class="hh-metric-label">Feels like</p>
              <p class="hh-metric-value">${displayValue(payload.detail?.current?.feelsLike, '°')}</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Humidity</p>
              <p class="hh-metric-value">${displayValue(payload.detail?.current?.humidity, '%')}</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Wind</p>
              <p class="hh-metric-value">${displayValue(payload.detail?.current?.windMph, ' mph')}</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Gusts</p>
              <p class="hh-metric-value">${displayValue(payload.detail?.current?.gustMph, ' mph')}</p>
            </div>
          </div>
        </div>
      </aside>
      <section class="hh-card hh-col-8">
        <div class="hh-stack">
          <div class="hh-page-kicker">Next 12 hours</div>
          ${hourly.length ? `
            <div class="hh-list">
              ${hourly.map((hour) => `
                <div class="hh-list-row">
                  <div class="hh-row-meta">
                    <div class="hh-row-title">${escapeHtml(formatTime(hour.time))}</div>
                    <div class="hh-row-copy">${displayValue(hour.precipitationChance, '% precip')}</div>
                  </div>
                  <div class="hh-row-title">${displayValue(hour.temp, '°')} ${escapeHtml(hour.icon || '·')}</div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="hh-state">
              <p class="hh-state-title">Hourly forecast unavailable</p>
              <p class="hh-state-copy">HomeHub will fill this outlook back in when forecast data returns.</p>
            </div>
          `}
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">Radar & risk</div>
          <div class="hh-kv">
            <div class="hh-kv-row"><span>Radar</span><strong>${escapeHtml(payload.detail?.radar?.source || 'Unavailable')}</strong></div>
            <div class="hh-kv-row"><span>Status</span><strong>${payload.detail?.radar?.available ? 'Available' : 'Unavailable'}</strong></div>
            <div class="hh-kv-row"><span>Window</span><strong>${escapeHtml(payload.summary?.risk?.timeWindow || 'Next 24 hours')}</strong></div>
          </div>
          <p class="hh-row-copy" style="margin:0;">${escapeHtml(payload.summary?.risk?.summary || 'Weather risk data is temporarily unavailable.')}</p>
        </div>
      </aside>
      <section class="hh-card hh-col-12">
        <div class="hh-stack">
          <div class="hh-page-kicker">7-day outlook</div>
          ${daily.length ? `
            <div class="hh-photo-grid">
              ${daily.map((day) => `
                <div class="hh-metric">
                  <p class="hh-metric-label">${escapeHtml(formatDate(day.date, { weekday: 'short' }))}</p>
                  <p class="hh-metric-value">${escapeHtml(day.icon || '·')} ${displayValue(day.high, '°')}</p>
                  <p class="hh-row-copy">${displayValue(day.low, '° low')} · ${displayValue(day.precipitationChance, '% precip')}</p>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="hh-state">
              <p class="hh-state-title">Daily forecast unavailable</p>
              <p class="hh-state-copy">HomeHub could not build the seven-day outlook from the current payload.</p>
            </div>
          `}
        </div>
      </section>
    </div>
  `;
}

```

### MODIFIED `public/assets/domains/environment/alertsView.js`

```js
import { asArray, escapeHtml, formatDateTime } from '../../core/format.js';

function bannerClass(level) {
  if (level >= 5) return 'hh-banner-danger';
  if (level >= 3) return 'hh-banner-warning';
  return 'hh-banner-info';
}

function renderAlertList(alerts, emptyTitle, emptyCopy) {
  if (!alerts.length) {
    return `
      <div class="hh-state">
        <p class="hh-state-title">${escapeHtml(emptyTitle)}</p>
        <p class="hh-state-copy">${escapeHtml(emptyCopy)}</p>
      </div>
    `;
  }
  return `
    <div class="hh-list">
      ${alerts.map((alert) => `
        <article class="hh-list-row" style="align-items:flex-start;">
          <div class="hh-row-meta" style="max-width:100%;">
            <div class="hh-pill-row">
              <span class="hh-badge hh-badge-${alert.severityLevel >= 5 ? 'danger' : alert.severityLevel >= 4 ? 'urgent' : alert.severityLevel >= 3 ? 'warning' : 'info'}">level ${escapeHtml(String(alert.severityLevel || 0))}</span>
              <span class="hh-badge hh-badge-neutral">${escapeHtml(alert.area || 'Area wide')}</span>
            </div>
            <div class="hh-row-title">${escapeHtml(alert.type || 'Weather alert')}</div>
            <div class="hh-row-copy">${escapeHtml(alert.summary || 'Weather alert details are temporarily unavailable.')}</div>
            ${asArray(alert.impacts).length ? `<div class="hh-row-copy">Impact: ${escapeHtml(asArray(alert.impacts).join(' · '))}</div>` : ''}
            ${asArray(alert.actions).length ? `<div class="hh-row-copy">Action: ${escapeHtml(asArray(alert.actions).join(' · '))}</div>` : ''}
          </div>
          <div class="hh-row-copy">${escapeHtml(alert.endsAt ? `Until ${formatDateTime(alert.endsAt, { hour: 'numeric', minute: '2-digit' })}` : 'Ongoing')}</div>
        </article>
      `).join('')}
    </div>
  `;
}

export function renderAlertsView(payload) {
  const activeAlerts = asArray(payload.detail?.alerts?.active);
  const recentlyEnded = asArray(payload.detail?.alerts?.recentlyEnded);
  const top = activeAlerts[0] || null;
  const warnings = asArray(payload.meta?.warnings);

  return `
    <div class="hh-grid">
      <section class="hh-card hh-card-hero hh-col-12">
        <div class="hh-stack">
          <div class="hh-pill-row">
            <span class="hh-badge hh-badge-${payload.summary?.status === 'danger' ? 'danger' : payload.summary?.status === 'urgent' ? 'urgent' : payload.summary?.status === 'warning' ? 'warning' : 'success'}">${escapeHtml(top ? top.type : payload.summary?.headline || 'All clear')}</span>
            <span class="hh-badge hh-badge-neutral">${escapeHtml(String(activeAlerts.length))} active</span>
          </div>
          <div>
            <h2 class="hh-page-title" style="font-size:clamp(2rem,4vw,3rem);">${escapeHtml(top ? top.headline : payload.summary?.headline || 'No active alerts')}</h2>
            <p class="hh-page-subtitle">${escapeHtml(top ? top.summary : payload.summary?.risk?.summary || 'No hazardous weather alerts are active right now.')}</p>
          </div>
          ${top ? `
            <div class="hh-banner ${bannerClass(top.severityLevel)}" style="margin:0;">
              <div class="hh-banner-copy">
                <p class="hh-banner-title">Action guidance</p>
                <p class="hh-banner-subtitle">${escapeHtml((asArray(top.actions)[0]) || 'Stay aware and monitor updates.')}</p>
              </div>
            </div>
          ` : payload.meta?.degraded ? `
            <div class="hh-banner hh-banner-offline" style="margin:0;">
              <div class="hh-banner-copy">
                <p class="hh-banner-title">Alerts data is degraded</p>
                <p class="hh-banner-subtitle">${escapeHtml(warnings[0] || 'HomeHub is showing the best available alert summary.')}</p>
              </div>
            </div>
          ` : ''}
        </div>
      </section>
      <section class="hh-card hh-col-8">
        <div class="hh-stack">
          <div class="hh-page-kicker">Active alerts</div>
          ${renderAlertList(activeAlerts, 'No active alerts', 'HomeHub will keep monitoring for threats.')}
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">Threat summary</div>
          <div class="hh-kv">
            <div class="hh-kv-row"><span>Risk level</span><strong>${escapeHtml(String(payload.summary?.risk?.level ?? 0))} / 5</strong></div>
            <div class="hh-kv-row"><span>Headline</span><strong>${escapeHtml(payload.summary?.risk?.headline || 'No active threat')}</strong></div>
            <div class="hh-kv-row"><span>Window</span><strong>${escapeHtml(payload.summary?.risk?.timeWindow || 'No active deadline')}</strong></div>
          </div>
          <p class="hh-row-copy" style="margin:0;">${escapeHtml(payload.summary?.risk?.summary || 'Threat details are temporarily unavailable.')}</p>
        </div>
      </aside>
      <section class="hh-card hh-col-12">
        <div class="hh-stack">
          <div class="hh-page-kicker">Recently ended</div>
          ${renderAlertList(recentlyEnded, 'No recently ended alerts', 'Expired alerts remain visible here for two hours.')}
        </div>
      </section>
    </div>
  `;
}

```

### MODIFIED `public/assets/domains/household/index.js`

```js
import { apiFetch } from '../../core/api.js';
import { asArray, asNumber, asObject, bindRouteButtons, escapeHtml, formatDateTime } from '../../core/format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';

const TAB_KEY = 'hh_household_tab';

function readStoredTab() {
  try {
    return sessionStorage.getItem(TAB_KEY) || 'chores';
  } catch {
    return 'chores';
  }
}

function writeStoredTab(tab) {
  try {
    sessionStorage.setItem(TAB_KEY, tab);
  } catch {
    // Ignore sessionStorage failures.
  }
}

function getFallbackPayload(errorMessage = '') {
  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      degraded: Boolean(errorMessage),
      warnings: errorMessage ? [errorMessage] : [],
    },
    summary: {
      status: 'info',
      headline: 'Household data unavailable',
      supportingText: errorMessage || 'HomeHub is showing the best available household state.',
      chores: {
        dueToday: 0,
        completedToday: 0,
        overdueCount: 0,
        progressPercent: 0,
      },
      treats: {
        petName: 'Pet',
        statusLevel: 'unknown',
        treatsRemaining: 0,
      },
    },
    detail: {
      chores: {
        degraded: Boolean(errorMessage),
        warning: errorMessage || null,
        nextResetAt: null,
        overdue: [],
        dueToday: [],
        completedToday: [],
        upcoming: [],
      },
      treats: {
        degraded: Boolean(errorMessage),
        warning: errorMessage || null,
        petName: 'Pet',
        statusLevel: 'unknown',
        treatsRemaining: 0,
        treatsGivenToday: 0,
        dailyLimitTreats: 0,
        history: [],
        lastTreat: null,
        resetsAt: null,
      },
    },
  };
}

function normalizeHouseholdPayload(payload, errorMessage = '') {
  const fallback = getFallbackPayload(errorMessage);
  const meta = asObject(payload?.meta);
  const summary = asObject(payload?.summary);
  const detail = asObject(payload?.detail);
  const chores = asObject(detail.chores);
  const treats = asObject(detail.treats);
  return {
    meta: {
      ...fallback.meta,
      ...meta,
      warnings: asArray(meta.warnings),
    },
    summary: {
      ...fallback.summary,
      ...summary,
      chores: {
        ...fallback.summary.chores,
        ...asObject(summary.chores),
      },
      treats: {
        ...fallback.summary.treats,
        ...asObject(summary.treats),
      },
    },
    detail: {
      chores: {
        ...fallback.detail.chores,
        ...chores,
        overdue: asArray(chores.overdue),
        dueToday: asArray(chores.dueToday),
        completedToday: asArray(chores.completedToday),
        upcoming: asArray(chores.upcoming),
      },
      treats: {
        ...fallback.detail.treats,
        ...treats,
        history: asArray(treats.history),
        lastTreat: treats.lastTreat && typeof treats.lastTreat === 'object' ? treats.lastTreat : null,
      },
    },
  };
}

function renderWarningBanner(message) {
  if (!message) return '';
  return `
    <div class="hh-banner hh-banner-offline" style="margin-bottom:1rem;">
      <div class="hh-banner-copy">
        <p class="hh-banner-title">Section degraded</p>
        <p class="hh-banner-subtitle">${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

function renderChoreRows(items, actionLabel, complete) {
  const safeItems = asArray(items);
  if (!safeItems.length) {
    return `
      <div class="hh-state">
        <p class="hh-state-title">Nothing here</p>
        <p class="hh-state-copy">This list is empty right now.</p>
      </div>
    `;
  }
  return `
    <div class="hh-list">
      ${safeItems.map((item) => `
        <div class="hh-list-row">
          <div class="hh-row-meta">
            <div class="hh-row-title">${escapeHtml(item.title || 'Untitled chore')}</div>
            <div class="hh-row-copy">${escapeHtml(item.badge || '')}${item.assignee ? ` · ${escapeHtml(item.assignee)}` : ''}</div>
          </div>
          <div class="hh-inline-actions">
            <button class="hh-btn hh-btn-secondary" data-action="toggle-chore" data-id="${escapeHtml(item.id)}" data-complete="${complete ? '1' : '0'}">${escapeHtml(actionLabel)}</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTreatHistory(items) {
  const safeItems = asArray(items);
  if (!safeItems.length) {
    return `
      <div class="hh-state">
        <p class="hh-state-title">No treats logged today</p>
        <p class="hh-state-copy">Use the quick-add form when your pet gets a treat.</p>
      </div>
    `;
  }
  return `
    <div class="hh-list">
      ${safeItems.map((item) => `
        <div class="hh-list-row">
          <div class="hh-row-meta">
            <div class="hh-row-title">${escapeHtml(item.note || 'Treat')}</div>
            <div class="hh-row-copy">${escapeHtml(formatDateTime(item.at, { hour: 'numeric', minute: '2-digit' }))} · ${escapeHtml(item.by || 'Family')}</div>
          </div>
          <div class="hh-row-copy">${escapeHtml(String(item.calories || 0))} cal</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTabs(activeTab) {
  return `
    <div class="hh-pill-row" style="margin-bottom:1rem;">
      <button class="hh-tab-pill ${activeTab === 'chores' ? 'is-active' : ''}" data-tab="chores">Chores</button>
      <button class="hh-tab-pill ${activeTab === 'treats' ? 'is-active' : ''}" data-tab="treats">Treat Tracker</button>
    </div>
  `;
}

function renderChoresTab(payload) {
  const chores = payload.detail.chores;
  return `
    ${renderWarningBanner(chores.warning || (chores.degraded ? 'Chore data is temporarily unavailable.' : ''))}
    <div class="hh-grid">
      <section class="hh-card hh-card-hero hh-col-12">
        <div class="hh-stack">
          <div class="hh-pill-row">
            <span class="hh-badge hh-badge-${payload.summary.status === 'warning' ? 'warning' : payload.summary.status === 'info' ? 'info' : 'success'}">${escapeHtml(payload.summary.headline || 'Chores')}</span>
            <span class="hh-badge hh-badge-neutral">${escapeHtml(String(payload.summary.chores.progressPercent || 0))}% complete</span>
          </div>
          <p class="hh-page-subtitle" style="margin:0;">${escapeHtml(payload.summary.supportingText || '')}</p>
        </div>
      </section>
      <section class="hh-card hh-col-8">
        <div class="hh-stack">
          <div class="hh-page-kicker">Due now</div>
          ${renderChoreRows(chores.overdue, 'Mark done', true)}
          ${renderChoreRows(chores.dueToday, 'Mark done', true)}
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">Household progress</div>
          <div class="hh-kv">
            <div class="hh-kv-row"><span>Due today</span><strong>${escapeHtml(String(payload.summary.chores.dueToday || 0))}</strong></div>
            <div class="hh-kv-row"><span>Completed</span><strong>${escapeHtml(String(payload.summary.chores.completedToday || 0))}</strong></div>
            <div class="hh-kv-row"><span>Overdue</span><strong>${escapeHtml(String(payload.summary.chores.overdueCount || 0))}</strong></div>
            <div class="hh-kv-row"><span>Resets</span><strong>${escapeHtml(formatDateTime(chores.nextResetAt, { hour: 'numeric', minute: '2-digit' }))}</strong></div>
          </div>
          <form id="hh-create-chore" class="hh-stack">
            <div class="hh-field">
              <label class="hh-field-label" for="hh-chore-title">New chore</label>
              <input id="hh-chore-title" class="hh-input" name="title" placeholder="Unload dishwasher" required>
            </div>
            <div class="hh-field">
              <label class="hh-field-label" for="hh-chore-category">Category</label>
              <select id="hh-chore-category" class="hh-select" name="category">
                <option value="Daily">Daily</option>
                <option value="Monday">Monday</option>
                <option value="Tuesday">Tuesday</option>
                <option value="Wednesday">Wednesday</option>
                <option value="Thursday">Thursday</option>
                <option value="Friday">Friday</option>
                <option value="Saturday">Saturday</option>
                <option value="Sunday">Sunday</option>
              </select>
            </div>
            <button class="hh-btn hh-btn-primary" type="submit">Add chore</button>
          </form>
        </div>
      </aside>
      <section class="hh-card hh-col-12">
        <div class="hh-stack">
          <div class="hh-page-kicker">Completed and upcoming</div>
          ${renderChoreRows(chores.completedToday, 'Undo', false)}
          ${renderChoreRows(chores.upcoming, 'Delete', false).replace(/data-action="toggle-chore"/g, 'data-action="delete-chore"')}
        </div>
      </section>
    </div>
  `;
}

function renderTreatsTab(payload) {
  const treats = payload.detail.treats;
  const statusClass = treats.statusLevel === 'at' ? 'warning' : treats.statusLevel === 'near' ? 'info' : 'success';
  return `
    ${renderWarningBanner(treats.warning || (treats.degraded ? 'Treat tracker data is temporarily unavailable.' : ''))}
    <div class="hh-grid">
      <section class="hh-card hh-card-hero hh-col-12">
        <div class="hh-stack">
          <div class="hh-pill-row">
            <span class="hh-badge hh-badge-${statusClass}">${escapeHtml(treats.petName || 'Pet')}</span>
            <span class="hh-badge hh-badge-neutral">${escapeHtml(String(treats.treatsRemaining || 0))} left today</span>
          </div>
          <div class="hh-metric-grid">
            <div class="hh-metric">
              <p class="hh-metric-label">Given today</p>
              <p class="hh-metric-value">${escapeHtml(String(treats.treatsGivenToday || 0))}</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Remaining</p>
              <p class="hh-metric-value">${escapeHtml(String(treats.treatsRemaining || 0))}</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Limit</p>
              <p class="hh-metric-value">${escapeHtml(String(treats.dailyLimitTreats || 0))}</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Resets</p>
              <p class="hh-metric-value">${escapeHtml(formatDateTime(treats.resetsAt, { hour: 'numeric', minute: '2-digit' }))}</p>
            </div>
          </div>
        </div>
      </section>
      <section class="hh-card hh-col-8">
        <div class="hh-stack">
          <div class="hh-page-kicker">Today’s treat log</div>
          ${renderTreatHistory(treats.history)}
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">Quick add</div>
          <div class="hh-kv">
            <div class="hh-kv-row"><span>Status</span><strong>${escapeHtml(treats.statusLevel || 'unknown')}</strong></div>
            <div class="hh-kv-row"><span>Last treat</span><strong>${escapeHtml(treats.lastTreat ? formatDateTime(treats.lastTreat.at, { hour: 'numeric', minute: '2-digit' }) : 'None yet')}</strong></div>
          </div>
          <form id="hh-log-treat" class="hh-stack">
            <div class="hh-field">
              <label class="hh-field-label" for="hh-treat-name">Treat name</label>
              <input id="hh-treat-name" class="hh-input" name="name" value="Treat" required>
            </div>
            <div class="hh-field">
              <label class="hh-field-label" for="hh-treat-calories">Calories</label>
              <input id="hh-treat-calories" class="hh-input" name="calories" type="number" min="0" step="1" value="0">
            </div>
            <button class="hh-btn hh-btn-primary" type="submit">${asNumber(treats.treatsRemaining, 0) <= 0 ? 'Log override treat' : 'Log treat'}</button>
          </form>
        </div>
      </aside>
    </div>
  `;
}

async function runMutation(requestFactory, successMessage, reload) {
  try {
    await requestFactory();
    pushToast(successMessage);
    await reload({ showLoading: false });
  } catch (error) {
    pushToast(error.message || 'Action failed.');
  }
}

export async function renderHouseholdPage(container) {
  let disposed = false;
  let pollId = null;
  let loadVersion = 0;
  let activeTab = readStoredTab();

  async function load({ showLoading = true } = {}) {
    const currentLoad = ++loadVersion;
    if (showLoading && !disposed) {
      container.innerHTML = loadingState('Loading household…');
    }

    let payload;
    try {
      payload = normalizeHouseholdPayload(await apiFetch('/api/household'));
    } catch (error) {
      payload = normalizeHouseholdPayload(null, error.message);
    }

    if (disposed || currentLoad !== loadVersion) return;

    container.innerHTML = `
      ${pageHeader({
        kicker: 'Household',
        title: activeTab === 'treats' ? 'Treat Tracker' : 'Chores',
        subtitle: `Updated ${formatDateTime(payload.meta.fetchedAt)}`,
        actions: '<button id="hh-household-refresh" class="hh-btn hh-btn-secondary">Refresh</button>',
      })}
      ${payload.meta.degraded ? renderWarningBanner(payload.meta.warnings?.[0] || 'Some household data is degraded.') : ''}
      ${renderTabs(activeTab)}
      ${activeTab === 'treats' ? renderTreatsTab(payload) : renderChoresTab(payload)}
    `;

    bindRouteButtons(container);
    container.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.tab || 'chores';
        writeStoredTab(activeTab);
        load({ showLoading: false }).catch(() => {});
      });
    });
    container.querySelector('#hh-household-refresh')?.addEventListener('click', async () => {
      pushToast('Refreshing household…');
      await load({ showLoading: false });
    });
    container.querySelectorAll('[data-action="toggle-chore"]').forEach((button) => {
      button.addEventListener('click', async () => {
        await runMutation(() => apiFetch('/api/household', {
          method: 'POST',
          body: {
            action: 'toggle_chore',
            id: button.dataset.id,
            complete: button.dataset.complete === '1',
          },
        }), 'Chore updated.', load);
      });
    });
    container.querySelectorAll('[data-action="delete-chore"]').forEach((button) => {
      button.addEventListener('click', async () => {
        await runMutation(() => apiFetch('/api/household', {
          method: 'POST',
          body: {
            action: 'delete_chore',
            id: button.dataset.id,
          },
        }), 'Chore removed.', load);
      });
    });
    container.querySelector('#hh-create-chore')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      await runMutation(() => apiFetch('/api/household', {
        method: 'POST',
        body: {
          action: 'create_chore',
          title: formData.get('title'),
          category: formData.get('category'),
        },
      }), 'Chore added.', load);
    });
    container.querySelector('#hh-log-treat')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      await runMutation(() => apiFetch('/api/household', {
        method: 'POST',
        body: {
          action: 'log_treat',
          name: formData.get('name'),
          calories: Number(formData.get('calories') || 0),
        },
      }), 'Treat logged.', load);
    });
  }

  await load();
  pollId = window.setInterval(() => {
    load({ showLoading: false }).catch(() => {});
  }, 60000);
  return () => {
    disposed = true;
    loadVersion += 1;
    window.clearInterval(pollId);
  };
}

```

### MODIFIED `public/assets/domains/media/index.js`

```js
import { apiFetch } from '../../core/api.js';
import { asArray, asObject, escapeHtml, formatDateTime } from '../../core/format.js';
import { setMediaState, store } from '../../core/store.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';
import { renderMediaHero } from './hero.js';
import { renderMusicTab } from './musicTab.js';
import { renderRadioTab } from './radioTab.js';

const TAB_KEY = 'hh_media_tab';
const radioAudio = new Audio();
radioAudio.preload = 'none';

let listenersBound = false;

function readStoredTab() {
  try {
    return sessionStorage.getItem(TAB_KEY) || 'music';
  } catch {
    return 'music';
  }
}

function writeStoredTab(tab) {
  try {
    sessionStorage.setItem(TAB_KEY, tab);
  } catch {
    // Ignore sessionStorage failures.
  }
}

function getDefaultNowPlaying() {
  return {
    state: 'idle',
    sourceType: null,
    title: null,
    subtitle: null,
    startedAt: null,
  };
}

function getFallbackPayload(errorMessage = '') {
  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      degraded: Boolean(errorMessage),
      warnings: errorMessage ? [errorMessage] : [],
    },
    summary: {
      status: 'normal',
      headline: errorMessage ? 'Media is running in degraded mode' : 'Nothing playing right now',
      supportingText: errorMessage || 'Open Media to start music or radio.',
      nowPlaying: getDefaultNowPlaying(),
    },
    detail: {
      nowPlaying: getDefaultNowPlaying(),
      radioPresets: [],
      musicContext: {
        spotifyEmbedUrl: '',
      },
    },
  };
}

function normalizeMediaPayload(payload, errorMessage = '') {
  const fallback = getFallbackPayload(errorMessage);
  const meta = asObject(payload?.meta);
  const summary = asObject(payload?.summary);
  const detail = asObject(payload?.detail);
  const nowPlaying = {
    ...getDefaultNowPlaying(),
    ...asObject(detail.nowPlaying),
    ...asObject(summary.nowPlaying),
  };
  return {
    meta: {
      ...fallback.meta,
      ...meta,
      warnings: asArray(meta.warnings),
    },
    summary: {
      ...fallback.summary,
      ...summary,
      nowPlaying,
    },
    detail: {
      ...fallback.detail,
      ...detail,
      nowPlaying,
      radioPresets: asArray(detail.radioPresets),
      musicContext: {
        ...fallback.detail.musicContext,
        ...asObject(detail.musicContext),
      },
    },
  };
}

function setNowPlaying(next) {
  setMediaState({ nowPlaying: next });
}

function ensureAudioBindings() {
  if (listenersBound) return;
  listenersBound = true;
  radioAudio.addEventListener('waiting', () => {
    setNowPlaying({
      ...(store.mediaState?.nowPlaying || {}),
      state: 'buffering',
    });
  });
  radioAudio.addEventListener('play', () => {
    setNowPlaying({
      ...(store.mediaState?.nowPlaying || {}),
      state: 'playing',
    });
  });
  radioAudio.addEventListener('pause', () => {
    if (radioAudio.currentTime === 0 || radioAudio.ended) return;
    setNowPlaying({
      ...(store.mediaState?.nowPlaying || {}),
      state: 'paused',
    });
  });
  radioAudio.addEventListener('ended', () => {
    setNowPlaying(getDefaultNowPlaying());
  });
  radioAudio.addEventListener('error', () => {
    pushToast('Radio playback failed. Try another preset.');
    setNowPlaying({
      ...(store.mediaState?.nowPlaying || {}),
      state: 'error',
    });
  });
}

async function postMediaAction(body) {
  const response = await apiFetch('/api/media', {
    method: 'POST',
    body,
  });
  if (response?.anticipatedState) {
    setNowPlaying({
      ...getDefaultNowPlaying(),
      ...response.anticipatedState,
    });
  }
}

export async function renderMediaPage(container) {
  ensureAudioBindings();
  let disposed = false;
  let pollId = null;
  let loadVersion = 0;
  let activeTab = readStoredTab();

  function schedulePoll(nowPlaying) {
    window.clearInterval(pollId);
    const isActive = nowPlaying?.state === 'playing' || nowPlaying?.state === 'buffering';
    pollId = window.setInterval(() => {
      load({ showLoading: false }).catch(() => {});
    }, isActive ? 15000 : 45000);
  }

  async function load({ showLoading = true } = {}) {
    const currentLoad = ++loadVersion;
    if (showLoading && !disposed) {
      container.innerHTML = loadingState('Loading media…');
    }

    let payload;
    try {
      payload = normalizeMediaPayload(await apiFetch('/api/media'));
    } catch (error) {
      payload = normalizeMediaPayload(null, error.message);
    }

    const nowPlaying = {
      ...getDefaultNowPlaying(),
      ...asObject(store.mediaState?.nowPlaying),
      ...asObject(payload.detail.nowPlaying),
    };
    payload.summary.nowPlaying = nowPlaying;
    payload.detail.nowPlaying = nowPlaying;

    if (disposed || currentLoad !== loadVersion) return;

    container.innerHTML = `
      ${pageHeader({
        kicker: 'Media',
        title: 'Music & Radio',
        subtitle: `Updated ${formatDateTime(payload.meta.fetchedAt)}`,
        actions: '<button id="hh-media-refresh" class="hh-btn hh-btn-secondary">Refresh</button>',
      })}
      ${payload.meta.degraded ? `
        <div class="hh-banner hh-banner-offline" style="margin-bottom:1rem;">
          <div class="hh-banner-copy">
            <p class="hh-banner-title">Media is degraded</p>
            <p class="hh-banner-subtitle">${escapeHtml(payload.meta.warnings?.[0] || 'HomeHub is showing the best available media state.')}</p>
          </div>
        </div>
      ` : ''}
      <div class="hh-pill-row" style="margin-bottom:1rem;">
        <button class="hh-tab-pill ${activeTab === 'music' ? 'is-active' : ''}" data-tab="music">Music</button>
        <button class="hh-tab-pill ${activeTab === 'radio' ? 'is-active' : ''}" data-tab="radio">Radio</button>
      </div>
      ${renderMediaHero({ ...payload.summary, nowPlaying })}
      ${activeTab === 'radio' ? renderRadioTab(payload.detail, nowPlaying) : renderMusicTab(payload.detail, nowPlaying)}
    `;

    container.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.tab || 'music';
        writeStoredTab(activeTab);
        load({ showLoading: false }).catch(() => {});
      });
    });
    container.querySelector('#hh-media-refresh')?.addEventListener('click', async () => {
      pushToast('Refreshing media…');
      await load({ showLoading: false });
    });
    container.querySelector('[data-media-action="music-active"]')?.addEventListener('click', async () => {
      try {
        await postMediaAction({
          action: 'play',
          title: 'Spotify session',
        });
        setNowPlaying({
          state: 'playing',
          sourceType: 'music',
          title: 'Spotify session',
          subtitle: 'Use embedded controls',
          startedAt: new Date().toISOString(),
        });
        pushToast('Marked music as active.');
        await load({ showLoading: false });
      } catch (error) {
        pushToast(error.message || 'Could not update media state.');
      }
    });
    container.querySelectorAll('[data-media-action="pause"]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          if (store.mediaState?.nowPlaying?.sourceType === 'radio') radioAudio.pause();
          await postMediaAction({ action: 'pause' });
          pushToast('Media paused.');
          await load({ showLoading: false });
        } catch (error) {
          pushToast(error.message || 'Could not pause media.');
        }
      });
    });
    container.querySelectorAll('[data-media-action="stop"]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          radioAudio.pause();
          radioAudio.src = '';
          await postMediaAction({ action: 'stop' });
          setNowPlaying(getDefaultNowPlaying());
          pushToast('Media cleared.');
          await load({ showLoading: false });
        } catch (error) {
          pushToast(error.message || 'Could not clear media.');
        }
      });
    });
    container.querySelectorAll('[data-radio-play]').forEach((button) => {
      button.addEventListener('click', async () => {
        const station = asArray(payload.detail.radioPresets).find((entry) => entry.id === button.dataset.radioPlay);
        if (!station?.streamUrl) return;
        try {
          radioAudio.src = station.streamUrl;
          setNowPlaying({
            state: 'buffering',
            sourceType: 'radio',
            title: station.name,
            subtitle: 'Live radio',
            startedAt: new Date().toISOString(),
          });
          await postMediaAction({
            action: 'play',
            stationId: station.id,
            title: station.name,
          });
          await radioAudio.play();
          pushToast(`Playing ${station.name}`);
          await load({ showLoading: false });
        } catch (error) {
          pushToast(error.message || `Could not play ${station.name}`);
        }
      });
    });

    schedulePoll(nowPlaying);
  }

  await load();
  return () => {
    disposed = true;
    loadVersion += 1;
    window.clearInterval(pollId);
  };
}

```

### MODIFIED `public/assets/domains/media/hero.js`

```js
import { escapeHtml, formatDateTime } from '../../core/format.js';

export function renderMediaHero(summary = {}) {
  const nowPlaying = summary.nowPlaying || {};
  return `
    <section class="hh-card hh-card-hero hh-col-12">
      <div class="hh-stack">
        <div class="hh-pill-row">
          <span class="hh-badge hh-badge-${summary.status === 'success' ? 'success' : summary.status === 'warning' ? 'warning' : 'neutral'}">${escapeHtml(nowPlaying.sourceType || 'idle')}</span>
          <span class="hh-badge hh-badge-neutral">${escapeHtml(nowPlaying.state || 'idle')}</span>
        </div>
        <div>
          <div class="hh-row-title" style="font-size:2rem;">${escapeHtml(summary.headline || 'Nothing playing right now')}</div>
          <p class="hh-row-copy" style="margin:.6rem 0 0;">${escapeHtml(summary.supportingText || 'Open Media to start music or radio.')}</p>
        </div>
        <div class="hh-kv">
          <div class="hh-kv-row"><span>Started</span><strong>${escapeHtml(nowPlaying.startedAt ? formatDateTime(nowPlaying.startedAt, { hour: 'numeric', minute: '2-digit' }) : 'Not active')}</strong></div>
        </div>
      </div>
    </section>
  `;
}

```

### MODIFIED `public/assets/domains/media/musicTab.js`

```js
import { escapeHtml } from '../../core/format.js';

export function renderMusicTab(detail = {}, nowPlaying = {}) {
  const spotifyEmbedUrl = detail.musicContext?.spotifyEmbedUrl || '';
  return `
    <div class="hh-grid">
      <section class="hh-card hh-col-8">
        <div class="hh-stack">
          <div class="hh-page-kicker">Music</div>
          <p class="hh-row-copy" style="margin:0;">Use the embedded player for streaming music. HomeHub keeps a shared now-playing state so dashboard and standby summaries stay in sync.</p>
          ${spotifyEmbedUrl ? `
            <iframe
              class="hh-embed"
              src="${escapeHtml(spotifyEmbedUrl)}"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              title="Spotify embed"
            ></iframe>
          ` : `
            <div class="hh-state">
              <p class="hh-state-title">Music embed unavailable</p>
              <p class="hh-state-copy">Add a Spotify embed URL in server config to restore the shared music view.</p>
            </div>
          `}
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">State sync</div>
          <p class="hh-row-copy" style="margin:0;">Because the current music provider is browser-owned, mark the shared state when you start or stop listening so HomeHub can summarize it correctly.</p>
          <div class="hh-inline-actions">
            <button class="hh-btn hh-btn-primary" data-media-action="music-active">Mark music active</button>
            <button class="hh-btn hh-btn-secondary" data-media-action="stop">Clear now playing</button>
          </div>
          <div class="hh-kv">
            <div class="hh-kv-row"><span>Current source</span><strong>${escapeHtml(nowPlaying.sourceType || 'idle')}</strong></div>
            <div class="hh-kv-row"><span>State</span><strong>${escapeHtml(nowPlaying.state || 'idle')}</strong></div>
          </div>
        </div>
      </aside>
    </div>
  `;
}

```

### MODIFIED `public/assets/domains/media/radioTab.js`

```js
import { asArray, escapeHtml } from '../../core/format.js';

export function renderRadioTab(detail = {}, nowPlaying = {}) {
  const presets = asArray(detail.radioPresets);
  return `
    <div class="hh-grid">
      <section class="hh-card hh-col-8">
        <div class="hh-stack">
          <div class="hh-page-kicker">Radio presets</div>
          ${presets.length ? `
            <div class="hh-list">
              ${presets.map((station) => `
                <div class="hh-list-row">
                  <div class="hh-row-meta">
                    <div class="hh-row-title">${escapeHtml(station.emoji || '📻')} ${escapeHtml(station.name || 'Station')}</div>
                    <div class="hh-row-copy">${escapeHtml(station.streamUrl || 'Stream URL unavailable')}</div>
                  </div>
                  <div class="hh-inline-actions">
                    <button class="hh-btn hh-btn-primary" data-radio-play="${escapeHtml(station.id)}">Play</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="hh-state">
              <p class="hh-state-title">No radio presets available</p>
              <p class="hh-state-copy">The Media page is still available, but HomeHub did not receive any preset stations.</p>
            </div>
          `}
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">Radio controls</div>
          <div class="hh-kv">
            <div class="hh-kv-row"><span>Source</span><strong>${escapeHtml(nowPlaying.sourceType || 'idle')}</strong></div>
            <div class="hh-kv-row"><span>Status</span><strong>${escapeHtml(nowPlaying.state || 'idle')}</strong></div>
            <div class="hh-kv-row"><span>Title</span><strong>${escapeHtml(nowPlaying.title || 'Nothing playing')}</strong></div>
          </div>
          <div class="hh-inline-actions">
            <button class="hh-btn hh-btn-secondary" data-media-action="pause">Pause</button>
            <button class="hh-btn hh-btn-secondary" data-media-action="stop">Stop</button>
          </div>
        </div>
      </aside>
    </div>
  `;
}

```

### MODIFIED `public/assets/domains/photos/index.js`

```js
import { apiFetch } from '../../core/api.js';
import { asArray, asObject, bindRouteButtons, escapeHtml, formatDateTime } from '../../core/format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';

function getFallbackPayload(errorMessage = '') {
  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      degraded: Boolean(errorMessage),
      warnings: errorMessage ? [errorMessage] : [],
    },
    summary: {
      headline: 'Photo queue unavailable',
    },
    detail: {
      source: 'local_fallback',
      fallbackInUse: true,
      currentPhoto: {
        id: 'fallback-1',
        url: '/fallback/photos/family-1.svg',
        credit: 'HomeHub fallback',
      },
      queue: [
        { id: 'fallback-1', url: '/fallback/photos/family-1.svg', credit: 'HomeHub fallback' },
        { id: 'fallback-2', url: '/fallback/photos/family-2.svg', credit: 'HomeHub fallback' },
        { id: 'fallback-3', url: '/fallback/photos/family-3.svg', credit: 'HomeHub fallback' },
      ],
    },
  };
}

function normalizePhotosPayload(payload, errorMessage = '') {
  const fallback = getFallbackPayload(errorMessage);
  const meta = asObject(payload?.meta);
  const summary = asObject(payload?.summary);
  const detail = asObject(payload?.detail);
  return {
    meta: {
      ...fallback.meta,
      ...meta,
      warnings: asArray(meta.warnings),
    },
    summary: {
      ...fallback.summary,
      ...summary,
    },
    detail: {
      ...fallback.detail,
      ...detail,
      currentPhoto: detail.currentPhoto && typeof detail.currentPhoto === 'object' ? detail.currentPhoto : fallback.detail.currentPhoto,
      queue: asArray(detail.queue).length ? asArray(detail.queue) : fallback.detail.queue,
    },
  };
}

function renderBanner(payload) {
  if (!payload.detail.fallbackInUse && !payload.meta.degraded && !payload.meta.isMock) return '';
  const message = payload.meta.warnings?.[0]
    || (payload.detail.fallbackInUse ? 'A fallback photo source is currently in use.' : 'Photos are partially degraded.');
  return `
    <div class="hh-banner ${payload.detail.fallbackInUse ? 'hh-banner-warning' : 'hh-banner-offline'}">
      <div class="hh-banner-copy">
        <p class="hh-banner-title">${escapeHtml(payload.summary.headline || 'Photo queue')}</p>
        <p class="hh-banner-subtitle">${escapeHtml(message)}</p>
      </div>
      <button class="hh-btn hh-btn-secondary" data-route="settings">Open Settings</button>
    </div>
  `;
}

export async function renderPhotosPage(container) {
  let disposed = false;
  let loadVersion = 0;

  async function load({ showLoading = true } = {}) {
    const currentLoad = ++loadVersion;
    if (showLoading && !disposed) {
      container.innerHTML = loadingState('Loading photos…');
    }

    let payload;
    try {
      payload = normalizePhotosPayload(await apiFetch('/api/photos'));
    } catch (error) {
      payload = normalizePhotosPayload(null, error.message);
    }

    if (disposed || currentLoad !== loadVersion) return;

    const queue = asArray(payload.detail.queue);
    container.innerHTML = `
      ${pageHeader({
        kicker: 'Photos',
        title: 'Household Photos',
        subtitle: `Updated ${formatDateTime(payload.meta.fetchedAt)}`,
        actions: '<button id="hh-photos-refresh" class="hh-btn hh-btn-secondary">Refresh</button>',
      })}
      ${renderBanner(payload)}
      <div class="hh-grid">
        <section class="hh-card hh-card-hero hh-col-12">
          <div class="hh-stack">
            <div class="hh-pill-row">
              <span class="hh-badge hh-badge-neutral">${escapeHtml(payload.detail.source || 'local_fallback')}</span>
              <span class="hh-badge hh-badge-${payload.detail.fallbackInUse ? 'warning' : 'success'}">${payload.detail.fallbackInUse ? 'fallback' : 'primary source'}</span>
            </div>
            ${payload.detail.currentPhoto ? `
              <div class="hh-photo-frame" style="aspect-ratio:16/8;">
                <img src="${escapeHtml(payload.detail.currentPhoto.url)}" alt="${escapeHtml(payload.detail.currentPhoto.credit || 'Current photo')}">
              </div>
              <div class="hh-row-copy">${escapeHtml(payload.detail.currentPhoto.credit || 'Current household photo')}</div>
            ` : `
              <div class="hh-state">
                <p class="hh-state-title">No photos available</p>
                <p class="hh-state-copy">Configure a photo source in Settings.</p>
              </div>
            `}
          </div>
        </section>
        <section class="hh-card hh-col-12">
          <div class="hh-stack">
            <div class="hh-page-kicker">Queue</div>
            ${queue.length ? `
              <div class="hh-photo-grid">
                ${queue.map((photo) => `
                  <div class="hh-photo-tile">
                    <div class="hh-photo-frame">
                      <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.credit || 'Household photo')}">
                    </div>
                    <div class="hh-row-copy">${escapeHtml(photo.credit || 'Household photo')}</div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="hh-state">
                <p class="hh-state-title">Queue unavailable</p>
                <p class="hh-state-copy">HomeHub could not load the photo queue from the current payload.</p>
              </div>
            `}
          </div>
        </section>
      </div>
    `;

    bindRouteButtons(container);
    container.querySelector('#hh-photos-refresh')?.addEventListener('click', async () => {
      pushToast('Refreshing photo queue…');
      await load({ showLoading: false });
    });
  }

  await load();
  return () => {
    disposed = true;
    loadVersion += 1;
  };
}

```

### MODIFIED `public/assets/domains/settings/index.js`

```js
import { apiFetch } from '../../core/api.js';
import { asArray, asObject, bindRouteButtons, escapeHtml, formatDateTime } from '../../core/format.js';
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
  };
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
      payload = normalizeSettingsPayload(null, error.message);
    }

    if (disposed || currentLoad !== loadVersion) return;

    const config = payload.config;
    const isAdmin = store.membership?.role === 'admin' || Boolean(getSessionValue('hh_admin_token'));
    const readOnly = payload.readOnly;

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

### MODIFIED `public/assets/domains/admin/index.js`

```js
import { apiFetch } from '../../core/api.js';
import { asArray, asObject, escapeHtml, formatDateTime } from '../../core/format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';

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

function renderAdminAccess(errorMessage = '') {
  return `
    <div class="hh-grid">
      <section class="hh-card hh-col-12">
        <div class="hh-stack">
          <div class="hh-page-kicker">Admin access</div>
          <div class="hh-row-title" style="font-size:1.4rem;">Protected operations require admin auth</div>
          <p class="hh-row-copy" style="margin:0;">Use an admin membership or enter the shared admin token for this browser session only.</p>
          ${errorMessage ? `<div class="hh-banner hh-banner-danger"><div class="hh-banner-copy"><p class="hh-banner-title">Access denied</p><p class="hh-banner-subtitle">${escapeHtml(errorMessage)}</p></div></div>` : ''}
          <form id="hh-admin-token-form" class="hh-inline-actions">
            <input class="hh-input" name="adminToken" placeholder="Admin token">
            <button class="hh-btn hh-btn-primary" type="submit">Save token</button>
            <button class="hh-btn hh-btn-secondary" type="button" id="hh-clear-admin-token">Clear token</button>
          </form>
        </div>
      </section>
    </div>
  `;
}

function getFallbackPayload(errorMessage = '') {
  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      degraded: Boolean(errorMessage),
      warnings: errorMessage ? [errorMessage] : [],
    },
    system: {},
    recentActions: [],
    availableActions: [],
    mockSupport: [],
  };
}

function normalizeAdminPayload(payload, errorMessage = '') {
  const fallback = getFallbackPayload(errorMessage);
  const meta = asObject(payload?.meta);
  return {
    meta: {
      ...fallback.meta,
      ...meta,
      warnings: asArray(meta.warnings),
    },
    system: asObject(payload?.system),
    recentActions: asArray(payload?.recentActions),
    availableActions: asArray(payload?.availableActions),
    mockSupport: asArray(payload?.mockSupport),
  };
}

export async function renderAdminPage(container) {
  let disposed = false;
  let loadVersion = 0;

  async function load(errorMessage = '', { showLoading = true } = {}) {
    const currentLoad = ++loadVersion;
    if (showLoading && !disposed) {
      container.innerHTML = loadingState('Loading admin…');
    }

    let payload;
    try {
      payload = normalizeAdminPayload(await apiFetch('/api/admin'));
    } catch (error) {
      if (disposed || currentLoad !== loadVersion) return;
      if (error.status === 403) {
        container.innerHTML = `
          ${pageHeader({ kicker: 'Admin', title: 'Control Panel', subtitle: 'Admin auth is required for diagnostics, mocks, and dangerous actions.' })}
          ${renderAdminAccess(error.message)}
        `;
        container.querySelector('#hh-admin-token-form')?.addEventListener('submit', (event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          setSessionValue('hh_admin_token', String(formData.get('adminToken') || '').trim());
          pushToast('Admin token saved for this session.');
          load('', { showLoading: false }).catch(() => {});
        });
        container.querySelector('#hh-clear-admin-token')?.addEventListener('click', () => {
          removeSessionValue('hh_admin_token');
          pushToast('Admin token cleared.');
          load('', { showLoading: false }).catch(() => {});
        });
        return;
      }
      payload = normalizeAdminPayload(null, error.message || errorMessage);
    }

    if (disposed || currentLoad !== loadVersion) return;

    container.innerHTML = `
      ${pageHeader({
        kicker: 'Admin',
        title: 'Control Panel',
        subtitle: `Updated ${formatDateTime(payload.meta.fetchedAt)}`,
        actions: '<button id="hh-admin-refresh" class="hh-btn hh-btn-secondary">Refresh</button>',
      })}
      ${payload.meta.degraded ? `
        <div class="hh-banner hh-banner-offline" style="margin-bottom:1rem;">
          <div class="hh-banner-copy">
            <p class="hh-banner-title">Diagnostics are degraded</p>
            <p class="hh-banner-subtitle">${escapeHtml(payload.meta.warnings?.[0] || 'HomeHub is showing the best available admin payload.')}</p>
          </div>
        </div>
      ` : ''}
      <div class="hh-grid">
        <section class="hh-card hh-col-8">
          <div class="hh-stack">
            <div class="hh-page-kicker">Domain health</div>
            <table class="hh-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(payload.system || {}).length ? Object.entries(payload.system || {}).map(([key, value]) => `
                  <tr>
                    <td>${escapeHtml(key)}</td>
                    <td><span class="hh-badge hh-badge-${value.status === 'healthy' ? 'success' : value.status === 'degraded' ? 'warning' : 'offline'}">${escapeHtml(value.status || value.healthStatus || 'unknown')}</span></td>
                    <td>${escapeHtml(value.errorState || asArray(value.warnings)[0] || JSON.stringify(value).slice(0, 90))}</td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="3">No diagnostics available.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </section>
        <aside class="hh-card hh-col-4">
          <div class="hh-stack">
            <div class="hh-page-kicker">Mocks</div>
            <div class="hh-inline-actions">
              ${payload.mockSupport.map((mock) => `<button class="hh-btn hh-btn-secondary" data-mock="${escapeHtml(mock)}">${escapeHtml(mock)}</button>`).join('')}
            </div>
            <button id="hh-clear-mock" class="hh-btn hh-btn-secondary">Clear mock</button>
            <div class="hh-kv">
              <div class="hh-kv-row"><span>Current mock</span><strong>${escapeHtml(getSessionValue('hh_mock') || 'none')}</strong></div>
            </div>
          </div>
        </aside>
        <section class="hh-card hh-col-6">
          <div class="hh-stack">
            <div class="hh-page-kicker">Actions</div>
            <div class="hh-inline-actions">
              ${payload.availableActions.map((action) => `<button class="hh-btn ${action.dangerous ? 'hh-btn-danger' : 'hh-btn-secondary'}" data-admin-action="${escapeHtml(action.action)}">${escapeHtml(action.action)}</button>`).join('')}
            </div>
          </div>
        </section>
        <section class="hh-card hh-col-6">
          <div class="hh-stack">
            <div class="hh-page-kicker">Recent actions</div>
            <div class="hh-list">
              ${payload.recentActions.length ? payload.recentActions.map((action) => `
                <div class="hh-list-row">
                  <div class="hh-row-meta">
                    <div class="hh-row-title">${escapeHtml(action.action || 'Admin action')}</div>
                    <div class="hh-row-copy">${escapeHtml(action.message || '')}</div>
                  </div>
                  <div class="hh-row-copy">${escapeHtml(formatDateTime(action.time, { hour: 'numeric', minute: '2-digit' }))}</div>
                </div>
              `).join('') : `
                <div class="hh-state">
                  <p class="hh-state-title">No recent admin actions</p>
                  <p class="hh-state-copy">Dangerous actions stay isolated here and are logged when they run.</p>
                </div>
              `}
            </div>
          </div>
        </section>
      </div>
    `;

    container.querySelector('#hh-admin-refresh')?.addEventListener('click', async () => {
      pushToast('Refreshing admin diagnostics…');
      await load('', { showLoading: false });
    });
    container.querySelectorAll('[data-mock]').forEach((button) => {
      button.addEventListener('click', async () => {
        setSessionValue('hh_mock', button.dataset.mock || '');
        pushToast(`Mock enabled: ${button.dataset.mock}`);
        await load('', { showLoading: false });
      });
    });
    container.querySelector('#hh-clear-mock')?.addEventListener('click', async () => {
      removeSessionValue('hh_mock');
      pushToast('Mock cleared.');
      await load('', { showLoading: false });
    });
    container.querySelectorAll('[data-admin-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const action = button.dataset.adminAction;
        try {
          const result = await apiFetch('/api/admin', {
            method: 'POST',
            body: { action },
          });
          pushToast(result?.message || `${action} complete`);
          await load('', { showLoading: false });
        } catch (error) {
          pushToast(error.message || `${action} failed`);
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

### MODIFIED `public/assets/domains/standby/index.js`

```js
import { apiFetch } from '../../core/api.js';
import { asArray, asObject, escapeHtml, formatDate } from '../../core/format.js';
import { go } from '../../core/router.js';
import { loadingState } from '../../ui/state.js';

function getFallbackPayload(errorMessage = '') {
  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      degraded: Boolean(errorMessage),
      warnings: errorMessage ? [errorMessage] : [],
    },
    urgentOverride: false,
    backgroundPhoto: {
      url: '/fallback/photos/family-1.svg',
      credit: 'HomeHub fallback',
    },
    primaryAlert: null,
    widgets: {
      agenda: {
        headline: 'Agenda unavailable',
        supportingText: 'Calendar data could not be loaded.',
      },
      household: {
        headline: 'Household unavailable',
        supportingText: 'Household data could not be loaded.',
      },
      weather: {
        headline: '--° ·',
        supportingText: 'Weather data unavailable.',
      },
      media: {
        headline: 'Nothing playing right now',
        supportingText: 'Open Media to start playback.',
      },
    },
  };
}

function normalizeStandbyPayload(payload, errorMessage = '') {
  const fallback = getFallbackPayload(errorMessage);
  const meta = asObject(payload?.meta);
  const widgets = asObject(payload?.widgets);
  return {
    ...fallback,
    ...asObject(payload),
    meta: {
      ...fallback.meta,
      ...meta,
      warnings: asArray(meta.warnings),
    },
    backgroundPhoto: payload?.backgroundPhoto && typeof payload.backgroundPhoto === 'object'
      ? payload.backgroundPhoto
      : fallback.backgroundPhoto,
    widgets: {
      agenda: {
        ...fallback.widgets.agenda,
        ...asObject(widgets.agenda),
      },
      household: {
        ...fallback.widgets.household,
        ...asObject(widgets.household),
      },
      weather: {
        ...fallback.widgets.weather,
        ...asObject(widgets.weather),
      },
      media: {
        ...fallback.widgets.media,
        ...asObject(widgets.media),
      },
    },
  };
}

function renderStandby(payload) {
  return `
    <section class="hh-standby-shell" id="hh-standby-shell">
      <img class="hh-standby-bg" src="${escapeHtml(payload.backgroundPhoto?.url || '/fallback/photos/family-1.svg')}" alt="${escapeHtml(payload.backgroundPhoto?.credit || 'Standby photo')}">
      <div class="hh-standby-overlay"></div>
      <button id="hh-standby-exit" class="hh-btn hh-btn-secondary hh-standby-exit">Exit</button>
      <div id="hh-standby-hud" class="hh-standby-hud">
        ${payload.urgentOverride && payload.primaryAlert ? `
          <div class="hh-banner hh-banner-danger">
            <div class="hh-banner-copy">
              <p class="hh-banner-title">${escapeHtml(payload.primaryAlert.type || 'Weather alert')}</p>
              <p class="hh-banner-subtitle">${escapeHtml(payload.primaryAlert.summary || 'Take action now.')}</p>
            </div>
          </div>
        ` : payload.meta?.degraded ? `
          <div class="hh-banner hh-banner-offline">
            <div class="hh-banner-copy">
              <p class="hh-banner-title">Standby is degraded</p>
              <p class="hh-banner-subtitle">${escapeHtml(payload.meta.warnings?.[0] || 'HomeHub is showing the best available standby payload.')}</p>
            </div>
          </div>
        ` : ''}
        <div>
          <div id="hh-standby-clock" class="hh-clock"></div>
          <p id="hh-standby-date" class="hh-page-subtitle" style="font-size:1rem;color:#d8e5f2;margin:.5rem 0 0;"></p>
        </div>
        <div class="hh-standby-widgets">
          ${Object.values(payload.widgets || {}).map((widget) => `
            <div class="hh-standby-widget">
              <div class="hh-row-title">${escapeHtml(widget.headline || '')}</div>
              <div class="hh-row-copy">${escapeHtml(widget.supportingText || '')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function updateClock() {
  const now = new Date();
  const clock = document.getElementById('hh-standby-clock');
  const date = document.getElementById('hh-standby-date');
  if (clock) {
    clock.textContent = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  if (date) {
    date.textContent = formatDate(now.toISOString(), { weekday: 'long', month: 'long', day: 'numeric' });
  }
}

function jitterHud() {
  const hud = document.getElementById('hh-standby-hud');
  if (!hud) return;
  const x = Math.floor(Math.random() * 9) - 4;
  const y = Math.floor(Math.random() * 7) - 3;
  hud.style.transform = `translate(${x}px, ${y}px)`;
}

export async function renderStandbyPage(container) {
  let disposed = false;
  let loadVersion = 0;
  let clockTimer = null;
  let pollTimer = null;
  let jitterTimer = null;

  async function load({ showLoading = true } = {}) {
    const currentLoad = ++loadVersion;
    if (showLoading && !disposed) {
      container.innerHTML = loadingState('Loading standby…');
    }

    let payload;
    try {
      payload = normalizeStandbyPayload(await apiFetch('/api/standby'));
    } catch (error) {
      payload = normalizeStandbyPayload(null, error.message);
    }

    if (disposed || currentLoad !== loadVersion) return;

    container.innerHTML = renderStandby(payload);
    updateClock();
    jitterHud();
    container.querySelector('#hh-standby-exit')?.addEventListener('click', () => go('home'));
  }

  function handleKey(event) {
    if (event.key === 'Escape') go('home');
  }

  await load();
  clockTimer = window.setInterval(updateClock, 1000);
  pollTimer = window.setInterval(() => {
    load({ showLoading: false }).catch(() => {});
  }, 60000);
  jitterTimer = window.setInterval(jitterHud, 60000);
  window.addEventListener('keydown', handleKey);
  return () => {
    disposed = true;
    loadVersion += 1;
    window.clearInterval(clockTimer);
    window.clearInterval(pollTimer);
    window.clearInterval(jitterTimer);
    window.removeEventListener('keydown', handleKey);
  };
}

```

### MODIFIED `lib/server/http.js`

```js
function normalizeWarnings(warnings = []) {
  return (Array.isArray(warnings) ? warnings : [])
    .map((warning) => String(warning || '').trim())
    .filter(Boolean);
}

export function createMeta({
  schemaVersion = 1,
  fetchedAt = new Date().toISOString(),
  stale = false,
  degraded = false,
  isMock = false,
  warnings = [],
} = {}) {
  return {
    schemaVersion,
    fetchedAt,
    stale: Boolean(stale),
    degraded: Boolean(degraded),
    isMock: Boolean(isMock),
    warnings: normalizeWarnings(warnings),
  };
}

async function readRawBody(req) {
  if (!req || typeof req.on !== 'function') return '';
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf8'));
    } catch {
      return {};
    }
  }

  const rawBody = await readRawBody(req);
  if (!rawBody) return {};

  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
}

function buildErrorObject(error, fallbackStatus = 500) {
  const nextStatusCode = Number(error?.statusCode || error?.status || fallbackStatus || 500);
  return {
    statusCode: Number.isFinite(nextStatusCode) ? nextStatusCode : 500,
    error: {
      message: error?.message || 'Unexpected error',
      code: error?.code || null,
      statusCode: Number.isFinite(nextStatusCode) ? nextStatusCode : 500,
      details: error?.details || null,
    },
  };
}

export function sendError(res, error, fallbackStatus = 500, payload = {}) {
  const { statusCode, error: errorBody } = buildErrorObject(error, fallbackStatus);
  const meta = createMeta({
    ...payload.meta,
    degraded: true,
    warnings: [errorBody.message, ...(payload.meta?.warnings || [])],
  });

  return res.status(statusCode).json({
    ...payload,
    meta,
    error: errorBody,
    message: errorBody.message,
  });
}

```

### MODIFIED `lib/server/auth.js`

```js
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
  const hasToken = Boolean(adminToken) && providedToken === adminToken;
  if (!hasRole && !hasToken) {
    const error = new Error('Admin access required');
    error.statusCode = 403;
    throw error;
  }
}

```

### MODIFIED `lib/server/domains/media/service.js`

```js
import { safeJsonParse } from '../../fetch.js';
import { createMeta } from '../../http.js';

function getDefaultNowPlaying() {
  return {
    state: 'idle',
    sourceType: null,
    title: null,
    subtitle: null,
    startedAt: null,
  };
}

function getRadioPresets(config) {
  return Array.isArray(config?.media?.radioPresets) ? config.media.radioPresets : [];
}

function getSpotifyEmbedUrl(config) {
  return typeof config?.media?.spotifyEmbedUrl === 'string' && config.media.spotifyEmbedUrl
    ? config.media.spotifyEmbedUrl
    : 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M';
}

export function getMediaPayload(config, req) {
  const headerState = safeJsonParse(req?.headers?.['x-homehub-media-state'], null);
  const nowPlaying = headerState?.nowPlaying && typeof headerState.nowPlaying === 'object'
    ? {
        ...getDefaultNowPlaying(),
        ...headerState.nowPlaying,
      }
    : getDefaultNowPlaying();

  return {
    meta: createMeta({
      warnings: headerState
        ? ['Media state is currently client-bridged until a persistent provider adapter is wired.']
        : [],
    }),
    summary: {
      status: nowPlaying.state === 'playing' ? 'success' : nowPlaying.state === 'buffering' ? 'warning' : 'normal',
      priority: 'normal',
      headline: nowPlaying.title || 'Nothing playing right now',
      supportingText: nowPlaying.subtitle || 'Open Media to start music or radio.',
      badges: [nowPlaying.sourceType || 'idle'],
      cta: { label: 'Open Media', route: '#/media' },
      updatedAt: new Date().toISOString(),
      nowPlaying,
    },
    detail: {
      nowPlaying,
      availableControls: {
        playPause: true,
        next: true,
        prev: true,
        volume: true,
      },
      radioPresets: getRadioPresets(config),
      musicContext: {
        spotifyEmbedUrl: getSpotifyEmbedUrl(config),
      },
    },
  };
}

export function mutateMedia(req) {
  const body = req.body || {};
  const action = body.action || 'play';
  const state = action === 'pause' ? 'paused' : action === 'stop' ? 'idle' : 'playing';

  return {
    meta: createMeta(),
    success: true,
    anticipatedState: {
      state,
      sourceType: body.stationId ? 'radio' : action === 'stop' ? null : 'music',
      title: action === 'stop' ? null : body.title || null,
      subtitle: action === 'stop' ? null : body.stationId || null,
      startedAt: action === 'stop' ? null : new Date().toISOString(),
    },
  };
}

export async function getMediaHealth(config, req) {
  const payload = getMediaPayload(config, req);
  return {
    status: 'healthy',
    warnings: payload.meta.warnings,
    stationCount: payload.detail.radioPresets.length,
  };
}

```

### MODIFIED `lib/server/domains/photos/service.js`

```js
import { fetchJson } from '../../fetch.js';
import { createMeta } from '../../http.js';
import { readSnapshot, writeSnapshot } from '../../cache/snapshots.js';

let cachedGoogleToken = null;
let cachedGoogleTokenExpiry = 0;

const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID || '546c25a59c58ad7';

function fallbackPhotos() {
  return [
    '/fallback/photos/family-1.svg',
    '/fallback/photos/family-2.svg',
    '/fallback/photos/family-3.svg',
  ];
}

function getSourcePriority(config) {
  const configured = Array.isArray(config?.photos?.sourcePriority) ? config.photos.sourcePriority : [];
  const ordered = [...configured, 'google_photos', 'immich', 'imgur', 'local_fallback']
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .filter((entry, index, list) => list.indexOf(entry) === index);
  return ordered.includes('local_fallback') ? ordered : [...ordered, 'local_fallback'];
}

function buildFallbackImages() {
  return fallbackPhotos().map((url, index) => ({
    id: `fallback-${index + 1}`,
    url,
    source: 'local_fallback',
    credit: 'HomeHub fallback',
    orientation: 'landscape',
  }));
}

function buildPhotosPayload(config, {
  images = [],
  source = 'local_fallback',
  warnings = [],
  stale = false,
  degraded = false,
  isMock = false,
} = {}) {
  const queue = images.slice(0, 10);
  const primarySource = getSourcePriority(config)[0] || 'local_fallback';
  const fallbackInUse = source !== primarySource || (source === 'local_fallback' && primarySource !== 'local_fallback');
  return {
    meta: createMeta({
      stale,
      degraded: degraded || warnings.length > 0 || fallbackInUse,
      isMock,
      warnings,
    }),
    summary: {
      status: fallbackInUse ? 'warning' : 'normal',
      priority: fallbackInUse ? 'attention_needed' : 'normal',
      headline: source === 'google_photos' ? 'Google Photos slideshow ready' : `Using ${source.replace(/_/g, ' ')}`,
      supportingText: `${queue.length} photo${queue.length === 1 ? '' : 's'} available.`,
      badges: [source.replace(/_/g, ' '), `${queue.length} photos`],
      cta: { label: 'Open Photos', route: '#/photos' },
      updatedAt: new Date().toISOString(),
    },
    detail: {
      source,
      fallbackInUse,
      currentPhoto: queue[0] || null,
      queue,
    },
  };
}

async function getGoogleAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google Photos env vars missing');
  }
  if (cachedGoogleToken && Date.now() < cachedGoogleTokenExpiry - 120000) {
    return cachedGoogleToken;
  }
  const response = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  }, 8000);
  if (!response.ok) {
    throw new Error('Google Photos token refresh failed');
  }
  cachedGoogleToken = response.data?.access_token;
  cachedGoogleTokenExpiry = Date.now() + ((response.data?.expires_in || 3600) * 1000);
  if (!cachedGoogleToken) {
    throw new Error('Google Photos token refresh returned no access token');
  }
  return cachedGoogleToken;
}

async function fetchGooglePhotos(config) {
  const token = await getGoogleAccessToken();
  const albumId = config?.photos?.googleAlbumId;
  if (!albumId) throw new Error('Google Photos album not configured');
  const response = await fetchJson('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      albumId,
      pageSize: 25,
    }),
  }, 8000);
  if (!response.ok) throw new Error('Google Photos mediaItems search failed');
  return (response.data?.mediaItems || [])
    .filter((item) => item.mimeType?.startsWith('image/') && item.baseUrl)
    .map((item) => ({
      id: item.id,
      url: `${item.baseUrl}=w1920-h1080-c`,
      source: 'google_photos',
      credit: item.filename || 'Google Photos',
      orientation: item.mediaMetadata?.width > item.mediaMetadata?.height ? 'landscape' : 'portrait',
    }));
}

async function fetchImmich(config) {
  if (!config?.photos?.immichBaseUrl || !config?.photos?.immichAlbumId) {
    throw new Error('Immich not configured');
  }
  const url = `${config.photos.immichBaseUrl.replace(/\/$/, '')}/api/albums/${config.photos.immichAlbumId}`;
  const response = await fetchJson(url, {
    headers: process.env.IMMICH_SHARED_ALBUM_TOKEN
      ? { 'x-api-key': process.env.IMMICH_SHARED_ALBUM_TOKEN }
      : {},
  }, 8000);
  if (!response.ok) throw new Error('Immich album fetch failed');
  return (response.data?.assets || [])
    .filter((asset) => asset.type === 'IMAGE')
    .map((asset) => ({
      id: asset.id,
      url: `${config.photos.immichBaseUrl.replace(/\/$/, '')}/api/assets/${asset.id}/thumbnail?size=preview`,
      source: 'immich',
      credit: response.data?.albumName || 'Immich',
      orientation: 'landscape',
    }));
}

async function fetchImgur(config) {
  if (!config?.photos?.imgurAlbumId) throw new Error('Imgur album not configured');
  const response = await fetchJson(`https://api.imgur.com/3/album/${config.photos.imgurAlbumId}`, {
    headers: { Authorization: `Client-ID ${IMGUR_CLIENT_ID}` },
  }, 8000);
  if (!response.ok) throw new Error('Imgur album fetch failed');
  return (response.data?.data?.images || []).map((image) => ({
    id: image.id,
    url: image.link,
    source: 'imgur',
    credit: 'Imgur',
    orientation: image.width > image.height ? 'landscape' : 'portrait',
  }));
}

export async function getPhotosPayload(config, { mockScenario = null } = {}) {
  if (mockScenario === 'PHOTOS_AUTH_EXPIRED') {
    return buildPhotosPayload(config, {
      images: buildFallbackImages(),
      source: 'local_fallback',
      warnings: ['Using fallback photos because Google Photos auth is expired.'],
      degraded: true,
      isMock: true,
    });
  }

  const attempts = {
    google_photos: () => fetchGooglePhotos(config),
    immich: () => fetchImmich(config),
    imgur: () => fetchImgur(config),
    local_fallback: async () => buildFallbackImages(),
  };

  let images = [];
  let source = 'local_fallback';
  const warnings = [];

  for (const provider of getSourcePriority(config)) {
    const attempt = attempts[provider];
    if (!attempt) continue;
    try {
      images = await attempt();
      if (Array.isArray(images) && images.length) {
        source = provider;
        break;
      }
      warnings.push(`${provider} returned no photos.`);
    } catch (error) {
      warnings.push(`${provider} failed: ${error.message}`);
    }
  }

  const snapshotKey = 'photos';
  const snapshot = readSnapshot(snapshotKey);
  if ((!Array.isArray(images) || !images.length) && snapshot) {
    return {
      ...snapshot,
      meta: createMeta({
        fetchedAt: snapshot.meta?.fetchedAt,
        stale: true,
        degraded: true,
        isMock: snapshot.meta?.isMock,
        warnings: [...(snapshot.meta?.warnings || []), ...warnings],
      }),
    };
  }

  if (!Array.isArray(images) || !images.length) {
    images = buildFallbackImages();
    source = 'local_fallback';
    warnings.push('No remote photo providers returned usable images. Using built-in fallback photos.');
  }

  const payload = buildPhotosPayload(config, {
    images,
    source,
    warnings,
  });

  return writeSnapshot(snapshotKey, payload);
}

export async function getPhotosHealth(config) {
  try {
    const payload = await getPhotosPayload(config);
    return {
      status: payload.meta.degraded ? 'degraded' : 'healthy',
      source: payload.detail.source,
      warnings: payload.meta.warnings,
      photoCount: payload.detail.queue.length,
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'unknown',
      warnings: [error.message || 'Photos health check failed.'],
      photoCount: 0,
    };
  }
}

```

### MODIFIED `lib/server/domains/environment/service.js`

```js
import { fetchJson } from '../../fetch.js';
import { createMeta } from '../../http.js';
import { readSnapshot, writeSnapshot } from '../../cache/snapshots.js';

const NWS_USER_AGENT = 'HomeHub/3.0 (support: HomeHub)';
const recentAlerts = new Map();

function getConditionLabel(code = 0) {
  const labels = {
    0: 'Clear',
    1: 'Mostly Clear',
    2: 'Partly Cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Fog',
    51: 'Light Drizzle',
    53: 'Drizzle',
    55: 'Heavy Drizzle',
    61: 'Light Rain',
    63: 'Rain',
    65: 'Heavy Rain',
    71: 'Light Snow',
    73: 'Snow',
    75: 'Heavy Snow',
    80: 'Showers',
    81: 'Showers',
    82: 'Heavy Showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm',
    99: 'Severe Thunderstorm',
  };
  return labels[code] || 'Unknown';
}

function getConditionIcon(code = 0) {
  if (code === 0) return '☀️';
  if (code >= 1 && code <= 3) return '⛅';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 65) return '🌧️';
  if (code >= 71 && code <= 75) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}

function maybeRound(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function hazardFamily(eventName = '') {
  const value = eventName.toLowerCase();
  if (value.includes('tornado')) return 'tornado';
  if (value.includes('thunderstorm')) return 'thunderstorm';
  if (value.includes('flood')) return 'flood';
  if (value.includes('wind')) return 'wind';
  if (value.includes('heat')) return 'heat';
  if (value.includes('winter')) return 'winter';
  return value;
}

function mapSeverityLevel(alert) {
  const event = (alert.event || '').toLowerCase();
  const severity = (alert.severity || '').toLowerCase();
  const urgency = (alert.urgency || '').toLowerCase();
  if (event.includes('emergency')) return 5;
  if (event.includes('tornado warning')) return 5;
  if (severity === 'extreme' && urgency === 'immediate') return 5;
  if (event.includes('warning')) return 4;
  if (severity === 'severe' && ['immediate', 'expected'].includes(urgency)) return 4;
  if (event.includes('watch')) return 3;
  if (severity === 'severe' || severity === 'moderate') return 2;
  if (event.includes('statement') || event.includes('advisory')) return 1;
  return 1;
}

function mapStatus(level) {
  if (level >= 5) return 'danger';
  if (level === 4) return 'urgent';
  if (level >= 2) return 'warning';
  if (level === 1) return 'info';
  return 'success';
}

function dedupeAndRankAlerts(features = []) {
  const byId = new Map();
  for (const feature of Array.isArray(features) ? features : []) {
    const properties = feature?.properties || {};
    const id = properties.id || feature?.id || `${properties.event}-${properties.sent || properties.effective || ''}`;
    const current = byId.get(id);
    if (!current || new Date(properties.sent || properties.updated || 0) > new Date(current.properties?.sent || current.properties?.updated || 0)) {
      byId.set(id, feature);
    }
  }

  const normalized = [...byId.values()].map((feature) => {
    const properties = feature?.properties || {};
    const severityLevel = mapSeverityLevel(properties);
    return {
      id: properties.id || feature?.id,
      type: properties.event || 'Weather Alert',
      event: properties.event || 'Weather Alert',
      severityLevel,
      status: 'active',
      startsAt: properties.effective || properties.onset || null,
      endsAt: properties.ends || properties.expires || null,
      headline: properties.headline || properties.event || 'Weather Alert',
      summary: properties.description?.split('\n')[0] || properties.headline || properties.event || 'Weather Alert',
      impacts: extractSection(properties.description, 'IMPACT'),
      actions: extractSection(properties.instruction || properties.description, 'PRECAUTIONARY'),
      source: 'National Weather Service',
      sourceUrl: properties['@id'] || null,
      area: properties.areaDesc || null,
      severity: properties.severity || null,
      urgency: properties.urgency || null,
      certainty: properties.certainty || null,
    };
  });

  normalized.sort((left, right) => {
    if (right.severityLevel !== left.severityLevel) return right.severityLevel - left.severityLevel;
    return new Date(left.endsAt || 0) - new Date(right.endsAt || 0);
  });

  const strongestByFamily = new Map();
  const result = [];
  for (const alert of normalized) {
    const family = hazardFamily(alert.event);
    const existing = strongestByFamily.get(family);
    if (!existing || alert.severityLevel > existing.severityLevel) {
      strongestByFamily.set(family, alert);
    }
  }
  for (const alert of normalized) {
    const family = hazardFamily(alert.event);
    const strongest = strongestByFamily.get(family);
    if (strongest && strongest.id !== alert.id && strongest.severityLevel >= 4 && alert.severityLevel <= 3) {
      continue;
    }
    result.push(alert);
  }
  return result;
}

function extractSection(text = '', header = '') {
  if (!text) return [];
  const lines = String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const matches = lines
    .filter((line) => line.toUpperCase().includes(header))
    .slice(0, 3)
    .map((line) => line.replace(/^\*+\s*/, '').replace(/\.\.\./g, ' ').trim());
  if (matches.length) return matches;
  return lines.slice(0, 2);
}

function updateRecentAlerts(activeAlerts) {
  const now = Date.now();
  const activeIds = new Set(activeAlerts.map((alert) => alert.id));
  for (const alert of activeAlerts) {
    recentAlerts.set(alert.id, { ...alert, status: 'active', endedAt: null });
  }
  for (const [id, alert] of recentAlerts.entries()) {
    if (!activeIds.has(id) && !alert.endedAt) {
      recentAlerts.set(id, { ...alert, status: 'expired', endedAt: new Date().toISOString() });
    }
  }
  for (const [id, alert] of recentAlerts.entries()) {
    if (alert.endedAt && (now - new Date(alert.endedAt).getTime()) > 2 * 60 * 60 * 1000) {
      recentAlerts.delete(id);
    }
  }
}

async function safeFetchJson(url, init, timeoutMs) {
  try {
    return await fetchJson(url, init, timeoutMs);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error,
    };
  }
}

function buildWarning(label, response) {
  const suffix = response?.error?.message
    ? `: ${response.error.message}`
    : response?.status
      ? ` (${response.status})`
      : '';
  return `${label} unavailable${suffix}`;
}

function buildRiskSummary(current, daily, alerts, { forecastAvailable = true, alertsAvailable = true } = {}) {
  if (alerts.length) {
    const top = alerts[0];
    return {
      level: top.severityLevel,
      status: mapStatus(top.severityLevel),
      headline: top.type,
      summary: top.summary,
      timeWindow: top.endsAt ? `Until ${new Date(top.endsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : null,
    };
  }
  if (!forecastAvailable) {
    return {
      level: 0,
      status: alertsAvailable ? 'info' : 'warning',
      headline: 'Weather data unavailable',
      summary: alertsAvailable
        ? 'Forecast data is temporarily unavailable.'
        : 'Forecast and alert feeds are temporarily unavailable.',
      timeWindow: null,
    };
  }
  const precip = Number(daily?.precipitation_probability_max?.[0] || 0);
  const wind = Number(current?.wind_speed_10m || current?.wind_gusts_10m || 0);
  const temp = Number(current?.temperature_2m || 0);
  let level = 0;
  let headline = 'No hazardous weather expected';
  let summary = 'Conditions look calm over the next 24 hours.';
  if (precip >= 70 || wind >= 30) {
    level = 2;
    headline = 'Elevated weather impact';
    summary = 'Rain or gusty conditions may affect outdoor plans today.';
  }
  if (temp >= 95) {
    level = Math.max(level, 2);
    headline = 'Heat risk';
    summary = 'Hot conditions today. Limit strenuous outdoor activity.';
  }
  return { level, status: mapStatus(level), headline, summary, timeWindow: null };
}

function buildEnvironmentPayload(config, {
  forecast = null,
  alerts = [],
  stale = false,
  degraded = false,
  isMock = false,
  warnings = [],
  forecastAvailable = true,
  alertsAvailable = true,
  fetchedAt = new Date().toISOString(),
} = {}) {
  const current = forecast?.current || {};
  const daily = forecast?.daily || {};
  const hourly = forecast?.hourly || {};
  const locationName = config?.environment?.locationName || 'Configured location';
  const risk = buildRiskSummary(current, daily, alerts, { forecastAvailable, alertsAvailable });
  const currentTemp = maybeRound(current.temperature_2m);
  const highTemp = maybeRound(daily.temperature_2m_max?.[0]);
  const lowTemp = maybeRound(daily.temperature_2m_min?.[0]);

  return {
    meta: createMeta({
      fetchedAt,
      stale,
      degraded,
      isMock,
      warnings,
    }),
    summary: {
      status: risk.status,
      priority: risk.level >= 4 ? 'critical_alert' : risk.level >= 2 ? 'attention_needed' : 'normal',
      headline: risk.headline,
      supportingText: risk.summary,
      badges: [
        locationName,
        currentTemp == null ? 'Forecast unavailable' : `${currentTemp}°`,
      ],
      cta: risk.level >= 3 ? { label: 'View Alerts', route: '#/alerts' } : { label: 'Open Weather', route: '#/weather' },
      updatedAt: fetchedAt,
      weather: {
        temp: currentTemp,
        high: highTemp,
        low: lowTemp,
        condition: forecastAvailable ? getConditionLabel(current.weather_code) : 'Forecast unavailable',
        icon: forecastAvailable ? getConditionIcon(current.weather_code) : '·',
      },
      risk,
      activeAlertCount: alertsAvailable ? alerts.length : 0,
      ticker: alerts.length
        ? alerts.slice(0, 3).map((alert) => alert.type).join(' · ')
        : alertsAvailable
          ? 'No alerts'
          : 'Alerts unavailable',
    },
    detail: {
      forecastAvailable,
      alertsAvailable,
      current: {
        temp: currentTemp,
        feelsLike: maybeRound(current.apparent_temperature ?? current.temperature_2m),
        humidity: maybeRound(current.relative_humidity_2m),
        windMph: maybeRound(current.wind_speed_10m),
        gustMph: maybeRound(current.wind_gusts_10m),
        condition: forecastAvailable ? getConditionLabel(current.weather_code) : 'Forecast unavailable',
        icon: forecastAvailable ? getConditionIcon(current.weather_code) : '·',
      },
      hourly: Array.isArray(hourly.time)
        ? hourly.time.slice(0, 12).map((time, index) => ({
            time,
            temp: maybeRound(hourly.temperature_2m?.[index]),
            precipitationChance: maybeRound(hourly.precipitation_probability?.[index]),
            icon: getConditionIcon(hourly.weather_code?.[index]),
          }))
        : [],
      daily: Array.isArray(daily.time)
        ? daily.time.slice(0, 7).map((time, index) => ({
            date: time,
            high: maybeRound(daily.temperature_2m_max?.[index]),
            low: maybeRound(daily.temperature_2m_min?.[index]),
            precipitationChance: maybeRound(daily.precipitation_probability_max?.[index]),
            icon: getConditionIcon(daily.weather_code?.[index]),
          }))
        : [],
      radar: {
        available: forecastAvailable,
        source: forecastAvailable ? 'RainViewer' : 'Unavailable',
      },
      risk,
      alerts: {
        active: alerts,
        recentlyEnded: [...recentAlerts.values()].filter((alert) => alert.status === 'expired'),
      },
    },
  };
}

export async function getEnvironmentPayload(config, { mockScenario = null } = {}) {
  if (mockScenario === 'TORNADO_5') {
    const mockAlert = {
      id: 'mock-tornado',
      type: 'Tornado Warning',
      event: 'Tornado Warning',
      severityLevel: 5,
      status: 'active',
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + (30 * 60 * 1000)).toISOString(),
      headline: 'Tornado Warning',
      summary: 'Take shelter now in an interior room on the lowest floor.',
      impacts: ['Flying debris will be dangerous.', 'Power outages are likely.'],
      actions: ['Move away from windows.', 'Take shelter immediately.'],
      source: 'HomeHub Test',
      sourceUrl: null,
      area: config?.environment?.locationName || 'Configured location',
      severity: 'Extreme',
      urgency: 'Immediate',
      certainty: 'Observed',
    };
    updateRecentAlerts([mockAlert]);
    return buildEnvironmentPayload(config, {
      forecast: {
        current: {
          temperature_2m: 73,
          apparent_temperature: 74,
          relative_humidity_2m: 73,
          wind_speed_10m: 18,
          wind_gusts_10m: 31,
          weather_code: 95,
        },
        hourly: {
          time: [],
          temperature_2m: [],
          precipitation_probability: [],
          weather_code: [],
        },
        daily: {
          time: [],
          temperature_2m_max: [75],
          temperature_2m_min: [59],
          precipitation_probability_max: [90],
          weather_code: [95],
        },
      },
      alerts: [mockAlert],
      isMock: true,
    });
  }

  const lat = Number(config?.environment?.lat);
  const lon = Number(config?.environment?.lon);
  const [forecastResponse, alertsResponse] = await Promise.all([
    safeFetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m' +
      '&hourly=temperature_2m,precipitation_probability,weather_code' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
      '&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto',
      {},
      7000
    ),
    safeFetchJson(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, {
      headers: { 'User-Agent': NWS_USER_AGENT },
    }, 7000),
  ]);

  const warnings = [];
  if (!forecastResponse.ok) warnings.push(buildWarning('Forecast feed', forecastResponse));
  if (!alertsResponse.ok) warnings.push(buildWarning('Alert feed', alertsResponse));

  const snapshotKey = `environment:${lat}:${lon}`;
  const snapshot = readSnapshot(snapshotKey);
  if (!forecastResponse.ok && !alertsResponse.ok && snapshot) {
    return {
      ...snapshot,
      meta: createMeta({
        fetchedAt: snapshot.meta?.fetchedAt,
        stale: true,
        degraded: true,
        isMock: snapshot.meta?.isMock,
        warnings: [...(snapshot.meta?.warnings || []), ...warnings, 'Environment origin fetch failed. Returned last-known-good snapshot.'],
      }),
      detail: {
        ...snapshot.detail,
        forecastAvailable: Boolean(snapshot.detail?.forecastAvailable),
        alertsAvailable: Boolean(snapshot.detail?.alertsAvailable),
      },
    };
  }

  const alerts = alertsResponse.ok
    ? dedupeAndRankAlerts((alertsResponse.data?.features || []).filter((feature) => {
        const props = feature?.properties || {};
        const endsAt = props.ends || props.expires;
        return !endsAt || new Date(endsAt) > new Date();
      }))
    : [];

  if (alertsResponse.ok) {
    updateRecentAlerts(alerts);
  }

  const payload = buildEnvironmentPayload(config, {
    forecast: forecastResponse.ok ? (forecastResponse.data || {}) : null,
    alerts,
    degraded: !forecastResponse.ok || !alertsResponse.ok,
    warnings,
    forecastAvailable: Boolean(forecastResponse.ok),
    alertsAvailable: Boolean(alertsResponse.ok),
  });

  return writeSnapshot(snapshotKey, payload);
}

export async function getEnvironmentHealth(config) {
  try {
    const payload = await getEnvironmentPayload(config);
    return {
      status: payload.meta.degraded ? 'degraded' : 'healthy',
      source: 'open-meteo + nws',
      lastUpdated: payload.meta.fetchedAt,
      warnings: payload.meta.warnings,
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'open-meteo + nws',
      errorState: error.message,
      warnings: [error.message],
    };
  }
}

```

### MODIFIED `lib/server/domains/household/service.js`

```js
import { restMutate, restSelect } from '../../supabase.js';
import { fetchJson } from '../../fetch.js';
import { createMeta } from '../../http.js';
import { getLocalWeekdayIndex, getNextLocalMidnightIso, isSameLocalDay } from '../../time.js';

const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://dog-calorie-counter-default-rtdb.firebaseio.com';

function deriveCategoryDay(category) {
  const map = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  if (!category) return null;
  const entry = Object.entries(map).find(([key]) => category.toLowerCase().includes(key));
  return entry ? entry[1] : null;
}

function buildEmptyChores(config, warning = '') {
  return {
    degraded: Boolean(warning),
    warning: warning || null,
    nextResetAt: getNextLocalMidnightIso(new Date(), config.system.timezone),
    overdue: [],
    dueToday: [],
    completedToday: [],
    upcoming: [],
    summary: {
      dueToday: 0,
      completedToday: 0,
      overdueCount: 0,
      progressPercent: 0,
    },
  };
}

function buildEmptyTreats(config, warning = '') {
  const dailyLimitTreats = Math.max(Number(config?.household?.treats?.dailyLimitTreats || 0), 0);
  return {
    degraded: Boolean(warning),
    warning: warning || null,
    petId: 'pet',
    petName: config?.household?.treats?.petName || 'Pet',
    avatarEmoji: config?.household?.treats?.avatarEmoji || '🐕',
    dailyLimitTreats,
    treatsGivenToday: 0,
    treatsRemaining: dailyLimitTreats,
    percentOfLimit: 0,
    caloriesToday: {
      total: 0,
      fromFood: 0,
      fromTreats: 0,
      dailyCalorieTarget: 0,
    },
    statusLevel: warning ? 'unknown' : 'under',
    lastTreat: null,
    history: [],
    resetsAt: getNextLocalMidnightIso(new Date(), config.system.timezone),
  };
}

function evaluateChores(config, chores) {
  const weekday = getLocalWeekdayIndex(new Date(), config.system.timezone);
  const grouped = { overdue: [], dueToday: [], completedToday: [], upcoming: [] };
  for (const chore of chores) {
    const scheduledDay = typeof chore.day_of_week === 'number' ? chore.day_of_week : deriveCategoryDay(chore.category);
    const isDaily = scheduledDay == null && (chore.category === 'Daily' || !chore.category);
    const isDueToday = isDaily || scheduledDay === weekday;
    const wasCompletedToday = chore.last_completed_at
      ? isSameLocalDay(chore.last_completed_at, new Date(), config.system.timezone)
      : chore.status === 'done';

    const normalized = {
      id: chore.id,
      title: chore.title || chore.name || 'Untitled chore',
      assignee: chore.assignee || chore.completed_by_name || null,
      frequency: isDaily ? 'daily' : 'weekly',
      badge: isDueToday ? 'Today' : scheduledDay != null ? 'Weekly' : 'Daily',
      completed: wasCompletedToday || chore.status === 'done',
      overdue: false,
    };

    if (normalized.completed && isDueToday) {
      grouped.completedToday.push(normalized);
      continue;
    }
    if (!normalized.completed && isDueToday) {
      grouped.dueToday.push(normalized);
      continue;
    }
    if (!normalized.completed && scheduledDay != null && scheduledDay < weekday) {
      normalized.overdue = true;
      normalized.badge = 'Overdue';
      grouped.overdue.push(normalized);
      continue;
    }
    grouped.upcoming.push(normalized);
  }

  const dueToday = grouped.dueToday.length + grouped.completedToday.length;
  const progressPercent = dueToday > 0 ? Math.round((grouped.completedToday.length / dueToday) * 100) : 100;

  return {
    degraded: false,
    warning: null,
    nextResetAt: getNextLocalMidnightIso(new Date(), config.system.timezone),
    overdue: grouped.overdue,
    dueToday: grouped.dueToday,
    completedToday: grouped.completedToday,
    upcoming: grouped.upcoming,
    summary: {
      dueToday: grouped.dueToday.length,
      completedToday: grouped.completedToday.length,
      overdueCount: grouped.overdue.length,
      progressPercent,
    },
  };
}

async function fetchTreatProfile(config) {
  const dogsResponse = await fetchJson(`${FIREBASE_DATABASE_URL}/dogs.json`, {}, 6000);
  if (!dogsResponse.ok) {
    throw new Error('Treat profile fetch failed');
  }

  const dogs = dogsResponse.data || {};
  const dogEntries = Object.entries(dogs);
  const petName = config.household.treats.petName;
  const selected = dogEntries.find(([, dog]) => dog?.name === petName) || dogEntries[0] || [null, null];
  const [dogId, dog] = selected;
  return {
    dogId,
    dog: dog || {
      name: petName,
      dailyCalorieLimit: 1800,
    },
  };
}

async function fetchTreatEvents(dogId) {
  if (!dogId) throw new Error('Treat profile is missing a dog id');
  const response = await fetchJson(`${FIREBASE_DATABASE_URL}/treats/${dogId}.json`, {}, 6000);
  if (!response.ok) {
    throw new Error('Treat events fetch failed');
  }
  return response.data || {};
}

function evaluateTreats(config, dogId, dog, rawEvents) {
  const dailyLimitTreats = Math.max(Number(config.household.treats.dailyLimitTreats || 0), 0);
  const events = Object.entries(rawEvents || {})
    .map(([id, event]) => ({ id, ...event }))
    .filter((event) => event.timestamp && isSameLocalDay(event.timestamp, new Date(), config.system.timezone))
    .sort((left, right) => right.timestamp - left.timestamp);

  const treatsGivenToday = events.length;
  const treatsRemaining = Math.max(dailyLimitTreats - treatsGivenToday, 0);
  const percentOfLimit = dailyLimitTreats > 0
    ? Math.min(Math.round((treatsGivenToday / dailyLimitTreats) * 100), 100)
    : 0;
  const caloriesFromTreats = events.reduce((sum, event) => sum + Number(event.calories || 0), 0);
  const statusLevel = dailyLimitTreats === 0
    ? 'unknown'
    : treatsGivenToday >= dailyLimitTreats
      ? 'at'
      : treatsGivenToday >= Math.ceil(dailyLimitTreats * 0.7)
        ? 'near'
        : 'under';

  return {
    degraded: false,
    warning: null,
    petId: dogId || 'pet',
    petName: dog?.name || config.household.treats.petName,
    avatarEmoji: config.household.treats.avatarEmoji,
    dailyLimitTreats,
    treatsGivenToday,
    treatsRemaining,
    percentOfLimit,
    caloriesToday: {
      total: Number(dog?.dailyCalorieLimit || 0),
      fromFood: 0,
      fromTreats: caloriesFromTreats,
      dailyCalorieTarget: Number(dog?.dailyCalorieLimit || 0),
    },
    statusLevel,
    lastTreat: events[0] ? {
      at: new Date(events[0].timestamp).toISOString(),
      by: events[0].by || 'Family',
      note: events[0].name || events[0].note || null,
    } : null,
    history: events.slice(0, 10).map((event) => ({
      id: event.id,
      at: new Date(event.timestamp).toISOString(),
      by: event.by || 'Family',
      note: event.name || event.note || null,
      calories: Number(event.calories || 0),
    })),
    resetsAt: getNextLocalMidnightIso(new Date(), config.system.timezone),
  };
}

function buildHouseholdPayload(config, chores, treats, warnings = []) {
  const degraded = warnings.length > 0 || chores.degraded || treats.degraded;
  let status = 'success';
  if (chores.summary.overdueCount > 0 || treats.statusLevel === 'at') {
    status = 'warning';
  } else if (degraded || chores.summary.dueToday > 0 || treats.statusLevel === 'near' || treats.statusLevel === 'unknown') {
    status = 'info';
  }

  let headline = `${chores.summary.completedToday} of ${chores.summary.completedToday + chores.summary.dueToday} chores done`;
  let supportingText = `${treats.petName}: ${treats.treatsRemaining} treats left today.`;

  if (chores.summary.overdueCount > 0) {
    headline = `${chores.summary.overdueCount} overdue chore${chores.summary.overdueCount === 1 ? '' : 's'}`;
  } else if (degraded && chores.degraded) {
    headline = 'Chore status temporarily unavailable';
  }

  if (treats.statusLevel === 'at') {
    supportingText = `${treats.petName} has reached today’s treat limit.`;
  } else if (degraded && treats.degraded) {
    supportingText = 'Treat tracker data is temporarily unavailable.';
  } else if (degraded && warnings.length) {
    supportingText = 'HomeHub is showing the best available household state.';
  }

  return {
    meta: createMeta({
      degraded,
      warnings,
    }),
    summary: {
      status,
      priority: status === 'warning' ? 'attention_needed' : 'normal',
      headline,
      supportingText,
      badges: [
        chores.degraded ? 'chores degraded' : `${chores.summary.dueToday} due`,
        treats.degraded ? 'treats degraded' : `${treats.treatsRemaining} treats left`,
      ],
      cta: { label: 'Open Household', route: '#/household' },
      updatedAt: new Date().toISOString(),
      chores: chores.summary,
      treats: {
        petName: treats.petName,
        statusLevel: treats.statusLevel,
        treatsRemaining: treats.treatsRemaining,
      },
    },
    detail: {
      chores,
      treats,
    },
  };
}

export async function getHouseholdPayload(config, context) {
  const warnings = [];
  let chores = buildEmptyChores(config);
  let treats = buildEmptyTreats(config);

  if (!context.householdId) {
    const warning = 'Household context is missing.';
    warnings.push(warning);
    chores = buildEmptyChores(config, warning);
  } else {
    try {
      const rawChores = await restSelect('chores', `select=*&household_id=eq.${context.householdId}&order=created_at.desc`);
      chores = evaluateChores(config, rawChores || []);
    } catch (error) {
      const warning = `Chores unavailable: ${error.message}`;
      warnings.push(warning);
      chores = buildEmptyChores(config, warning);
    }
  }

  try {
    const { dogId, dog } = await fetchTreatProfile(config);
    const treatEvents = await fetchTreatEvents(dogId);
    treats = evaluateTreats(config, dogId, dog, treatEvents);
  } catch (error) {
    const warning = `Treat tracker unavailable: ${error.message}`;
    warnings.push(warning);
    treats = buildEmptyTreats(config, warning);
  }

  return buildHouseholdPayload(config, chores, treats, warnings);
}

async function writeTreatEvent(dogId, event) {
  const response = await fetchJson(`${FIREBASE_DATABASE_URL}/treats/${dogId}/${event.id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  }, 6000);
  if (!response.ok) throw new Error('Failed to write treat event');
}

function requireField(value, message) {
  if (value == null || String(value).trim() === '') {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
}

export async function mutateHousehold(config, context, body = {}) {
  if (!context.householdId) {
    const error = new Error('Household context required');
    error.statusCode = 401;
    throw error;
  }

  const action = body.action;
  if (action === 'toggle_chore') {
    requireField(body.id, 'A chore id is required.');
    const isComplete = Boolean(body.complete);
    const payload = {
      status: isComplete ? 'done' : 'pending',
      completed_by_name: isComplete ? (context.user?.user_metadata?.full_name || context.user?.email || 'Family') : null,
      last_completed_at: isComplete ? new Date().toISOString() : null,
    };
    await restMutate('chores', `id=eq.${body.id}`, 'PATCH', payload, { prefer: 'return=minimal' });
    return { meta: createMeta(), success: true };
  }

  if (action === 'create_chore') {
    requireField(body.title, 'A chore title is required.');
    const payload = {
      household_id: context.householdId,
      title: String(body.title).trim(),
      category: body.category || 'Daily',
      priority: body.priority || 'medium',
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    const data = await restMutate('chores', '', 'POST', payload);
    return { meta: createMeta(), success: true, data };
  }

  if (action === 'delete_chore') {
    requireField(body.id, 'A chore id is required.');
    await restMutate('chores', `id=eq.${body.id}`, 'DELETE', {}, { prefer: 'return=minimal' });
    return { meta: createMeta(), success: true };
  }

  if (action === 'log_treat') {
    const { dogId } = await fetchTreatProfile(config);
    if (!dogId) {
      const error = new Error('Treat profile is unavailable.');
      error.statusCode = 503;
      throw error;
    }
    const event = {
      name: String(body.name || 'Treat').trim() || 'Treat',
      calories: Number(body.calories || 0),
      timestamp: Date.now(),
      by: context.user?.user_metadata?.full_name || context.user?.email || 'Family',
      id: String(Date.now()),
    };
    await writeTreatEvent(dogId, event);
    return { meta: createMeta(), success: true };
  }

  const error = new Error(`Unknown household action: ${action}`);
  error.statusCode = 400;
  throw error;
}

export async function getHouseholdHealth(config, context) {
  try {
    const payload = await getHouseholdPayload(config, context);
    return {
      status: payload.meta.degraded ? 'degraded' : 'healthy',
      choresDueToday: payload.summary.chores.dueToday,
      treatsRemaining: payload.summary.treats.treatsRemaining,
      warnings: payload.meta.warnings,
    };
  } catch (error) {
    return {
      status: 'error',
      errorState: error.message,
      warnings: [error.message],
    };
  }
}

```

### MODIFIED `lib/server/domains/dashboard/build.js`

```js
import { createMeta } from '../../http.js';
import { getAgendaPayload } from '../../integrations/agenda/service.js';
import { getEnvironmentPayload } from '../environment/service.js';
import { getHouseholdPayload } from '../household/service.js';
import { getMediaPayload } from '../media/service.js';
import { getPhotosPayload } from '../photos/service.js';

function fallbackEnvironmentModule() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Environment summary is unavailable.'] }),
    summary: {
      status: 'warning',
      headline: 'Weather unavailable',
      supportingText: 'HomeHub could not load the weather summary.',
      badges: ['weather degraded'],
      cta: { label: 'Open Weather', route: '#/weather' },
      weather: {
        temp: null,
        high: null,
        low: null,
        condition: 'Unavailable',
        icon: '·',
      },
      risk: {
        level: 0,
        headline: 'Weather unavailable',
        summary: 'Forecast data is temporarily unavailable.',
        timeWindow: null,
      },
      activeAlertCount: 0,
      ticker: 'Weather unavailable',
    },
  };
}

function fallbackAgendaModule() {
  return {
    status: 'disconnected',
    headline: 'Agenda unavailable',
    supportingText: 'Calendar data could not be loaded.',
    items: [],
    sections: {
      today: 0,
      tomorrow: 0,
      upcoming: 0,
    },
  };
}

function fallbackHouseholdModule() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Household summary is unavailable.'] }),
    summary: {
      status: 'warning',
      headline: 'Household summary unavailable',
      supportingText: 'HomeHub could not load chore and treat status.',
      badges: ['household degraded'],
      cta: { label: 'Open Household', route: '#/household' },
      chores: {
        dueToday: 0,
        completedToday: 0,
        overdueCount: 0,
        progressPercent: 0,
      },
      treats: {
        petName: 'Pet',
        statusLevel: 'unknown',
        treatsRemaining: 0,
      },
    },
  };
}

function fallbackMediaModule() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Media summary is unavailable.'] }),
    summary: {
      status: 'normal',
      headline: 'Nothing playing right now',
      supportingText: 'Open Media to start music or radio.',
      badges: ['idle'],
      cta: { label: 'Open Media', route: '#/media' },
      nowPlaying: {
        state: 'idle',
        sourceType: null,
        title: null,
        subtitle: null,
        startedAt: null,
      },
    },
  };
}

function fallbackPhotosModule() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Photos summary is unavailable.'] }),
    summary: {
      status: 'warning',
      headline: 'Photo queue unavailable',
      supportingText: 'Built-in fallback photos may still be available in the Photos page.',
      badges: ['photos degraded'],
      cta: { label: 'Open Photos', route: '#/photos' },
    },
  };
}

function safeValue(result, fallbackFactory) {
  return result.status === 'fulfilled' ? result.value : fallbackFactory();
}

function pickHero(environment, household, agenda) {
  const riskLevel = Number(environment?.summary?.risk?.level || 0);
  const overdueCount = Number(household?.summary?.chores?.overdueCount || 0);
  if (riskLevel >= 4) {
    return {
      status: environment.summary.status,
      eyebrow: 'Immediate attention',
      headline: environment.summary.headline,
      supportingText: environment.summary.supportingText,
      actions: [{ label: 'Open Alerts', route: '#/alerts' }],
    };
  }
  if (overdueCount > 0) {
    return {
      status: 'warning',
      eyebrow: 'Household pulse',
      headline: `${overdueCount} overdue chore${overdueCount === 1 ? '' : 's'}`,
      supportingText: household.summary.supportingText,
      actions: [{ label: 'Open Household', route: '#/household' }],
    };
  }
  return {
    status: 'success',
    eyebrow: 'Today',
    headline: agenda.headline || 'Everything looks calm',
    supportingText: agenda.supportingText || environment.summary.supportingText || 'HomeHub is ready.',
    actions: [{ label: 'Open Weather', route: '#/weather' }],
  };
}

export async function buildDashboardPayload(config, context, req) {
  const [environmentResult, agendaResult, householdResult, mediaResult, photosResult] = await Promise.allSettled([
    getEnvironmentPayload(config, { mockScenario: req.headers['x-homehub-mock'] }),
    getAgendaPayload(config, context),
    getHouseholdPayload(config, context),
    getMediaPayload(config, req),
    getPhotosPayload(config, { mockScenario: req.headers['x-homehub-mock'] }),
  ]);

  const environment = safeValue(environmentResult, fallbackEnvironmentModule);
  const agenda = safeValue(agendaResult, fallbackAgendaModule);
  const household = safeValue(householdResult, fallbackHouseholdModule);
  const media = safeValue(mediaResult, fallbackMediaModule);
  const photos = safeValue(photosResult, fallbackPhotosModule);
  const hero = pickHero(environment, household, agenda);
  const warnings = [
    ...(environment.meta?.warnings || []),
    ...(agenda.warnings || []),
    ...(household.meta?.warnings || []),
    ...(photos.meta?.warnings || []),
  ];

  if (agendaResult.status === 'rejected') {
    warnings.push(agendaResult.reason?.message || 'Agenda summary is unavailable.');
  }
  if (mediaResult.status === 'rejected') {
    warnings.push(mediaResult.reason?.message || 'Media summary is unavailable.');
  }

  return {
    meta: createMeta({
      stale: Boolean(environment.meta?.stale || household.meta?.stale || photos.meta?.stale),
      degraded: Boolean(
        environment.meta?.degraded
        || household.meta?.degraded
        || photos.meta?.degraded
        || (agenda.warnings || []).length
        || agendaResult.status === 'rejected'
        || mediaResult.status === 'rejected'
      ),
      isMock: Boolean(environment.meta?.isMock || photos.meta?.isMock),
      warnings,
    }),
    hero,
    modules: {
      environment: environment.summary,
      agenda,
      household: household.summary,
      media: media.summary,
      photos: photos.summary,
    },
  };
}

```

### MODIFIED `lib/server/domains/standby/build.js`

```js
import { createMeta } from '../../http.js';
import { getAgendaPayload } from '../../integrations/agenda/service.js';
import { isQuietHours } from '../../time.js';
import { getEnvironmentPayload } from '../environment/service.js';
import { getHouseholdPayload } from '../household/service.js';
import { getMediaPayload } from '../media/service.js';
import { getPhotosPayload } from '../photos/service.js';

function fallbackEnvironment() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Environment standby widget is unavailable.'] }),
    summary: {
      weather: {
        temp: null,
        high: null,
        low: null,
        condition: 'Unavailable',
        icon: '·',
      },
    },
    detail: {
      alerts: {
        active: [],
      },
    },
  };
}

function fallbackAgenda() {
  return {
    headline: 'Agenda unavailable',
    supportingText: 'Calendar data could not be loaded.',
  };
}

function fallbackHousehold() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Household standby widget is unavailable.'] }),
    summary: {
      headline: 'Household unavailable',
      supportingText: 'Chore and treat data could not be loaded.',
    },
  };
}

function fallbackMedia() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Media standby widget is unavailable.'] }),
    summary: {
      headline: 'Nothing playing right now',
      supportingText: 'Open Media to start playback.',
    },
  };
}

function fallbackPhotos() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Standby photo is unavailable.'] }),
    detail: {
      currentPhoto: {
        id: 'fallback-1',
        url: '/fallback/photos/family-1.svg',
        credit: 'HomeHub fallback',
      },
    },
  };
}

function safeValue(result, fallbackFactory) {
  return result.status === 'fulfilled' ? result.value : fallbackFactory();
}

function formatDegree(value) {
  return value == null ? '--' : String(value);
}

export async function buildStandbyPayload(config, context, req) {
  const [environmentResult, agendaResult, householdResult, mediaResult, photosResult] = await Promise.allSettled([
    getEnvironmentPayload(config, { mockScenario: req.headers['x-homehub-mock'] }),
    getAgendaPayload(config, context),
    getHouseholdPayload(config, context),
    getMediaPayload(config, req),
    getPhotosPayload(config, { mockScenario: req.headers['x-homehub-mock'] }),
  ]);

  const environment = safeValue(environmentResult, fallbackEnvironment);
  const agenda = safeValue(agendaResult, fallbackAgenda);
  const household = safeValue(householdResult, fallbackHousehold);
  const media = safeValue(mediaResult, fallbackMedia);
  const photos = safeValue(photosResult, fallbackPhotos);
  const topAlert = environment.detail?.alerts?.active?.[0] || null;
  const warnings = [
    ...(environment.meta?.warnings || []),
    ...(agenda.warnings || []),
    ...(household.meta?.warnings || []),
    ...(media.meta?.warnings || []),
    ...(photos.meta?.warnings || []),
  ];

  if (agendaResult.status === 'rejected') {
    warnings.push(agendaResult.reason?.message || 'Agenda standby widget is unavailable.');
  }

  return {
    meta: createMeta({
      stale: Boolean(environment.meta?.stale || photos.meta?.stale),
      degraded: Boolean(
        environment.meta?.degraded
        || (agenda.warnings || []).length
        || household.meta?.degraded
        || media.meta?.degraded
        || photos.meta?.degraded
        || agendaResult.status === 'rejected'
      ),
      isMock: Boolean(environment.meta?.isMock || photos.meta?.isMock),
      warnings,
    }),
    ambientState: isQuietHours(config) ? 'night' : 'day',
    urgentOverride: Boolean(topAlert && topAlert.severityLevel >= 4),
    backgroundPhoto: photos.detail?.currentPhoto || fallbackPhotos().detail.currentPhoto,
    primaryAlert: topAlert,
    widgets: {
      agenda: {
        headline: agenda.headline || 'No upcoming events',
        supportingText: agenda.supportingText || 'Nothing scheduled soon.',
      },
      household: {
        headline: household.summary?.headline || 'Household unavailable',
        supportingText: household.summary?.supportingText || 'Household status is temporarily unavailable.',
      },
      weather: {
        headline: `${formatDegree(environment.summary?.weather?.temp)}° ${environment.summary?.weather?.icon || '·'}`,
        supportingText: `${formatDegree(environment.summary?.weather?.high)}° / ${formatDegree(environment.summary?.weather?.low)}° · ${environment.summary?.weather?.condition || 'Unavailable'}`,
      },
      media: {
        headline: media.summary?.headline || 'Nothing playing right now',
        supportingText: media.summary?.supportingText || 'Open Media to start playback.',
      },
    },
  };
}

```

### MODIFIED `lib/server/domains/admin/diagnostics.js`

```js
import { createMeta } from '../../http.js';
import { clearSnapshots } from '../../cache/snapshots.js';
import { getAgendaHealth } from '../../integrations/agenda/service.js';
import { getEnvironmentHealth } from '../environment/service.js';
import { getHouseholdHealth } from '../household/service.js';
import { getMediaHealth } from '../media/service.js';
import { getPhotosHealth } from '../photos/service.js';

const recentActions = [];

function healthFallback(error, source) {
  return {
    status: 'error',
    source,
    errorState: error?.message || 'Health check failed',
    warnings: [error?.message || 'Health check failed'],
  };
}

export async function buildAdminDiagnostics(config, context, req) {
  const [environment, household, media, photos] = await Promise.allSettled([
    getEnvironmentHealth(config),
    getHouseholdHealth(config, context),
    getMediaHealth(config, req),
    getPhotosHealth(config),
  ]);
  const agenda = getAgendaHealth(context);

  const system = {
    environment: environment.status === 'fulfilled' ? environment.value : healthFallback(environment.reason, 'open-meteo + nws'),
    household: household.status === 'fulfilled' ? household.value : healthFallback(household.reason, 'household'),
    media: media.status === 'fulfilled' ? media.value : healthFallback(media.reason, 'media'),
    photos: photos.status === 'fulfilled' ? photos.value : healthFallback(photos.reason, 'photos'),
    agenda,
  };

  const degraded = Object.values(system).some((entry) => {
    const state = entry.status || entry.healthStatus || entry.authState;
    return state !== 'healthy' && state !== 'connected';
  });
  const warnings = Object.values(system).flatMap((entry) => entry.warnings || []);

  return {
    meta: createMeta({
      degraded,
      warnings,
    }),
    system,
    recentActions,
    availableActions: [
      { action: 'CLEAR_SNAPSHOTS', dangerous: false },
    ],
    mockSupport: [
      'TORNADO_5',
      'PHOTOS_AUTH_EXPIRED',
    ],
  };
}

export function recordAdminAction(action, status, message) {
  recentActions.unshift({
    time: new Date().toISOString(),
    action,
    status,
    message,
  });
  recentActions.splice(10);
}

export async function runAdminAction(action) {
  if (action === 'CLEAR_SNAPSHOTS') {
    clearSnapshots();
    recordAdminAction(action, 'success', 'Cleared in-memory snapshots');
    return { meta: createMeta(), success: true, message: 'Cleared in-memory snapshots.' };
  }
  throw new Error(`Unknown admin action: ${action}`);
}

```

### MODIFIED `lib/server/integrations/agenda/service.js`

```js
import { fetchJson } from '../../fetch.js';

function classifyEvents(events) {
  const today = [];
  const tomorrow = [];
  const upcoming = [];
  const now = new Date();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(now.getDate() + 1);
  for (const event of events) {
    const start = new Date(event.start.dateTime || event.start.date);
    const sameDay = start.toDateString() === now.toDateString();
    const sameTomorrow = start.toDateString() === tomorrowDate.toDateString();
    if (sameDay) today.push(event);
    else if (sameTomorrow) tomorrow.push(event);
    else upcoming.push(event);
  }
  return { today, tomorrow, upcoming };
}

export async function getAgendaPayload(config, context) {
  const basePayload = {
    status: 'empty',
    headline: 'No upcoming events',
    supportingText: 'Nothing scheduled soon.',
    items: [],
    sections: {
      today: 0,
      tomorrow: 0,
      upcoming: 0,
    },
    warnings: [],
  };

  const token = context.googleProviderToken;
  if (!token) {
    return {
      ...basePayload,
      status: 'disconnected',
      headline: 'Calendar not connected',
      supportingText: 'Sign in with Google Calendar access to show today’s schedule.',
    };
  }

  const calendarIds = config.agenda.selectedCalendars || ['primary'];
  const maxItems = config.agenda.maxItems || 6;
  const timeMin = new Date().toISOString();
  const events = [];
  const warnings = [];

  for (const calendarId of calendarIds) {
    let response;
    try {
      response = await fetchJson(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
        `?maxResults=${maxItems}&orderBy=startTime&singleEvents=true&timeMin=${encodeURIComponent(timeMin)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        },
        7000
      );
    } catch (error) {
      warnings.push(`Calendar ${calendarId} failed: ${error.message}`);
      continue;
    }
    if (response.ok && Array.isArray(response.data?.items)) {
      events.push(...response.data.items.map((event) => ({ ...event, calendarId })));
      continue;
    }
    warnings.push(`Calendar ${calendarId} returned an invalid response.`);
  }

  events.sort((left, right) => new Date(left.start.dateTime || left.start.date) - new Date(right.start.dateTime || right.start.date));
  const limited = events.slice(0, maxItems);
  const buckets = classifyEvents(limited);
  const next = limited[0] || null;

  return {
    ...basePayload,
    status: next ? 'normal' : 'empty',
    headline: next ? next.summary || 'Upcoming event' : 'No upcoming events',
    supportingText: next
      ? new Date(next.start.dateTime || next.start.date).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : 'Nothing scheduled soon.',
    items: limited.map((event) => ({
      id: event.id,
      summary: event.summary || 'Untitled event',
      start: event.start.dateTime || event.start.date,
      calendarId: event.calendarId,
    })),
    sections: {
      today: buckets.today.length,
      tomorrow: buckets.tomorrow.length,
      upcoming: buckets.upcoming.length,
    },
    warnings,
  };
}

export function getAgendaHealth(context) {
  return {
    providerId: 'google_calendar',
    healthStatus: context.googleProviderToken ? 'healthy' : 'missing',
    authState: context.googleProviderToken ? 'connected' : 'missing',
    warnings: context.googleProviderToken ? [] : ['No Google provider token present in the current session.'],
  };
}

```

### MODIFIED `api/environment.js`

```js
import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { getEnvironmentPayload } from '../lib/server/domains/environment/service.js';
import { createMeta, sendError } from '../lib/server/http.js';

function environmentErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Environment payload is unavailable.'],
    }),
    summary: {
      status: 'warning',
      headline: 'Weather unavailable',
      supportingText: 'Environment data could not be loaded.',
      risk: {
        level: 0,
        headline: 'Weather unavailable',
        summary: 'Forecast and alerts are temporarily unavailable.',
        timeWindow: null,
      },
      weather: {
        temp: null,
        high: null,
        low: null,
        condition: 'Unavailable',
        icon: '·',
      },
      activeAlertCount: 0,
      ticker: 'Environment unavailable',
    },
    detail: {
      forecastAvailable: false,
      alertsAvailable: false,
      current: {
        temp: null,
        feelsLike: null,
        humidity: null,
        windMph: null,
        gustMph: null,
        condition: 'Unavailable',
        icon: '·',
      },
      hourly: [],
      daily: [],
      radar: {
        available: false,
        source: 'Unavailable',
      },
      risk: {
        level: 0,
        headline: 'Weather unavailable',
        summary: 'Forecast and alerts are temporarily unavailable.',
        timeWindow: null,
      },
      alerts: {
        active: [],
        recentlyEnded: [],
      },
    },
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: false });
    const { config } = await loadConfig(context);
    const payload = await getEnvironmentPayload(config, { mockScenario: req.headers['x-homehub-mock'] });
    applyCacheProfile(res, 'environment', {
      privateResponse: Boolean(context.user) || Boolean(req.headers['x-homehub-mock']),
      vary: ['Authorization', 'X-HomeHub-Mock'],
    });
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 500, environmentErrorPayload());
  }
}

```

### MODIFIED `api/photos.js`

```js
import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { getPhotosPayload } from '../lib/server/domains/photos/service.js';
import { createMeta, sendError } from '../lib/server/http.js';

function photosErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Photos payload is unavailable.'],
    }),
    summary: {
      status: 'warning',
      priority: 'attention_needed',
      headline: 'Photo queue unavailable',
      supportingText: 'HomeHub is using the built-in fallback queue.',
      badges: ['photos degraded', 'fallback'],
      cta: { label: 'Open Photos', route: '#/photos' },
      updatedAt: new Date().toISOString(),
    },
    detail: {
      source: 'local_fallback',
      fallbackInUse: true,
      currentPhoto: {
        id: 'fallback-1',
        url: '/fallback/photos/family-1.svg',
        credit: 'HomeHub fallback',
      },
      queue: [
        { id: 'fallback-1', url: '/fallback/photos/family-1.svg', credit: 'HomeHub fallback' },
        { id: 'fallback-2', url: '/fallback/photos/family-2.svg', credit: 'HomeHub fallback' },
        { id: 'fallback-3', url: '/fallback/photos/family-3.svg', credit: 'HomeHub fallback' },
      ],
    },
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: false });
    const { config } = await loadConfig(context);
    const payload = await getPhotosPayload(config, { mockScenario: req.headers['x-homehub-mock'] });
    applyCacheProfile(res, 'photos', {
      privateResponse: Boolean(context.user) || Boolean(req.headers['x-homehub-mock']),
      vary: ['Authorization', 'X-HomeHub-Mock'],
    });
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 500, photosErrorPayload());
  }
}

```

### MODIFIED `api/media.js`

```js
import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { getMediaPayload, mutateMedia } from '../lib/server/domains/media/service.js';
import { createMeta, parseJsonBody, sendError } from '../lib/server/http.js';

function mediaReadErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Media payload is unavailable.'],
    }),
    summary: {
      status: 'normal',
      priority: 'normal',
      headline: 'Nothing playing right now',
      supportingText: 'Media state could not be loaded.',
      badges: ['idle'],
      cta: { label: 'Open Media', route: '#/media' },
      updatedAt: new Date().toISOString(),
      nowPlaying: {
        state: 'idle',
        sourceType: null,
        title: null,
        subtitle: null,
        startedAt: null,
      },
    },
    detail: {
      nowPlaying: {
        state: 'idle',
        sourceType: null,
        title: null,
        subtitle: null,
        startedAt: null,
      },
      availableControls: {
        playPause: true,
        next: true,
        prev: true,
        volume: true,
      },
      radioPresets: [],
      musicContext: {
        spotifyEmbedUrl: '',
      },
    },
  };
}

function mediaMutationErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Media action failed.'],
    }),
    success: false,
    anticipatedState: null,
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    const { config } = await loadConfig(context);
    if (req.method === 'POST') {
      req.body = await parseJsonBody(req);
      const result = await mutateMedia(req);
      applyCacheProfile(res, 'media');
      return res.status(200).json(result);
    }
    const payload = getMediaPayload(config, req);
    applyCacheProfile(res, 'media');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 500, req.method === 'POST' ? mediaMutationErrorPayload() : mediaReadErrorPayload());
  }
}

```

### MODIFIED `api/household.js`

```js
import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { getHouseholdPayload, mutateHousehold } from '../lib/server/domains/household/service.js';
import { createMeta, parseJsonBody, sendError } from '../lib/server/http.js';

function householdReadErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Household payload is unavailable.'],
    }),
    summary: {
      status: 'info',
      priority: 'normal',
      headline: 'Household data unavailable',
      supportingText: 'Chore and treat data could not be loaded.',
      badges: ['household degraded'],
      cta: { label: 'Open Household', route: '#/household' },
      updatedAt: new Date().toISOString(),
      chores: {
        dueToday: 0,
        completedToday: 0,
        overdueCount: 0,
        progressPercent: 0,
      },
      treats: {
        petName: 'Pet',
        statusLevel: 'unknown',
        treatsRemaining: 0,
      },
    },
    detail: {
      chores: {
        degraded: true,
        warning: 'Chore data could not be loaded.',
        nextResetAt: null,
        overdue: [],
        dueToday: [],
        completedToday: [],
        upcoming: [],
        summary: {
          dueToday: 0,
          completedToday: 0,
          overdueCount: 0,
          progressPercent: 0,
        },
      },
      treats: {
        degraded: true,
        warning: 'Treat data could not be loaded.',
        petId: 'pet',
        petName: 'Pet',
        avatarEmoji: '🐕',
        dailyLimitTreats: 0,
        treatsGivenToday: 0,
        treatsRemaining: 0,
        percentOfLimit: 0,
        caloriesToday: {
          total: 0,
          fromFood: 0,
          fromTreats: 0,
          dailyCalorieTarget: 0,
        },
        statusLevel: 'unknown',
        lastTreat: null,
        history: [],
        resetsAt: null,
      },
    },
  };
}

function householdMutationErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Household action failed.'],
    }),
    success: false,
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    const { config } = await loadConfig(context);
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const result = await mutateHousehold(config, context, body);
      applyCacheProfile(res, 'household');
      return res.status(200).json(result);
    }
    const payload = await getHouseholdPayload(config, context);
    applyCacheProfile(res, 'household');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 500, req.method === 'POST' ? householdMutationErrorPayload() : householdReadErrorPayload());
  }
}

```

### MODIFIED `api/dashboard.js`

```js
import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { buildDashboardPayload } from '../lib/server/domains/dashboard/build.js';
import { createMeta, sendError } from '../lib/server/http.js';

function dashboardErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Dashboard payload is unavailable.'],
    }),
    hero: {
      status: 'warning',
      eyebrow: 'Home',
      headline: 'Dashboard unavailable',
      supportingText: 'HomeHub could not load the household summary.',
      actions: [{ label: 'Open Settings', route: '#/settings' }],
    },
    modules: {
      environment: {
        status: 'warning',
        headline: 'Weather unavailable',
        supportingText: 'Environment data could not be loaded.',
        weather: {
          temp: null,
          high: null,
          low: null,
          condition: 'Unavailable',
          icon: '·',
        },
        risk: {
          level: 0,
          headline: 'Weather unavailable',
          summary: 'Environment data could not be loaded.',
          timeWindow: null,
        },
        activeAlertCount: 0,
        ticker: 'Environment unavailable',
      },
      agenda: {
        status: 'empty',
        headline: 'Agenda unavailable',
        supportingText: 'Calendar data could not be loaded.',
        items: [],
        sections: {
          today: 0,
          tomorrow: 0,
          upcoming: 0,
        },
      },
      household: {
        status: 'warning',
        headline: 'Household unavailable',
        supportingText: 'Chore and treat data could not be loaded.',
      },
      media: {
        status: 'normal',
        headline: 'Nothing playing right now',
        supportingText: 'Media data could not be loaded.',
      },
      photos: {
        status: 'warning',
        headline: 'Photo queue unavailable',
        supportingText: 'Photos data could not be loaded.',
      },
    },
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    const { config } = await loadConfig(context);
    const payload = await buildDashboardPayload(config, context, req);
    applyCacheProfile(res, 'dashboard');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 500, dashboardErrorPayload());
  }
}

```

### MODIFIED `api/standby.js`

```js
import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { buildStandbyPayload } from '../lib/server/domains/standby/build.js';
import { createMeta, sendError } from '../lib/server/http.js';

function standbyErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Standby payload is unavailable.'],
    }),
    ambientState: 'day',
    urgentOverride: false,
    backgroundPhoto: {
      id: 'fallback-1',
      url: '/fallback/photos/family-1.svg',
      credit: 'HomeHub fallback',
    },
    primaryAlert: null,
    widgets: {
      agenda: {
        headline: 'Agenda unavailable',
        supportingText: 'Calendar data could not be loaded.',
      },
      household: {
        headline: 'Household unavailable',
        supportingText: 'Household data could not be loaded.',
      },
      weather: {
        headline: '--° ·',
        supportingText: 'Weather data unavailable.',
      },
      media: {
        headline: 'Nothing playing right now',
        supportingText: 'Media data unavailable.',
      },
    },
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    const { config } = await loadConfig(context);
    const payload = await buildStandbyPayload(config, context, req);
    applyCacheProfile(res, 'standby');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 500, standbyErrorPayload());
  }
}

```

### MODIFIED `api/admin.js`

```js
import { getRequestContext, requireAdmin } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { buildAdminDiagnostics, runAdminAction } from '../lib/server/domains/admin/diagnostics.js';
import { createMeta, parseJsonBody, sendError } from '../lib/server/http.js';

function adminReadErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Admin payload is unavailable.'],
    }),
    system: {},
    recentActions: [],
    availableActions: [],
    mockSupport: [],
  };
}

function adminMutationErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Admin action failed.'],
    }),
    success: false,
    message: 'Admin action failed.',
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    requireAdmin(context, req);
    const { config } = await loadConfig(context);
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const result = await runAdminAction(body.action);
      applyCacheProfile(res, 'admin');
      return res.status(200).json(result);
    }
    const payload = await buildAdminDiagnostics(config, context, req);
    applyCacheProfile(res, 'admin');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 500, req.method === 'POST' ? adminMutationErrorPayload() : adminReadErrorPayload());
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
import { restMutate } from '../lib/server/supabase.js';

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
    });
  } catch (error) {
    return sendError(res, error, 500, {
      config: null,
      integrations: [],
      systemHealth: [],
    });
  }
}

```

