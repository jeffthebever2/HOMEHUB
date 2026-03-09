import { go } from './router.js';
import { signInWithGoogle, signOut } from './session.js';
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

  root.querySelector('#hh-signout-btn').addEventListener('click', () => signOut());
  root.querySelector('#hh-standby-btn').addEventListener('click', () => go('standby'));
}

export function renderLogin() {
  document.getElementById('hh-login').classList.remove('hh-hidden');
  document.getElementById('hh-shell').classList.add('hh-hidden');
  document.getElementById('hh-login').innerHTML = `
    <div class="hh-card hh-card-hero hh-login-card">
      <p class="hh-page-kicker">House OS</p>
      <h1 class="hh-page-title">Sign in to HomeHub</h1>
      <p class="hh-page-subtitle">One household dashboard for weather, chores, photos, media, and standby mode.</p>
      <div style="margin-top:1.5rem;display:flex;gap:.75rem;flex-wrap:wrap;">
        <button id="hh-google-login" class="hh-btn hh-btn-primary">Continue with Google</button>
      </div>
    </div>
  `;
  document.getElementById('hh-google-login').addEventListener('click', () => signInWithGoogle());
}

export function renderAppShell() {
  document.getElementById('hh-login').classList.add('hh-hidden');
  document.getElementById('hh-shell').classList.remove('hh-hidden');
  const meta = document.getElementById('hh-topbar-meta');
  const userName = store.session?.user?.user_metadata?.full_name || store.session?.user?.email || 'Family';
  meta.textContent = `${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${userName}`;
  const nav = document.getElementById('hh-nav');
  nav.innerHTML = NAV_ITEMS.map(([route, label]) => `
    <button class="hh-nav-pill ${store.route === route ? 'is-active' : ''}" data-route="${route}">${label}</button>
  `).join('');
  nav.querySelectorAll('[data-route]').forEach((button) => {
    button.addEventListener('click', () => go(button.dataset.route));
  });
}
