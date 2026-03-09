import { apiFetch } from '../../core/api.js';
import { bindRouteButtons, escapeHtml, formatDateTime } from '../../core/format.js';
import { store } from '../../core/store.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { errorState, loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';

function renderIntegrationRows(items) {
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
        ${items.map((item) => `
          <tr>
            <td>${escapeHtml(item.displayName || item.providerId)}</td>
            <td>${escapeHtml(item.category || 'system')}</td>
            <td><span class="hh-badge hh-badge-${item.authState === 'connected' || item.healthStatus === 'healthy' ? 'success' : item.healthStatus === 'degraded' ? 'warning' : 'offline'}">${escapeHtml(item.authState || item.healthStatus || (item.enabled ? 'enabled' : 'disabled'))}</span></td>
            <td>${escapeHtml((item.warnings && item.warnings[0]) || (item.enabled ? 'Ready' : 'Not configured'))}</td>
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

export async function renderSettingsPage(container) {
  async function load() {
    container.innerHTML = loadingState('Loading settings…');
    try {
      const payload = await apiFetch('/api/settings');
      const config = payload.config;
      const isAdmin = store.membership?.role === 'admin' || Boolean(sessionStorage.getItem('hh_admin_token'));
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
        <div class="hh-grid">
          <section class="hh-card hh-col-8">
            <div class="hh-stack">
              <div class="hh-page-kicker">Core config</div>
              <form id="hh-settings-form" class="hh-form-grid">
                <div class="hh-field">
                  <label class="hh-field-label" for="hh-location-name">Location name</label>
                  <input id="hh-location-name" class="hh-input" name="locationName" value="${escapeHtml(config.environment.locationName)}">
                </div>
                <div class="hh-field">
                  <label class="hh-field-label" for="hh-standby-timeout">Standby timeout (min)</label>
                  <input id="hh-standby-timeout" class="hh-input" name="standbyTimeoutMin" type="number" min="1" value="${escapeHtml(String(config.system.standbyTimeoutMin))}">
                </div>
                <div class="hh-field">
                  <label class="hh-field-label" for="hh-location-lat">Latitude</label>
                  <input id="hh-location-lat" class="hh-input" name="lat" type="number" step="any" value="${escapeHtml(String(config.environment.lat))}">
                </div>
                <div class="hh-field">
                  <label class="hh-field-label" for="hh-location-lon">Longitude</label>
                  <input id="hh-location-lon" class="hh-input" name="lon" type="number" step="any" value="${escapeHtml(String(config.environment.lon))}">
                </div>
                <div class="hh-field">
                  <label class="hh-field-label" for="hh-quiet-start">Quiet hours start</label>
                  <input id="hh-quiet-start" class="hh-input" name="quietHoursStart" type="time" value="${escapeHtml(config.system.quietHoursStart)}">
                </div>
                <div class="hh-field">
                  <label class="hh-field-label" for="hh-quiet-end">Quiet hours end</label>
                  <input id="hh-quiet-end" class="hh-input" name="quietHoursEnd" type="time" value="${escapeHtml(config.system.quietHoursEnd)}">
                </div>
                <div class="hh-field">
                  <label class="hh-field-label" for="hh-google-album">Google Photos album ID</label>
                  <input id="hh-google-album" class="hh-input" name="googleAlbumId" value="${escapeHtml(config.photos.googleAlbumId || '')}">
                </div>
                <div class="hh-field">
                  <label class="hh-field-label" for="hh-primary-photos">Primary photo source</label>
                  <select id="hh-primary-photos" class="hh-select" name="primaryPhotoSource">
                    ${['google_photos', 'immich', 'imgur', 'local_fallback'].map((option) => `
                      <option value="${option}" ${config.photos.sourcePriority[0] === option ? 'selected' : ''}>${option.replace(/_/g, ' ')}</option>
                    `).join('')}
                  </select>
                </div>
                <div class="hh-field">
                  <label class="hh-field-label" for="hh-imgur-album">Imgur album ID</label>
                  <input id="hh-imgur-album" class="hh-input" name="imgurAlbumId" value="${escapeHtml(config.photos.imgurAlbumId || '')}">
                </div>
                <div class="hh-field">
                  <label class="hh-field-label" for="hh-immich-base">Immich base URL</label>
                  <input id="hh-immich-base" class="hh-input" name="immichBaseUrl" value="${escapeHtml(config.photos.immichBaseUrl || '')}">
                </div>
                <div class="hh-field">
                  <label class="hh-field-label" for="hh-immich-album">Immich album ID</label>
                  <input id="hh-immich-album" class="hh-input" name="immichAlbumId" value="${escapeHtml(config.photos.immichAlbumId || '')}">
                </div>
                <div class="hh-field hh-field-span-2">
                  <label class="hh-field-label" for="hh-calendars">Selected calendars (comma separated)</label>
                  <input id="hh-calendars" class="hh-input" name="selectedCalendars" value="${escapeHtml((config.agenda.selectedCalendars || []).join(', '))}">
                </div>
                <div class="hh-field hh-field-span-2">
                  <button class="hh-btn hh-btn-primary" type="submit">Save settings</button>
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
                  ${(payload.integrations || []).map((integration) => `
                    <button class="hh-btn hh-btn-secondary" data-test-provider="${escapeHtml(integration.providerId)}">Test ${escapeHtml(integration.displayName || integration.providerId)}</button>
                  `).join('')}
                </div>
              </div>
              ${renderIntegrationRows(payload.integrations || [])}
            </div>
          </section>
        </div>
      `;
      bindRouteButtons(container);
      container.querySelector('#hh-settings-refresh')?.addEventListener('click', async () => {
        pushToast('Refreshing settings…');
        await load();
      });
      container.querySelector('#hh-settings-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const nextConfig = structuredClone(config);
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
        await apiFetch('/api/settings', {
          method: 'POST',
          body: {
            action: 'save_config',
            payload: nextConfig,
          },
        });
        window.dispatchEvent(new CustomEvent('homehub:config-updated', { detail: { config: nextConfig } }));
        pushToast('Settings saved.');
        await load();
      });
      container.querySelectorAll('[data-test-provider]').forEach((button) => {
        button.addEventListener('click', async () => {
          const providerId = button.dataset.testProvider;
          const result = await apiFetch('/api/settings', {
            method: 'POST',
            body: {
              action: 'test_integration',
              providerId,
            },
          });
          pushToast(result.message || `Tested ${providerId}`);
        });
      });
    } catch (error) {
      container.innerHTML = `
        ${pageHeader({ kicker: 'Settings', title: 'Settings & Integrations', subtitle: 'This section is temporarily unavailable.' })}
        ${errorState('Settings unavailable', error.message)}
      `;
    }
  }

  await load();
  return () => {};
}
