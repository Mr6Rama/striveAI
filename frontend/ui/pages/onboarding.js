// v2 onboarding — 5-step flow. Module-level draft persists across re-renders.

const CATEGORIES = [
  { id: 'project', label: 'Build a project' },
  { id: 'startup', label: 'Startup / validation' },
  { id: 'content', label: 'Content / brand' },
  { id: 'skill',   label: 'Learn a skill' },
  { id: 'career',  label: 'Career / portfolio' },
  { id: 'study',   label: 'Study / exam' },
  { id: 'habit',   label: 'Habit / routine' },
  { id: 'fitness', label: 'Fitness / health' },
  { id: 'other',   label: 'Something else' },
];

const BLOCKERS = [
  { id: 'procrastinate', label: 'I procrastinate' },
  { id: 'forget',        label: 'I forget' },
  { id: 'overwhelmed',   label: 'I get overwhelmed' },
  { id: 'no_start',      label: "I don't know where to start" },
  { id: 'motivation',    label: 'I lose motivation' },
  { id: 'avoid',         label: 'I avoid hard tasks' },
  { id: 'no_time',       label: "I don't have time" },
  { id: 'too_big',       label: 'My plan feels too big' },
];

const INTENSITIES = [
  { id: '0-1', label: '10 min/day',  sub: 'tiny steps' },
  { id: '1-2', label: '25 min/day',  sub: 'light progress' },
  { id: '2-4', label: '45 min/day',  sub: 'real progress' },
  { id: '4-6', label: '60+ min/day', sub: 'aggressive' },
];

const IF_THEN_RULES = [
  { id: 'tiny_version', text: 'If no time → give me a 5-minute version of the task' },
  { id: 'tiny_step',    text: 'If overwhelmed → break it into one tiny step' },
  { id: 'first_action', text: "If stuck → show me the first visible action" },
  { id: 'recover',      text: "If I miss a day → help me recover, don't restart" },
];

const PING_OPTIONS = [
  { id: 'morning',   label: 'Morning',   hour: 9  },
  { id: 'afternoon', label: 'Afternoon', hour: 14 },
  { id: 'evening',   label: 'Evening',   hour: 20 },
  { id: 'custom',    label: 'Custom',    hour: null },
];

const GOAL_EXAMPLES = {
  project:  'e.g. Build a web app that lets students track their study sessions',
  startup:  'e.g. Validate my idea for a budget tool aimed at freelancers',
  content:  'e.g. Write and publish 3 short posts about productivity for students',
  skill:    'e.g. Learn enough Python to build a simple data analysis script',
  career:   'e.g. Update my portfolio and apply to 3 UX designer roles at startups',
  study:    'e.g. Prepare for my calculus exam next Friday, focus on integration',
  habit:    'e.g. Build a consistent 20-minute morning reading habit',
  fitness:  'e.g. Train at the gym 4 times this week and track my key lifts',
  other:    'Describe your goal as specifically as possible',
};

const DRAFT_KEY    = 'sv2_onboarding_draft';
const STEP_KEY     = 'sv2_onboarding_step';
const TOTAL_STEPS  = 7;

// Position within each 7-day week that becomes a rest day (1 = first day, 7 = last)
const REST_DAY_OPTIONS = [
  { id: 4, label: 'Mid-week',  sub: 'Day 4 of each week' },
  { id: 5, label: 'Day 5',     sub: 'One before weekend' },
  { id: 6, label: 'Day 6',     sub: 'Second-to-last day' },
  { id: 7, label: 'End of week', sub: 'Day 7 — last day' },
];

function defaultDraft() {
  return {
    goalCategory:   '',
    specificGoal:   '',
    weekGoal:       '',
    currentProject: '',
    triedBefore:    '',
    blocker:        '',
    dailyHours:     '2-4',
    ifThenRules:    [],
    pingSelection:  'morning',
    pingHour:       9,
    trackKind:      'track', // 'spark' | 'track'
    restDayPosition: 6,      // 1–7: which day position within each 7-day week is rest
    goalArtifact:   '',      // set when user accepts a sharpened goal
    // kept for API compat — not shown in UI
    escalationRule: 'none',
    whyItMatters:   '',
    goalTemplate:   '',
  };
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return defaultDraft();
    return { ...defaultDraft(), ...(JSON.parse(raw) || {}) };
  } catch (_e) { return defaultDraft(); }
}

