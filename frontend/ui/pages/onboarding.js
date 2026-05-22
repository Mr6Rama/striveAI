// v2 onboarding — 8-step flow. Module-level draft persists across re-renders.

const CATEGORIES = [
  { id: 'project', label: 'Build a project / MVP' },
  { id: 'startup', label: 'Startup / idea validation' },
  { id: 'content', label: 'Content / personal brand' },
  { id: 'skill',   label: 'Learn a skill' },
  { id: 'career',  label: 'Career / portfolio' },
  { id: 'study',   label: 'Study / exam' },
  { id: 'habit',   label: 'Habit / self-development' },
  { id: 'fitness', label: 'Fitness / health' },
  { id: 'other',   label: 'Other' },
];

const TEMPLATES = {
  project: ['Build an MVP', 'Finish a project', 'Launch a landing page', 'Create a portfolio project'],
  startup: ['Validate an idea', 'Talk to potential users', 'Build a waitlist', 'Launch a first offer'],
  content: ['Post daily', 'Write scripts', 'Plan a content week', 'Build a personal brand'],
  skill:   ['Learn coding', 'Learn English', 'Complete a course', 'Practice every day'],
  career:  ['Improve resume', 'Build portfolio', 'Prepare for interviews', 'Apply to opportunities'],
  study:   ['Prepare for exam', 'Study every day', 'Finish assignments', 'Improve one subject'],
  habit:   ['Build consistency', 'Journal daily', 'Read daily', 'Fix sleep routine'],
  fitness: ['Exercise daily', 'Walk daily', 'Stretch daily', 'Track nutrition'],
  other:   ['Custom goal'],
};

const BLOCKERS = [
  { id: 'procrastinate', label: 'I procrastinate' },
  { id: 'forget',        label: 'I forget' },
  { id: 'overwhelmed',   label: 'I get overwhelmed' },
  { id: 'no_start',      label: "I don't know where to start" },
  { id: 'motivation',    label: 'I lose motivation' },
  { id: 'avoid',         label: 'I avoid hard tasks' },
  { id: 'no_time',       label: "I don't have time" },
  { id: 'too_big',       label: 'My plan is too big' },
];

const INTENSITIES = [
  { id: '0-1', label: '10 min/day',  sub: 'tiny steps' },
  { id: '1-2', label: '25 min/day',  sub: 'light progress' },
  { id: '2-4', label: '45 min/day',  sub: 'serious progress' },
  { id: '4-6', label: '60+ min/day', sub: 'aggressive mode' },
];

const IF_THEN_RULES = [
  { id: 'tiny_version', text: 'If I have no time → give me a 5-minute version' },
  { id: 'tiny_step',    text: 'If I feel overwhelmed → break it into one tiny step' },
  { id: 'first_action', text: "If I don't know where to start → give me the first visible action" },
  { id: 'safe_step',    text: 'If I avoid the task → give me the safest first step' },
  { id: 'recover',      text: "If I miss a day → recover, don't restart" },
  { id: 'tiny_miss',    text: 'If I miss 2 days → make the next task tiny' },
];

const PING_OPTIONS = [
  { id: 'morning',   label: 'Morning',   hour: 9  },
  { id: 'afternoon', label: 'Afternoon', hour: 14 },
  { id: 'evening',   label: 'Evening',   hour: 20 },
  { id: 'custom',    label: 'Custom',    hour: null },
];

const ESCALATIONS = [
  { id: 'stricter',  label: 'Send me a stricter message' },
  { id: 'message',   label: 'Generate a message I can send to a friend' },
  { id: 'promise',   label: 'Make me write a restart promise' },
  { id: 'tiny_mode', label: 'Switch me to Tiny Mode' },
  { id: 'none',      label: 'No escalation' },
];

// ── Module state ───────────────────────────────────────────────────────────

const DRAFT_KEY = 'sv2_onboarding_draft';

function defaultDraft() {
  return {
    goalCategory: '', goalTemplate: '', specificGoal: '',
    currentProject: '', weekGoal: '', whyItMatters: '', triedBefore: '',
    blocker: '', dailyHours: '2-4', ifThenRules: [],
    pingSelection: 'morning', pingHour: 9, escalationRule: '',
  };
}

