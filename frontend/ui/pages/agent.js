// Agent Mode — /agent
// Guides the user through 3-5 concrete micro-steps to execute today's task.
// Not a chatbot. Moves the user through execution, one step at a time.

const PATTERN_TIPS = Object.freeze({
  time:      'Short on time? Agent can give you a 5-minute version.',
  skill_gap: 'Stuck on skills? Action Kit has resources and examples.',
  unclear:   'Not sure where to start? The first step below is your answer.',
  motivation:'Low energy? Completing step 1 usually breaks the inertia.',
  avoid:     'Avoiding this? Step 1 is the safest possible entry point.',
  external:  'Blocked externally? Step 1 focuses on what you can do right now.',
  other:     'Something in the way? Flag it with "I\'m stuck" on any step.',
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

  // Request step generation exactly once per session
  if (!session && !loading) {
    if (!sessionRequested) {
      sessionRequested = true;
      actions.onAgentInit?.();
    }
    renderLoading(container, actions);
    return;
  }

  // Reset flag once session exists so the next day re-triggers init
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
    <div style="max-width:560px;margin:4rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif;text-align:center">
      <div style="color:#6b7280;font-size:.9rem;margin-bottom:20px">Building your execution steps…</div>
      <div style="display:inline-block;width:20px;height:20px;border:2px solid #1f2937;border-top-color:#3b82f6;border-radius:50%;animation:spin .8s linear infinite"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      <div style="margin-top:28px">
        <button data-route="/today" style="${ghostBtn()}">← Back to Today</button>
      </div>
    </div>`;
  wireNav(container, actions);
}

// ── Main execution view ────────────────────────────────────────────────────

function renderExecution(container, dayPlan, track, today, session, insight, loading, actions) {
  const { steps, currentStepIndex } = session;

  container.innerHTML = `
    <div style="max-width:900px;margin:2rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">

        <div style="flex:1;min-width:230px;max-width:280px">
          ${contextPanel(dayPlan, track, today, insight)}
        </div>

        <div style="flex:2;min-width:280px">
          ${progressPills(steps, currentStepIndex)}
          ${stepList(steps, currentStepIndex, stepNote, loading)}
          <div style="margin-top:14px">
            <button data-route="/today" style="${ghostBtn()}">← Back to Today</button>
          </div>
        </div>

      </div>
    </div>`;

  // Restore textarea value and keep module state in sync
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
    <div style="max-width:760px;margin:2rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">

        <div style="flex:1;min-width:220px;max-width:260px">
          ${contextPanel(dayPlan, track, null, insight)}
        </div>

        <div style="flex:2;min-width:260px">
          <div style="font-size:.72rem;font-weight:700;color:#22c55e;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">All steps complete ✓</div>
          <h2 style="font-size:1.1rem;font-weight:800;color:#f9fafb;margin:0 0 6px">What did you produce?</h2>
          <p style="color:#9ca3af;font-size:.82rem;margin:0 0 16px;line-height:1.5">Be specific — this becomes your proof of work.</p>

          <div style="display:flex;gap:6px;margin-bottom:12px">
            ${['text','link','statement'].map((t) => {
              const active = proofType === t;
              return `<button data-ptype="${t}"
                style="padding:7px 12px;background:${active ? '#1e3a5f' : '#111827'};color:${active ? '#93c5fd' : '#6b7280'};border:${active ? '2px solid #3b82f6' : '1px solid #1f2937'};border-radius:6px;font-size:.78rem;font-weight:${active ? '700' : '500'};cursor:pointer;text-transform:capitalize">
                ${t}
              </button>`;
            }).join('')}
          </div>

          <textarea id="ag-proof" rows="4" placeholder="${esc(placeholder)}"
            style="width:100%;padding:10px 12px;background:#111827;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.88rem;box-sizing:border-box;resize:vertical;min-height:88px"></textarea>

          <div id="ag-proof-err" style="font-size:.78rem;color:#f87171;min-height:1.2em;margin-top:6px"></div>

          <button id="ag-submit" ${loading ? 'disabled' : ''}
            style="width:100%;padding:12px;background:${loading ? '#1f2937' : '#3b82f6'};color:${loading ? '#6b7280' : '#fff'};border:none;border-radius:8px;font-weight:800;font-size:.92rem;cursor:${loading ? 'default' : 'pointer'};margin-top:10px">
            ${loading ? 'Checking proof…' : 'Submit proof →'}
          </button>

          <div style="margin-top:12px">
            <button data-route="/today" style="${ghostBtn()}">← Back to Today</button>
          </div>
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
  const accentColor = isPartial ? '#f59e0b' : '#ef4444';
  const heading = isPartial ? 'Good progress — one more thing' : "Proof doesn't show completion";
  const note = proofNote || (isPartial
    ? "Your proof shows real progress but doesn't fully meet the done criteria yet."
    : "The proof doesn't clearly demonstrate the task was completed.");

  container.innerHTML = `
    <div style="max-width:760px;margin:2rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">

        <div style="flex:1;min-width:220px;max-width:260px">
          ${contextPanel(dayPlan, track, null, insight)}
        </div>

        <div style="flex:2;min-width:260px">
          <div style="font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${accentColor};margin-bottom:10px">${esc(heading)}</div>
          <p style="color:#9ca3af;font-size:.85rem;line-height:1.6;margin:0 0 20px">${esc(note)}</p>

          ${isPartial ? `
            <label style="font-size:.78rem;font-weight:600;color:#9ca3af;display:block;margin-bottom:6px">Add or improve your proof:</label>
            <textarea id="ag-improve" rows="4" placeholder="What specifically can you add to show it's done?"
              style="width:100%;padding:10px 12px;background:#111827;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.88rem;box-sizing:border-box;resize:vertical;min-height:80px"></textarea>
            <button id="ag-resubmit"
              style="width:100%;padding:12px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:.9rem;cursor:pointer;margin-top:10px">
              Submit improved proof →
            </button>` : ''}

          <div style="display:flex;gap:8px;margin-top:${isPartial ? '8px' : '0'}">
            <button id="ag-rescue"
              style="flex:1;padding:11px;background:#111827;color:#f59e0b;border:1px solid #92400e;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer">
              Get Rescue Action
            </button>
            ${!isPartial ? `
            <button id="ag-retry"
              style="flex:1;padding:11px;background:#111827;color:#9ca3af;border:1px solid #1f2937;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer">
              Try Again
            </button>` : ''}
          </div>

          <div style="margin-top:14px">
            <button data-route="/today" style="${ghostBtn()}">← Back to Today</button>
          </div>
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

  container.querySelector('#ag-rescue')?.addEventListener('click', () => {
    actions.onNavigate?.('/blocked?type=blocked');
  });

  container.querySelector('#ag-retry')?.addEventListener('click', () => {
    proofText = '';
    actions.onAgentRetry?.();
  });

  wireNav(container, actions);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function contextPanel(dayPlan, track, today, insight) {
  const status = today?.status || 'pending';
  const dayNum = dayPlan.dayNumber || 1;
  return `
    <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:16px;position:sticky;top:1.5rem">
      <div style="font-size:.68rem;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;margin-bottom:6px">
        Day ${dayNum} of 7 · ${esc(status.replace('_', ' ').toUpperCase())}
      </div>
      <div style="font-size:.74rem;color:#4b5563;margin-bottom:10px;line-height:1.4">${esc(track.goal || '')}</div>
      <div style="font-weight:700;color:#f9fafb;font-size:.88rem;line-height:1.35;margin-bottom:8px">${esc(dayPlan.title || '—')}</div>
      ${dayPlan.successCriteria
        ? `<div style="font-size:.74rem;color:#4b5563;padding:8px 10px;background:#111827;border-left:2px solid #1d4ed8;border-radius:4px;margin-bottom:8px;line-height:1.45">Done: ${esc(dayPlan.successCriteria)}</div>`
        : ''}
      <div style="font-size:.72rem;color:#4b5563">${dayPlan.estimateMinutes || 60} min · ${esc(dayPlan.category || 'task')}</div>
      ${insight ? `<div style="font-size:.72rem;color:#4b5563;margin-top:10px;padding-top:10px;border-top:1px solid #1f2937;line-height:1.5">${esc(insight)}</div>` : ''}
    </div>`;
}

function progressPills(steps, currentIndex) {
  const pills = steps.map((_, i) => {
    const bg = i < currentIndex ? '#22c55e' : i === currentIndex ? '#3b82f6' : '#1f2937';
    return `<div style="flex:1;height:4px;background:${bg};border-radius:2px"></div>`;
  }).join('');
  return `
    <div style="display:flex;gap:4px;margin-bottom:14px">${pills}</div>
    <div style="font-size:.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px">
      Step ${Math.min(currentIndex + 1, steps.length)} of ${steps.length}
    </div>`;
}

function stepList(steps, currentIndex, note, loading) {
  return steps.map((step, i) => {
    if (i < currentIndex) {
      return `<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #111827;opacity:.5">
        <span style="color:#22c55e;font-size:.82rem;flex-shrink:0;margin-top:1px">✓</span>
        <span style="font-size:.82rem;color:#6b7280;line-height:1.4">${esc(step.text)}</span>
      </div>`;
    }
    if (i === currentIndex) {
      return `<div style="background:#0f172a;border:2px solid #3b82f6;border-radius:10px;padding:16px;margin-bottom:12px">
        <div style="font-weight:700;color:#f9fafb;font-size:.92rem;line-height:1.4;margin-bottom:12px">${esc(step.text)}</div>
        <label style="font-size:.75rem;font-weight:600;color:#6b7280;display:block;margin-bottom:6px">Your output or a short note:</label>
        <textarea id="ag-note" rows="3" placeholder="What did you produce? Or note where you are…"
          style="width:100%;padding:10px;background:#111827;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.85rem;box-sizing:border-box;resize:vertical;min-height:70px">${esc(note)}</textarea>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button id="ag-complete" ${loading ? 'disabled' : ''}
            style="flex:1;padding:11px;background:#3b82f6;color:#fff;border:none;border-radius:7px;font-weight:700;font-size:.88rem;cursor:pointer">
            Complete Step →
          </button>
          <button id="ag-stuck"
            style="padding:11px 14px;background:transparent;color:#6b7280;border:1px solid #1f2937;border-radius:7px;font-size:.8rem;cursor:pointer">
            I'm stuck
          </button>
        </div>
      </div>`;
    }
    return `<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #0f172a;opacity:.3">
      <span style="font-size:.76rem;color:#4b5563;flex-shrink:0;margin-top:1px">${i + 1}.</span>
      <span style="font-size:.82rem;color:#6b7280;line-height:1.4">${esc(step.text)}</span>
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

function ghostBtn() {
  return 'padding:8px 0;background:transparent;color:#4b5563;border:none;font-size:.78rem;cursor:pointer';
}

function wireNav(container, actions) {
  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