function loadStep() {
  try {
    const n = parseInt(localStorage.getItem(STEP_KEY) || '1', 10);
    return Number.isFinite(n) && n >= 1 && n <= TOTAL_STEPS ? n : 1;
  } catch (_e) { return 1; }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    localStorage.setItem(STEP_KEY, String(currentStep));
  } catch (_e) {}
}

export function clearOnboardingDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(STEP_KEY);
  } catch (_e) {}
  draft        = defaultDraft();
  currentStep  = 1;
  sharpenState = 'idle';
  sharpenResult = null;
}

let draft         = loadDraft();
let currentStep   = loadStep();
let lastState     = null;
let lastActions   = null;
let lastContainer = null;
// Goal sharpening state machine — 'idle' | 'loading' | 'ready' | 'accepted' | 'skipped'
let sharpenState  = 'idle';
let sharpenResult = null;

export function render(container, state, actions) {
  lastState   = state;
  lastActions = actions;
  renderStep(container);
}

function renderStep(container) {
  switch (currentStep) {
    case 1: renderGoal(container);       break;
    case 2: renderOutcome(container);    break;
    case 3: renderObstacle(container);   break;
    case 4: renderRules(container);      break;
    case 5: renderCommitment(container); break;
    case 6: renderRestDay(container);    break;
    default: renderSetup(container);
  }
}

function go(n, container) { currentStep = n; saveDraft(); renderStep(container); }

// ── Layout helpers ─────────────────────────────────────────────────────────

function wrap(inner) {
  const dots = Array.from({ length: TOTAL_STEPS }, (_, i) =>
    `<div class="v2-ob-dot${i < currentStep ? ' v2-ob-dot--done' : ''}"></div>`
  ).join('');
  return `<div class="v2-page-center">
    <div class="v2-ob-progress">${dots}</div>
    ${inner}
  </div>`;
}

function hdr(step, title, sub) {
  return `<div class="v2-kicker v2-kicker--muted">Step ${step} of ${TOTAL_STEPS}</div>
    <h1 class="v2-h1" style="margin-bottom:${sub ? '8px' : '20px'}">${esc(title)}</h1>
    ${sub ? `<p class="v2-sub" style="margin-bottom:20px">${esc(sub)}</p>` : ''}`;
}

function selGrid(items, selId, attr, cols) {
  const style = cols ? `style="grid-template-columns:repeat(${cols},1fr)"` : '';
  return `<div class="v2-sel-grid" ${style}>
    ${items.map((item) => {
      const on = Array.isArray(selId) ? selId.includes(item.id) : item.id === selId;
      return `<button ${attr}="${esc(item.id)}" class="v2-sel-card${on ? ' v2-sel-card--on' : ''}">
        ${esc(item.label || item.text || '')}
        ${item.sub ? `<div style="font-size:.73rem;margin-top:3px;color:${on ? '#60a5fa' : 'var(--v2-muted)'}">${esc(item.sub)}</div>` : ''}
      </button>`;
    }).join('')}
  </div>`;
}

function nextBtn(label = 'Continue →', disabled = false) {
  return `<button id="ob-next" ${disabled ? 'disabled' : ''} class="v2-btn v2-btn--primary v2-btn--lg v2-btn--full" style="margin-top:4px">${esc(label)}</button>`;
}

function backBtn() {
  return `<button id="ob-back" class="v2-btn v2-btn--ghost v2-btn--sm" style="margin-top:4px">← Back</button>`;
}

function errDiv() { return `<div id="ob-err" class="v2-err"></div>`; }

function setErr(container, msg) {
  const el = container.querySelector('#ob-err');
  if (el) el.textContent = msg;
}

function bindCards(container, attr, getVal, setVal, multi = false) {
  container.querySelectorAll(`[${attr}]`).forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute(attr);
      if (multi) {
        const arr = getVal();
        const i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1); else arr.push(id);
      } else {
        setVal(id);
      }
      saveDraft();
      const sel = multi ? getVal() : [id];
      container.querySelectorAll(`[${attr}]`).forEach((b) => {
        b.classList.toggle('v2-sel-card--on', sel.includes(b.getAttribute(attr)));
      });
    });
  });
}

// ── Step 1: Goal + Category ────────────────────────────────────────────────

