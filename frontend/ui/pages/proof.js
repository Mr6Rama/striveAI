// Proof of Progress — /proof
// Entry points: /today "I already did it", /agent final step, rescue completion.
// URL param ?source=rescue → marks day as 'rescued' on success (not 'done').
// URL param ?source=agent  → for display context only; completion handled by agent.js

// Category-specific proof config
const CATEGORY_PROOF = Object.freeze({
  coding: {
    prompt: 'What did you build or fix today?',
    hint:   'A GitHub link, commit note, or brief description of the code change',
    types:  ['link', 'text'],
  },
  writing: {
    prompt: 'What did you write?',
    hint:   'Word count + 1–2 sentences about what it covers, or a link to a doc',
    types:  ['text', 'link'],
  },
  design: {
    prompt: 'What did you design or prototype?',
    hint:   'A Figma link, screenshot URL, or a description of the design decision made',
    types:  ['link', 'text'],
  },
  business: {
    prompt: 'What did you complete or decide?',
    hint:   'Describe the action taken, outcome reached, or decision made',
    types:  ['text', 'link'],
  },
  learning: {
    prompt: 'What did you learn or practice?',
    hint:   'Summarise the concept, skill, or exercise you completed',
    types:  ['text', 'statement'],
  },
  fitness: {
    prompt: 'What did you do?',
    hint:   'Sets/reps/duration or a short note on what you completed',
    types:  ['statement', 'text'],
  },
  content: {
    prompt: 'What did you create or publish?',
    hint:   'A link to the post/video/episode, or a description of what you produced',
    types:  ['link', 'text'],
  },
  other: {
    prompt: 'What did you accomplish today?',
    hint:   'A brief description of what you completed',
    types:  ['text', 'link', 'statement'],
  },
});

const TYPE_LABELS = Object.freeze({
  text:      'Written note — describe what you completed',
  link:      'Link — URL to your work (repo, doc, post, etc.)',
  statement: 'Quick statement — "I completed X"',
});

// Module-level state to survive re-renders without DOM querying
let proofText  = '';
let proofType  = '';
let submitting = false;

export function render(container, state, actions) {
  const { track, today, ui } = state;
  const source  = getQueryParam('source'); // 'rescue' | 'main' | 'agent' | null

  if (!track?.id || !Array.isArray(track.days) || !track.days.length) {
    actions.onNavigate?.('/onboarding');
    return;
  }

  const dayNum  = track.currentDayNumber || today.dayNumber || 1;
  const dayPlan = track.days.find((d) => d.dayNumber === dayNum) ?? track.days[0] ?? {};
  const category = (track.goalCategory || 'other').toLowerCase();
  const cfg     = CATEGORY_PROOF[category] || CATEGORY_PROOF.other;

  // Initialise proof type to the first option for this category if not yet set
  if (!proofType || !cfg.types.includes(proofType)) {
    proofType = cfg.types[0];
  }

  // proofResult is set by app.js after checkProof runs
  const proofResult = today.proofResult || null;
  const loading     = Boolean(ui?.proofLoading);
  const isRescue    = source === 'rescue';

  container.innerHTML = buildPage(dayNum, dayPlan, cfg, proofType, proofText, proofResult, loading, isRescue, submitting);

  // ── Event wiring ──────────────────────────────────────────────────────────

  // Back / cancel navigation
  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });

  // Proof type radio buttons — update module state and re-render
  container.querySelectorAll('input[name="proof-type"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const ta = container.querySelector('#proof-textarea');
      proofText = ta ? ta.value : proofText;
      proofType = radio.value;
      render(container, state, actions);
    });
  });

  // Textarea — keep proofText in sync without re-rendering
  const ta = container.querySelector('#proof-textarea');
  if (ta) {
    ta.addEventListener('input', () => { proofText = ta.value; });
  }

  // Primary submit button
  container.querySelector('#proof-submit')?.addEventListener('click', () => {
    const value = String(container.querySelector('#proof-textarea')?.value || proofText).trim();
    if (!value || submitting) return;
    proofText  = value;
    submitting = true;
    actions.onProofSubmit?.({ type: proofType, value, isRescue: Boolean(isRescue) });
  });

  // Improvement submit (partial verdict — user adds more)
  container.querySelector('#proof-improve-submit')?.addEventListener('click', () => {
    const extra = String(container.querySelector('#proof-improve-text')?.value || '').trim();
    if (!extra || submitting) return;
    // Combine original proof with the improvement note
    const combined = proofText ? `${proofText}\nImprovement: ${extra}` : extra;
    proofText  = combined;
    submitting = true;
    actions.onProofSubmit?.({ type: proofType, value: combined, isRescue: Boolean(isRescue) });
  });

  // Reset proof to try again (not_enough / retry)
  container.querySelector('#proof-retry')?.addEventListener('click', () => {
    proofText  = '';
    submitting = false;
    actions.onProofReset?.();
  });
}

// Called by app.js on navigation away to reset module state
export function resetProofState() {
  proofText  = '';
  proofType  = '';
  submitting = false;
}

// ── Page builder ──────────────────────────────────────────────────────────────

