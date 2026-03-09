import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { getPhotosPayload } from '../lib/server/domains/photos/service.js';
import { createMeta, sendError } from '../lib/server/http.js';

function photosErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Photos payload is unavailable.'],
    }),
    summary: {
      status: 'warning',
      priority: 'attention_needed',
      headline: 'Photo queue unavailable',
      supportingText: 'HomeHub is using the built-in fallback queue.',
      badges: ['photos degraded', 'fallback'],
      cta: { label: 'Open Photos', route: '#/photos' },
      updatedAt: new Date().toISOString(),
    },
    detail: {
      source: 'local_fallback',
      fallbackInUse: true,
      currentPhoto: {
        id: 'fallback-1',
        url: '/fallback/photos/family-1.svg',
        credit: 'HomeHub fallback',
      },
      queue: [
        { id: 'fallback-1', url: '/fallback/photos/family-1.svg', credit: 'HomeHub fallback' },
        { id: 'fallback-2', url: '/fallback/photos/family-2.svg', credit: 'HomeHub fallback' },
        { id: 'fallback-3', url: '/fallback/photos/family-3.svg', credit: 'HomeHub fallback' },
      ],
    },
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: false });
    const { config } = await loadConfig(context);
    const payload = await getPhotosPayload(config, { mockScenario: req.headers['x-homehub-mock'] });
    applyCacheProfile(res, 'photos', {
      privateResponse: Boolean(context.user) || Boolean(req.headers['x-homehub-mock']),
      vary: ['Authorization', 'X-HomeHub-Mock'],
    });
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 500, photosErrorPayload());
  }
}