function renderGoal(container) {
  const placeholder = GOAL_EXAMPLES[draft.goalCategory] || GOAL_EXAMPLES.other;

  container.innerHTML = wrap(`
    ${hdr(1, 'What do you want to work on?', 'The more specific you are, the more your plan fits you.')}
    <div class="v2-field" style="margin-bottom:20px">
      <textarea id="ob-goal" rows="3" class="v2-textarea"
        placeholder="${esc(placeholder)}"
        style="font-size:1rem;line-height:1.55;resize:none"
      >${esc(draft.specificGoal)}</textarea>
    </div>
    <div class="v2-section-label" style="margin-bottom:10px">Pick the closest category</div>
    ${selGrid(CATEGORIES, draft.goalCategory, 'data-cat')}
    ${errDiv()}${nextBtn()}`);

  const ta = container.querySelector('#ob-goal');
  if (ta) {
    ta.addEventListener('input', (e) => { draft.specificGoal = e.target.value; saveDraft(); });
  }

  bindCards(container, 'data-cat', () => draft.goalCategory, (v) => {
    draft.goalCategory = v;
    const taEl = container.querySelector('#ob-goal');
    if (taEl && !taEl.value.trim()) taEl.placeholder = esc(GOAL_EXAMPLES[v] || GOAL_EXAMPLES.other);
  });

  container.querySelector('#ob-next')?.addEventListener('click', () => {
    if (!draft.specificGoal.trim()) { setErr(container, 'Write your goal before continuing.'); return; }
    if (!draft.goalCategory) { setErr(container, 'Pick a category to continue.'); return; }
    go(2, container);
  });
}

// ── Step 2: By Day 7 ───────────────────────────────────────────────────────

function renderOutcome(container) {
  container.innerHTML = wrap(`
    ${hdr(2, 'What would make this a success?', 'This becomes the target your plan is built toward.')}
    <div class="v2-field">
      <label class="v2-label">By the end of my track, I want to have…</label>
      <input id="ob-week" type="text" class="v2-input" value="${esc(draft.weekGoal)}"
        placeholder="e.g. A working login page deployed and accessible online"/>
    </div>
    <div class="v2-field">
      <label class="v2-label">What are you starting from? <span class="v2-muted-text">(optional)</span></label>
      <input id="ob-current" type="text" class="v2-input" value="${esc(draft.currentProject)}"
        placeholder="e.g. A Next.js project is set up but has no auth yet"/>
    </div>
    <div class="v2-field">
      <label class="v2-label">What have you tried before? <span class="v2-muted-text">(optional)</span></label>
      <input id="ob-tried" type="text" class="v2-input" value="${esc(draft.triedBefore)}"
        placeholder="e.g. Started twice, got stuck on database setup every time"/>
    </div>
    ${errDiv()}${nextBtn()}${backBtn()}`);

  const bind = (id, key) =>
    container.querySelector(id)?.addEventListener('input', (e) => { draft[key] = e.target.value; saveDraft(); });
  bind('#ob-week',    'weekGoal');
  bind('#ob-current', 'currentProject');
  bind('#ob-tried',   'triedBefore');

  container.querySelector('#ob-next')?.addEventListener('click', () => {
    if (!draft.weekGoal.trim()) { setErr(container, 'Describe what success looks like by Day 7.'); return; }
    go(3, container);
  });
  container.querySelector('#ob-back')?.addEventListener('click', () => go(1, container));
}

// ── Step 3: Obstacle + Intensity ──────────────────────────────────────────

function renderObstacle(container) {
  container.innerHTML = wrap(`
    ${hdr(3, "What's in your way?")}
    <div class="v2-section-label" style="margin-bottom:10px">What usually stops you?</div>
    ${selGrid(BLOCKERS, draft.blocker, 'data-blk')}
    <div class="v2-section-label" style="margin:20px 0 10px">How much time can you spend each day?</div>
    ${selGrid(INTENSITIES, draft.dailyHours, 'data-int', 4)}
    ${errDiv()}${nextBtn()}${backBtn()}`);

  bindCards(container, 'data-blk', () => draft.blocker, (v) => { draft.blocker = v; });
  bindCards(container, 'data-int', () => draft.dailyHours, (v) => { draft.dailyHours = v; });

  container.querySelector('#ob-next')?.addEventListener('click', () => {
    if (!draft.blocker)    { setErr(container, 'Pick your main obstacle to continue.'); return; }
    if (!draft.dailyHours) { setErr(container, 'Pick your daily time to continue.'); return; }
    go(4, container);
  });
  container.querySelector('#ob-back')?.addEventListener('click', () => go(2, container));
}