function buildPage(dayNum, dayPlan, cfg, selectedType, currentText, proofResult, loading, isRescue, isSubmitting) {
  const verdict = proofResult?.verdict;

  return `
    <div style="max-width:520px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">

      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">
        Proof of progress · Day ${dayNum}${isRescue ? ' · Rescue' : ''}
      </div>
      <h1 style="font-size:1.35rem;font-weight:800;color:#f9fafb;margin:0 0 6px">
        ${isRescue ? 'Did you complete the rescue action?' : 'Did you get it done?'}
      </h1>

      ${dayPlan.successCriteria
        ? `<div style="margin-bottom:20px;padding:10px 14px;background:#111827;border-left:3px solid #3b82f6;border-radius:4px;color:#9ca3af;font-size:.82rem;line-height:1.55">
             Done means: ${esc(dayPlan.successCriteria)}
           </div>`
        : '<div style="margin-bottom:20px"></div>'}

      ${loading ? renderLoading() : (verdict ? renderVerdict(verdict, proofResult, isRescue) : renderForm(cfg, selectedType, currentText, isSubmitting))}

      <div style="margin-top:12px">
        <button data-route="/today" style="padding:8px 0;background:transparent;color:#4b5563;border:none;font-size:.78rem;cursor:pointer">
          ← Back to Today
        </button>
      </div>

    </div>`;
}

function renderForm(cfg, selectedType, currentText, isSubmitting) {
  const typeOptions = cfg.types.map((t) => `
    <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid ${selectedType === t ? '#3b82f6' : '#374151'};border-radius:8px;background:${selectedType === t ? '#0f1f3d' : 'transparent'}">
      <input type="radio" name="proof-type" value="${t}" ${selectedType === t ? 'checked' : ''} style="accent-color:#3b82f6;margin-top:3px;flex-shrink:0"/>
      <span style="color:#e5e7eb;font-size:.88rem">${esc(TYPE_LABELS[t] || t)}</span>
    </label>`).join('');

  const placeholder = selectedType === 'link' ? 'https://…' : cfg.hint;

  return `
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${typeOptions}
    </div>

    <p style="color:#6b7280;font-size:.8rem;margin:0 0 8px">${esc(cfg.prompt)}</p>
    <textarea id="proof-textarea"
      placeholder="${esc(placeholder)}"
      style="width:100%;min-height:90px;padding:10px 12px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#f9fafb;font-size:.88rem;resize:vertical;box-sizing:border-box;line-height:1.5">${esc(currentText)}</textarea>

    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="proof-submit" ${isSubmitting ? 'disabled' : ''}
        style="flex:1;padding:12px;background:${isSubmitting ? '#374151' : '#22c55e'};color:${isSubmitting ? '#6b7280' : '#000'};border:none;border-radius:8px;font-weight:700;font-size:.9rem;cursor:${isSubmitting ? 'default' : 'pointer'}">
        ${isSubmitting ? 'Checking…' : 'Submit proof →'}
      </button>
    </div>

    <p style="color:#4b5563;font-size:.75rem;margin:12px 0 0;text-align:center">
      Light proof — a sentence or two is enough.
    </p>`;
}

function renderLoading() {
  return `
    <div style="text-align:center;padding:32px 0">
      <div style="color:#6b7280;font-size:.88rem;margin-bottom:16px">Checking your proof…</div>
      <div style="display:inline-block;width:18px;height:18px;border:2px solid #1f2937;border-top-color:#3b82f6;border-radius:50%;animation:spin .8s linear infinite"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    </div>`;
}

function renderVerdict(verdict, proofResult, isRescue) {
  const note = esc(proofResult?.note || '');

  if (verdict === 'met') {
    return `
      <div style="background:#052e16;border:1px solid #166534;border-radius:10px;padding:20px;text-align:center">
        <div style="font-size:1.5rem;margin-bottom:8px">✓</div>
        <div style="color:#4ade80;font-weight:700;font-size:1rem;margin-bottom:6px">
          ${isRescue ? 'Rescue complete!' : 'Day complete!'}
        </div>
        ${note ? `<p style="color:#6b7280;font-size:.82rem;margin:0">${note}</p>` : ''}
      </div>`;
  }

  if (verdict === 'partial') {
    return `
      <div style="background:#1a1200;border:1px solid #92400e;border-radius:10px;padding:18px;margin-bottom:16px">
        <div style="color:#fbbf24;font-weight:700;font-size:.9rem;margin-bottom:6px">Almost there</div>
        ${note ? `<p style="color:#d97706;font-size:.83rem;margin:0 0 12px;line-height:1.55">${note}</p>` : ''}
        <p style="color:#6b7280;font-size:.8rem;margin:0">Add a bit more to confirm you're done:</p>
      </div>
      <textarea id="proof-improve-text"
        placeholder="One more sentence about what you completed…"
        style="width:100%;min-height:72px;padding:10px 12px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#f9fafb;font-size:.88rem;resize:vertical;box-sizing:border-box;line-height:1.5"></textarea>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button id="proof-improve-submit"
          style="flex:1;padding:11px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:.88rem;cursor:pointer">
          Resubmit →
        </button>
        <button id="proof-retry"
          style="padding:11px 14px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer">
          Start over
        </button>
      </div>`;
  }

  // not_enough
  return `
    <div style="background:#1a0a0a;border:1px solid #7f1d1d;border-radius:10px;padding:18px;margin-bottom:16px">
      <div style="color:#f87171;font-weight:700;font-size:.9rem;margin-bottom:6px">Needs more work</div>
      ${note ? `<p style="color:#dc2626;font-size:.83rem;margin:0 0 10px;line-height:1.55">${note}</p>` : ''}
      <p style="color:#6b7280;font-size:.8rem;margin:0">Go complete the remaining work, then come back to submit.</p>
    </div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <button id="proof-retry"
        style="padding:11px 18px;background:transparent;color:#9ca3af;border:1px solid #374151;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer">
        ← Try again
      </button>
      <button data-route="/today"
        style="flex:1;padding:11px;background:#111827;color:#6b7280;border:1px solid #1f2937;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer">
        Back to Today
      </button>
    </div>`;
}

// ── Utils ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getQueryParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name) || '';
  } catch (_) {
    return '';
  }
}
