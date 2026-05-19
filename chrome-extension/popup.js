// StriveAI Focus — popup.js

document.getElementById('open-btn').addEventListener('click', () => {
  chrome.tabs.query({ url: `${STRIVEAI_APP_URL}/*` }, (tabs) => {
    if (tabs.length) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: STRIVEAI_APP_URL });
    }
    window.close();
  });
});

function pad(n) { return String(n).padStart(2, '0'); }

function msToLabel(ms) {
  if (ms <= 0) return 'DONE';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(m)}:${pad(s)}`;
}

function elapsedLabel(startedAt) {
  if (!startedAt) return '00:00';
  const ms = Math.max(0, Date.now() - startedAt);
  return msToLabel(ms);
}

function countdownLabel(startedAt, plannedDuration) {
  if (!startedAt || !plannedDuration) return '–';
  const elapsed = Date.now() - startedAt;
  const planned = plannedDuration * 60 * 1000;
  return msToLabel(Math.max(0, planned - elapsed));
}

function progressPct(startedAt, plannedDuration) {
  if (!startedAt || !plannedDuration) return 0;
  const elapsed = Date.now() - startedAt;
  const planned = plannedDuration * 60 * 1000;
  return Math.min(100, Math.round((elapsed / planned) * 100));
}

function isUrgent(startedAt, plannedDuration) {
  if (!startedAt || !plannedDuration) return false;
  const elapsed = Date.now() - startedAt;
  const planned = plannedDuration * 60 * 1000;
  const remaining = planned - elapsed;
  return remaining > 0 && remaining < 120000; // < 2 min
}

function findStriveTab(cb) {
  chrome.tabs.query({ url: `${STRIVEAI_APP_URL}/*` }, (tabs) => {
    cb(tabs[0] || null);
  });
}

function sendPageAction(action) {
  findStriveTab((tab) => {
    if (!tab) {
      chrome.tabs.create({ url: STRIVEAI_APP_URL });
      window.close();
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: 'page_action', action });
  });
}

function render(state) {
  const root = document.getElementById('root');

  if (!state || (!state.isRunning && !state.stageName)) {
    // Not connected / no active session
    root.innerHTML = `
      <div class="not-connected">
        <div class="not-connected-icon">◈</div>
        <div class="not-connected-title">No active session</div>
        <div class="not-connected-sub">Open StriveAI and start a session from the Dashboard to track your focus here.</div>
        <button class="btn primary" id="go-btn" style="max-width:180px;margin:0 auto;display:block">Open StriveAI</button>
      </div>
      ${state?.streak > 0 ? `
      <div class="stats-row">
        <div class="stat"><div class="stat-val">${state.streak}🔥</div><div class="stat-lbl">Streak</div></div>
        <div class="stat"><div class="stat-val">${state.userName || '–'}</div><div class="stat-lbl">Builder</div></div>
      </div>` : ''}
      <div class="footer">
        <span class="footer-note">StriveAI Focus v1.0</span>
        <a class="footer-link" id="footer-link">Open app</a>
      </div>`;
    document.getElementById('go-btn')?.addEventListener('click', () => {
      chrome.tabs.create({ url: STRIVEAI_APP_URL }); window.close();
    });
    document.getElementById('footer-link')?.addEventListener('click', () => {
      chrome.tabs.create({ url: STRIVEAI_APP_URL }); window.close();
    });
    return;
  }

  const running = state.isRunning;
  const urgent = running && isUrgent(state.startedAt, state.plannedDuration);
  const pct = progressPct(state.startedAt, state.plannedDuration);
  const elapsed = elapsedLabel(state.startedAt);
  const countdown = countdownLabel(state.startedAt, state.plannedDuration);
  const statusClass = running ? (urgent ? 'warning' : 'running') : '';
  const statusLabel = running ? (urgent ? 'ENDING SOON' : 'SESSION RUNNING') : 'IDLE';

  root.innerHTML = `
    <div class="status-bar">
      <div class="status-dot ${statusClass}"></div>
      <div class="status-label ${statusClass}">${statusLabel}</div>
      ${state.streak > 0 ? `<div style="margin-left:auto;font-size:11px;color:var(--amber);font-weight:700">${state.streak}🔥</div>` : ''}
    </div>

    <div class="session-card">
      <div class="session-goal ${state.goal ? '' : 'empty'}">${state.goal || 'No goal set for this session'}</div>

      <div class="timer-row">
        <div class="timer-box">
          <div class="timer-val" id="elapsed-val">${elapsed}</div>
          <div class="timer-lbl">Elapsed</div>
        </div>
        ${state.plannedDuration ? `
        <div class="timer-box">
          <div class="timer-val countdown ${urgent ? 'urgent' : 'ok'}" id="countdown-val">${countdown}</div>
          <div class="timer-lbl">Remaining · ${state.plannedDuration}m</div>
        </div>` : ''}
      </div>

      ${state.plannedDuration ? `
      <div class="progress-wrap">
        <div class="progress-track"><div class="progress-fill" id="prog-fill" style="width:${pct}%"></div></div>
        <div class="progress-pct" id="prog-pct">${pct}%</div>
      </div>` : ''}

      ${state.stageName ? `<div style="font-size:10px;color:var(--muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:600">${state.stageName}</div>` : ''}

      <div class="action-row">
        ${running ? `<button class="btn danger" id="end-btn">End Session</button>` : `<button class="btn primary" id="start-btn">Start Session</button>`}
      </div>
    </div>

    <div class="stats-row">
      <div class="stat">
        <div class="stat-val">${state.taskCount || 0}</div>
        <div class="stat-lbl">Tasks</div>
      </div>
      <div class="stat">
        <div class="stat-val">${state.streak > 0 ? `${state.streak}🔥` : '–'}</div>
        <div class="stat-lbl">Streak</div>
      </div>
    </div>

    <div class="footer">
      <span class="footer-note">${state.userName ? `Hi, ${state.userName}` : 'StriveAI Focus v1.0'}</span>
      <a class="footer-link" id="footer-link">Open app</a>
    </div>`;

  document.getElementById('end-btn')?.addEventListener('click', () => {
    sendPageAction('end_session');
  });
  document.getElementById('start-btn')?.addEventListener('click', () => {
    sendPageAction('start_session');
    findStriveTab((tab) => {
      if (tab) { chrome.tabs.update(tab.id, { active: true }); }
      else { chrome.tabs.create({ url: STRIVEAI_APP_URL }); }
      window.close();
    });
  });
  document.getElementById('footer-link')?.addEventListener('click', () => {
    chrome.tabs.create({ url: STRIVEAI_APP_URL }); window.close();
  });
}

// Live ticker
let tickerInterval = null;
let cachedState = null;

function tick() {
  if (!cachedState) return;
  const elapsed = document.getElementById('elapsed-val');
  const countdown = document.getElementById('countdown-val');
  const progFill = document.getElementById('prog-fill');
  const progPct = document.getElementById('prog-pct');
  if (elapsed && cachedState.startedAt) {
    elapsed.textContent = elapsedLabel(cachedState.startedAt);
  }
  if (countdown && cachedState.startedAt && cachedState.plannedDuration) {
    countdown.textContent = countdownLabel(cachedState.startedAt, cachedState.plannedDuration);
    const urgent = isUrgent(cachedState.startedAt, cachedState.plannedDuration);
    countdown.className = `timer-val countdown ${urgent ? 'urgent' : 'ok'}`;
  }
  if (progFill && cachedState.startedAt && cachedState.plannedDuration) {
    const pct = progressPct(cachedState.startedAt, cachedState.plannedDuration);
    progFill.style.width = pct + '%';
    if (progPct) progPct.textContent = pct + '%';
  }
}

// Initial load
chrome.runtime.sendMessage({ type: 'get_state' }, (state) => {
  cachedState = state;
  render(state);
  if (state?.isRunning) {
    tickerInterval = setInterval(tick, 1000);
  }
});
