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
