importScripts('config.js');

// StriveAI Focus — background.js (service worker)
// Handles alarms, notifications, and state sync from content script

const ALARM_TICK = 'striveai-tick';
const ALARM_REMINDER = 'striveai-reminder';
const STORE_KEY = 'striveai_state';

// ── Boot ─────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_TICK, { periodInMinutes: 1 / 60 }); // every ~1s via alarm minimum
  chrome.alarms.create(ALARM_REMINDER, { periodInMinutes: 60 }); // hourly streak/activity check
  setDefaultState();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_TICK, { periodInMinutes: 1 / 60 });
  chrome.alarms.create(ALARM_REMINDER, { periodInMinutes: 60 });
});

// ── Alarm handler ────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_TICK) await handleTick();
  if (alarm.name === ALARM_REMINDER) await handleReminderCheck();
});

async function handleTick() {
  const state = await getState();
  if (!state.isRunning || !state.startedAt || !state.plannedDuration) return;

  const elapsed = Date.now() - state.startedAt;
  const planned = state.plannedDuration * 60 * 1000;
  const remaining = Math.max(0, planned - elapsed);

  // Update badge with remaining minutes
  const remMins = Math.ceil(remaining / 60000);
  chrome.action.setBadgeText({ text: state.isRunning ? `${remMins}m` : '' });
  chrome.action.setBadgeBackgroundColor({ color: remaining < 120000 ? '#ef4444' : '#0052ff' });

  // Fire "time's up" notification once
  if (remaining === 0 && !state.endNotified) {
    await patchState({ endNotified: true });
    chrome.notifications.create('session-end', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '⏱ Session Complete — StriveAI',
      message: `Your ${state.plannedDuration}min session is up. Time to review!`,
      priority: 2,
    });
  }
}

async function handleReminderCheck() {
  const state = await getState();
  const now = Date.now();
  const lastActivity = state.lastActivityAt || 0;
  const streak = state.streak || 0;
  if (!lastActivity) return;

  const hoursSince = (now - lastActivity) / (1000 * 60 * 60);

  // 2-day inactivity reminder
  if (hoursSince >= 48) {
    chrome.notifications.create('inactivity', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'StriveAI — Come back!',
      message: `You've been away ${Math.floor(hoursSince / 24)} days. Your roadmap needs you.`,
      priority: 2,
      buttons: [{ title: 'Open StriveAI' }],
    });
  } else if (streak > 0 && hoursSince >= 20) {
    // Streak risk: active streak but approaching 24h
    chrome.notifications.create('streak-risk', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `🔥 ${streak}-day streak at risk — StriveAI`,
      message: "Complete a session today to keep your streak alive!",
      priority: 2,
      buttons: [{ title: 'Start session' }],
    });
  }
}

// ── Notification click ───────────────────────────────────────────
chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  openStriveAI();
});
chrome.notifications.onClicked.addListener(() => {
  openStriveAI();
});

function openStriveAI() {
  const url = STRIVEAI_APP_URL;
  chrome.tabs.query({ url: `${url}/*` }, (tabs) => {
    if (tabs.length) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url });
    }
  });
}

// ── Messages from content script / popup ────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'state_update') {
    patchState(msg.payload).then(() => sendResponse({ ok: true }));
    return true; // async
  }
  if (msg.type === 'get_state') {
    getState().then((s) => sendResponse(s));
    return true;
  }
  if (msg.type === 'clear_session') {
    patchState({ isRunning: false, endNotified: false }).then(() => {
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ ok: true });
    });
    return true;
  }
});

// ── State helpers ────────────────────────────────────────────────
async function getState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORE_KEY, (res) => {
      resolve(res[STORE_KEY] || defaultState());
    });
  });
}

async function patchState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORE_KEY]: next }, resolve);
  });
}

function defaultState() {
  return {
    isRunning: false,
    goal: '',
    startedAt: 0,
    plannedDuration: 0,
    elapsed: '00:00',
    countdown: '–',
    progress: 0,
    streak: 0,
    stageName: '',
    userName: '',
    lastActivityAt: 0,
    endNotified: false,
  };
}

async function setDefaultState() {
  const existing = await getState();
  if (!existing.lastActivityAt) {
    await patchState(defaultState());
  }
}
