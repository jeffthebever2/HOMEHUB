import { createMeta } from '../../http.js';
import { getAgendaPayload } from '../../integrations/agenda/service.js';
import { isQuietHours } from '../../time.js';
import { getEnvironmentPayload } from '../environment/service.js';
import { getHouseholdPayload } from '../household/service.js';
import { getMediaPayload } from '../media/service.js';
import { getPhotosPayload } from '../photos/service.js';

function fallbackEnvironment() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Environment standby widget is unavailable.'] }),
    summary: {
      weather: {
        temp: null,
        high: null,
        low: null,
        condition: 'Unavailable',
        icon: '·',
      },
    },
    detail: {
      alerts: {
        active: [],
      },
    },
  };
}

function fallbackAgenda() {
  return {
    headline: 'Agenda unavailable',
    supportingText: 'Calendar data could not be loaded.',
  };
}

function fallbackHousehold() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Household standby widget is unavailable.'] }),
    summary: {
      headline: 'Household unavailable',
      supportingText: 'Chore and treat data could not be loaded.',
    },
  };
}

function fallbackMedia() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Media standby widget is unavailable.'] }),
    summary: {
      headline: 'Nothing playing right now',
      supportingText: 'Open Media to start playback.',
    },
  };
}

function fallbackPhotos() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Standby photo is unavailable.'] }),
    detail: {
      currentPhoto: {
        id: 'fallback-1',
        url: '/fallback/photos/family-1.svg',
        credit: 'HomeHub fallback',
      },
    },
  };
}

function safeValue(result, fallbackFactory) {
  return result.status === 'fulfilled' ? result.value : fallbackFactory();
}

function formatDegree(value) {
  return value == null ? '--' : String(value);
}

export async function buildStandbyPayload(config, context, req) {
  const [environmentResult, agendaResult, householdResult, mediaResult, photosResult] = await Promise.allSettled([
    getEnvironmentPayload(config, { mockScenario: req.headers['x-homehub-mock'] }),
    getAgendaPayload(config, context),
    getHouseholdPayload(config, context),
    getMediaPayload(config, req),
    getPhotosPayload(config, { mockScenario: req.headers['x-homehub-mock'] }),
  ]);

  const environment = safeValue(environmentResult, fallbackEnvironment);
  const agenda = safeValue(agendaResult, fallbackAgenda);
  const household = safeValue(householdResult, fallbackHousehold);
  const media = safeValue(mediaResult, fallbackMedia);
  const photos = safeValue(photosResult, fallbackPhotos);
  const topAlert = environment.detail?.alerts?.active?.[0] || null;
  const warnings = [
    ...(environment.meta?.warnings || []),
    ...(agenda.warnings || []),
    ...(household.meta?.warnings || []),
    ...(media.meta?.warnings || []),
    ...(photos.meta?.warnings || []),
  ];

  if (agendaResult.status === 'rejected') {
    warnings.push(agendaResult.reason?.message || 'Agenda standby widget is unavailable.');
  }

  return {
    meta: createMeta({
      stale: Boolean(environment.meta?.stale || photos.meta?.stale),
      degraded: Boolean(
        environment.meta?.degraded
        || (agenda.warnings || []).length
        || household.meta?.degraded
        || media.meta?.degraded
        || photos.meta?.degraded
        || agendaResult.status === 'rejected'
      ),
      isMock: Boolean(environment.meta?.isMock || photos.meta?.isMock),
      warnings,
    }),
    ambientState: isQuietHours(config) ? 'night' : 'day',
    urgentOverride: Boolean(topAlert && topAlert.severityLevel >= 4),
    backgroundPhoto: photos.detail?.currentPhoto || fallbackPhotos().detail.currentPhoto,
    primaryAlert: topAlert,
    widgets: {
      agenda: {
        headline: agenda.headline || 'No upcoming events',
        supportingText: agenda.supportingText || 'Nothing scheduled soon.',
      },
      household: {
        headline: household.summary?.headline || 'Household unavailable',
        supportingText: household.summary?.supportingText || 'Household status is temporarily unavailable.',
      },
      weather: {
        headline: `${formatDegree(environment.summary?.weather?.temp)}° ${environment.summary?.weather?.icon || '·'}`,
        supportingText: `${formatDegree(environment.summary?.weather?.high)}° / ${formatDegree(environment.summary?.weather?.low)}° · ${environment.summary?.weather?.condition || 'Unavailable'}`,
      },
      media: {
        headline: media.summary?.headline || 'Nothing playing right now',
        supportingText: media.summary?.supportingText || 'Open Media to start playback.',
      },
    },
  };
}
