// Agent Mode — /agent
// Guides the user through 3-5 concrete micro-steps to execute today's task.

const PATTERN_TIPS = Object.freeze({
  time:      'Short on time? Agent can give you a 5-minute version.',
  skill_gap: 'Stuck on skills? Action Kit has resources and examples.',
  unclear:   'Not sure where to start? The first step below is your answer.',
  motivation:'Low energy? Completing step 1 usually breaks the inertia.',
  avoid:     'Avoiding this? Step 1 is the safest possible entry point.',
  external:  'Blocked externally? Step 1 focuses on what you can do right now.',
  other:     "Something in the way? Flag it with 'I'm stuck' on any step.",
});

const PROOF_PLACEHOLDERS = Object.freeze({
  text:      'Describe what you made or did — one or two specific sentences.',
  link:      'Paste the URL to what you built, wrote, or published.',
  statement: 'Write one concrete statement of what you proved you could do.',
});

// Module state — persists across re-renders within a session
let sessionRequested = false;
let stepNote  = '';
let proofText = '';
let proofType = 'text';

export function render(container, state, actions) {
  const track   = state.track;
  const today   = state.today;
  const session = today?.agentSession;
  const loading = Boolean(state.ui?.agentLoading);

  if (!track?.id || !Array.isArray(track.days) || !track.days.length) {
    actions.onNavigate?.('/onboarding');
    return;
  }

  const dayNum  = track.currentDayNumber || today.dayNumber || 1;
  const dayPlan = track.days.find((d) => d.dayNumber === dayNum) ?? track.days[0] ?? {};

  if (!session && !loading) {
    if (!sessionRequested) {
      sessionRequested = true;
      actions.onAgentInit?.();
    }
    renderLoading(container, actions);
    return;
  }

  if (session) sessionRequested = false;
  if (loading && !session) { renderLoading(container, actions); return; }
  if (!session) return;

  const { steps, currentStepIndex, outcome, proofNote } = session;
  const insight = buildInsight(state.history?.failurePatterns);

  if (outcome === 'done') { actions.onNavigate?.('/today'); return; }

  if (outcome === 'partial' || outcome === 'blocked') {
    renderVerdict(container, dayPlan, track, outcome, proofNote, insight, actions);
    return;
  }

  if (currentStepIndex >= steps.length) {
    renderProofInput(container, dayPlan, track, insight, loading, actions);
    return;
  }

  renderExecution(container, dayPlan, track, today, session, insight, loading, actions);
}

// ── Loading ────────────────────────────────────────────────────────────────

function renderLoading(container, actions) {
  container.innerHTML = `
    <div class="v2-page-center">
      <div class="v2-loading-center">
        <div class="v2-spin"></div>
        <p class="v2-muted-text">Building your execution steps…</p>
        <button data-route="/today" class="v2-btn v2-btn--ghost">← Back to Today</button>
      </div>
    </div>`;
  wireNav(container, actions);
}

// ── Main execution view ────────────────────────────────────────────────────

function renderExecution(container, dayPlan, track, today, session, insight, loading, actions) {
  const { steps, currentStepIndex } = session;

  container.innerHTML = `
    <div class="v2-page-wide">
      <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">

        <div style="flex:0 0 260px;min-width:220px;max-width:280px;position:sticky;top:1.5rem">
          ${contextPanel(dayPlan, track, today, insight)}
        </div>

        <div style="flex:1;min-width:260px">
          ${progressPills(steps, currentStepIndex)}
          ${stepList(steps, currentStepIndex, stepNote, loading)}
          <button data-route="/today" class="v2-btn v2-btn--ghost" style="margin-top:6px">← Back to Today</button>
        </div>

      </div>
    </div>`;

  const ta = container.querySelector('#ag-note');
  if (ta) {
    ta.value = stepNote;
    ta.addEventListener('input', (e) => { stepNote = e.target.value; });
  }

  container.querySelector('#ag-complete')?.addEventListener('click', async () => {
    const btn = container.querySelector('#ag-complete');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    await actions.onAgentStepDone?.({ stepIndex: currentStepIndex, note: stepNote });
    stepNote = '';
  });

  container.querySelector('#ag-stuck')?.addEventListener('click', () => {
    actions.onNavigate?.('/blocked?type=blocked');
  });

  wireNav(container, actions);
}

// ── Proof input ────────────────────────────────────────────────────────────

