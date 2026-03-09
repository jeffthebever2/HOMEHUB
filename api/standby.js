import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { buildStandbyPayload } from '../lib/server/domains/standby/build.js';
import { createMeta, sendError } from '../lib/server/http.js';

function standbyErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Standby payload is unavailable.'],
    }),
    ambientState: 'day',
    urgentOverride: false,
    backgroundPhoto: {
      id: 'fallback-1',
      url: '/fallback/photos/family-1.svg',
      credit: 'HomeHub fallback',
    },
    primaryAlert: null,
    widgets: {
      agenda: {
        headline: 'Agenda unavailable',
        supportingText: 'Calendar data could not be loaded.',
      },
      household: {
        headline: 'Household unavailable',
        supportingText: 'Household data could not be loaded.',
      },
      weather: {
        headline: '--° ·',
        supportingText: 'Weather data unavailable.',
      },
      media: {
        headline: 'Nothing playing right now',
        supportingText: 'Media data unavailable.',
      },
    },
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    const { config } = await loadConfig(context);
    const payload = await buildStandbyPayload(config, context, req);
    applyCacheProfile(res, 'standby');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 500, standbyErrorPayload());
  }
}
