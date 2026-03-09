import { clearSnapshots } from '../../cache/snapshots.js';
import { getEnvironmentHealth } from '../environment/service.js';
import { getHouseholdHealth } from '../household/service.js';
import { getMediaHealth } from '../media/service.js';
import { getPhotosHealth } from '../photos/service.js';
import { getAgendaHealth } from '../../integrations/agenda/service.js';

const recentActions = [];

export async function buildAdminDiagnostics(config, context, req) {
  return {
    meta: {
      schemaVersion: 1,
      fetchedAt: new Date().toISOString(),
      stale: false,
      degraded: false,
      isMock: false,
      warnings: [],
    },
    system: {
      environment: await getEnvironmentHealth(config),
      household: await getHouseholdHealth(config, context),
      media: await getMediaHealth(config, req),
      photos: await getPhotosHealth(config),
      agenda: getAgendaHealth(context),
    },
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
    return { success: true, message: 'Cleared in-memory snapshots.' };
  }
  throw new Error(`Unknown admin action: ${action}`);
}
