import { apiFetch } from '../../core/api.js';
import { asArray, asObject, escapeHtml, formatDateTime } from '../../core/format.js';
import { setMediaState, store } from '../../core/store.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';
import { renderMediaHero } from './hero.js';
import { renderMusicTab } from './musicTab.js';
import { renderRadioTab } from './radioTab.js';

const TAB_KEY = 'hh_media_tab';
const radioAudio = new Audio();
radioAudio.preload = 'none';

let listenersBound = false;

function readStoredTab() {
  try {
    return sessionStorage.getItem(TAB_KEY) || 'music';
  } catch {
    return 'music';
  }
}

function writeStoredTab(tab) {
  try {
    sessionStorage.setItem(TAB_KEY, tab);
  } catch {
    // Ignore sessionStorage failures.
  }
}

function getDefaultNowPlaying() {
  return {
    state: 'idle',
    sourceType: null,
    title: null,
    subtitle: null,
    startedAt: null,
  };
}

function getFallbackPayload(errorMessage = '') {
  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      degraded: Boolean(errorMessage),
      warnings: errorMessage ? [errorMessage] : [],
    },
    summary: {
      status: 'normal',
      headline: errorMessage ? 'Media is running in degraded mode' : 'Nothing playing right now',
      supportingText: errorMessage || 'Open Media to start music or radio.',
      nowPlaying: getDefaultNowPlaying(),
    },
    detail: {
      nowPlaying: getDefaultNowPlaying(),
      radioPresets: [],
      musicContext: {
        spotifyEmbedUrl: '',
      },
    },
  };
}

function normalizeMediaPayload(payload, errorMessage = '') {
  const fallback = getFallbackPayload(errorMessage);
  const meta = asObject(payload?.meta);
  const summary = asObject(payload?.summary);
  const detail = asObject(payload?.detail);
  const nowPlaying = {
    ...getDefaultNowPlaying(),
    ...asObject(detail.nowPlaying),
    ...asObject(summary.nowPlaying),
  };
  return {
    meta: {
      ...fallback.meta,
      ...meta,
      warnings: asArray(meta.warnings),
    },
    summary: {
      ...fallback.summary,
      ...summary,
      nowPlaying,
    },
    detail: {
      ...fallback.detail,
      ...detail,
      nowPlaying,
      radioPresets: asArray(detail.radioPresets),
      musicContext: {
        ...fallback.detail.musicContext,
        ...asObject(detail.musicContext),
      },
    },
  };
}

function setNowPlaying(next) {
  setMediaState({ nowPlaying: next });
}

function ensureAudioBindings() {
  if (listenersBound) return;
  listenersBound = true;
  radioAudio.addEventListener('waiting', () => {
    setNowPlaying({
      ...(store.mediaState?.nowPlaying || {}),
      state: 'buffering',
    });
  });
  radioAudio.addEventListener('play', () => {
    setNowPlaying({
      ...(store.mediaState?.nowPlaying || {}),
      state: 'playing',
    });
  });
  radioAudio.addEventListener('pause', () => {
    if (radioAudio.currentTime === 0 || radioAudio.ended) return;
    setNowPlaying({
      ...(store.mediaState?.nowPlaying || {}),
      state: 'paused',
    });
  });
  radioAudio.addEventListener('ended', () => {
    setNowPlaying(getDefaultNowPlaying());
  });
  radioAudio.addEventListener('error', () => {
    pushToast('Radio playback failed. Try another preset.');
    setNowPlaying({
      ...(store.mediaState?.nowPlaying || {}),
      state: 'error',
    });
  });
}

async function postMediaAction(body) {
  const response = await apiFetch('/api/media', {
    method: 'POST',
    body,
  });
  if (response?.anticipatedState) {
    setNowPlaying({
      ...getDefaultNowPlaying(),
      ...response.anticipatedState,
    });
  }
}

