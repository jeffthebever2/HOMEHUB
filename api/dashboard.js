import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { buildDashboardPayload } from '../lib/server/domains/dashboard/build.js';
import { createMeta, sendError } from '../lib/server/http.js';

function dashboardErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Dashboard payload is unavailable.'],
    }),
    hero: {
      status: 'warning',
      eyebrow: 'Home',
      headline: 'Dashboard unavailable',
      supportingText: 'HomeHub could not load the household summary.',
      actions: [{ label: 'Open Settings', route: '#/settings' }],
    },
    modules: {
      environment: {
        status: 'warning',
        headline: 'Weather unavailable',
        supportingText: 'Environment data could not be loaded.',
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
          summary: 'Environment data could not be loaded.',
          timeWindow: null,
        },
        activeAlertCount: 0,
        ticker: 'Environment unavailable',
      },
      agenda: {
        status: 'empty',
        headline: 'Agenda unavailable',
        supportingText: 'Calendar data could not be loaded.',
        items: [],
        sections: {
          today: 0,
          tomorrow: 0,
          upcoming: 0,
        },
      },
      household: {
        status: 'warning',
        headline: 'Household unavailable',
        supportingText: 'Chore and treat data could not be loaded.',
      },
      media: {
        status: 'normal',
        headline: 'Nothing playing right now',
        supportingText: 'Media data could not be loaded.',
      },
      photos: {
        status: 'warning',
        headline: 'Photo queue unavailable',
        supportingText: 'Photos data could not be loaded.',
      },
    },
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    const { config } = await loadConfig(context);
    const payload = await buildDashboardPayload(config, context, req);
    applyCacheProfile(res, 'dashboard');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 500, dashboardErrorPayload());
  }
}
