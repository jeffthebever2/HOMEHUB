import { createMeta } from '../../http.js';
import { clearSnapshots } from '../../cache/snapshots.js';
import { getAgendaHealth } from '../../integrations/agenda/service.js';
import { getEnvironmentHealth } from '../environment/service.js';
import { getHouseholdHealth } from '../household/service.js';
import { getMediaHealth } from '../media/service.js';
import { getPhotosHealth } from '../photos/service.js';

const recentActions = [];

function healthFallback(error, source) {
  return {
    status: 'error',
    source,
    errorState: error?.message || 'Health check failed',
    warnings: [error?.message || 'Health check failed'],
  };
}

export async function buildAdminDiagnostics(config, context, req) {
  const [environment, household, media, photos] = await Promise.allSettled([
    getEnvironmentHealth(config),
    getHouseholdHealth(config, context),
    getMediaHealth(config, req),
    getPhotosHealth(config),
  ]);
  const agenda = getAgendaHealth(context);

  const system = {
    environment: environment.status === 'fulfilled' ? environment.value : healthFallback(environment.reason, 'open-meteo + nws'),
    household: household.status === 'fulfilled' ? household.value : healthFallback(household.reason, 'household'),
    media: media.status === 'fulfilled' ? media.value : healthFallback(media.reason, 'media'),
    photos: photos.status === 'fulfilled' ? photos.value : healthFallback(photos.reason, 'photos'),
    agenda,
  };

  const degraded = Object.values(system).some((entry) => {
    const state = entry.status || entry.healthStatus || entry.authState;
    return state !== 'healthy' && state !== 'connected';
  });
  const warnings = Object.values(system).flatMap((entry) => entry.warnings || []);

  return {
    meta: createMeta({
      degraded,
      warnings,
    }),
    system,
    recentActions,
    availableActions: [
      { action: 'CLEAR_SNAPSHOTS', dangerous: false },
    ],
    mockSupport: [
      'TORNADO_5',
      'PHOTOS_AUTH_EXPIRED',
    ],
  };
}

export function recordAdminAction(action, status, message) {
  recentActions.unshift({
    time: new Date().toISOString(),
    action,
    status,
    message,
  });
  recentActions.splice(10);
}

export async function runAdminAction(action) {
  if (action === 'CLEAR_SNAPSHOTS') {
    clearSnapshots();
    recordAdminAction(action, 'success', 'Cleared in-memory snapshots');
    return { meta: createMeta(), success: true, message: 'Cleared in-memory snapshots.' };
  }
  throw new Error(`Unknown admin action: ${action}`);
}