// ── Step 4: Smart Rules ────────────────────────────────────────────────────

function renderRules(container) {
  const ruleCards = IF_THEN_RULES.map((r) => {
    const on = draft.ifThenRules.includes(r.id);
    return `<button data-rule="${esc(r.id)}" class="v2-sel-card${on ? ' v2-sel-card--on' : ''}" style="grid-column:1/-1;padding:13px 16px">
      ${esc(r.text)}
    </button>`;
  }).join('');

  container.innerHTML = wrap(`
    ${hdr(4, 'How should StriveAI adapt for you?', 'Pick all that apply.')}
    <div class="v2-sel-grid" style="grid-template-columns:1fr;gap:8px;margin-bottom:20px">
      ${ruleCards}
    </div>
    ${errDiv()}${nextBtn()}${backBtn()}`);

  bindCards(container, 'data-rule', () => draft.ifThenRules, () => {}, true);

  container.querySelector('#ob-next')?.addEventListener('click', () => {
    if (!draft.ifThenRules.length) { setErr(container, 'Pick at least one rule.'); return; }
    go(5, container);
  });
  container.querySelector('#ob-back')?.addEventListener('click', () => go(3, container));
}

// ── Step 5: Commitment (Spark vs Track) ────────────────────────────────────

function renderCommitment(container) {
  container.innerHTML = wrap(`
    ${hdr(5, 'How long do you want to commit?')}

    <div class="v2-sel-grid" style="grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <button data-kind="spark" class="v2-sel-card${draft.trackKind === 'spark' ? ' v2-sel-card--on' : ''}"
              style="padding:18px 14px;text-align:left">
        <div style="font-size:1.05rem;font-weight:700;margin-bottom:6px">7-day Spark</div>
        <div style="font-size:.8rem;color:var(--v2-muted);line-height:1.45">
          Try the format for a week. Low commitment — see if it fits before going deeper.
        </div>
      </button>
      <button data-kind="track" class="v2-sel-card${draft.trackKind === 'track' ? ' v2-sel-card--on' : ''}"
              style="padding:18px 14px;text-align:left">
        <div style="font-size:1.05rem;font-weight:700;margin-bottom:6px">28-day Track ✦</div>
        <div style="font-size:.8rem;color:var(--v2-muted);line-height:1.45">
          Four structured phases. One rest day per week. Built to produce a real artifact.
        </div>
      </button>
    </div>
    ${errDiv()}${nextBtn()}${backBtn()}`);

  container.querySelectorAll('[data-kind]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.trackKind = btn.getAttribute('data-kind');
      saveDraft();
      container.querySelectorAll('[data-kind]').forEach((b) => {
        b.classList.toggle('v2-sel-card--on', b.getAttribute('data-kind') === draft.trackKind);
      });
    });
  });

  container.querySelector('#ob-next')?.addEventListener('click', () => {
    // Spark skips rest-day step
    go(draft.trackKind === 'spark' ? 7 : 6, container);
  });
  container.querySelector('#ob-back')?.addEventListener('click', () => go(4, container));
}

// ── Step 6: Rest day (Track only) ─────────────────────────────────────────

function renderRestDay(container) {
  container.innerHTML = wrap(`
    ${hdr(6, 'Which day each week is your rest day?',
             'Active days build toward your goal. The rest day recharges without counting as missed.')}
    ${selGrid(REST_DAY_OPTIONS.map((o) => ({ ...o, id: String(o.id), label: o.label, sub: o.sub })),
              String(draft.restDayPosition), 'data-rest', 4)}
    ${errDiv()}${nextBtn()}${backBtn()}`);

  bindCards(container, 'data-rest',
    () => String(draft.restDayPosition),
    (v) => { draft.restDayPosition = Number(v); });

  container.querySelector('#ob-next')?.addEventListener('click', () => {
    go(7, container);
  });
  container.querySelector('#ob-back')?.addEventListener('click', () => go(5, container));
}

// ── Step 7: Setup + Confirm ────────────────────────────────────────────────