const STEP_KEY = 'sv2_onboarding_step';

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return defaultDraft();
    const parsed = JSON.parse(raw);
    return { ...defaultDraft(), ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch (_e) {
    return defaultDraft();
  }
}

function loadStep() {
  try {
    const n = parseInt(localStorage.getItem(STEP_KEY) || '1', 10);
    return Number.isFinite(n) && n >= 1 && n <= 8 ? n : 1;
  } catch (_e) {
    return 1;
  }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    localStorage.setItem(STEP_KEY, String(currentStep));
  } catch (_e) { /* quota / disabled */ }
}

export function clearOnboardingDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(STEP_KEY);
  } catch (_e) { /* noop */ }
  draft = defaultDraft();
  currentStep = 1;
}

let draft = loadDraft();
let currentStep = loadStep();
let lastState   = null;
let lastActions = null;

export function render(container, state, actions) {
  lastState   = state;
  lastActions = actions;
  renderStep(container);
}

function renderStep(container) {
  switch (currentStep) {
    case 1:  renderCategory(container);   break;
    case 2:  renderTemplate(container);   break;
    case 3:  renderBlocker(container);    break;
    case 4:  renderIntensity(container);  break;
    case 5:  renderIfThen(container);     break;
    case 6:  renderTelegram(container);   break;
    case 7:  renderEscalation(container); break;
    default: renderConfirm(container);
  }
}

function go(n, container) { currentStep = n; saveDraft(); renderStep(container); }

// ── Layout helpers ─────────────────────────────────────────────────────────

function wrap(inner) {
  const dots = Array.from({ length: 8 }, (_, i) =>
    `<div class="v2-ob-dot${i < currentStep ? ' v2-ob-dot--done' : ''}"></div>`
  ).join('');
  return `<div class="v2-page-center">
    <div class="v2-ob-progress">${dots}</div>
    ${inner}
  </div>`;
}

function hdr(step, title, sub) {
  return `<div class="v2-kicker v2-kicker--muted">Step ${step} of 8</div>
    <h1 class="v2-h1" style="margin-bottom:${sub ? '8px' : '20px'}">${esc(title)}</h1>
    ${sub ? `<p class="v2-sub">${esc(sub)}</p>` : ''}`;
}

