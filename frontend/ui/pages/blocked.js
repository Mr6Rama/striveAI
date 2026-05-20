// Blocked / Skipped flow — /blocked?type=blocked  or  /blocked?type=skipped
//
// States (module-level, survive re-renders):
//   'reason'   — choose a reason
//   'loading'  — generating rescue action
//   'rescue'   — show diagnosis + rescue action + CTAs
//   'done'     — terminal (navigates away, never renders)

const REASONS = Object.freeze([
  { id: 'no_time',       label: 'No time',            category: 'time'       },
  { id: 'too_big',       label: 'Too big',             category: 'unclear'    },
  { id: 'unclear_start', label: 'Unclear start',       category: 'unclear'    },
  { id: 'low_energy',    label: 'Low energy',          category: 'motivation' },
  { id: 'avoiding',      label: 'Avoiding it',         category: 'motivation' },
  { id: 'forgot',        label: 'Forgot',              category: 'time'       },
  { id: 'not_important', label: 'Not important today', category: 'motivation' },
]);

// Map reason IDs → human text sent to the AI
const REASON_TEXT = Object.freeze({
  no_time:       'Not enough time today',
  too_big:       'The task feels too big to start',
  unclear_start: 'Not sure how to start',
  low_energy:    'Low energy / not in the right headspace',
  avoiding:      'Feeling avoidant or anxious about it',
  forgot:        'Simply forgot about it',
  not_important: 'Does not feel important today',
});

// Module state — reset on every fresh navigation
let phase       = 'reason'; // 'reason' | 'loading' | 'rescue'
let selectedId  = '';
let rescueData  = null;     // { rescueTitle, steps, reframeNote }
let repeating   = false;

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

  // Sync loading state from ui flags
  if (ui?.rescueLoading && phase === 'reason') phase = 'loading';
  // Sync rescue data from state (set by app.js after AI call)
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
  const dayLabel = `Day ${dayNum}${isSkip ? ' · Skip' : ' · Blocked'}`;

  return `
    <div style="max-width:520px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">

      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">
        ${esc(dayLabel)}
      </div>
      <h1 style="font-size:1.35rem;font-weight:800;color:#f9fafb;margin:0 0 6px">${esc(question)}</h1>
      <p style="color:#6b7280;font-size:.83rem;margin:0 0 20px;line-height:1.5">${esc(dayPlan.title || '')}</p>

      ${phase === 'reason'  ? renderReasonPicker(selId)               : ''}
      ${phase === 'loading' ? renderLoading()                         : ''}
      ${phase === 'rescue'  ? renderRescue(rescue, isSkip, repeating) : ''}

      <div style="margin-top:12px">
        <button data-route="/today" style="padding:8px 0;background:transparent;color:#4b5563;border:none;font-size:.78rem;cursor:pointer">
          ← Back to Today
        </button>
      </div>

    </div>`;
}

function renderReasonPicker(selectedId) {
  const pills = REASONS.map((r) => {
    const active = selectedId === r.id;
    return `<button data-reason="${r.id}"
      style="padding:9px 14px;border-radius:20px;border:1px solid ${active ? '#3b82f6' : '#374151'};background:${active ? '#0f1f3d' : 'transparent'};color:${active ? '#93c5fd' : '#9ca3af'};font-size:.85rem;font-weight:${active ? '700' : '500'};cursor:pointer;transition:none">
      ${esc(r.label)}
    </button>`;
  }).join('');

  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
      ${pills}
    </div>
    <button id="blocked-next" ${selectedId ? '' : 'disabled'}
      style="width:100%;padding:12px;background:${selectedId ? '#f59e0b' : '#1f2937'};color:${selectedId ? '#000' : '#4b5563'};border:none;border-radius:8px;font-weight:700;font-size:.9rem;cursor:${selectedId ? 'pointer' : 'default'}">
      Get rescue action →
    </button>`;
}

function renderLoading() {
  return `
    <div style="text-align:center;padding:32px 0">
      <div style="color:#6b7280;font-size:.88rem;margin-bottom:16px">Finding a smaller action for you…</div>
      <div style="display:inline-block;width:18px;height:18px;border:2px solid #1f2937;border-top-color:#f59e0b;border-radius:50%;animation:spin .8s linear infinite"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    </div>`;
}

function renderRescue(rescue, isSkip, repeating) {
  if (!rescue) return renderLoading();

  const steps = Array.isArray(rescue.steps) ? rescue.steps : [];
  const stepsHtml = steps.map((s, i) =>
    `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #1f2937">
       <div style="color:#6b7280;font-size:.8rem;min-width:18px;padding-top:1px">${i + 1}.</div>
       <div style="color:#d1d5db;font-size:.87rem;line-height:1.55">${esc(String(s))}</div>
     </div>`
  ).join('');

  return `
    ${repeating ? `
      <div style="background:#1a1200;border:1px solid #92400e;border-radius:8px;padding:12px 14px;margin-bottom:16px">
        <div style="color:#fbbf24;font-size:.82rem;font-weight:600">This pattern is repeating. Tomorrow will start smaller and clearer.</div>
      </div>` : ''}

    ${rescue.reframeNote ? `
      <div style="color:#9ca3af;font-size:.82rem;line-height:1.55;margin-bottom:16px;padding:10px 14px;background:#111827;border-left:3px solid #374151;border-radius:4px">
        ${esc(rescue.reframeNote)}
      </div>` : ''}

    <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:16px;margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Rescue action</div>
      <div style="font-weight:700;color:#f9fafb;font-size:.95rem;margin-bottom:12px">${esc(rescue.rescueTitle || '')}</div>
      ${stepsHtml}
      ${rescue.estimateMinutes ? `
        <div style="color:#6b7280;font-size:.78rem;margin-top:10px">~${rescue.estimateMinutes} min</div>` : ''}
    </div>

    <div style="display:flex;flex-direction:column;gap:8px">
      <button id="rescue-agent"
        style="padding:12px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:.9rem;cursor:pointer">
        Start Rescue with Agent
      </button>
      <button id="rescue-mark-done"
        style="padding:11px;background:#052e16;color:#4ade80;border:1px solid #166534;border-radius:8px;font-weight:600;font-size:.88rem;cursor:pointer">
        Mark Rescued — I did the rescue action
      </button>
      <button id="rescue-missed"
        style="padding:11px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer">
        Accept missed day
      </button>
    </div>`;
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function wireEvents(container, state, actions, isSkip, dayPlan) {
  // Back navigation
  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });

  // Reason pills
  container.querySelectorAll('[data-reason]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedId = btn.getAttribute('data-reason');
      render(container, state, actions);
    });
  });

  // Next — trigger rescue generation
  container.querySelector('#blocked-next')?.addEventListener('click', () => {
    if (!selectedId) return;
    const reason = REASONS.find((r) => r.id === selectedId);
    const reasonText  = REASON_TEXT[selectedId] || reason?.label || selectedId;
    const category    = reason?.category || 'other';
    phase = 'loading';
    render(container, state, actions);
    actions.onBlockerDiagnose?.({ reasonText, category, isSkip });
  });

  // Rescue CTAs
  container.querySelector('#rescue-agent')?.addEventListener('click', () => {
    actions.onNavigate?.('/agent');
  });

  container.querySelector('#rescue-mark-done')?.addEventListener('click', () => {
    actions.onBlockerRescueDone?.();
  });

  container.querySelector('#rescue-missed')?.addEventListener('click', () => {
    actions.onBlockerMissed?.();
  });
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
