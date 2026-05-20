// v2 Today's Action screen.
// Route: /today — primary daily screen showing the current day's task.

const STATUS_COLOR = Object.freeze({
  done:        '#22c55e',
  rescued:     '#22c55e',
  blocked:     '#f59e0b',
  skipped:     '#6b7280',
  missed:      '#ef4444',
  in_progress: '#3b82f6',
  pending:     '#6b7280',
});

const STATUS_LABEL = Object.freeze({
  done:        'DONE',
  rescued:     'RESCUED',
  blocked:     'BLOCKED',
  skipped:     'SKIPPED',
  missed:      'MISSED',
  in_progress: 'IN PROGRESS',
  pending:     'PENDING',
});

const PATTERN_TIPS = Object.freeze({
  time:       'Short on time? Agent can give you a 5-minute version of today\'s task.',
  skill_gap:  'Feeling stuck on skills? Action Kit has resources and worked examples.',
  unclear:    'Not sure where to start? Agent will surface the first visible action.',
  motivation: 'Low energy? Start Agent — the first micro-step usually unsticks things.',
  avoid:      'Avoiding the task? Agent gives you the safest possible first step.',
  external:   'Waiting on something external? Agent can suggest what you can do now.',
  other:      'Something blocking you? Agent or Action Kit can help you get unstuck.',
});

// ── v1 legacy exports (used by old HTML shell via script.js) ───────────────

let bound = false;

export function bindTodayHandlers({ onDone, onMissed, onBlocked, onSkip } = {}) {
  if (bound) return;
  bound = true;
  document.getElementById('btn-done')?.addEventListener('click', () => typeof onDone === 'function' && onDone());
  document.getElementById('btn-missed')?.addEventListener('click', () => typeof onMissed === 'function' && onMissed());
  document.getElementById('btn-blocked')?.addEventListener('click', () => typeof onBlocked === 'function' && onBlocked());
  document.getElementById('btn-skip')?.addEventListener('click', () => typeof onSkip === 'function' && onSkip());
}

export function renderToday(state) {
  const today = state.today;
  setText('mc-title', today.primaryTaskText || 'Complete onboarding to generate your plan');
  setText('mc-detail', today.reason || '');
  setText('mc-tag1', `Status: ${String(today.status || 'Ready').toUpperCase()}`);
  setText('mc-tag2', today.stageProgressHint ? `Progress: ${today.stageProgressHint}` : 'Priority: —');
  setText('today-task-text', today.primaryTaskText || 'No task assigned');
  setText('today-status', String(today.status || 'pending').toUpperCase());
  setText('today-feedback', state.ui.feedback || '');
}

// ── v2 render ──────────────────────────────────────────────────────────────

export function render(container, state, actions) {
  const track = state.track;
  const today = state.today;

  if (!track?.id || !Array.isArray(track.days) || !track.days.length) {
    actions.onNavigate?.('/onboarding');
    return;
  }
  if (track.status === 'complete') {
    actions.onNavigate?.('/recap');
    return;
  }

  const dayNum  = track.currentDayNumber || today.dayNumber || 1;
  const dayPlan = track.days.find((d) => d.dayNumber === dayNum) ?? track.days[0] ?? {};
  const status  = today.status || 'pending';

  if (status === 'done' || status === 'rescued') {
    renderComplete(container, track, today, dayPlan, status, actions);
  } else if (status === 'blocked') {
    renderBlocked(container, track, today, dayPlan, state, actions);
  } else if (status === 'skipped' || status === 'missed') {
    renderInactive(container, track, today, dayPlan, status, actions);
  } else {
    renderActive(container, track, today, dayPlan, state, actions);
  }
}

// ── Active (pending / in_progress) ────────────────────────────────────────