export async function renderMediaPage(container) {
  ensureAudioBindings();
  let disposed = false;
  let pollId = null;
  let loadVersion = 0;
  let activeTab = readStoredTab();

  function schedulePoll(nowPlaying) {
    window.clearInterval(pollId);
    const isActive = nowPlaying?.state === 'playing' || nowPlaying?.state === 'buffering';
    pollId = window.setInterval(() => {
      load({ showLoading: false }).catch(() => {});
    }, isActive ? 15000 : 45000);
  }

  async function load({ showLoading = true } = {}) {
    const currentLoad = ++loadVersion;
    if (showLoading && !disposed) {
      container.innerHTML = loadingState('Loading media…');
    }

    let payload;
    try {
      payload = normalizeMediaPayload(await apiFetch('/api/media'));
    } catch (error) {
      payload = normalizeMediaPayload(null, error.message);
    }

    const nowPlaying = {
      ...getDefaultNowPlaying(),
      ...asObject(store.mediaState?.nowPlaying),
      ...asObject(payload.detail.nowPlaying),
    };
    payload.summary.nowPlaying = nowPlaying;
    payload.detail.nowPlaying = nowPlaying;

    if (disposed || currentLoad !== loadVersion) return;

    container.innerHTML = `
      ${pageHeader({
        kicker: 'Media',
        title: 'Music & Radio',
        subtitle: `Updated ${formatDateTime(payload.meta.fetchedAt)}`,
        actions: '<button id="hh-media-refresh" class="hh-btn hh-btn-secondary">Refresh</button>',
      })}
      ${payload.meta.degraded ? `
        <div class="hh-banner hh-banner-offline" style="margin-bottom:1rem;">
          <div class="hh-banner-copy">
            <p class="hh-banner-title">Media is degraded</p>
            <p class="hh-banner-subtitle">${escapeHtml(payload.meta.warnings?.[0] || 'HomeHub is showing the best available media state.')}</p>
          </div>
        </div>
      ` : ''}
      <div class="hh-pill-row" style="margin-bottom:1rem;">
        <button class="hh-tab-pill ${activeTab === 'music' ? 'is-active' : ''}" data-tab="music">Music</button>
        <button class="hh-tab-pill ${activeTab === 'radio' ? 'is-active' : ''}" data-tab="radio">Radio</button>
      </div>
      ${renderMediaHero({ ...payload.summary, nowPlaying })}
      ${activeTab === 'radio' ? renderRadioTab(payload.detail, nowPlaying) : renderMusicTab(payload.detail, nowPlaying)}
    `;

    container.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.tab || 'music';
        writeStoredTab(activeTab);
        load({ showLoading: false }).catch(() => {});
      });
    });
    container.querySelector('#hh-media-refresh')?.addEventListener('click', async () => {
      pushToast('Refreshing media…');
      await load({ showLoading: false });
    });
    container.querySelector('[data-media-action="music-active"]')?.addEventListener('click', async () => {
      try {
        await postMediaAction({
          action: 'play',
          title: 'Spotify session',
        });
        setNowPlaying({
          state: 'playing',
          sourceType: 'music',
          title: 'Spotify session',
          subtitle: 'Use embedded controls',
          startedAt: new Date().toISOString(),
        });
        pushToast('Marked music as active.');
        await load({ showLoading: false });
      } catch (error) {
        pushToast(error.message || 'Could not update media state.');
      }
    });
    container.querySelectorAll('[data-media-action="pause"]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          if (store.mediaState?.nowPlaying?.sourceType === 'radio') radioAudio.pause();
          await postMediaAction({ action: 'pause' });
          pushToast('Media paused.');
          await load({ showLoading: false });
        } catch (error) {
          pushToast(error.message || 'Could not pause media.');
        }
      });
    });
    container.querySelectorAll('[data-media-action="stop"]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          radioAudio.pause();
          radioAudio.src = '';
          await postMediaAction({ action: 'stop' });
          setNowPlaying(getDefaultNowPlaying());
          pushToast('Media cleared.');
          await load({ showLoading: false });
        } catch (error) {
          pushToast(error.message || 'Could not clear media.');
        }
      });
    });
    container.querySelectorAll('[data-radio-play]').forEach((button) => {
      button.addEventListener('click', async () => {
        const station = asArray(payload.detail.radioPresets).find((entry) => entry.id === button.dataset.radioPlay);
        if (!station?.streamUrl) return;
        try {
          radioAudio.src = station.streamUrl;
          setNowPlaying({
            state: 'buffering',
            sourceType: 'radio',
            title: station.name,
            subtitle: 'Live radio',
            startedAt: new Date().toISOString(),
          });
          await postMediaAction({
            action: 'play',
            stationId: station.id,
            title: station.name,
          });
          await radioAudio.play();
          pushToast(`Playing ${station.name}`);
          await load({ showLoading: false });
        } catch (error) {
          pushToast(error.message || `Could not play ${station.name}`);
        }
      });
    });

    schedulePoll(nowPlaying);
  }

  await load();
  return () => {
    disposed = true;
    loadVersion += 1;
    window.clearInterval(pollId);
  };
}
