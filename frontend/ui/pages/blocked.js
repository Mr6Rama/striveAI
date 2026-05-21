// Blocked / Skipped flow — /blocked?type=blocked  or  /blocked?type=skipped

const REASONS = Object.freeze([
  { id: 'no_time',       label: 'No time',            category: 'time'       },
  { id: 'too_big',       label: 'Too big',             category: 'unclear'    },
  { id: 'unclear_start', label: 'Unclear start',       category: 'unclear'    },
  { id: 'low_energy',    label: 'Low energy',          category: 'motivation' },
  { id: 'avoiding',      label: 'Avoiding it',         category: 'motivation' },
  { id: 'forgot',        label: 'Forgot',              category: 'time'       },
  { id: 'not_important', label: 'Not important today', category: 'motivation' },
]);

const REASON_TEXT = Object.freeze({
  no_time:       'Not enough time today',
  too_big:       'The task feels too big to start',
  unclear_start: 'Not sure how to start',
  low_energy:    'Low energy / not in the right headspace',
  avoiding:      'Feeling avoidant or anxious about it',
  forgot:        'Simply forgot about it',
  not_important: 'Does not feel important today',
});

let phase      = 'reason';
let selectedId = '';
let rescueData = null;
let repeating  = false;

export function resetBlockedState() {
  phase      = 'reason';
  selectedId = '';
  rescueData = null;
  repeating  = false;
}

export function render(container, state, actions) {
  const { track, today, history, ui } = state;

  if (!track?.id || !Array.isArray(track.days) || !track.days.length) {
    actions.onNavigate?.('/onboarding');
    return;
  }

  const params  = new URLSearchParams(window.location.search);
  const type    = params.get('type') === 'skipped' ? 'skipped' : 'blocked';
  const isSkip  = type === 'skipped';
  const dayNum  = track.currentDayNumber || today.dayNumber || 1;
  const dayPlan = track.days.find((d) => d.dayNumber === dayNum) ?? track.days[0] ?? {};

  if (ui?.rescueLoading && phase === 'reason') phase = 'loading';
  if (today.rescueAction && phase !== 'rescue' && !ui?.rescueLoading) {
    rescueData = today.rescueAction;
    repeating  = Boolean(today.rescueRepeating);
    phase      = 'rescue';
  }

  container.innerHTML = buildPage(phase, isSkip, dayNum, dayPlan, selectedId, rescueData, repeating, ui);
  wireEvents(container, state, actions, isSkip, dayPlan);
}

// ── Page builder ──────────────────────────────────────────────────────────────

function buildPage(phase, isSkip, dayNum, dayPlan, selId, rescue, repeating, ui) {
  const question = isSkip ? 'Why are you skipping?' : 'What blocked you?';
  const badgeCls = isSkip ? 'v2-badge--skipped' : 'v2-badge--blocked';

  return `
    <div class="v2-page-center">

      <div class="v2-kicker" style="margin-bottom:8px">
        <span>Day ${dayNum}</span>
        <span class="v2-badge ${badgeCls}">${isSkip ? 'Skip' : 'Blocked'}</span>
      </div>
      <h1 class="v2-h1" style="margin-bottom:6px">${esc(question)}</h1>
      <p class="v2-sub">${esc(dayPlan.title || '')}</p>

      ${phase === 'reason'  ? renderReasonPicker(selId)               : ''}
      ${phase === 'loading' ? renderLoading()                         : ''}
      ${phase === 'rescue'  ? renderRescue(rescue, isSkip, repeating) : ''}

      <button data-route="/today" class="v2-btn v2-btn--ghost" style="margin-top:12px">← Back to Today</button>

    </div>`;
}

function renderReasonPicker(selId) {
  const pills = REASONS.map((r) => {
    const on = selId === r.id;
    return `<button data-reason="${r.id}" class="v2-reason-pill${on ? ' v2-reason-pill--on' : ''}">${esc(r.label)}</button>`;
  }).join('');

  return `
    <div class="v2-reason-grid">${pills}</div>
    <button id="blocked-next" ${selId ? '' : 'disabled'} class="v2-btn v2-btn--amber v2-btn--lg v2-btn--full">
      Get rescue action →
    </button>`;
}

function renderLoading() {
  return `<div class="v2-loading-center">
    <div class="v2-spin" style="border-top-color:var(--v2-amber)"></div>
    <p class="v2-muted-text">Finding a smaller action for you…</p>
  </div>`;
}

function renderRescue(rescue, isSkip, repeating) {
  if (!rescue) return renderLoading();

  const steps = Array.isArray(rescue.steps) ? rescue.steps : [];
  const stepsHtml = steps.map((s, i) =>
    `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--v2-border)">
       <span class="v2-muted-text" style="min-width:18px;padding-top:1px">${i + 1}.</span>
       <p class="v2-body-text" style="margin:0">${esc(String(s))}</p>
     </div>`
  ).join('');

  return `
    ${repeating ? `
      <div class="v2-card v2-card--amber" style="margin-bottom:14px">
        <p style="color:var(--v2-amber);font-size:.875rem;font-weight:600;margin:0">This pattern is repeating. Tomorrow will start smaller and clearer.</p>
      </div>` : ''}

    ${rescue.reframeNote ? `
      <div class="v2-insight" style="margin-bottom:14px">${esc(rescue.reframeNote)}</div>` : ''}

    <div class="v2-card" style="margin-bottom:16px">
      <div class="v2-section-label" style="margin-bottom:8px">Rescue action</div>
      <p class="v2-h3" style="margin-bottom:12px">${esc(rescue.rescueTitle || '')}</p>
      ${stepsHtml}
      ${rescue.estimateMinutes
        ? `<p class="v2-muted-text" style="margin-top:10px">~${rescue.estimateMinutes} min</p>` : ''}
    </div>

    <div class="v2-row v2-row--col" style="gap:8px">
      <button id="rescue-agent" class="v2-btn v2-btn--primary v2-btn--lg v2-btn--full">
        Start Rescue with Agent
      </button>
      <button id="rescue-mark-done" class="v2-btn v2-btn--green v2-btn--full">
        Mark Rescued — I did the rescue action
      </button>
      <button id="rescue-missed" class="v2-btn v2-btn--ghost v2-btn--full">
        Accept missed day
      </button>
    </div>`;
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function wireEvents(container, state, actions, isSkip, dayPlan) {
  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });

  container.querySelectorAll('[data-reason]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedId = btn.getAttribute('data-reason');
      render(container, state, actions);
    });
  });

  container.querySelector('#blocked-next')?.addEventListener('click', () => {
    if (!selectedId) return;
    const reason     = REASONS.find((r) => r.id === selectedId);
    const reasonText = REASON_TEXT[selectedId] || reason?.label || selectedId;
    const category   = reason?.category || 'other';
    phase = 'loading';
    render(container, state, actions);
    actions.onBlockerDiagnose?.({ reasonText, category, isSkip });
  });

  container.querySelector('#rescue-agent')?.addEventListener('click', () => actions.onNavigate?.('/agent'));
  container.querySelector('#rescue-mark-done')?.addEventListener('click', () => actions.onBlockerRescueDone?.());
  container.querySelector('#rescue-missed')?.addEventListener('click', () => actions.onBlockerMissed?.());
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