function renderProofInput(container, dayPlan, track, insight, loading, actions) {
  const placeholder = PROOF_PLACEHOLDERS[proofType] || PROOF_PLACEHOLDERS.text;

  container.innerHTML = `
    <div class="v2-page-wide">
      <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">

        <div style="flex:0 0 260px;min-width:220px;max-width:280px;position:sticky;top:1.5rem">
          ${contextPanel(dayPlan, track, null, insight)}
        </div>

        <div style="flex:1;min-width:260px">
          <div class="v2-kicker" style="margin-bottom:12px">
            <span class="v2-badge v2-badge--done">All steps complete ✓</span>
          </div>
          <h2 class="v2-h2" style="margin-bottom:6px">What did you produce?</h2>
          <p class="v2-sub">Be specific — this becomes your proof of work.</p>

          <div class="v2-proof-types">
            ${['text','link','statement'].map((t) => {
              const active = proofType === t;
              return `<button data-ptype="${t}" class="v2-btn v2-btn--sm ${active ? 'v2-btn--primary' : 'v2-btn--secondary'}" style="text-transform:capitalize">${t}</button>`;
            }).join('')}
          </div>

          <div class="v2-field">
            <textarea id="ag-proof" rows="4" placeholder="${esc(placeholder)}" class="v2-textarea">${esc(proofText)}</textarea>
          </div>

          <div id="ag-proof-err" class="v2-err"></div>

          <button id="ag-submit" ${loading ? 'disabled' : ''} class="v2-btn v2-btn--primary v2-btn--lg v2-btn--full" style="margin-top:4px">
            ${loading ? 'Checking proof…' : 'Submit proof →'}
          </button>

          <button data-route="/today" class="v2-btn v2-btn--ghost" style="margin-top:8px">← Back to Today</button>
        </div>

      </div>
    </div>`;

  const ta = container.querySelector('#ag-proof');
  if (ta) {
    ta.value = proofText;
    ta.addEventListener('input', (e) => { proofText = e.target.value; });
  }

  container.querySelectorAll('[data-ptype]').forEach((btn) => {
    btn.addEventListener('click', () => {
      proofType = btn.getAttribute('data-ptype');
      renderProofInput(container, dayPlan, track, insight, loading, actions);
    });
  });

  container.querySelector('#ag-submit')?.addEventListener('click', async () => {
    const val = proofText.trim();
    const errEl = container.querySelector('#ag-proof-err');
    if (!val) { if (errEl) errEl.textContent = 'Describe your output before submitting.'; return; }
    if (errEl) errEl.textContent = '';
    await actions.onAgentProofSubmit?.({ type: proofType, value: val });
  });

  wireNav(container, actions);
}

// ── Verdict (partial / blocked) ────────────────────────────────────────────

