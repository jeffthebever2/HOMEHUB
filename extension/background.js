// ============================================================
// background.js — HomeHub Music Bridge service worker
//
// Central relay between YouTube Music tab and HomeHub tab.
// Stores current player state; routes commands both directions.
// ============================================================

let ytmState = {
  connected: false,
  playing:   false,
  title:     '',
  artist:    '',
  album:     '',
  thumbnail: '',
  duration:  0,
  currentTime: 0,
  videoId:   '',
  tabId:     null,
};

// ── Message handler ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // YTM content script reporting state
  if (msg.type === 'YTM_STATE') {
    ytmState = {
      ...msg.state,
      connected: true,
      tabId: sender.tab?.id ?? ytmState.tabId,
    };
    sendResponse({ ok: true });
    return;
  }

  // YTM content script disconnecting
  if (msg.type === 'YTM_DISCONNECT') {
    ytmState.connected = false;
    ytmState.tabId = null;
    sendResponse({ ok: true });
    return;
  }

  // HomeHub requesting current state
  if (msg.type === 'HUB_GET_STATE') {
    sendResponse({ state: ytmState });
    return;
  }

  // HomeHub sending a command to YTM
  if (msg.type === 'HUB_COMMAND') {
    const tabId = ytmState.tabId;
    if (!tabId) {
      sendResponse({ ok: false, error: 'No YouTube Music tab connected' });
      return;
    }
    chrome.tabs.sendMessage(tabId, {
      type: 'YTM_COMMAND',
      cmd:  msg.cmd,
      args: msg.args || {},
    }, (resp) => {
      sendResponse(resp || { ok: true });
    });
    return true; // async sendResponse
  }

  // HomeHub asking to open/focus YouTube Music
  if (msg.type === 'HUB_OPEN_YTM') {
    const url = msg.url || 'https://music.youtube.com';
    if (ytmState.tabId) {
      // Focus existing tab and optionally navigate
      chrome.tabs.update(ytmState.tabId, { active: true, url: msg.url ? url : undefined }, () => {
        if (chrome.runtime.lastError) {
          // Tab was closed — open new one
          chrome.tabs.create({ url }, (tab) => {
            ytmState.tabId = tab.id;
            sendResponse({ ok: true, tabId: tab.id });
          });
        } else {
          sendResponse({ ok: true, tabId: ytmState.tabId });
        }
      });
    } else {
      chrome.tabs.create({ url }, (tab) => {
        ytmState.tabId = tab.id;
        sendResponse({ ok: true, tabId: tab.id });
      });
    }
    return true; // async
  }

  // HomeHub asking to search in YTM
  if (msg.type === 'HUB_SEARCH_YTM') {
    const searchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(msg.query)}`;
    if (ytmState.tabId) {
      chrome.tabs.update(ytmState.tabId, { url: searchUrl }, () => {
        if (chrome.runtime.lastError) {
          chrome.tabs.create({ url: searchUrl }, (tab) => {
            ytmState.tabId = tab.id;
            sendResponse({ ok: true });
          });
        } else {
          sendResponse({ ok: true });
        }
      });
    } else {
      chrome.tabs.create({ url: searchUrl }, (tab) => {
        ytmState.tabId = tab.id;
        sendResponse({ ok: true });
      });
    }
    return true;
  }
});

// Clean up when YTM tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === ytmState.tabId) {
    ytmState.connected = false;
    ytmState.tabId = null;
  }
});