function renderSharpenSection() {
  if (sharpenState === 'loading') {
    return `<div class="v2-card" style="margin-bottom:20px">
      <div class="v2-loading-center" style="padding:20px">
        <div class="v2-spin"></div>
        <p class="v2-muted-text" style="margin-top:8px">Refining your goal…</p>
      </div>
    </div>`;
  }
  if (sharpenState === 'ready' && sharpenResult) {
    return `<div class="v2-card" style="margin-bottom:20px">
      <div class="v2-section-label" style="margin-bottom:10px">Goal refinement</div>
      <p class="v2-muted-text" style="margin-bottom:3px;font-size:.78rem">Original</p>
      <p class="v2-body-text" style="margin-bottom:12px;opacity:.5">${esc(draft.specificGoal.slice(0, 120))}</p>
      <p class="v2-muted-text" style="margin-bottom:3px;font-size:.78rem">Sharpened</p>
      <p class="v2-h3" style="margin-bottom:6px">${esc(sharpenResult.sharpenedGoal)}</p>
      ${sharpenResult.artifactStatement
        ? `<p class="v2-muted-text" style="margin-bottom:12px;font-size:.82rem">Artifact: ${esc(sharpenResult.artifactStatement)}</p>`
        : ''}
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="ob-sharpen-accept" class="v2-btn v2-btn--primary v2-btn--sm" style="flex:1">Looks good →</button>
        <button id="ob-sharpen-skip"   class="v2-btn v2-btn--ghost v2-btn--sm">Keep original</button>
      </div>
    </div>`;
  }
  if (sharpenState === 'accepted' && sharpenResult) {
    return `<div class="v2-card" style="margin-bottom:20px">
      <div class="v2-section-label" style="margin-bottom:6px">Your sharpened goal</div>
      <p class="v2-body-text" style="font-weight:600;margin:0">${esc(sharpenResult.sharpenedGoal)}</p>
      ${sharpenResult.artifactStatement
        ? `<p class="v2-muted-text" style="margin-top:4px;font-size:.82rem">Artifact: ${esc(sharpenResult.artifactStatement)}</p>`
        : ''}
    </div>`;
  }
  // skipped or idle — show static summary card
  const row = (label, value) =>
    `<div class="v2-meta-row">
      <span class="v2-muted-text" style="flex-shrink:0">${esc(label)}</span>
      <span class="v2-body-text" style="text-align:right">${esc(String(value))}</span>
    </div>`;
  const catLabel  = CATEGORIES.find((c) => c.id === draft.goalCategory)?.label || draft.goalCategory;
  const blkLabel  = BLOCKERS.find((b) => b.id === draft.blocker)?.label || draft.blocker;
  const intLabel  = INTENSITIES.find((i) => i.id === draft.dailyHours)?.label || draft.dailyHours;
  const kindLabel = draft.trackKind === 'spark' ? '7-day Spark' : '28-day Track';
  const restLabel = draft.trackKind === 'track'
    ? (REST_DAY_OPTIONS.find((r) => r.id === draft.restDayPosition)?.label || `Day ${draft.restDayPosition}`)
    : null;
  return `<div class="v2-card" style="margin-bottom:20px">
    ${row('Category',     catLabel)}
    ${row('Goal',         (draft.specificGoal || '—').slice(0, 80))}
    ${row('Target',       (draft.weekGoal     || '—').slice(0, 80))}
    ${draft.currentProject ? row('Starting from', draft.currentProject.slice(0, 80)) : ''}
    ${row('Main obstacle', blkLabel)}
    ${row('Daily time',    intLabel)}
    ${row('Track type',   kindLabel)}
    ${restLabel ? row('Rest day', `${restLabel} each week`) : ''}
  </div>`;
}