function renderVerdict(container, dayPlan, track, outcome, proofNote, insight, actions) {
  const isPartial = outcome === 'partial';
  const heading   = isPartial ? 'Good progress — one more thing' : "Proof doesn't show completion";
  const note      = proofNote || (isPartial
    ? "Your proof shows real progress but doesn't fully meet the done criteria yet."
    : "The proof doesn't clearly demonstrate the task was completed.");

  container.innerHTML = `
    <div class="v2-page-wide">
      <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">

        <div style="flex:0 0 260px;min-width:220px;max-width:280px;position:sticky;top:1.5rem">
          ${contextPanel(dayPlan, track, null, insight)}
        </div>

        <div style="flex:1;min-width:260px">
          <div class="v2-kicker" style="margin-bottom:10px">
            <span class="v2-badge ${isPartial ? 'v2-badge--blocked' : 'v2-badge--missed'}">${esc(heading)}</span>
          </div>
          <p class="v2-sub">${esc(note)}</p>

          ${isPartial ? `
            <div class="v2-field">
              <label class="v2-label">Add or improve your proof:</label>
              <textarea id="ag-improve" rows="4" placeholder="What specifically can you add to show it's done?" class="v2-textarea"></textarea>
            </div>
            <button id="ag-resubmit" class="v2-btn v2-btn--primary v2-btn--lg v2-btn--full" style="margin-bottom:10px">
              Submit improved proof →
            </button>` : ''}

          <div class="v2-row">
            <button id="ag-rescue" class="v2-btn v2-btn--amber" style="flex:1">Get Rescue Action</button>
            ${!isPartial ? `
            <button id="ag-retry" class="v2-btn v2-btn--secondary" style="flex:1">Try Again</button>` : ''}
          </div>

          <button data-route="/today" class="v2-btn v2-btn--ghost" style="margin-top:12px">← Back to Today</button>
        </div>

      </div>
    </div>`;

  const improveTA = container.querySelector('#ag-improve');
  if (improveTA) {
    improveTA.value = proofText;
    improveTA.addEventListener('input', (e) => { proofText = e.target.value; });
  }

  container.querySelector('#ag-resubmit')?.addEventListener('click', async () => {
    const val = (improveTA?.value || '').trim() || proofText.trim();
    if (!val) return;
    proofText = val;
    await actions.onAgentProofSubmit?.({ type: proofType, value: val });
  });

  container.querySelector('#ag-rescue')?.addEventListener('click', () => actions.onNavigate?.('/blocked?type=blocked'));
  container.querySelector('#ag-retry')?.addEventListener('click', () => { proofText = ''; actions.onAgentRetry?.(); });
  wireNav(container, actions);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function contextPanel(dayPlan, track, today, insight) {
  const status = today?.status || 'pending';
  const dayNum = dayPlan.dayNumber || 1;
  return `
    <div class="v2-context-panel">
      <div class="v2-kicker v2-kicker--muted" style="margin-bottom:8px">
        Day ${dayNum} of 7
      </div>
      <p class="v2-muted-text" style="margin-bottom:10px">${esc(track.goal || '')}</p>
      <p class="v2-h3" style="margin-bottom:8px">${esc(dayPlan.title || '—')}</p>
      ${dayPlan.successCriteria
        ? `<div class="v2-done-criteria" style="margin-bottom:8px">Done: ${esc(dayPlan.successCriteria)}</div>`
        : ''}
      <p class="v2-muted-text">${dayPlan.estimateMinutes || 60} min · ${esc(dayPlan.category || 'task')}</p>
      ${insight ? `<div class="v2-insight" style="margin-top:12px;margin-bottom:0">${esc(insight)}</div>` : ''}
    </div>`;
}

function progressPills(steps, currentIndex) {
  const pills = steps.map((_, i) => {
    const cls = i < currentIndex ? 'v2-step-pill--done' : i === currentIndex ? 'v2-step-pill--active' : '';
    const label = i < currentIndex ? '✓' : String(i + 1);
    return `<div class="v2-step-pill ${cls}">${label}</div>`;
  }).join('');
  return `
    <div class="v2-step-pills">${pills}</div>
    <div class="v2-kicker v2-kicker--muted" style="margin-bottom:14px">
      Step ${Math.min(currentIndex + 1, steps.length)} of ${steps.length}
    </div>`;
}

function stepList(steps, currentIndex, note, loading) {
  return steps.map((step, i) => {
    if (i < currentIndex) {
      return `<div class="v2-step-done-row">
        <span style="color:var(--v2-green);flex-shrink:0">✓</span>
        <span style="color:var(--v2-muted)">${esc(step.text)}</span>
      </div>`;
    }
    if (i === currentIndex) {
      return `<div class="v2-step-card--active v2-bracketed" style="overflow:visible">
        <span class="v2-br-tr"></span><span class="v2-br-bl"></span>
        <div class="v2-today-action" style="margin-bottom:8px">// Step ${i + 1}</div>
        <p class="v2-h3" style="margin-bottom:12px">${esc(step.text)}</p>
        <div class="v2-field">
          <label class="v2-label">Your output or a short note:</label>
          <textarea id="ag-note" rows="3" placeholder="What did you produce? Or note where you are…" class="v2-textarea" style="min-height:70px"></textarea>
        </div>
        <div class="v2-row" style="margin-top:8px">
          <button id="ag-complete" ${loading ? 'disabled' : ''} class="v2-btn v2-btn--primary" style="flex:1">
            Complete Step →
          </button>
          <button id="ag-stuck" class="v2-btn v2-btn--ghost">I'm stuck</button>
        </div>
      </div>`;
    }
    return `<div class="v2-step-upcoming-row">
      <span style="color:var(--v2-dim);flex-shrink:0">${i + 1}.</span>
      <span>${esc(step.text)}</span>
    </div>`;
  }).join('');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildInsight(patterns) {
  if (!Array.isArray(patterns) || !patterns.length) return '';
  const counts = {};
  patterns.forEach(({ blockerCategory: c }) => { if (c) counts[c] = (counts[c] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ? (PATTERN_TIPS[top] || '') : '';
}

function wireNav(container, actions) {
  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