function selGrid(items, selId, attr) {
  return `<div class="v2-sel-grid">
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

function errDiv() {
  return `<div id="ob-err" class="v2-err"></div>`;
}

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
        if (i >= 0) arr.splice(i, 1);
        else if (arr.length < 4) arr.push(id);
      } else {
        setVal(id);
      }
      saveDraft();
      refreshCards(container, attr, getVal());
    });
  });
}

function refreshCards(container, attr, sel) {
  const selected = Array.isArray(sel) ? sel : [sel];
  container.querySelectorAll(`[${attr}]`).forEach((b) => {
    const on = selected.includes(b.getAttribute(attr));
    b.classList.toggle('v2-sel-card--on', on);
  });
}

// ── Step 1: Goal Category ──────────────────────────────────────────────────

function renderCategory(container) {
  container.innerHTML = wrap(`
    ${hdr(1, 'What do you want to stay on track with?')}
    ${selGrid(CATEGORIES, draft.goalCategory, 'data-cat')}
    ${errDiv()}${nextBtn()}`);

  bindCards(container, 'data-cat', () => draft.goalCategory, (v) => { draft.goalCategory = v; });

  container.querySelector('#ob-next')?.addEventListener('click', () => {
    if (!draft.goalCategory) { setErr(container, 'Pick a category to continue.'); return; }
    if (draft.goalTemplate && !TEMPLATES[draft.goalCategory]?.includes(draft.goalTemplate)) draft.goalTemplate = '';
    go(2, container);
  });
}

// ── Step 2: Goal Template ──────────────────────────────────────────────────

function renderTemplate(container) {
  const tpls = (TEMPLATES[draft.goalCategory] || TEMPLATES.other).map((t) => ({ id: t, label: t }));
  container.innerHTML = wrap(`
    ${hdr(2, 'Tell us about your goal', 'The more specific, the more your plan fits you.')}
    ${selGrid(tpls, draft.goalTemplate, 'data-tpl')}
    <div class="v2-field">
      <label class="v2-label">Make it more specific</label>
      <input id="ob-specific" type="text" placeholder="e.g. Build a Notion clone in Next.js" value="${esc(draft.specificGoal)}" class="v2-input"/>
    </div>
    <div class="v2-field">
      <label class="v2-label">What are you working on right now?</label>
      <input id="ob-current" type="text" placeholder="e.g. A landing page for my SaaS idea" value="${esc(draft.currentProject)}" class="v2-input"/>
    </div>
    <div class="v2-field">
      <label class="v2-label">By day 7, you want to have…</label>
      <input id="ob-week" type="text" placeholder="e.g. A working signup form and 5 waitlist users" value="${esc(draft.weekGoal)}" class="v2-input"/>
    </div>
    <div class="v2-field">
      <label class="v2-label">Why does this matter to you? <span class="v2-muted-text">(optional)</span></label>
      <input id="ob-why" type="text" placeholder="e.g. So I can validate the idea before quitting my job" value="${esc(draft.whyItMatters)}" class="v2-input"/>
    </div>
    <div class="v2-field">
      <label class="v2-label">What have you already tried? <span class="v2-muted-text">(optional)</span></label>
      <input id="ob-tried" type="text" placeholder="e.g. Started twice, got stuck after the auth setup" value="${esc(draft.triedBefore)}" class="v2-input"/>
    </div>
    ${errDiv()}${nextBtn()}${backBtn()}`);

  bindCards(container, 'data-tpl', () => draft.goalTemplate, (v) => { draft.goalTemplate = v; });
  const bind = (id, key) => container.querySelector(id)?.addEventListener('input', (e) => { draft[key] = e.target.value; saveDraft(); });
  bind('#ob-specific', 'specificGoal');
  bind('#ob-current',  'currentProject');
  bind('#ob-week',     'weekGoal');
  bind('#ob-why',      'whyItMatters');
  bind('#ob-tried',    'triedBefore');

  container.querySelector('#ob-next')?.addEventListener('click', () => {
    if (!draft.goalTemplate && !draft.specificGoal.trim()) {
      setErr(container, 'Pick a goal template or enter a specific goal.'); return;
    }
    go(3, container);
  });
  container.querySelector('#ob-back')?.addEventListener('click', () => go(1, container));
}

// ── Step 3: Main Blocker ───────────────────────────────────────────────────

function renderBlocker(container) {
  container.innerHTML = wrap(`
    ${hdr(3, 'What usually makes you fall off track?')}
    ${selGrid(BLOCKERS, draft.blocker, 'data-blk')}
    ${errDiv()}${nextBtn()}${backBtn()}`);

  bindCards(container, 'data-blk', () => draft.blocker, (v) => { draft.blocker = v; });

  container.querySelector('#ob-next')?.addEventListener('click', () => {
    if (!draft.blocker) { setErr(container, 'Pick your main blocker to continue.'); return; }
    go(4, container);
  });
  container.querySelector('#ob-back')?.addEventListener('click', () => go(2, container));
}

// ── Step 4: Daily Intensity ────────────────────────────────────────────────

function renderIntensity(container) {
  container.innerHTML = wrap(`
    ${hdr(4, 'How much can you realistically do each day?')}
    ${selGrid(INTENSITIES, draft.dailyHours, 'data-int')}
    ${errDiv()}${nextBtn()}${backBtn()}`);

  bindCards(container, 'data-int', () => draft.dailyHours, (v) => { draft.dailyHours = v; });

  container.querySelector('#ob-next')?.addEventListener('click', () => {
    if (!draft.dailyHours) { setErr(container, 'Pick your daily intensity to continue.'); return; }
    go(5, container);
  });
  container.querySelector('#ob-back')?.addEventListener('click', () => go(3, container));
}

// ── Step 5: If-Then Rules ──────────────────────────────────────────────────

function renderIfThen(container) {
  const ruleCards = IF_THEN_RULES.map((r) => {
    const on = draft.ifThenRules.includes(r.id);
    return `<button data-rule="${esc(r.id)}" class="v2-sel-card${on ? ' v2-sel-card--on' : ''}" style="grid-column:1/-1;padding:13px 16px">
      ${esc(r.text)}
    </button>`;
  }).join('');

  container.innerHTML = wrap(`
    ${hdr(5, 'What should StriveAI do when things go wrong?', 'Select 2–4 rules.')}
    <div class="v2-sel-grid" style="grid-template-columns:1fr;gap:8px;margin-bottom:20px">
      ${ruleCards}
    </div>
    ${errDiv()}${nextBtn()}${backBtn()}`);

  bindCards(container, 'data-rule', () => draft.ifThenRules, () => {}, true);

  container.querySelector('#ob-next')?.addEventListener('click', () => {
    if (draft.ifThenRules.length < 2) { setErr(container, 'Select at least 2 rules.'); return; }
    go(6, container);
  });
  container.querySelector('#ob-back')?.addEventListener('click', () => go(4, container));
}

// ── Step 6: Telegram Ping Setup ────────────────────────────────────────────

function renderTelegram(container) {
  const tg        = lastState?.telegram || {};
  const connected = Boolean(tg.connected);

  const pingCards = PING_OPTIONS.map((opt) => {
    const on = draft.pingSelection === opt.id;
    return `<button data-ping="${opt.id}" class="v2-sel-card${on ? ' v2-sel-card--on' : ''}" style="text-align:center;padding:12px 8px">
      ${opt.label}
      ${opt.hour !== null ? `<div style="font-size:.72rem;margin-top:3px;color:${on ? '#60a5fa' : 'var(--v2-muted)'}">${opt.hour}:00 UTC</div>` : ''}
    </button>`;
  }).join('');

  container.innerHTML = wrap(`
    ${hdr(6, 'When should StriveAI check in on Telegram?')}
    <div class="v2-sel-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
      ${pingCards}
    </div>
    ${draft.pingSelection === 'custom' ? `
      <div class="v2-field" style="margin-bottom:14px">
        <label class="v2-label">Hour (0–23, UTC)</label>
        <input id="ob-custom-hour" type="number" min="0" max="23" value="${draft.pingHour}" class="v2-input" style="max-width:100px"/>
      </div>` : ''}
    <div class="v2-card v2-card--sm" style="margin-bottom:16px">
      <div class="v2-h3" style="margin-bottom:10px">Telegram</div>
      ${connected
        ? `<p class="v2-body-text" style="color:var(--v2-green)">Connected${tg.username ? ` as @${esc(tg.username)}` : ''}</p>`
        : `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
             <span class="v2-muted-text">Not connected</span>
             <button id="ob-tg-connect" class="v2-btn v2-btn--primary v2-btn--sm">Connect Telegram</button>
             <button id="ob-tg-refresh" class="v2-btn v2-btn--ghost v2-btn--sm">I connected →</button>
           </div>`}
      <p id="ob-tg-note" class="v2-hint">Telegram is the only ping channel.</p>
    </div>
    ${errDiv()}${nextBtn()}${backBtn()}`);

  container.querySelectorAll('[data-ping]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.pingSelection = btn.getAttribute('data-ping');
      const opt = PING_OPTIONS.find((p) => p.id === draft.pingSelection);
      if (opt?.hour !== null) draft.pingHour = opt.hour;
      saveDraft();
      renderTelegram(container);
    });
  });

  container.querySelector('#ob-custom-hour')?.addEventListener('input', (e) => {
    draft.pingHour = Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0));
    saveDraft();
  });

  container.querySelector('#ob-tg-connect')?.addEventListener('click', async () => {
    const note = container.querySelector('#ob-tg-note');
    if (note) note.textContent = 'Opening Telegram…';
    try {
      await lastActions?.onTelegramLink?.();
      if (note) note.textContent = "Opened! Click 'I connected →' to refresh status.";
    } catch (err) {
      if (note) note.textContent = String(err?.message || 'Could not start connection.');
    }
  });

  container.querySelector('#ob-tg-refresh')?.addEventListener('click', async () => {
    const note = container.querySelector('#ob-tg-note');
    if (note) note.textContent = 'Checking…';
    await lastActions?.onTelegramRefresh?.();
  });

  container.querySelector('#ob-next')?.addEventListener('click', () => go(7, container));
  container.querySelector('#ob-back')?.addEventListener('click', () => go(5, container));
}

// ── Step 7: Escalation ────────────────────────────────────────────────────

function renderEscalation(container) {
  container.innerHTML = wrap(`
    ${hdr(7, 'What should happen if you disappear for 2 days?')}
    ${selGrid(ESCALATIONS, draft.escalationRule, 'data-esc')}
    ${errDiv()}${nextBtn()}${backBtn()}`);

  bindCards(container, 'data-esc', () => draft.escalationRule, (v) => { draft.escalationRule = v; });

  container.querySelector('#ob-next')?.addEventListener('click', () => {
    if (!draft.escalationRule) { setErr(container, 'Pick an option to continue.'); return; }
    go(8, container);
  });
  container.querySelector('#ob-back')?.addEventListener('click', () => go(6, container));
}

// ── Step 8: Confirm Track ──────────────────────────────────────────────────

function renderConfirm(container) {
  const goal      = draft.specificGoal.trim() || draft.goalTemplate;
  const catLabel  = CATEGORIES.find((c)  => c.id === draft.goalCategory)?.label  || draft.goalCategory;
  const blkLabel  = BLOCKERS.find((b)    => b.id === draft.blocker)?.label       || draft.blocker;
  const intLabel  = INTENSITIES.find((i) => i.id === draft.dailyHours)?.label    || draft.dailyHours;
  const escLabel  = ESCALATIONS.find((e) => e.id === draft.escalationRule)?.label || draft.escalationRule;
  const pingLabel = PING_OPTIONS.find((p) => p.id === draft.pingSelection)?.label || 'Morning';
  const tg        = lastState?.telegram || {};
  const loading   = Boolean(lastState?.ui?.trackGenerating || lastState?.ui?.loading);
  const errText   = String(lastState?.ui?.error || '');
  const ruleTexts = draft.ifThenRules.map((id) => IF_THEN_RULES.find((r) => r.id === id)?.text || id).join(' · ');

  const row = (label, value) =>
    `<div class="v2-meta-row">
      <span class="v2-muted-text" style="flex-shrink:0">${esc(label)}</span>
      <span class="v2-body-text" style="text-align:right">${esc(String(value))}</span>
    </div>`;

  container.innerHTML = wrap(`
    ${hdr(8, 'Your 7-day track setup')}
    <div class="v2-card" style="margin-bottom:20px">
      ${row('Goal category', catLabel)}
      ${row('Goal', goal || '—')}
      ${row('Main blocker', blkLabel)}
      ${row('Daily time', intLabel)}
      ${row('Rules', ruleTexts || '—')}
      ${row('Telegram ping', `${pingLabel} · ${draft.pingHour}:00 UTC${tg.connected ? ' (connected)' : ' (not connected)'}`)}
      ${row('If absent 2 days', escLabel)}
    </div>
    ${errText ? `<p class="v2-err" style="margin-bottom:12px">${esc(errText)}</p>` : ''}
    ${nextBtn(loading ? 'Building your track…' : 'Build my 7-day track →', loading)}
    ${backBtn()}`);

  container.querySelector('#ob-next')?.addEventListener('click', async () => {
    if (!goal.trim()) return;
    const btn = container.querySelector('#ob-next');
    if (btn) { btn.disabled = true; btn.textContent = 'Building your track…'; }
    try {
      await lastActions?.onGenerate?.({ ...draft, goal: goal.trim() });
      clearOnboardingDraft();
    } catch (_e) { /* error state already surfaced via ui.error */ }
  });
  container.querySelector('#ob-back')?.addEventListener('click', () => go(7, container));
}

// ── Utils ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
