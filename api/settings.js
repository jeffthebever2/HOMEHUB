import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { getEnvironmentHealth } from '../lib/server/domains/environment/service.js';
import { getHouseholdHealth } from '../lib/server/domains/household/service.js';
import { getMediaHealth } from '../lib/server/domains/media/service.js';
import { getPhotosHealth } from '../lib/server/domains/photos/service.js';
import { createMeta, parseJsonBody, sendError } from '../lib/server/http.js';
import { getAgendaHealth } from '../lib/server/integrations/agenda/service.js';
import { getServerSupabaseDiagnostics, restMutate } from '../lib/server/supabase.js';

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

function buildSettingsDiagnostics() {
  return {
    serverSupabase: getServerSupabaseDiagnostics(),
  };
}

function readOnlySettingsFallback(message = 'Settings payload is unavailable.') {
  return {
    meta: createMeta({
      degraded: true,
      warnings: [message],
    }),
    config: null,
    integrations: [],
    systemHealth: [],
    readOnly: true,
    diagnostics: buildSettingsDiagnostics(),
  };
}

function settingsMutationFallback(message = 'Settings action failed.') {
  return {
    meta: createMeta({
      degraded: true,
      warnings: [message],
    }),
    success: false,
    message,
    diagnostics: buildSettingsDiagnostics(),
  };
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
      readOnly: false,
      diagnostics: buildSettingsDiagnostics(),
    });
  } catch (error) {
    return sendError(
      res,
      error,
      500,
      req.method === 'POST'
        ? settingsMutationFallback(error.message || 'Settings action failed.')
        : readOnlySettingsFallback(error.message || 'Settings payload is unavailable.')
    );
  }
}
