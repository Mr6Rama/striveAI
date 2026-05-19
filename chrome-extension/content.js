// StriveAI Focus — content.js
// Runs on the configured StriveAI host, reads session state and syncs to background

let lastSentSignature = '';
let syncInterval = null;

function syncState() {
  try {
    const pageAPI = window.__striveAI;
    if (!pageAPI || typeof pageAPI.getState !== 'function') return;

    const state = pageAPI.getState();
    const signature = JSON.stringify(state);
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;

    // Enrich with lastActivityAt
    const enriched = {
      ...state,
      lastActivityAt: state.isRunning ? Date.now() : undefined,
    };

    chrome.runtime.sendMessage({ type: 'state_update', payload: enriched });
  } catch (_e) {
    // Extension context may be invalidated — stop polling
    if (syncInterval) clearInterval(syncInterval);
  }
}

// Poll every second while the page is open
syncInterval = setInterval(syncState, 1000);
syncState();

// Also respond to messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'page_action') {
    try {
      const api = window.__striveAI;
      if (!api) { sendResponse({ ok: false }); return; }
      if (msg.action === 'start_session') { api.startSession(); sendResponse({ ok: true }); }
      if (msg.action === 'end_session') { api.endSession(); sendResponse({ ok: true }); }
    } catch (_e) {
      sendResponse({ ok: false });
    }
  }
});
