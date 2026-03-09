import { getEnvironmentPayload } from '../environment/service.js';
import { getAgendaPayload } from '../../integrations/agenda/service.js';
import { getHouseholdPayload } from '../household/service.js';
import { getMediaPayload } from '../media/service.js';
import { getPhotosPayload } from '../photos/service.js';
import { isQuietHours } from '../../time.js';

export async function buildStandbyPayload(config, context, req) {
  const [environment, agenda, household, media, photos] = await Promise.all([
    getEnvironmentPayload(config, { mockScenario: req.headers['x-homehub-mock'] }),
    getAgendaPayload(config, context),
    getHouseholdPayload(config, context),
    getMediaPayload(config, req),
    getPhotosPayload(config, { mockScenario: req.headers['x-homehub-mock'] }),
  ]);

  const topAlert = environment.detail.alerts.active[0] || null;
  return {
    meta: {
      schemaVersion: 1,
      fetchedAt: new Date().toISOString(),
      stale: environment.meta.stale || photos.meta.stale,
      degraded: environment.meta.degraded || photos.meta.degraded,
      isMock: environment.meta.isMock || photos.meta.isMock,
      warnings: [...environment.meta.warnings, ...photos.meta.warnings],
    },
    ambientState: isQuietHours(config) ? 'night' : 'day',
    urgentOverride: Boolean(topAlert && topAlert.severityLevel >= 4),
    backgroundPhoto: photos.detail.currentPhoto,
    primaryAlert: topAlert,
    widgets: {
      agenda: {
        headline: agenda.headline,
        supportingText: agenda.supportingText,
      },
      household: {
        headline: household.summary.headline,
        supportingText: household.summary.supportingText,
      },
      weather: {
        headline: `${environment.summary.weather.temp}° ${environment.summary.weather.icon}`,
        supportingText: `${environment.summary.weather.high}° / ${environment.summary.weather.low}° · ${environment.summary.weather.condition}`,
      },
      media: {
        headline: media.summary.headline,
        supportingText: media.summary.supportingText,
      },
    },
  };
}
