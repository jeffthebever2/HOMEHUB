// ============================================================
// content-ytmusic.js — Injected into music.youtube.com
//
// Observes the YouTube Music player DOM and reports state to
// the extension background. Executes playback commands.
// ============================================================

(function () {
  'use strict';

  const POLL_MS = 1000;      // state update interval
  const RETRY_MS = 3000;     // retry if player not found yet
  let pollTimer = null;
  let lastStateJSON = '';

  // ── DOM selectors (YouTube Music 2025+) ─────────────────────
  // YTM uses web components; these selectors target the rendered DOM.

  function getVideo() {
    return document.querySelector('video');
  }

  function getPlayerBar() {
    return document.querySelector('ytmusic-player-bar');
  }

  function getTitle() {
    const bar = getPlayerBar();
    if (!bar) return '';
    // Primary: the title link inside the content info wrapper
    const el = bar.querySelector('.title.ytmusic-player-bar yt-formatted-string')
            || bar.querySelector('.title yt-formatted-string')
            || bar.querySelector('.title');
    return el?.textContent?.trim() || '';
  }

  function getArtist() {
    const bar = getPlayerBar();
    if (!bar) return '';
    const el = bar.querySelector('.byline.ytmusic-player-bar yt-formatted-string a')
            || bar.querySelector('.byline yt-formatted-string a')
            || bar.querySelector('.byline yt-formatted-string')
            || bar.querySelector('.byline');
    // May have "Artist • Album • Year" — take first segment
    const text = el?.textContent?.trim() || '';
    return text.split(' \u2022 ')[0]?.trim() || text;
  }

  function getAlbum() {
    const bar = getPlayerBar();
    if (!bar) return '';
    const el = bar.querySelector('.byline yt-formatted-string');
    const text = el?.textContent?.trim() || '';
    const parts = text.split(' \u2022 ');
    return parts.length > 1 ? parts[1]?.trim() : '';
  }

  function getThumbnail() {
    const bar = getPlayerBar();
    if (!bar) return '';
    const img = bar.querySelector('.thumbnail-image-wrapper img')
             || bar.querySelector('.image.ytmusic-player-bar')
             || bar.querySelector('img.image');
    let src = img?.src || '';
    // Upgrade to higher resolution
    if (src) src = src.replace(/=w\d+-h\d+/, '=w400-h400').replace(/=s\d+/, '=s400');
    return src;
  }

  function getVideoId() {
    // From URL
    const params = new URLSearchParams(window.location.search);
    const v = params.get('v');
    if (v) return v;
    // From video element src
    const video = getVideo();
    if (video?.src) {
      const m = video.src.match(/[?&]v=([^&]+)/);
      if (m) return m[1];
    }
    return '';
  }

  function clickButton(selector) {
    const btn = typeof selector === 'string'
      ? document.querySelector(selector)
      : selector;
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  // ── Read full player state ──────────────────────────────────
  function readState() {
    const video = getVideo();
    return {
      playing:     video ? !video.paused : false,
      title:       getTitle(),
      artist:      getArtist(),
      album:       getAlbum(),
      thumbnail:   getThumbnail(),
      duration:    video?.duration || 0,
      currentTime: video?.currentTime || 0,
      videoId:     getVideoId(),
      volume:      video ? video.volume : 1,
      muted:       video ? video.muted : false,
    };
  }

  // ── State polling ──────────────────────────────────────────
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      const state = readState();
      const json = JSON.stringify(state);
      // Only send if changed (reduce message churn)
      if (json !== lastStateJSON) {
        lastStateJSON = json;
        try {
          chrome.runtime.sendMessage({ type: 'YTM_STATE', state });
        } catch (e) {
          // Extension context invalidated — stop polling
          stopPolling();
        }
      }
    }, POLL_MS);
    console.log('[HUB-Bridge] Polling YouTube Music state');
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // ── Wait for player to appear, then start ──────────────────
  function waitForPlayer() {
    if (getPlayerBar() || getVideo()) {
      startPolling();
      return;
    }
    // Player not loaded yet — retry
    setTimeout(waitForPlayer, RETRY_MS);
  }

  // ── Command handler ────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== 'YTM_COMMAND') return;

    const cmd = msg.cmd;
    let ok = false;

    switch (cmd) {
      case 'play':
      case 'pause':
      case 'togglePlay': {
        // Click the play/pause button
        ok = clickButton('#play-pause-button')
          || clickButton('tp-yt-paper-icon-button.play-pause-button')
          || clickButton('.play-pause-button');
        // Fallback: directly toggle video
        if (!ok) {
          const v = getVideo();
          if (v) { v.paused ? v.play() : v.pause(); ok = true; }
        }
        break;
      }
      case 'next':
        ok = clickButton('.next-button')
          || clickButton('tp-yt-paper-icon-button.next-button');
        break;
      case 'prev':
        ok = clickButton('.previous-button')
          || clickButton('tp-yt-paper-icon-button.previous-button');
        break;
      case 'like': {
        const bar = getPlayerBar();
        if (bar) {
          const likeBtn = bar.querySelector('.like.ytmusic-like-button-renderer')
                       || bar.querySelector('#button-shape-like button');
          ok = clickButton(likeBtn);
        }
        break;
      }
      case 'setVolume': {
        const v = getVideo();
        if (v && typeof msg.args?.volume === 'number') {
          v.volume = Math.max(0, Math.min(1, msg.args.volume));
          ok = true;
        }
        break;
      }
      case 'seek': {
        const v = getVideo();
        if (v && typeof msg.args?.time === 'number') {
          v.currentTime = msg.args.time;
          ok = true;
        }
        break;
      }
      case 'shuffle': {
        ok = clickButton('tp-yt-paper-icon-button.shuffle')
          || clickButton('.shuffle.ytmusic-player-bar');
        break;
      }
      case 'repeat': {
        ok = clickButton('tp-yt-paper-icon-button.repeat')
          || clickButton('.repeat.ytmusic-player-bar');
        break;
      }
      default:
        console.warn('[HUB-Bridge] Unknown command:', cmd);
    }

    sendResponse({ ok, cmd });
  });

  // ── Lifecycle ──────────────────────────────────────────────
  window.addEventListener('beforeunload', () => {
    stopPolling();
    try { chrome.runtime.sendMessage({ type: 'YTM_DISCONNECT' }); } catch (_) {}
  });

  // Also handle SPA navigations within YTM
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      // Force a state update on navigation (new song page)
      lastStateJSON = '';
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  // Start
  waitForPlayer();
  console.log('[HUB-Bridge] YouTube Music content script loaded');
})();
