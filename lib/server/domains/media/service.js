import { safeJsonParse } from '../../fetch.js';
import { createMeta } from '../../http.js';

function getDefaultNowPlaying() {
  return {
    state: 'idle',
    sourceType: null,
    title: null,
    subtitle: null,
    startedAt: null,
  };
}

function getRadioPresets(config) {
  return Array.isArray(config?.media?.radioPresets) ? config.media.radioPresets : [];
}

function getSpotifyEmbedUrl(config) {
  return typeof config?.media?.spotifyEmbedUrl === 'string' && config.media.spotifyEmbedUrl
    ? config.media.spotifyEmbedUrl
    : 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M';
}

export function getMediaPayload(config, req) {
  const headerState = safeJsonParse(req?.headers?.['x-homehub-media-state'], null);
  const nowPlaying = headerState?.nowPlaying && typeof headerState.nowPlaying === 'object'
    ? {
        ...getDefaultNowPlaying(),
        ...headerState.nowPlaying,
      }
    : getDefaultNowPlaying();

  return {
    meta: createMeta({
      warnings: headerState
        ? ['Media state is currently client-bridged until a persistent provider adapter is wired.']
        : [],
    }),
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
      radioPresets: getRadioPresets(config),
      musicContext: {
        spotifyEmbedUrl: getSpotifyEmbedUrl(config),
      },
    },
  };
}

export function mutateMedia(req) {
  const body = req.body || {};
  const action = body.action || 'play';
  const state = action === 'pause' ? 'paused' : action === 'stop' ? 'idle' : 'playing';

  return {
    meta: createMeta(),
    success: true,
    anticipatedState: {
      state,
      sourceType: body.stationId ? 'radio' : action === 'stop' ? null : 'music',
      title: action === 'stop' ? null : body.title || null,
      subtitle: action === 'stop' ? null : body.stationId || null,
      startedAt: action === 'stop' ? null : new Date().toISOString(),
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