function renderActive(container, track, today, dayPlan, state, actions) {
  const dayNum  = dayPlan.dayNumber || 1;
  const status  = today.status || 'pending';
  const insight = buildInsight(state.history?.failurePatterns);
  const tgNote  = buildTgNote(state.telegram);

  container.innerHTML = `
    <div style="max-width:560px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">

      ${topBar(dayNum, status, track.goal)}
      ${actionCard(dayPlan)}
      ${insight ? `<div style="font-size:.78rem;color:#6b7280;padding:10px 12px;background:#0f172a;border-left:3px solid #374151;border-radius:4px;margin-bottom:16px">${esc(insight)}</div>` : ''}

      <button id="td-agent"
        style="width:100%;padding:13px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:800;font-size:.95rem;cursor:pointer;margin-bottom:8px">
        Start with Agent →
      </button>

      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button id="td-kit"
          style="flex:1;padding:11px;background:#111827;color:#9ca3af;border:1px solid #1f2937;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer">
          Action Kit
        </button>
        <button id="td-done"
          style="flex:1;padding:11px;background:#111827;color:#9ca3af;border:1px solid #1f2937;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer">
          I already did it
        </button>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:20px">
        <button id="td-blocked"
          style="flex:1;padding:10px;background:transparent;color:#6b7280;border:1px solid #1f2937;border-radius:8px;font-size:.82rem;cursor:pointer">
          I'm blocked
        </button>
        <button id="td-skip"
          style="flex:1;padding:10px;background:transparent;color:#6b7280;border:1px solid #1f2937;border-radius:8px;font-size:.82rem;cursor:pointer">
          Skip today
        </button>
      </div>

      ${tgNote}
      ${secondaryNav()}
    </div>`;

  container.querySelector('#td-agent')?.addEventListener('click', () => actions.onNavigate?.('/agent'));
  container.querySelector('#td-kit')?.addEventListener('click', () => actions.onNavigate?.('/action-kit'));
  container.querySelector('#td-done')?.addEventListener('click', () => actions.onNavigate?.('/proof?source=main'));
  container.querySelector('#td-blocked')?.addEventListener('click', () => actions.onNavigate?.('/blocked?type=blocked'));
  container.querySelector('#td-skip')?.addEventListener('click', () => actions.onNavigate?.('/blocked?type=skipped'));
  wireNav(container, actions);
}

// ── Complete (done / rescued) ──────────────────────────────────────────────

function renderComplete(container, track, today, dayPlan, status, actions) {
  const dayNum = dayPlan.dayNumber || 1;
  const isLast = dayNum >= 7;
  const colour = STATUS_COLOR[status];
  const label  = status === 'rescued' ? 'Rescued' : 'Done';

  container.innerHTML = `
    <div style="max-width:560px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">

      ${topBar(dayNum, status, track.goal)}

      <div style="background:#0a1a0a;border:1px solid #166534;border-radius:10px;padding:16px;margin-bottom:20px">
        <div style="font-size:.75rem;font-weight:700;color:${colour};text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">${esc(label)} ✓</div>
        <div style="font-weight:700;color:#f9fafb;font-size:.95rem;line-height:1.4;margin-bottom:8px">${esc(dayPlan.title || '—')}</div>
        ${today.proof?.value ? `<div style="font-size:.8rem;color:#6b7280;border-top:1px solid #14532d;padding-top:8px;margin-top:4px">Proof: ${esc(today.proof.value)}</div>` : ''}
      </div>

      ${isLast
        ? `<button id="td-recap"
            style="width:100%;padding:13px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:800;font-size:.95rem;cursor:pointer;margin-bottom:10px">
            Go to Day 7 Recap →
          </button>`
        : `<div style="color:#6b7280;font-size:.85rem;text-align:center;padding:14px 0">
            Day ${dayNum} complete. Come back tomorrow for Day ${dayNum + 1}.
          </div>`}

      ${secondaryNav()}
    </div>`;

  container.querySelector('#td-recap')?.addEventListener('click', () => actions.onNavigate?.('/recap'));
  wireNav(container, actions);
}

// ── Blocked ────────────────────────────────────────────────────────────────

function renderBlocked(container, track, today, dayPlan, state, actions) {
  const dayNum  = dayPlan.dayNumber || 1;
  const insight = buildInsight(state.history?.failurePatterns);

  container.innerHTML = `
    <div style="max-width:560px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">

      ${topBar(dayNum, 'blocked', track.goal)}

      <div style="background:#1a1200;border:1px solid #92400e;border-radius:10px;padding:16px;margin-bottom:16px">
        <div style="font-size:.75rem;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Blocked</div>
        <div style="font-weight:700;color:#f9fafb;font-size:.92rem;line-height:1.4">${esc(dayPlan.title || '—')}</div>
        ${today.blockerText ? `<div style="font-size:.82rem;color:#9ca3af;margin-top:8px">${esc(today.blockerText)}</div>` : ''}
      </div>

      <button id="td-rescue"
        style="width:100%;padding:13px;background:#f59e0b;color:#000;border:none;border-radius:8px;font-weight:800;font-size:.95rem;cursor:pointer;margin-bottom:8px">
        Get Rescue Action →
      </button>
      <button id="td-agent-b"
        style="width:100%;padding:11px;background:#111827;color:#9ca3af;border:1px solid #1f2937;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer;margin-bottom:16px">
        Try Agent instead
      </button>

      ${insight ? `<div style="font-size:.78rem;color:#6b7280;padding:10px 12px;background:#0f172a;border-left:3px solid #374151;border-radius:4px;margin-bottom:16px">${esc(insight)}</div>` : ''}
      ${secondaryNav()}
    </div>`;

  container.querySelector('#td-rescue')?.addEventListener('click', () => actions.onNavigate?.('/blocked?type=blocked'));
  container.querySelector('#td-agent-b')?.addEventListener('click', () => actions.onNavigate?.('/agent'));
  wireNav(container, actions);
}

