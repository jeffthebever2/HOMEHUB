import { apiFetch } from '../../core/api.js';
import { escapeHtml, formatDateTime } from '../../core/format.js';
import { setMediaState, store } from '../../core/store.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { errorState, loadingState } from '../../ui/state.js';
import { pushToast } from '../../ui/toast.js';
import { renderMediaHero } from './hero.js';
import { renderMusicTab } from './musicTab.js';
import { renderRadioTab } from './radioTab.js';

const TAB_KEY = 'hh_media_tab';
const radioAudio = new Audio();
radioAudio.preload = 'none';

let listenersBound = false;

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
    if (radioAudio.currentTime === 0 || radioAudio.ended) {
      return;
    }
    setNowPlaying({
      ...(store.mediaState?.nowPlaying || {}),
      state: 'paused',
    });
  });
  radioAudio.addEventListener('ended', () => {
    setNowPlaying({
      state: 'idle',
      sourceType: null,
      title: null,
      subtitle: null,
      startedAt: null,
    });
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
  if (response.anticipatedState) {
    setNowPlaying(response.anticipatedState);
  }
}

export async function renderMediaPage(container) {
  ensureAudioBindings();
  let pollId = null;
  let activeTab = sessionStorage.getItem(TAB_KEY) || 'music';

  async function load() {
    container.innerHTML = loadingState('Loading media…');
    try {
      const payload = await apiFetch('/api/media');
      const nowPlaying = payload.detail.nowPlaying || store.mediaState?.nowPlaying || {};
      container.innerHTML = `
        ${pageHeader({
          kicker: 'Media',
          title: 'Music & Radio',
          subtitle: `Updated ${formatDateTime(payload.meta.fetchedAt)}`,
          actions: '<button id="hh-media-refresh" class="hh-btn hh-btn-secondary">Refresh</button>',
        })}
        <div class="hh-pill-row" style="margin-bottom:1rem;">
          <button class="hh-tab-pill ${activeTab === 'music' ? 'is-active' : ''}" data-tab="music">Music</button>
          <button class="hh-tab-pill ${activeTab === 'radio' ? 'is-active' : ''}" data-tab="radio">Radio</button>
        </div>
        ${renderMediaHero({ ...payload.summary, nowPlaying })}
        ${activeTab === 'radio' ? renderRadioTab(payload.detail, nowPlaying) : renderMusicTab(payload.detail, nowPlaying)}
      `;
      container.querySelectorAll('[data-tab]').forEach((button) => {
        button.addEventListener('click', () => {
          activeTab = button.dataset.tab;
          sessionStorage.setItem(TAB_KEY, activeTab);
          load();
        });
      });
      container.querySelector('#hh-media-refresh')?.addEventListener('click', async () => {
        pushToast('Refreshing media…');
        await load();
      });
      container.querySelector('[data-media-action="music-active"]')?.addEventListener('click', async () => {
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
        await load();
      });
      container.querySelectorAll('[data-media-action="pause"]').forEach((button) => {
        button.addEventListener('click', async () => {
          if (store.mediaState?.nowPlaying?.sourceType === 'radio') radioAudio.pause();
          await postMediaAction({ action: 'pause' });
          pushToast('Media paused.');
          await load();
        });
      });
      container.querySelectorAll('[data-media-action="stop"]').forEach((button) => {
        button.addEventListener('click', async () => {
          radioAudio.pause();
          radioAudio.src = '';
          await postMediaAction({ action: 'stop' });
          setNowPlaying({
            state: 'idle',
            sourceType: null,
            title: null,
            subtitle: null,
            startedAt: null,
          });
          pushToast('Media cleared.');
          await load();
        });
      });
      container.querySelectorAll('[data-radio-play]').forEach((button) => {
        button.addEventListener('click', async () => {
          const station = payload.detail.radioPresets.find((entry) => entry.id === button.dataset.radioPlay);
          if (!station) return;
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
          try {
            await radioAudio.play();
            pushToast(`Playing ${station.name}`);
          } catch (error) {
            pushToast(`Could not play ${station.name}`);
          }
          await load();
        });
      });
    } catch (error) {
      container.innerHTML = `
        ${pageHeader({ kicker: 'Media', title: 'Music & Radio', subtitle: 'This section is temporarily unavailable.' })}
        ${errorState('Media unavailable', error.message)}
      `;
    }
  }

  await load();
  pollId = window.setInterval(load, store.mediaState?.nowPlaying?.state === 'playing' ? 15000 : 45000);
  return () => window.clearInterval(pollId);
}
