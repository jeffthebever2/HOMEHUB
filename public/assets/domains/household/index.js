import { apiFetch } from '../../core/api.js';
import { bindRouteButtons, escapeHtml, formatDateTime } from '../../core/format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { errorState, loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';

const TAB_KEY = 'hh_household_tab';

function renderChoreRows(items, actionLabel, complete) {
  if (!items.length) {
    return `
      <div class="hh-state">
        <p class="hh-state-title">Nothing here</p>
        <p class="hh-state-copy">This list is empty right now.</p>
      </div>
    `;
  }
  return `
    <div class="hh-list">
      ${items.map((item) => `
        <div class="hh-list-row">
          <div class="hh-row-meta">
            <div class="hh-row-title">${escapeHtml(item.title)}</div>
            <div class="hh-row-copy">${escapeHtml(item.badge)}${item.assignee ? ` · ${escapeHtml(item.assignee)}` : ''}</div>
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
  if (!items.length) {
    return `
      <div class="hh-state">
        <p class="hh-state-title">No treats logged today</p>
        <p class="hh-state-copy">Use the quick-add form when ${'your pet'} gets a treat.</p>
      </div>
    `;
  }
  return `
    <div class="hh-list">
      ${items.map((item) => `
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
    <div class="hh-grid">
      <section class="hh-card hh-card-hero hh-col-12">
        <div class="hh-stack">
          <div class="hh-pill-row">
            <span class="hh-badge hh-badge-${payload.summary.status === 'warning' ? 'warning' : payload.summary.status === 'info' ? 'info' : 'success'}">${escapeHtml(payload.summary.headline)}</span>
            <span class="hh-badge hh-badge-neutral">${escapeHtml(String(payload.summary.chores.progressPercent))}% complete</span>
          </div>
          <p class="hh-page-subtitle" style="margin:0;">${escapeHtml(payload.summary.supportingText)}</p>
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
            <div class="hh-kv-row"><span>Due today</span><strong>${escapeHtml(String(payload.summary.chores.dueToday))}</strong></div>
            <div class="hh-kv-row"><span>Completed</span><strong>${escapeHtml(String(payload.summary.chores.completedToday))}</strong></div>
            <div class="hh-kv-row"><span>Overdue</span><strong>${escapeHtml(String(payload.summary.chores.overdueCount))}</strong></div>
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
    <div class="hh-grid">
      <section class="hh-card hh-card-hero hh-col-12">
        <div class="hh-stack">
          <div class="hh-pill-row">
            <span class="hh-badge hh-badge-${statusClass}">${escapeHtml(treats.petName)}</span>
            <span class="hh-badge hh-badge-neutral">${escapeHtml(String(treats.treatsRemaining))} left today</span>
          </div>
          <div class="hh-metric-grid">
            <div class="hh-metric">
              <p class="hh-metric-label">Given today</p>
              <p class="hh-metric-value">${escapeHtml(String(treats.treatsGivenToday))}</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Remaining</p>
              <p class="hh-metric-value">${escapeHtml(String(treats.treatsRemaining))}</p>
            </div>
            <div class="hh-metric">
              <p class="hh-metric-label">Limit</p>
              <p class="hh-metric-value">${escapeHtml(String(treats.dailyLimitTreats))}</p>
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
          ${renderTreatHistory(treats.history || [])}
        </div>
      </section>
      <aside class="hh-card hh-col-4">
        <div class="hh-stack">
          <div class="hh-page-kicker">Quick add</div>
          <div class="hh-kv">
            <div class="hh-kv-row"><span>Status</span><strong>${escapeHtml(treats.statusLevel)}</strong></div>
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
            <button class="hh-btn hh-btn-primary" type="submit">${treats.treatsRemaining <= 0 ? 'Log override treat' : 'Log treat'}</button>
          </form>
        </div>
      </aside>
    </div>
  `;
}

export async function renderHouseholdPage(container) {
  let pollId = null;
  let activeTab = sessionStorage.getItem(TAB_KEY) || 'chores';

  async function load() {
    container.innerHTML = loadingState('Loading household…');
    try {
      const payload = await apiFetch('/api/household');
      container.innerHTML = `
        ${pageHeader({
          kicker: 'Household',
          title: activeTab === 'treats' ? 'Treat Tracker' : 'Chores',
          subtitle: `Updated ${formatDateTime(payload.meta.fetchedAt)}`,
          actions: '<button id="hh-household-refresh" class="hh-btn hh-btn-secondary">Refresh</button>',
        })}
        ${renderTabs(activeTab)}
        ${activeTab === 'treats' ? renderTreatsTab(payload) : renderChoresTab(payload)}
      `;
      bindRouteButtons(container);
      container.querySelectorAll('[data-tab]').forEach((button) => {
        button.addEventListener('click', () => {
          activeTab = button.dataset.tab;
          sessionStorage.setItem(TAB_KEY, activeTab);
          load();
        });
      });
      container.querySelector('#hh-household-refresh')?.addEventListener('click', async () => {
        pushToast('Refreshing household…');
        await load();
      });
      container.querySelectorAll('[data-action="toggle-chore"]').forEach((button) => {
        button.addEventListener('click', async () => {
          await apiFetch('/api/household', {
            method: 'POST',
            body: {
              action: 'toggle_chore',
              id: button.dataset.id,
              complete: button.dataset.complete === '1',
            },
          });
          pushToast('Chore updated.');
          await load();
        });
      });
      container.querySelectorAll('[data-action="delete-chore"]').forEach((button) => {
        button.addEventListener('click', async () => {
          await apiFetch('/api/household', {
            method: 'POST',
            body: {
              action: 'delete_chore',
              id: button.dataset.id,
            },
          });
          pushToast('Chore removed.');
          await load();
        });
      });
      container.querySelector('#hh-create-chore')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        await apiFetch('/api/household', {
          method: 'POST',
          body: {
            action: 'create_chore',
            title: formData.get('title'),
            category: formData.get('category'),
          },
        });
        pushToast('Chore added.');
        await load();
      });
      container.querySelector('#hh-log-treat')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        await apiFetch('/api/household', {
          method: 'POST',
          body: {
            action: 'log_treat',
            name: formData.get('name'),
            calories: Number(formData.get('calories') || 0),
          },
        });
        pushToast('Treat logged.');
        await load();
      });
    } catch (error) {
      container.innerHTML = `
        ${pageHeader({ kicker: 'Household', title: 'Household', subtitle: 'This section is temporarily unavailable.' })}
        ${errorState('Household unavailable', error.message)}
      `;
    }
  }

  await load();
  pollId = window.setInterval(load, 60000);
  return () => window.clearInterval(pollId);
}