// ── Inactive (skipped / missed) ────────────────────────────────────────────

function renderInactive(container, track, today, dayPlan, status, actions) {
  const dayNum = dayPlan.dayNumber || 1;
  const label  = status === 'skipped' ? 'Skipped' : 'Missed';
  const colour = STATUS_COLOR[status];

  container.innerHTML = `
    <div style="max-width:560px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">

      ${topBar(dayNum, status, track.goal)}

      <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:16px;margin-bottom:16px">
        <div style="font-size:.75rem;font-weight:700;color:${colour};text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">${esc(label)}</div>
        <div style="font-weight:700;color:#9ca3af;font-size:.92rem;line-height:1.4">${esc(dayPlan.title || '—')}</div>
      </div>

      <p style="color:#6b7280;font-size:.85rem;margin:0 0 16px">No action needed — the track will adapt. Come back tomorrow.</p>

      <button id="td-agent-r"
        style="width:100%;padding:11px;background:#111827;color:#9ca3af;border:1px solid #1f2937;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer;margin-bottom:16px">
        Try it now with Agent →
      </button>

      ${secondaryNav()}
    </div>`;

  container.querySelector('#td-agent-r')?.addEventListener('click', () => actions.onNavigate?.('/agent'));
  wireNav(container, actions);
}

// ── Shared components ──────────────────────────────────────────────────────

function topBar(dayNum, status, goal) {
  const colour = STATUS_COLOR[status] || '#6b7280';
  const label  = STATUS_LABEL[status] || String(status).toUpperCase();
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase">Day ${dayNum} of 7</span>
      <span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${colour}">· ${esc(label)}</span>
    </div>
    <p style="color:#6b7280;font-size:.8rem;margin:0 0 14px;line-height:1.4">${esc(goal || '')}</p>`;
}

function actionCard(dayPlan) {
  return `
    <div style="margin-bottom:16px">
      <h1 style="font-size:1.25rem;font-weight:800;color:#f9fafb;margin:0 0 8px;line-height:1.35">${esc(dayPlan.title || 'No task assigned')}</h1>
      ${dayPlan.why ? `<p style="color:#9ca3af;font-size:.85rem;line-height:1.6;margin:0 0 10px">${esc(dayPlan.why)}</p>` : ''}
      ${dayPlan.successCriteria
        ? `<div style="font-size:.8rem;color:#4b5563;padding:9px 12px;background:#0f172a;border-left:3px solid #1d4ed8;border-radius:4px;margin-bottom:10px">Done means: ${esc(dayPlan.successCriteria)}</div>`
        : ''}
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:.76rem;color:#4b5563">
        <span>${dayPlan.estimateMinutes || 60} min</span>
        ${dayPlan.category ? `<span>· ${esc(dayPlan.category)}</span>` : ''}
        ${dayPlan.blockerRisk ? `<span>· Risk: ${esc(dayPlan.blockerRisk)}</span>` : ''}
      </div>
    </div>`;
}

function buildInsight(patterns) {
  if (!Array.isArray(patterns) || !patterns.length) return '';
  const counts = {};
  patterns.forEach(({ blockerCategory: c }) => { if (c) counts[c] = (counts[c] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ? (PATTERN_TIPS[top] || '') : '';
}

function buildTgNote(telegram) {
  if (!telegram?.connected) return '';
  const h      = telegram.pingHour ?? 9;
  const period = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `<div style="font-size:.76rem;color:#4b5563;margin-bottom:16px">Telegram check-in: ${period} · ${h}:00 UTC</div>`;
}

function secondaryNav() {
  return `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">
      <button data-route="/progress" style="padding:8px 0;background:transparent;color:#4b5563;border:none;font-size:.78rem;cursor:pointer">Progress</button>
      <button data-route="/settings" style="padding:8px 0;background:transparent;color:#4b5563;border:none;font-size:.78rem;cursor:pointer">Settings</button>
    </div>`;
}

function wireNav(container, actions) {
  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
