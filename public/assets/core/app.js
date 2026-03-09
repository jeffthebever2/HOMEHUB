import { renderAdminPage } from '../domains/admin/index.js';
import { renderDashboardPage } from '../domains/dashboard/index.js';
import { renderEnvironmentPage } from '../domains/environment/index.js';
import { renderHouseholdPage } from '../domains/household/index.js';
import { renderMediaPage } from '../domains/media/index.js';
import { renderPhotosPage } from '../domains/photos/index.js';
import { renderSettingsPage } from '../domains/settings/index.js';
import { renderStandbyPage } from '../domains/standby/index.js';
import { loadingState } from '../ui/state.js';
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

function resetInactivityTimer() {
  window.clearTimeout(inactivityTimer);
  if (!store.session?.user || store.route === 'standby') return;
  inactivityTimer = window.setTimeout(() => {
    window.location.hash = '#/standby';
  }, runtimeConfig.standbyTimeoutMin * 60 * 1000);
}

function bindActivityWatchers() {
  ['mousemove', 'touchstart', 'click', 'keydown'].forEach((eventName) => {
    window.addEventListener(eventName, resetInactivityTimer, { passive: true });
  });
}

async function loadRuntimeConfig() {
  if (!store.session?.user) return;
  try {
    const payload = await apiFetch('/api/settings');
    runtimeConfig.standbyTimeoutMin = payload.config?.system?.standbyTimeoutMin || runtimeConfig.standbyTimeoutMin;
  } catch {
    runtimeConfig.standbyTimeoutMin = runtimeConfig.standbyTimeoutMin || 5;
  }
  resetInactivityTimer();
}

async function renderCurrentRoute() {
  const container = document.getElementById('hh-page-content');
  const route = getRoute();
  const renderer = renderers[route] || renderers.home;

  document.body.classList.toggle('hh-standby-active', route === 'standby');
  renderAppShell();

  if (cleanupPage) {
    cleanupPage();
    cleanupPage = null;
  }

  container.innerHTML = loadingState('Loading HomeHub…');
  const currentVersion = ++renderVersion;
  const nextCleanup = await renderer(container);
  if (currentVersion !== renderVersion) {
    nextCleanup?.();
    return;
  }
  cleanupPage = nextCleanup || null;
  resetInactivityTimer();
}

async function renderApp() {
  if (!store.session?.user) {
    document.body.classList.remove('hh-standby-active');
    if (cleanupPage) {
      cleanupPage();
      cleanupPage = null;
    }
    renderLogin();
    return;
  }
  await renderCurrentRoute();
}

async function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;
  const root = document.getElementById('app');
  renderShell(root);
  document.getElementById('hh-login').innerHTML = loadingState('Checking session…');
  initRouter(() => {
    if (store.session?.user) {
      renderCurrentRoute().catch((error) => {
        document.getElementById('hh-page-content').innerHTML = `<div class="hh-card hh-card-danger"><div class="hh-state"><p class="hh-state-title">Render failed</p><p class="hh-state-copy">${error.message}</p></div></div>`;
      });
    }
  });
  await initSession();
  await loadRuntimeConfig();
  await renderApp();
  bindActivityWatchers();
  window.addEventListener('homehub:session-changed', async () => {
    await loadRuntimeConfig();
    await renderApp();
  });
  window.addEventListener('homehub:config-updated', (event) => {
    runtimeConfig.standbyTimeoutMin = event.detail?.config?.system?.standbyTimeoutMin || runtimeConfig.standbyTimeoutMin;
    resetInactivityTimer();
  });
}

bootstrap().catch((error) => {
  const root = document.getElementById('app');
  if (root) {
    root.innerHTML = `<div class="hh-login"><div class="hh-card hh-card-danger"><div class="hh-state"><p class="hh-state-title">HomeHub failed to start</p><p class="hh-state-copy">${error.message}</p></div></div></div>`;
  }
});
