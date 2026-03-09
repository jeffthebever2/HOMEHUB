import { createMeta } from '../../http.js';
import { getAgendaPayload } from '../../integrations/agenda/service.js';
import { getEnvironmentPayload } from '../environment/service.js';
import { getHouseholdPayload } from '../household/service.js';
import { getMediaPayload } from '../media/service.js';
import { getPhotosPayload } from '../photos/service.js';

function fallbackEnvironmentModule() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Environment summary is unavailable.'] }),
    summary: {
      status: 'warning',
      headline: 'Weather unavailable',
      supportingText: 'HomeHub could not load the weather summary.',
      badges: ['weather degraded'],
      cta: { label: 'Open Weather', route: '#/weather' },
      weather: {
        temp: null,
        high: null,
        low: null,
        condition: 'Unavailable',
        icon: '·',
      },
      risk: {
        level: 0,
        headline: 'Weather unavailable',
        summary: 'Forecast data is temporarily unavailable.',
        timeWindow: null,
      },
      activeAlertCount: 0,
      ticker: 'Weather unavailable',
    },
  };
}

function fallbackAgendaModule() {
  return {
    status: 'disconnected',
    headline: 'Agenda unavailable',
    supportingText: 'Calendar data could not be loaded.',
    items: [],
    sections: {
      today: 0,
      tomorrow: 0,
      upcoming: 0,
    },
  };
}

function fallbackHouseholdModule() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Household summary is unavailable.'] }),
    summary: {
      status: 'warning',
      headline: 'Household summary unavailable',
      supportingText: 'HomeHub could not load chore and treat status.',
      badges: ['household degraded'],
      cta: { label: 'Open Household', route: '#/household' },
      chores: {
        dueToday: 0,
        completedToday: 0,
        overdueCount: 0,
        progressPercent: 0,
      },
      treats: {
        petName: 'Pet',
        statusLevel: 'unknown',
        treatsRemaining: 0,
      },
    },
  };
}

function fallbackMediaModule() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Media summary is unavailable.'] }),
    summary: {
      status: 'normal',
      headline: 'Nothing playing right now',
      supportingText: 'Open Media to start music or radio.',
      badges: ['idle'],
      cta: { label: 'Open Media', route: '#/media' },
      nowPlaying: {
        state: 'idle',
        sourceType: null,
        title: null,
        subtitle: null,
        startedAt: null,
      },
    },
  };
}

function fallbackPhotosModule() {
  return {
    meta: createMeta({ degraded: true, warnings: ['Photos summary is unavailable.'] }),
    summary: {
      status: 'warning',
      headline: 'Photo queue unavailable',
      supportingText: 'Built-in fallback photos may still be available in the Photos page.',
      badges: ['photos degraded'],
      cta: { label: 'Open Photos', route: '#/photos' },
    },
  };
}

function safeValue(result, fallbackFactory) {
  return result.status === 'fulfilled' ? result.value : fallbackFactory();
}

function pickHero(environment, household, agenda) {
  const riskLevel = Number(environment?.summary?.risk?.level || 0);
  const overdueCount = Number(household?.summary?.chores?.overdueCount || 0);
  if (riskLevel >= 4) {
    return {
      status: environment.summary.status,
      eyebrow: 'Immediate attention',
      headline: environment.summary.headline,
      supportingText: environment.summary.supportingText,
      actions: [{ label: 'Open Alerts', route: '#/alerts' }],
    };
  }
  if (overdueCount > 0) {
    return {
      status: 'warning',
      eyebrow: 'Household pulse',
      headline: `${overdueCount} overdue chore${overdueCount === 1 ? '' : 's'}`,
      supportingText: household.summary.supportingText,
      actions: [{ label: 'Open Household', route: '#/household' }],
    };
  }
  return {
    status: 'success',
    eyebrow: 'Today',
    headline: agenda.headline || 'Everything looks calm',
    supportingText: agenda.supportingText || environment.summary.supportingText || 'HomeHub is ready.',
    actions: [{ label: 'Open Weather', route: '#/weather' }],
  };
}

export async function buildDashboardPayload(config, context, req) {
  const [environmentResult, agendaResult, householdResult, mediaResult, photosResult] = await Promise.allSettled([
    getEnvironmentPayload(config, { mockScenario: req.headers['x-homehub-mock'] }),
    getAgendaPayload(config, context),
    getHouseholdPayload(config, context),
    getMediaPayload(config, req),
    getPhotosPayload(config, { mockScenario: req.headers['x-homehub-mock'] }),
  ]);

  const environment = safeValue(environmentResult, fallbackEnvironmentModule);
  const agenda = safeValue(agendaResult, fallbackAgendaModule);
  const household = safeValue(householdResult, fallbackHouseholdModule);
  const media = safeValue(mediaResult, fallbackMediaModule);
  const photos = safeValue(photosResult, fallbackPhotosModule);
  const hero = pickHero(environment, household, agenda);
  const warnings = [
    ...(environment.meta?.warnings || []),
    ...(agenda.warnings || []),
    ...(household.meta?.warnings || []),
    ...(photos.meta?.warnings || []),
  ];

  if (agendaResult.status === 'rejected') {
    warnings.push(agendaResult.reason?.message || 'Agenda summary is unavailable.');
  }
  if (mediaResult.status === 'rejected') {
    warnings.push(mediaResult.reason?.message || 'Media summary is unavailable.');
  }

  return {
    meta: createMeta({
      stale: Boolean(environment.meta?.stale || household.meta?.stale || photos.meta?.stale),
      degraded: Boolean(
        environment.meta?.degraded
        || household.meta?.degraded
        || photos.meta?.degraded
        || (agenda.warnings || []).length
        || agendaResult.status === 'rejected'
        || mediaResult.status === 'rejected'
      ),
      isMock: Boolean(environment.meta?.isMock || photos.meta?.isMock),
      warnings,
    }),
    hero,
    modules: {
      environment: environment.summary,
      agenda,
      household: household.summary,
      media: media.summary,
      photos: photos.summary,
    },
  };
}
