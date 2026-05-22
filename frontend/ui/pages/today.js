// v2 Today's Action screen — primary daily execution screen.
import { renderRoadmap } from '../components/roadmap.js';
import { buildMorningBrief } from '../../domain/morning-brief.js';
import { computeStreaks, consecutiveMissedDays } from '../../domain/streak.js';
import { isoDateNow } from '../../core/state-model.js';

const STATUS_CLASS = Object.freeze({
  done:        'v2-badge--done',
  rescued:     'v2-badge--rescued',
  blocked:     'v2-badge--blocked',
  skipped:     'v2-badge--skipped',
  missed:      'v2-badge--missed',
  in_progress: 'v2-badge--in-prog',
  pending:     'v2-badge--pending',
});

const STATUS_LABEL = Object.freeze({
  done:        'Done',
  rescued:     'Rescued',
  blocked:     'Blocked',
  skipped:     'Skipped',
  missed:      'Missed',
  in_progress: 'In Progress',
  pending:     'Pending',
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
    renderComplete(container, track, today, dayPlan, status, state, actions);
  } else if (status === 'blocked') {
    renderBlocked(container, track, today, dayPlan, state, actions);
  } else if (status === 'skipped' || status === 'missed') {
    renderInactive(container, track, today, dayPlan, status, state, actions);
  } else {
    renderActive(container, track, today, dayPlan, state, actions);
  }
}

// ── Active (pending / in_progress) ────────────────────────────────────────

function renderActive(container, track, today, dayPlan, state, actions) {
  const dayNum   = dayPlan.dayNumber || 1;
  const status   = today.status || 'pending';
  const insight  = state.ui?.insight || '';
  const tgNote   = buildTgNote(state.telegram);
  const todayIso = isoDateNow();
  const streaks  = computeStreaks(state.history, track.id, todayIso);
  const missGap  = consecutiveMissedDays(state.history, track.id, todayIso);
  const brief    = buildMorningBrief({ user: state.user, track, today, history: state.history, streaks });
  const softReturn = missGap >= 2;

  container.innerHTML = `
    <div class="v2-page v2-page-center">

      ${topBar(dayNum, status, track.goal, track, state.user)}
      ${softReturn ? softReturnBanner(missGap) : `<p class="v2-morning-brief">${esc(brief)}</p>`}
      ${actionCard(dayPlan, state.user)}
      ${yesterdayCallback(state.history, track)}
      ${insight ? `<div class="v2-insight">${esc(insight)}</div>` : ''}

      <button id="td-agent" class="v2-btn v2-btn--primary v2-btn--lg v2-btn--full" style="margin-bottom:10px">
        Start with Agent →
      </button>

      <button id="td-kit" class="v2-btn v2-btn--secondary v2-btn--full" style="margin-bottom:18px">Action Kit</button>

      <div class="v2-row" style="margin-bottom:16px">
        <button id="td-blocked" class="v2-btn v2-btn--ghost" style="flex:1">I’m stuck</button>
        <button id="td-skip"    class="v2-btn v2-btn--ghost" style="flex:1">Skip today</button>
      </div>

      <div style="text-align:center;margin-bottom:20px">
        <button id="td-done" class="v2-link-btn">I already did it — submit proof</button>
      </div>

      ${tgNote}

    </div>`;

  container.querySelector('#td-agent')?.addEventListener('click', () => actions.onNavigate?.('/agent'));
  container.querySelector('#td-kit')?.addEventListener('click', () => actions.onNavigate?.('/action-kit'));
  container.querySelector('#td-done')?.addEventListener('click', () => actions.onNavigate?.('/proof?source=main'));
  container.querySelector('#td-blocked')?.addEventListener('click', () => actions.onNavigate?.('/blocked?type=blocked'));
  container.querySelector('#td-skip')?.addEventListener('click', () => actions.onNavigate?.('/blocked?type=skipped'));
}

// ── Complete (done / rescued) ──────────────────────────────────────────────

