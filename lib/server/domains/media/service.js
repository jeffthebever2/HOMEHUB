import { safeJsonParse } from '../../fetch.js';

export function getMediaPayload(config, req) {
  const headerState = safeJsonParse(req.headers['x-homehub-media-state'], null);
  const nowPlaying = headerState?.nowPlaying || {
    state: 'idle',
    sourceType: null,
    title: null,
    subtitle: null,
    startedAt: null,
  };

  return {
    meta: {
      schemaVersion: 1,
      fetchedAt: new Date().toISOString(),
      stale: false,
      degraded: false,
      isMock: false,
      warnings: headerState ? ['Media state is currently client-bridged until a persistent provider adapter is wired.'] : [],
    },
    summary: {
      status: nowPlaying.state === 'playing' ? 'success' : nowPlaying.state === 'buffering' ? 'warning' : 'normal',
      priority: 'normal',
      headline: nowPlaying.title || 'Nothing playing right now',
      supportingText: nowPlaying.subtitle || 'Open Media to start music or radio.',
      badges: [nowPlaying.sourceType || 'idle'],
      cta: { label: 'Open Media', route: '#/media' },
      updatedAt: new Date().toISOString(),
      nowPlaying,
    },
    detail: {
      nowPlaying,
      availableControls: {
        playPause: true,
        next: true,
        prev: true,
        volume: true,
      },
      radioPresets: config.media.radioPresets,
      musicContext: {
        spotifyEmbedUrl: config.media.spotifyEmbedUrl,
      },
    },
  };
}

export function mutateMedia(req) {
  const body = req.body || {};
  return {
    success: true,
    anticipatedState: {
      state: body.action === 'pause' || body.action === 'stop' ? 'idle' : 'playing',
      sourceType: body.stationId ? 'radio' : 'music',
      title: body.title || null,
      subtitle: body.stationId || null,
      startedAt: new Date().toISOString(),
    },
  };
}

export async function getMediaHealth(config, req) {
  const payload = getMediaPayload(config, req);
  return {
    status: 'healthy',
    warnings: payload.meta.warnings,
    stationCount: payload.detail.radioPresets.length,
  };
}
