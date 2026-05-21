// Proof of Progress — /proof
// Entry points: /today "I already did it", /agent final step, rescue completion.
// URL param ?source=rescue → marks day as 'rescued' on success (not 'done').
// URL param ?source=agent  → for display context only; completion handled by agent.js

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

let proofText  = '';
let proofType  = '';
let submitting = false;

export function render(container, state, actions) {
  const { track, today, ui } = state;
  const source  = getQueryParam('source');

  if (!track?.id || !Array.isArray(track.days) || !track.days.length) {
    actions.onNavigate?.('/onboarding');
    return;
  }

  const dayNum   = track.currentDayNumber || today.dayNumber || 1;
  const dayPlan  = track.days.find((d) => d.dayNumber === dayNum) ?? track.days[0] ?? {};
  const category = (track.goalCategory || 'other').toLowerCase();
  const cfg      = CATEGORY_PROOF[category] || CATEGORY_PROOF.other;

  if (!proofType || !cfg.types.includes(proofType)) {
    proofType = cfg.types[0];
  }

  const proofResult = today.proofResult || null;
  const loading     = Boolean(ui?.proofLoading);
  const isRescue    = source === 'rescue';

  container.innerHTML = buildPage(dayNum, dayPlan, cfg, proofType, proofText, proofResult, loading, isRescue, submitting);

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });

  container.querySelectorAll('input[name="proof-type"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const ta = container.querySelector('#proof-textarea');
      proofText = ta ? ta.value : proofText;
      proofType = radio.value;
      render(container, state, actions);
    });
  });

  const ta = container.querySelector('#proof-textarea');
  if (ta) {
    ta.addEventListener('input', () => { proofText = ta.value; });
  }

  container.querySelector('#proof-submit')?.addEventListener('click', () => {
    const value = String(container.querySelector('#proof-textarea')?.value || proofText).trim();
    if (!value || submitting) return;
    proofText  = value;
    submitting = true;
    actions.onProofSubmit?.({ type: proofType, value, isRescue: Boolean(isRescue) });
  });

  container.querySelector('#proof-improve-submit')?.addEventListener('click', () => {
    const extra = String(container.querySelector('#proof-improve-text')?.value || '').trim();
    if (!extra || submitting) return;
    const combined = proofText ? `${proofText}\nImprovement: ${extra}` : extra;
    proofText  = combined;
    submitting = true;
    actions.onProofSubmit?.({ type: proofType, value: combined, isRescue: Boolean(isRescue) });
  });

  container.querySelector('#proof-retry')?.addEventListener('click', () => {
    proofText  = '';
    submitting = false;
    actions.onProofReset?.();
  });
}

export function resetProofState() {
  proofText  = '';
  proofType  = '';
  submitting = false;
}

// ── Page builder ──────────────────────────────────────────────────────────────

function buildPage(dayNum, dayPlan, cfg, selectedType, currentText, proofResult, loading, isRescue, isSubmitting) {
  const verdict = proofResult?.verdict;

  return `
    <div class="v2-page-center">

      <div class="v2-kicker" style="margin-bottom:8px">
        <span class="v2-kicker--muted">Proof of progress · Day ${dayNum}${isRescue ? ' · Rescue' : ''}</span>
      </div>
      <h1 class="v2-h1" style="margin-bottom:6px">
        ${isRescue ? 'Did you complete the rescue action?' : 'Did you get it done?'}
      </h1>

      ${dayPlan.successCriteria
        ? `<div class="v2-done-criteria" style="margin-bottom:20px">Done means: ${esc(dayPlan.successCriteria)}</div>`
        : '<div style="margin-bottom:20px"></div>'}

      ${loading ? renderLoading() : (verdict ? renderVerdict(verdict, proofResult, isRescue) : renderForm(cfg, selectedType, currentText, isSubmitting))}

      <button data-route="/today" class="v2-btn v2-btn--ghost" style="margin-top:12px">← Back to Today</button>

    </div>`;
}

