import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { getHouseholdPayload, mutateHousehold } from '../lib/server/domains/household/service.js';
import { createMeta, parseJsonBody, sendError } from '../lib/server/http.js';

function householdReadErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Household payload is unavailable.'],
    }),
    summary: {
      status: 'info',
      priority: 'normal',
      headline: 'Household data unavailable',
      supportingText: 'Chore and treat data could not be loaded.',
      badges: ['household degraded'],
      cta: { label: 'Open Household', route: '#/household' },
      updatedAt: new Date().toISOString(),
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
    detail: {
      chores: {
        degraded: true,
        warning: 'Chore data could not be loaded.',
        nextResetAt: null,
        overdue: [],
        dueToday: [],
        completedToday: [],
        upcoming: [],
        summary: {
          dueToday: 0,
          completedToday: 0,
          overdueCount: 0,
          progressPercent: 0,
        },
      },
      treats: {
        degraded: true,
        warning: 'Treat data could not be loaded.',
        petId: 'pet',
        petName: 'Pet',
        avatarEmoji: '🐕',
        dailyLimitTreats: 0,
        treatsGivenToday: 0,
        treatsRemaining: 0,
        percentOfLimit: 0,
        caloriesToday: {
          total: 0,
          fromFood: 0,
          fromTreats: 0,
          dailyCalorieTarget: 0,
        },
        statusLevel: 'unknown',
        lastTreat: null,
        history: [],
        resetsAt: null,
      },
    },
  };
}

function householdMutationErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Household action failed.'],
    }),
    success: false,
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    const { config } = await loadConfig(context);
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const result = await mutateHousehold(config, context, body);
      applyCacheProfile(res, 'household');
      return res.status(200).json(result);
    }
    const payload = await getHouseholdPayload(config, context);
    applyCacheProfile(res, 'household');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 500, req.method === 'POST' ? householdMutationErrorPayload() : householdReadErrorPayload());
  }
}
