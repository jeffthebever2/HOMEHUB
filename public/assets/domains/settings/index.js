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