function renderComplete(container, track, today, dayPlan, status, state, actions) {
  const dayNum  = dayPlan.dayNumber || 1;
  const isLast  = dayNum >= 7;
  const cardCls = status === 'rescued' ? 'v2-card v2-card--blue' : 'v2-card v2-card--green';
  const label   = status === 'rescued' ? 'Rescued ✓' : 'Done ✓';

  container.innerHTML = `
    <div class="v2-page v2-page-center">

      ${topBar(dayNum, status, track.goal, track, state.user)}

      <div class="${cardCls}" style="margin-bottom:20px">
        <div class="v2-kicker" style="margin-bottom:8px">${esc(label)}</div>
        <p class="v2-h3">${esc(dayPlan.title || '—')}</p>
        ${today.proof?.value
          ? `<p class="v2-muted-text" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--v2-border)">Proof: ${esc(today.proof.value)}</p>`
          : ''}
      </div>

      ${isLast
        ? `<button id="td-recap" class="v2-btn v2-btn--primary v2-btn--lg v2-btn--full" style="margin-bottom:10px">
             Go to Day 7 Recap →
           </button>`
        : `<p class="v2-muted-text" style="text-align:center;padding:14px 0">
             Day ${dayNum} complete. Come back tomorrow for Day ${dayNum + 1}.
           </p>`}

    </div>`;

  container.querySelector('#td-recap')?.addEventListener('click', () => actions.onNavigate?.('/recap'));
}

// ── Blocked ────────────────────────────────────────────────────────────────

function renderBlocked(container, track, today, dayPlan, state, actions) {
  const dayNum  = dayPlan.dayNumber || 1;
  const insight = state.ui?.insight || '';

  container.innerHTML = `
    <div class="v2-page v2-page-center">

      ${topBar(dayNum, "blocked", track.goal, track, state.user)}

      <div class="v2-card v2-card--amber" style="margin-bottom:16px">
        <div class="v2-kicker v2-badge v2-badge--blocked" style="margin-bottom:8px;align-self:flex-start">Blocked</div>
        <p class="v2-h3">${esc(dayPlan.title || '—')}</p>
        ${today.blockerText ? `<p class="v2-muted-text" style="margin-top:6px">${esc(today.blockerText)}</p>` : ''}
      </div>

      <button id="td-rescue" class="v2-btn v2-btn--amber v2-btn--lg v2-btn--full" style="margin-bottom:8px">
        Get Rescue Action →
      </button>
      <button id="td-agent-b" class="v2-btn v2-btn--secondary v2-btn--full" style="margin-bottom:16px">
        Try Agent instead
      </button>

      ${insight ? `<div class="v2-insight">${esc(insight)}</div>` : ''}

    </div>`;

  container.querySelector('#td-rescue')?.addEventListener('click', () => actions.onNavigate?.('/blocked?type=blocked'));
  container.querySelector('#td-agent-b')?.addEventListener('click', () => actions.onNavigate?.('/agent'));
}

// ── Inactive (skipped / missed) ────────────────────────────────────────────

function renderInactive(container, track, today, dayPlan, status, state, actions) {
  const dayNum  = dayPlan.dayNumber || 1;
  const cardCls = status === 'missed' ? 'v2-card v2-card--red' : 'v2-card';

  container.innerHTML = `
    <div class="v2-page v2-page-center">

      ${topBar(dayNum, status, track.goal, track, state.user)}

      <div class="${cardCls}" style="margin-bottom:16px">
        <div class="v2-kicker" style="margin-bottom:6px">
          <span class="v2-badge v2-badge--${status}">${STATUS_LABEL[status] || status}</span>
        </div>
        <p class="v2-h3" style="color:var(--v2-text-2)">${esc(dayPlan.title || '—')}</p>
      </div>

      <p class="v2-muted-text" style="margin-bottom:16px">No action needed — the track will adapt. Come back tomorrow.</p>

      <button id="td-agent-r" class="v2-btn v2-btn--secondary v2-btn--full" style="margin-bottom:16px">
        Try it now with Agent →
      </button>

    </div>`;

  container.querySelector('#td-agent-r')?.addEventListener('click', () => actions.onNavigate?.('/agent'));
}

// ── Shared components ──────────────────────────────────────────────────────

// Hide PENDING / IN_PROGRESS status — they are noise. Show the badge only
// for outcomes that carry information (done, rescued, blocked, missed, skipped).
const VISIBLE_STATUSES = new Set(['done', 'rescued', 'blocked', 'missed', 'skipped']);

function topBar(dayNum, status, goal, track, user) {
  const cls       = STATUS_CLASS[status] || '';
  const label     = STATUS_LABEL[status] || '';
  const showBadge = VISIBLE_STATUSES.has(status);
  const project   = String(user?.currentProject || '').trim();
  const weekGoal  = String(user?.weekGoal || '').trim();
  // Lead with the most personal anchor: project, then week outcome, then track goal.
  const subline   = project || weekGoal || goal || '';

  const days = Array.isArray(track?.days) ? track.days.map((d) => ({
    dayNumber: d.dayNumber,
    status:    d.status || 'pending',
    title:     d.title,
  })) : [];
  const roadmap = days.length ? renderRoadmap({ days, currentDay: dayNum, variant: 'compact' }) : '';

  return `
    ${roadmap}
    <div class="v2-kicker" style="margin-bottom:6px">
      <span>Day ${dayNum} of 7</span>
      ${showBadge ? `<span class="v2-badge ${cls}">${esc(label)}</span>` : ''}
    </div>
    ${subline ? `<p class="v2-muted-text" style="margin-bottom:16px">${esc(subline)}</p>` : ''}`;
}

function actionCard(dayPlan, user) {
  const weekGoal = String(user?.weekGoal || '').trim();
  return `
    <div class="v2-card v2-card--focus v2-bracketed" style="margin-bottom:20px;overflow:visible">
      <span class="v2-br-tr"></span><span class="v2-br-bl"></span>
      <div class="v2-today-action">Today’s mission</div>
      <h2 class="v2-today-title">${esc(dayPlan.title || 'No task assigned')}</h2>
      ${dayPlan.why ? `<p class="v2-body-text" style="margin-bottom:12px">${esc(dayPlan.why)}</p>` : ''}
      ${dayPlan.successCriteria
        ? `<div class="v2-done-criteria" style="margin-bottom:10px">You’re done when ${esc(deCapitalize(dayPlan.successCriteria))}</div>`
        : ''}
      <p class="v2-mission-meta">${dayPlan.estimateMinutes || 60} min${weekGoal ? ` · toward ${esc(truncate(weekGoal, 36))}` : ''}</p>
    </div>`;
}

function deCapitalize(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function truncate(s, n) {
  const t = String(s || '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function yesterdayCallback(history, track) {
  const entries = Array.isArray(history?.entries) ? history.entries : [];
  const inTrack = entries.filter((e) => e.trackId === track?.id);
  if (!inTrack.length) return '';
  const last = inTrack.reduce((a, b) => (!a || b.date > a.date ? b : a), null);
  if (!last?.taskTitle) return '';

  const icon = ({
    done:    '✓',
    rescued: '✓',
    blocked: '!',
    missed:  '·',
    skipped: '·',
  })[last.outcome] || '·';
  const iconClass = (last.outcome === 'done' || last.outcome === 'rescued')
    ? 'v2-yesterday__icon--good'
    : (last.outcome === 'blocked')
      ? 'v2-yesterday__icon--blocked'
      : 'v2-yesterday__icon--muted';

  return `
    <div class="v2-yesterday">
      <span class="v2-yesterday__icon ${iconClass}">${icon}</span>
      <span class="v2-yesterday__label">Yesterday:</span>
      <span class="v2-yesterday__title">${esc(truncate(last.taskTitle, 70))}</span>
    </div>`;
}

function buildTgNote(telegram) {
  if (!telegram?.connected) return '';
  const h      = telegram.pingHour ?? 9;
  const period = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `<p class="v2-muted-text" style="margin-bottom:16px">Telegram check-in: ${period} · ${h}:00 UTC</p>`;
}

function softReturnBanner(missGap) {
  const days = missGap === 1 ? 'a day' : `${missGap} days`;
  return `
    <div class="v2-soft-return">
      <div class="v2-soft-return__title">Welcome back.</div>
      <p class="v2-soft-return__body">It’s been ${days}. You don’t need to catch up — the plan adjusts to where you are now. Today’s task is sized for a real return.</p>
    </div>`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
