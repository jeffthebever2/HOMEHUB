import { getEnvironmentPayload } from '../environment/service.js';
import { getAgendaPayload } from '../../integrations/agenda/service.js';
import { getHouseholdPayload } from '../household/service.js';
import { getMediaPayload } from '../media/service.js';
import { getPhotosPayload } from '../photos/service.js';

function pickHero(environment, household, agenda) {
  if (environment.summary.risk.level >= 4) {
    return {
      status: environment.summary.status,
      eyebrow: 'Immediate attention',
      headline: environment.summary.headline,
      supportingText: environment.summary.supportingText,
      actions: [{ label: 'Open Alerts', route: '#/alerts' }],
    };
  }
  if (household.summary.chores.overdueCount > 0) {
    return {
      status: 'warning',
      eyebrow: 'Household pulse',
      headline: `${household.summary.chores.overdueCount} overdue chore${household.summary.chores.overdueCount === 1 ? '' : 's'}`,
      supportingText: household.summary.supportingText,
      actions: [{ label: 'Open Household', route: '#/household' }],
    };
  }
  return {
    status: 'success',
    eyebrow: 'Today',
    headline: agenda.headline || 'Everything looks calm',
    supportingText: agenda.supportingText || environment.summary.supportingText,
    actions: [{ label: 'Open Weather', route: '#/weather' }],
  };
}

export async function buildDashboardPayload(config, context, req) {
  const [environment, agenda, household, media, photos] = await Promise.all([
    getEnvironmentPayload(config, { mockScenario: req.headers['x-homehub-mock'] }),
    getAgendaPayload(config, context),
    getHouseholdPayload(config, context),
    getMediaPayload(config, req),
    getPhotosPayload(config, { mockScenario: req.headers['x-homehub-mock'] }),
  ]);

  const hero = pickHero(environment, household, agenda);
  return {
    meta: {
      schemaVersion: 1,
      fetchedAt: new Date().toISOString(),
      degradedModules: [
        environment.meta.degraded ? 'environment' : null,
        household.meta.degraded ? 'household' : null,
        photos.meta.degraded ? 'photos' : null,
      ].filter(Boolean),
      stale: environment.meta.stale || household.meta.stale || photos.meta.stale,
      degraded: environment.meta.degraded || household.meta.degraded || photos.meta.degraded,
      isMock: environment.meta.isMock || photos.meta.isMock,
      warnings: [...environment.meta.warnings, ...household.meta.warnings, ...photos.meta.warnings],
    },
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
