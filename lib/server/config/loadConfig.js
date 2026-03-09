import { getDefaultConfig } from './defaults.js';
import { buildIntegrationRegistry } from './registry.js';
import { restSelect } from '../supabase.js';

function merge(target, source) {
  const output = { ...target };
  for (const key of Object.keys(source || {})) {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = merge(target[key] || {}, value);
    } else if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

function mapUserSettingsRow(row) {
  if (!row) return {};
  return {
    environment: {
      locationName: row.location_name || undefined,
      lat: row.location_lat != null ? Number(row.location_lat) : undefined,
      lon: row.location_lon != null ? Number(row.location_lon) : undefined,
    },
    system: {
      standbyTimeoutMin: row.standby_timeout_min != null ? Number(row.standby_timeout_min) : undefined,
      quietHoursStart: row.quiet_hours_start || undefined,
      quietHoursEnd: row.quiet_hours_end || undefined,
    },
    photos: {
      immichBaseUrl: row.immich_base_url || undefined,
      immichAlbumId: row.immich_album_id || undefined,
      imgurAlbumId: row.imgur_album_id || undefined,
      googleAlbumId: row.google_photos_album_id || undefined,
      sourcePriority: row.photo_provider ? [row.photo_provider, 'google_photos', 'immich', 'imgur', 'local_fallback'] : undefined,
    },
    agenda: {
      selectedCalendars: Array.isArray(row.selected_calendars) && row.selected_calendars.length
        ? row.selected_calendars
        : undefined,
    },
  };
}

export async function loadConfig(context) {
  const defaults = getDefaultConfig();
  if (!context?.user?.id) {
    return {
      config: defaults,
      integrations: buildIntegrationRegistry(defaults),
    };
  }

  let row = null;
  try {
    const results = await restSelect(
      'user_settings',
      `select=*&user_id=eq.${context.user.id}&limit=1`
    );
    row = results?.[0] || null;
  } catch {
    row = null;
  }

  const config = merge(defaults, mapUserSettingsRow(row));
  return {
    config,
    rawSettings: row,
    integrations: buildIntegrationRegistry(config),
  };
}
