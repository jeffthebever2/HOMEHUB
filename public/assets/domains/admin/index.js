import { apiFetch } from '../../core/api.js';
import { escapeHtml, formatDateTime } from '../../core/format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { errorState, loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';

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

export async function renderAdminPage(container) {
  async function load(errorMessage = '') {
    container.innerHTML = loadingState('Loading admin…');
    try {
      const payload = await apiFetch('/api/admin');
      container.innerHTML = `
        ${pageHeader({
          kicker: 'Admin',
          title: 'Control Panel',
          subtitle: `Updated ${formatDateTime(payload.meta.fetchedAt)}`,
          actions: '<button id="hh-admin-refresh" class="hh-btn hh-btn-secondary">Refresh</button>',
        })}
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
                  ${Object.entries(payload.system || {}).map(([key, value]) => `
                    <tr>
                      <td>${escapeHtml(key)}</td>
                      <td><span class="hh-badge hh-badge-${value.status === 'healthy' ? 'success' : value.status === 'degraded' ? 'warning' : 'offline'}">${escapeHtml(value.status || 'unknown')}</span></td>
                      <td>${escapeHtml(value.errorState || value.warnings?.[0] || JSON.stringify(value).slice(0, 90))}</td>
                    </tr>
                  `).join('')}
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
                <div class="hh-kv-row"><span>Current mock</span><strong>${escapeHtml(sessionStorage.getItem('hh_mock') || 'none')}</strong></div>
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
                ${(payload.recentActions || []).length ? payload.recentActions.map((action) => `
                  <div class="hh-list-row">
                    <div class="hh-row-meta">
                      <div class="hh-row-title">${escapeHtml(action.action)}</div>
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
        await load();
      });
      container.querySelectorAll('[data-mock]').forEach((button) => {
        button.addEventListener('click', async () => {
          sessionStorage.setItem('hh_mock', button.dataset.mock);
          pushToast(`Mock enabled: ${button.dataset.mock}`);
          await load();
        });
      });
      container.querySelector('#hh-clear-mock')?.addEventListener('click', async () => {
        sessionStorage.removeItem('hh_mock');
        pushToast('Mock cleared.');
        await load();
      });
      container.querySelectorAll('[data-admin-action]').forEach((button) => {
        button.addEventListener('click', async () => {
          const action = button.dataset.adminAction;
          const result = await apiFetch('/api/admin', {
            method: 'POST',
            body: { action },
          });
          pushToast(result.message || `${action} complete`);
          await load();
        });
      });
    } catch (error) {
      if (error.status === 403) {
        container.innerHTML = `
          ${pageHeader({ kicker: 'Admin', title: 'Control Panel', subtitle: 'Admin auth is required for diagnostics, mocks, and dangerous actions.' })}
          ${renderAdminAccess(error.message)}
        `;
        container.querySelector('#hh-admin-token-form')?.addEventListener('submit', (event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          sessionStorage.setItem('hh_admin_token', String(formData.get('adminToken') || '').trim());
          pushToast('Admin token saved for this session.');
          load();
        });
        container.querySelector('#hh-clear-admin-token')?.addEventListener('click', () => {
          sessionStorage.removeItem('hh_admin_token');
          pushToast('Admin token cleared.');
          load();
        });
        return;
      }
      container.innerHTML = `
        ${pageHeader({ kicker: 'Admin', title: 'Control Panel', subtitle: 'This section is temporarily unavailable.' })}
        ${errorState('Admin unavailable', error.message)}
      `;
    }
  }

  await load();
  return () => {};
}
