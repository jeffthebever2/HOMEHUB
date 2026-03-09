import { apiFetch } from '../../core/api.js';
import { escapeHtml, formatDate } from '../../core/format.js';
import { go } from '../../core/router.js';
import { loadingState } from '../../ui/state.js';

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
              <p class="hh-banner-title">${escapeHtml(payload.primaryAlert.type)}</p>
              <p class="hh-banner-subtitle">${escapeHtml(payload.primaryAlert.summary)}</p>
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
  let clockTimer = null;
  let pollTimer = null;
  let jitterTimer = null;

  async function load() {
    container.innerHTML = loadingState('Loading standby…');
    const payload = await apiFetch('/api/standby');
    container.innerHTML = renderStandby(payload);
    updateClock();
    jitterHud();
    container.querySelector('#hh-standby-exit')?.addEventListener('click', () => go('home'));
  }

  async function handleKey(event) {
    if (event.key === 'Escape') go('home');
  }

  await load();
  clockTimer = window.setInterval(updateClock, 1000);
  pollTimer = window.setInterval(load, 60000);
  jitterTimer = window.setInterval(jitterHud, 60000);
  window.addEventListener('keydown', handleKey);
  return () => {
    window.clearInterval(clockTimer);
    window.clearInterval(pollTimer);
    window.clearInterval(jitterTimer);
    window.removeEventListener('keydown', handleKey);
  };
}