function renderForm(cfg, selectedType, currentText, isSubmitting) {
  const typeOptions = cfg.types.map((t) => `
    <label class="v2-proof-type-option${selectedType === t ? ' v2-proof-type-option--on' : ''}">
      <input type="radio" name="proof-type" value="${t}" ${selectedType === t ? 'checked' : ''} style="accent-color:var(--v2-blue);margin-top:3px;flex-shrink:0"/>
      <span class="v2-body-text">${esc(TYPE_LABELS[t] || t)}</span>
    </label>`).join('');

  const placeholder = selectedType === 'link' ? 'https://…' : cfg.hint;

  return `
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${typeOptions}
    </div>

    <p class="v2-muted-text" style="margin:0 0 8px">${esc(cfg.prompt)}</p>
    <textarea id="proof-textarea" class="v2-textarea"
      placeholder="${esc(placeholder)}"
      style="min-height:90px">${esc(currentText)}</textarea>

    <div style="margin-top:12px">
      <button id="proof-submit" ${isSubmitting ? 'disabled' : ''} class="v2-btn v2-btn--green v2-btn--lg v2-btn--full">
        ${isSubmitting ? 'Checking…' : 'Submit proof →'}
      </button>
    </div>

    <p class="v2-muted-text" style="margin:12px 0 0;text-align:center;font-size:.75rem">
      Light proof — a sentence or two is enough.
    </p>`;
}

function renderLoading() {
  return `
    <div class="v2-loading-center" style="padding:32px 0">
      <div class="v2-spin"></div>
      <p class="v2-muted-text">Checking your proof…</p>
    </div>`;
}

function renderVerdict(verdict, proofResult, isRescue) {
  const note = esc(proofResult?.note || '');

  if (verdict === 'met') {
    return `
      <div class="v2-card v2-card--green" style="text-align:center;padding:24px">
        <div style="font-size:1.5rem;margin-bottom:8px;color:var(--v2-green)">✓</div>
        <div style="color:var(--v2-green);font-weight:700;font-size:1rem;margin-bottom:6px">
          ${isRescue ? 'Rescue complete!' : 'Day complete!'}
        </div>
        ${note ? `<p class="v2-muted-text" style="margin:0">${note}</p>` : ''}
      </div>`;
  }

  if (verdict === 'partial') {
    return `
      <div class="v2-card v2-card--amber" style="margin-bottom:16px">
        <div style="color:var(--v2-amber);font-weight:700;font-size:.9rem;margin-bottom:6px">Almost there</div>
        ${note ? `<p style="color:var(--v2-amber);font-size:.83rem;margin:0 0 12px;line-height:1.55">${note}</p>` : ''}
        <p class="v2-muted-text" style="margin:0">Add a bit more to confirm you're done:</p>
      </div>
      <textarea id="proof-improve-text" class="v2-textarea"
        placeholder="One more sentence about what you completed…"
        style="min-height:72px"></textarea>
      <div class="v2-row" style="margin-top:10px;gap:8px">
        <button id="proof-improve-submit" class="v2-btn v2-btn--primary v2-btn--lg" style="flex:1">
          Resubmit →
        </button>
        <button id="proof-retry" class="v2-btn v2-btn--ghost">
          Start over
        </button>
      </div>`;
  }

  return `
    <div class="v2-card v2-card--red" style="margin-bottom:16px">
      <div style="color:var(--v2-red);font-weight:700;font-size:.9rem;margin-bottom:6px">Needs more work</div>
      ${note ? `<p style="color:var(--v2-red);font-size:.83rem;margin:0 0 10px;line-height:1.55">${note}</p>` : ''}
      <p class="v2-muted-text" style="margin:0">Go complete the remaining work, then come back to submit.</p>
    </div>
    <div class="v2-row" style="margin-top:4px;gap:8px">
      <button id="proof-retry" class="v2-btn v2-btn--ghost">← Try again</button>
      <button data-route="/today" class="v2-btn v2-btn--secondary" style="flex:1">Back to Today</button>
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
