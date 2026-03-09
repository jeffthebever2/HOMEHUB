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
