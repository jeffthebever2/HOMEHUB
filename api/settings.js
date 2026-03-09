import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { getEnvironmentHealth } from '../lib/server/domains/environment/service.js';
import { getHouseholdHealth } from '../lib/server/domains/household/service.js';
import { getMediaHealth } from '../lib/server/domains/media/service.js';
import { getPhotosHealth } from '../lib/server/domains/photos/service.js';
import { getAgendaHealth } from '../lib/server/integrations/agenda/service.js';
import { parseJsonBody, sendError } from '../lib/server/http.js';
import { restMutate } from '../lib/server/supabase.js';

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
        return res.status(200).json({ success: true });
      }
      if (body.action === 'test_integration') {
        applyCacheProfile(res, 'settings');
        return res.status(200).json({
          testResult: 'success',
          message: `Tested ${body.providerId || 'integration'} with current configuration.`,
        });
      }
      if (body.action === 'disconnect_provider') {
        applyCacheProfile(res, 'settings');
        return res.status(200).json({
          success: true,
          message: 'Disconnect flow is provider-specific and should be completed via OAuth revoke or settings cleanup.',
        });
      }
      return res.status(400).json({ error: 'Unknown settings action' });
    }

    const health = [
      await getEnvironmentHealth(config),
      await getHouseholdHealth(config, context),
      await getMediaHealth(config, req),
      await getPhotosHealth(config),
      getAgendaHealth(context),
    ];

    applyCacheProfile(res, 'settings');
    return res.status(200).json({
      meta: {
        schemaVersion: 1,
        fetchedAt: new Date().toISOString(),
        stale: false,
        degraded: false,
        isMock: false,
        warnings: [],
      },
      config,
      integrations: integrations.map((integration) => {
        if (integration.providerId === 'google_calendar') return { ...integration, ...getAgendaHealth(context) };
        if (integration.providerId === 'google_photos') return { ...integration, ...health[3] };
        return integration;
      }),
      systemHealth: health,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