function renderSetup(container) {
  lastContainer = container;
  const tg      = lastState?.telegram || {};
  const loading = Boolean(lastState?.ui?.trackGenerating || lastState?.ui?.loading);
  const errText = String(lastState?.ui?.error || '');

  // Auto-trigger goal sharpening on first visit to step 7
  if (sharpenState === 'idle' && draft.specificGoal.trim()) {
    sharpenState = 'loading';
    (async () => {
      try {
        const result = await lastActions?.onSharpenGoal?.({ ...draft });
        if (!lastContainer?.isConnected) return;
        if (result?.sharpenedGoal) { sharpenResult = result; sharpenState = 'ready'; }
        else sharpenState = 'skipped';
      } catch (_e) {
        sharpenState = 'skipped';
      }
      if (lastContainer?.isConnected) renderSetup(lastContainer);
    })();
  }

  const pingCards = PING_OPTIONS.map((opt) => {
    const on = draft.pingSelection === opt.id;
    return `<button data-ping="${opt.id}" class="v2-sel-card${on ? ' v2-sel-card--on' : ''}" style="text-align:center;padding:12px 8px">
      ${opt.label}
      ${opt.hour !== null ? `<div style="font-size:.72rem;margin-top:3px;color:${on ? '#60a5fa' : 'var(--v2-muted)'}">${opt.hour}:00 UTC</div>` : ''}
    </button>`;
  }).join('');

  // Generate button is disabled until sharpening completes (or goal is empty)
  const goalExists  = Boolean(draft.specificGoal.trim());
  const sharpenDone = !goalExists || sharpenState === 'accepted' || sharpenState === 'skipped';
  const genLabel    = loading ? 'Building your track…' :
    draft.trackKind === 'spark' ? 'Build my 7-day Spark →' : 'Build my 28-day Track →';

  container.innerHTML = wrap(`
    ${hdr(7, 'Review and generate')}

    ${renderSharpenSection()}

    <div class="v2-section-label" style="margin-bottom:10px">Telegram check-ins <span class="v2-muted-text">(optional)</span></div>
    <div class="v2-sel-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px">
      ${pingCards}
    </div>
    ${draft.pingSelection === 'custom' ? `
      <div class="v2-field" style="margin-bottom:10px">
        <label class="v2-label">Hour (0–23, UTC)</label>
        <input id="ob-custom-hour" type="number" min="0" max="23" value="${draft.pingHour}" class="v2-input" style="max-width:100px"/>
      </div>` : ''}

    ${tg.connected
      ? `<p style="margin-bottom:14px;font-size:.875rem;color:var(--v2-green)">Telegram connected${tg.username ? ` as @${esc(tg.username)}` : ''}</p>`
      : `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
           <span class="v2-muted-text">Not connected</span>
           <button id="ob-tg-connect" class="v2-btn v2-btn--primary v2-btn--sm">Connect Telegram</button>
           <button id="ob-tg-refresh" class="v2-btn v2-btn--ghost v2-btn--sm">I connected →</button>
         </div>`}

    ${errText ? `<p class="v2-err" style="margin-bottom:12px">${esc(errText)}</p>` : ''}
    ${nextBtn(genLabel, loading || !sharpenDone)}
    ${backBtn()}`);

  // Sharpening accept / skip
  container.querySelector('#ob-sharpen-accept')?.addEventListener('click', () => {
    if (sharpenResult) {
      draft.specificGoal = sharpenResult.sharpenedGoal;
      draft.goalArtifact = sharpenResult.artifactStatement || '';
      saveDraft();
    }
    sharpenState = 'accepted';
    renderSetup(container);
  });
  container.querySelector('#ob-sharpen-skip')?.addEventListener('click', () => {
    sharpenState = 'skipped';
    renderSetup(container);
  });

  container.querySelectorAll('[data-ping]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.pingSelection = btn.getAttribute('data-ping');
      const opt = PING_OPTIONS.find((p) => p.id === draft.pingSelection);
      if (opt?.hour !== null) draft.pingHour = opt.hour;
      saveDraft();
      renderSetup(container);
    });
  });

  container.querySelector('#ob-custom-hour')?.addEventListener('input', (e) => {
    draft.pingHour = Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0));
    saveDraft();
  });

  container.querySelector('#ob-tg-connect')?.addEventListener('click', async () => {
    try {
      await lastActions?.onTelegramLink?.();
    } catch (_err) {}
  });

  container.querySelector('#ob-tg-refresh')?.addEventListener('click', async () => {
    await lastActions?.onTelegramRefresh?.();
  });

  container.querySelector('#ob-next')?.addEventListener('click', async () => {
    const goal = draft.specificGoal.trim();
    if (!goal) return;
    const btn = container.querySelector('#ob-next');
    if (btn) { btn.disabled = true; btn.textContent = 'Building your track…'; }
    try {
      await lastActions?.onGenerate?.({
        ...draft,
        goal,
        blockerHint:     draft.blocker,
        trackKind:       draft.trackKind || 'track',
        restDayPosition: draft.trackKind === 'track' ? (draft.restDayPosition || 6) : null,
      });
      clearOnboardingDraft();
    } catch (_e) { /* error shown via ui.error */ }
  });

  container.querySelector('#ob-back')?.addEventListener('click', () => {
    go(draft.trackKind === 'spark' ? 5 : 6, container);
  });
}

// ── Utils ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
