import { getRequestContext } from '../lib/server/auth.js';
import { applyCacheProfile } from '../lib/server/cache/headers.js';
import { loadConfig } from '../lib/server/config/loadConfig.js';
import { getMediaPayload, mutateMedia } from '../lib/server/domains/media/service.js';
import { createMeta, parseJsonBody, sendError } from '../lib/server/http.js';

function mediaReadErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Media payload is unavailable.'],
    }),
    summary: {
      status: 'normal',
      priority: 'normal',
      headline: 'Nothing playing right now',
      supportingText: 'Media state could not be loaded.',
      badges: ['idle'],
      cta: { label: 'Open Media', route: '#/media' },
      updatedAt: new Date().toISOString(),
      nowPlaying: {
        state: 'idle',
        sourceType: null,
        title: null,
        subtitle: null,
        startedAt: null,
      },
    },
    detail: {
      nowPlaying: {
        state: 'idle',
        sourceType: null,
        title: null,
        subtitle: null,
        startedAt: null,
      },
      availableControls: {
        playPause: true,
        next: true,
        prev: true,
        volume: true,
      },
      radioPresets: [],
      musicContext: {
        spotifyEmbedUrl: '',
      },
    },
  };
}

function mediaMutationErrorPayload() {
  return {
    meta: createMeta({
      degraded: true,
      warnings: ['Media action failed.'],
    }),
    success: false,
    anticipatedState: null,
  };
}

export default async function handler(req, res) {
  try {
    const context = await getRequestContext(req, { requireAuth: true });
    const { config } = await loadConfig(context);
    if (req.method === 'POST') {
      req.body = await parseJsonBody(req);
      const result = await mutateMedia(req);
      applyCacheProfile(res, 'media');
      return res.status(200).json(result);
    }
    const payload = getMediaPayload(config, req);
    applyCacheProfile(res, 'media');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 500, req.method === 'POST' ? mediaMutationErrorPayload() : mediaReadErrorPayload());
  }
}
