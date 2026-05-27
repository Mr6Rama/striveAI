// Plan preview — shown immediately after onboarding track generation.
import { renderJournal, wireJournal } from '../components/journal.js';

const INTENSITY_LABELS = {
  '0-1': '10 min/day', '1-2': '25 min/day', '2-4': '45 min/day', '4-6': '60+ min/day',
};

const CATEGORY_LABELS = {
  project: 'Build a project / MVP', startup: 'Startup / idea validation',
  content: 'Content / personal brand', skill: 'Learn a skill',
  career: 'Career / portfolio', study: 'Study / exam',
  habit: 'Habit / self-development', fitness: 'Fitness / health', other: 'Other',
};

const BLOCKER_LABELS = {
  procrastinate: 'procrastination', forget: 'forgetting',
  overwhelmed: 'overwhelm', no_start: 'not knowing where to start',
  motivation: 'low motivation', avoid: 'task avoidance',
  no_time: 'not enough time', too_big: 'plan too big',
};

export function render(container, state, actions) {
  const track = state.track;
  const days  = Array.isArray(track?.days) ? track.days : [];

  if (!track?.id || !days.length) { actions.onNavigate?.('/onboarding'); return; }

  const day1 = days[0] || {};

  const tg          = state.telegram || {};
  const pingHour    = tg.pingHour ?? 9;
  const pingLabel   = pingHour < 12 ? 'Morning' : pingHour < 17 ? 'Afternoon' : 'Evening';
  const pingDisplay = tg.connected
    ? `${pingLabel} · ${pingHour}:00 UTC (@${esc(tg.username || 'you')})`
    : 'Not connected — add Telegram in Settings';

  const intensity  = INTENSITY_LABELS[state.user?.dailyHours] || state.user?.dailyHours || '2–4 hours/day';
  const category   = CATEGORY_LABELS[track.goalCategory] || track.goalCategory || '';
  const blocker    = BLOCKER_LABELS[track.blockerHint]   || track.blockerHint  || '';
  const isSpark    = track.kind === 'spark';
  const planLabel  = isSpark ? '7-day Spark' : `${track.totalDays || 28}-day Track`;

  container.innerHTML = `
    <div class="v2-page">

      <div class="v2-kicker" style="margin-bottom:10px">
        <span class="v2-badge v2-badge--done">Plan ready</span>
      </div>
      <h1 class="v2-h1" style="margin-bottom:6px">Your ${planLabel} is ready</h1>
      <p class="v2-sub">${esc(track.goal)}</p>

      <div class="v2-card" style="margin-bottom:20px">
        <div class="v2-section-label" style="margin-bottom:12px">Setup summary</div>
        ${metaRow('Category',      category)}
        ${metaRow('Blocker',       blocker || '—')}
        ${metaRow('Daily time',    intensity)}
        ${metaRow('Telegram ping', pingDisplay)}
      </div>

      <div class="v2-section-label" style="margin-bottom:12px">Day 1 — Start here</div>
      ${dayCard1(day1)}

      <div class="v2-section-label" style="margin-bottom:12px;margin-top:24px">${isSpark ? 'The week ahead' : 'The 4 weeks ahead'}</div>
      ${renderJournal({ track, entries: [], currentDayNumber: 1, variant: 'compact' })}

      ${promiseBlock()}

      <button id="pp-start" class="v2-btn v2-btn--primary v2-btn--lg v2-btn--full" style="margin-bottom:10px">
        Start Day 1 →
      </button>
      ${tg.connected ? '' : `<button data-route="/settings" class="v2-btn v2-btn--ghost v2-btn--full">
        Connect Telegram for daily check-ins
      </button>`}

    </div>`;

  container.querySelector('#pp-start')?.addEventListener('click', () => actions.onStartDay1?.());
  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
  wireJournal(container);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function metaRow(label, value) {
  return `<div class="v2-meta-row">
    <span class="v2-muted-text" style="flex-shrink:0">${esc(label)}</span>
    <span class="v2-body-text" style="text-align:right">${esc(String(value))}</span>
  </div>`;
}

function dayCard1(day) {
  return `
    <div class="v2-card v2-card--blue" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="width:30px;height:30px;border-radius:50%;background:rgba(59,130,246,.2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;color:var(--v2-blue);flex-shrink:0;border:1px solid rgba(59,130,246,.3)">1</div>
        <span class="v2-kicker v2-kicker--muted" style="margin:0">Day 1 — Start here</span>
      </div>
      <p class="v2-h3" style="margin-bottom:8px">${esc(day.title || '—')}</p>
      ${day.why ? `<p class="v2-body-text" style="margin-bottom:10px">${esc(day.why)}</p>` : ''}
      ${day.successCriteria ? `<div class="v2-done-criteria">Done when: ${esc(day.successCriteria)}</div>` : ''}
      <p class="v2-muted-text" style="margin-top:8px">${day.estimateMinutes || 60} min · ${esc(day.category || 'task')}</p>
    </div>`;
}

function promiseBlock() {
  const items = [
    ['Start with Agent',   "Guided micro-steps for each day's task"],
    ['Get Action Kit',     'Resources, templates, and shortcuts'],
    ['Prove progress',     'Log your proof of work'],
    ['Recover if blocked', 'Rescue action when things go wrong'],
    ['Adapt the next day', "Tomorrow adjusts based on today's outcome"],
  ];
  return `
    <div class="v2-card" style="margin-bottom:20px">
      <div class="v2-section-label" style="margin-bottom:12px">StriveAI helps you execute each day</div>
      ${items.map(([label, desc]) => `
        <div style="display:flex;gap:10px;margin-bottom:9px;align-items:flex-start">
          <span style="color:var(--v2-blue);font-size:.82rem;flex-shrink:0;margin-top:1px">→</span>
          <div class="v2-body-text"><strong style="color:var(--v2-text)">${esc(label)}</strong> — ${esc(desc)}</div>
        </div>`).join('')}
    </div>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
