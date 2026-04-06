// ============================================================
// content-homehub.js — Injected into HomeHub pages
//
// Bridges between HomeHub's page JS (window.postMessage) and
// the extension background (chrome.runtime.sendMessage).
//
// Protocol:
//   Page → Extension:  window.postMessage({ type: 'HUB_MUSIC_*', ... })
//   Extension → Page:  window.postMessage({ type: 'HUB_MUSIC_STATE', ... })
// ============================================================

(function () {
  'use strict';

  const STATE_POLL_MS = 800;
  let pollTimer = null;
  let extensionAlive = true;

  // ── Signal to the page that the extension is available ─────
  window.postMessage({ type: 'HUB_MUSIC_BRIDGE_READY' }, '*');

  // ── Poll background for YTM state, push to page ───────────
  function pollState() {
    if (!extensionAlive) return;
    try {
      chrome.runtime.sendMessage({ type: 'HUB_GET_STATE' }, (resp) => {
        if (chrome.runtime.lastError) {
          extensionAlive = false;
          stopPolling();
          return;
        }
        if (resp?.state) {
          window.postMessage({
            type:  'HUB_MUSIC_STATE',
            state: resp.state,
          }, '*');
        }
      });
    } catch (e) {
      extensionAlive = false;
      stopPolling();
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollState, STATE_POLL_MS);
    pollState(); // immediate first poll
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ── Listen for commands from HomeHub page JS ───────────────
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg?.type?.startsWith('HUB_MUSIC_')) return;
    if (msg.type === 'HUB_MUSIC_STATE' || msg.type === 'HUB_MUSIC_BRIDGE_READY') return;

    // Translate page messages to extension messages
    switch (msg.type) {
      case 'HUB_MUSIC_CMD':
        chrome.runtime.sendMessage({
          type: 'HUB_COMMAND',
          cmd:  msg.cmd,
          args: msg.args || {},
        }, (resp) => {
          // Relay response back to page
          window.postMessage({
            type:   'HUB_MUSIC_CMD_RESULT',
            cmd:    msg.cmd,
            result: resp,
          }, '*');
        });
        break;

      case 'HUB_MUSIC_OPEN_YTM':
        chrome.runtime.sendMessage({
          type: 'HUB_OPEN_YTM',
          url:  msg.url || null,
        });
        break;

      case 'HUB_MUSIC_SEARCH':
        chrome.runtime.sendMessage({
          type:  'HUB_SEARCH_YTM',
          query: msg.query,
        });
        break;

      case 'HUB_MUSIC_START_POLL':
        startPolling();
        break;

      case 'HUB_MUSIC_STOP_POLL':
        stopPolling();
        break;
    }
  });

  // Start polling automatically
  startPolling();
  console.log('[HUB-Bridge] HomeHub content script loaded');
})();
