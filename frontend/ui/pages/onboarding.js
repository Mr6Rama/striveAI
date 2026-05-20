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
  { id: 'stricter',  label: 'Make reminders stricter' },
  { id: 'message',   label: 'Generate a message I can send to a friend' },
  { id: 'tiny_mode', label: 'Switch me to Tiny Mode' },
  { id: 'rescue',    label: 'Restart with a rescue action' },
  { id: 'none',      label: 'No escalation' },
];

// ── Module state ───────────────────────────────────────────────────────────

let draft = {
  goalCategory: '', goalTemplate: '', specificGoal: '',
  blocker: '', dailyHours: '2-4', ifThenRules: [],
  pingSelection: 'morning', pingHour: 9, escalationRule: '',
};
let currentStep = 1;
let lastState   = null;
let lastActions = null;

export function render(container, state, actions) {
  lastState   = state;
  lastActions = actions;
  renderStep(container);
}

function renderStep(container) {
  switch (currentStep) {
    case 1:  renderCategory(container);  break;
    case 2:  renderTemplate(container);  break;
    case 3:  renderBlocker(container);   break;
    case 4:  renderIntensity(container); break;
    case 5:  renderIfThen(container);    break;
    case 6:  renderTelegram(container);  break;
    case 7:  renderEscalation(container); break;
    default: renderConfirm(container);
  }
}

function go(n, container) {
  currentStep = n;
  renderStep(container);
}

// ── Layout helpers ─────────────────────────────────────────────────────────

function wrap(inner) {
  return `<div style="max-width:540px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">${inner}</div>`;
}

function hdr(step, title, sub) {
  return `<div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Step ${step} of 8</div>
    <h1 style="font-size:1.35rem;font-weight:800;color:#f9fafb;margin:0 0 ${sub ? '6px' : '20px'}">${esc(title)}</h1>
    ${sub ? `<p style="color:#9ca3af;font-size:.85rem;margin:0 0 20px">${esc(sub)}</p>` : ''}`;
}

function cards(items, selId, attr) {
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:8px;margin-bottom:20px">
    ${items.map((item) => {
      const on = (Array.isArray(selId) ? selId.includes(item.id) : item.id === selId);
      return `<button ${attr}="${esc(item.id)}" style="padding:11px 13px;background:${on ? '#1e3a5f' : '#111827'};border:${on ? '2px solid #3b82f6' : '1px solid #1f2937'};border-radius:8px;color:${on ? '#93c5fd' : '#9ca3af'};font-size:.84rem;font-weight:${on ? '700' : '600'};cursor:pointer;text-align:left;line-height:1.35">${esc(item.label || item.text || '')}${item.sub ? `<div style="font-size:.73rem;margin-top:3px;color:${on ? '#60a5fa' : '#4b5563'}">${esc(item.sub)}</div>` : ''}</button>`;
    }).join('')}
  </div>`;
}

function nextBtn(label = 'Continue →', disabled = false) {
  return `<button id="ob-next" ${disabled ? 'disabled' : ''} style="width:100%;padding:12px;background:${disabled ? '#1f2937' : '#3b82f6'};color:${disabled ? '#6b7280' : '#fff'};border:none;border-radius:8px;font-weight:700;cursor:${disabled ? 'default' : 'pointer'};margin-bottom:10px">${esc(label)}</button>`;
}

function backBtn() {
  return `<button id="ob-back" style="padding:8px 0;background:transparent;color:#6b7280;border:none;font-size:.8rem;cursor:pointer">← Back</button>`;
}

function errDiv() {
  return `<div id="ob-err" style="font-size:.8rem;color:#f87171;min-height:1.2em;margin-bottom:8px"></div>`;
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
      refreshCards(container, attr, getVal());
    });
  });
}

function refreshCards(container, attr, sel) {
  const selected = Array.isArray(sel) ? sel : [sel];
  container.querySelectorAll(`[${attr}]`).forEach((b) => {
    const on = selected.includes(b.getAttribute(attr));
    b.style.background = on ? '#1e3a5f' : '#111827';
    b.style.border     = on ? '2px solid #3b82f6' : '1px solid #1f2937';
    b.style.color      = on ? '#93c5fd' : '#9ca3af';
    b.style.fontWeight = on ? '700' : '600';
  });
}

// ── Step 1: Goal Category ──────────────────────────────────────────────────

function renderCategory(container) {
  container.innerHTML = wrap(`
    ${hdr(1, 'What do you want to stay on track with?')}
    ${cards(CATEGORIES, draft.goalCategory, 'data-cat')}
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
    ${hdr(2, 'Pick the closest goal')}
    ${cards(tpls, draft.goalTemplate, 'data-tpl')}
    <div style="margin-bottom:16px">
      <label style="font-size:.8rem;font-weight:600;color:#9ca3af;display:block;margin-bottom:4px">Make it more specific (optional)</label>
      <input id="ob-specific" type="text" placeholder="e.g. Build a Notion clone in Next.js" value="${esc(draft.specificGoal)}"
        style="width:100%;padding:10px 12px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.9rem;box-sizing:border-box"/>
    </div>
    ${errDiv()}${nextBtn()}${backBtn()}`);

  bindCards(container, 'data-tpl', () => draft.goalTemplate, (v) => { draft.goalTemplate = v; });
  container.querySelector('#ob-specific')?.addEventListener('input', (e) => { draft.specificGoal = e.target.value; });

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
    ${cards(BLOCKERS, draft.blocker, 'data-blk')}
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
    ${cards(INTENSITIES, draft.dailyHours, 'data-int')}
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
  container.innerHTML = wrap(`
    ${hdr(5, 'What should StriveAI do when things go wrong?', 'Select 2–4 rules.')}
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
      ${IF_THEN_RULES.map((r) => {
        const on = draft.ifThenRules.includes(r.id);
        return `<button data-rule="${esc(r.id)}" style="padding:12px 14px;background:${on ? '#1e3a5f' : '#111827'};border:${on ? '2px solid #3b82f6' : '1px solid #1f2937'};border-radius:8px;color:${on ? '#93c5fd' : '#9ca3af'};font-size:.84rem;font-weight:${on ? '700' : '600'};cursor:pointer;text-align:left">${esc(r.text)}</button>`;
      }).join('')}
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
  const tg = lastState?.telegram || {};
  const connected = Boolean(tg.connected);

  container.innerHTML = wrap(`
    ${hdr(6, 'When should StriveAI check in on Telegram?')}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
      ${PING_OPTIONS.map((opt) => {
        const on = draft.pingSelection === opt.id;
        return `<button data-ping="${opt.id}" style="padding:10px 8px;background:${on ? '#1e3a5f' : '#111827'};border:${on ? '2px solid #3b82f6' : '1px solid #1f2937'};border-radius:8px;color:${on ? '#93c5fd' : '#9ca3af'};font-size:.83rem;font-weight:${on ? '700' : '600'};cursor:pointer;text-align:center">${opt.label}${opt.hour !== null ? `<div style="font-size:.72rem;margin-top:2px;color:${on ? '#60a5fa' : '#4b5563'}">${opt.hour}:00 UTC</div>` : ''}</button>`;
      }).join('')}
    </div>
    ${draft.pingSelection === 'custom' ? `<div style="margin-bottom:14px"><label style="font-size:.8rem;font-weight:600;color:#9ca3af;display:block;margin-bottom:4px">Hour (0–23, UTC)</label><input id="ob-custom-hour" type="number" min="0" max="23" value="${draft.pingHour}" style="width:80px;padding:8px 10px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.9rem"/></div>` : ''}
    <div style="padding:14px;background:#111827;border:1px solid #1f2937;border-radius:8px;margin-bottom:16px">
      <div style="font-size:.84rem;font-weight:600;color:#e5e7eb;margin-bottom:8px">Telegram</div>
      ${connected
        ? `<div style="font-size:.84rem;color:#22c55e">Connected${tg.username ? ` as @${esc(tg.username)}` : ''}</div>`
        : `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
             <span style="font-size:.84rem;color:#6b7280">Not connected</span>
             <button id="ob-tg-connect" style="padding:7px 14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;font-size:.82rem;font-weight:700;cursor:pointer">Connect Telegram</button>
             <button id="ob-tg-refresh" style="padding:7px 12px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:6px;font-size:.78rem;cursor:pointer">I connected →</button>
           </div>`}
      <div id="ob-tg-note" style="font-size:.75rem;color:#6b7280;margin-top:6px">Telegram is the only ping channel.</div>
    </div>
    ${errDiv()}${nextBtn()}${backBtn()}`);

  container.querySelectorAll('[data-ping]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.pingSelection = btn.getAttribute('data-ping');
      const opt = PING_OPTIONS.find((p) => p.id === draft.pingSelection);
      if (opt?.hour !== null) draft.pingHour = opt.hour;
      renderTelegram(container);
    });
  });

  container.querySelector('#ob-custom-hour')?.addEventListener('input', (e) => {
    draft.pingHour = Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0));
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
    // renderApp fires automatically via store subscription with updated state
  });

  container.querySelector('#ob-next')?.addEventListener('click', () => go(7, container));
  container.querySelector('#ob-back')?.addEventListener('click', () => go(5, container));
}

// ── Step 7: Escalation Lite ────────────────────────────────────────────────

function renderEscalation(container) {
  container.innerHTML = wrap(`
    ${hdr(7, 'What should happen if you disappear for 2 days?')}
    ${cards(ESCALATIONS, draft.escalationRule, 'data-esc')}
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
  const catLabel  = CATEGORIES.find((c) => c.id === draft.goalCategory)?.label  || draft.goalCategory;
  const blkLabel  = BLOCKERS.find((b)   => b.id === draft.blocker)?.label       || draft.blocker;
  const intLabel  = INTENSITIES.find((i) => i.id === draft.dailyHours)?.label   || draft.dailyHours;
  const escLabel  = ESCALATIONS.find((e) => e.id === draft.escalationRule)?.label || draft.escalationRule;
  const pingLabel = PING_OPTIONS.find((p) => p.id === draft.pingSelection)?.label || 'Morning';
  const tg        = lastState?.telegram || {};
  const loading   = Boolean(lastState?.ui?.trackGenerating || lastState?.ui?.loading);
  const errText   = String(lastState?.ui?.error || '');
  const ruleTexts = draft.ifThenRules.map((id) => IF_THEN_RULES.find((r) => r.id === id)?.text || id).join(' · ');

  const row = (label, value) =>
    `<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #111827">
      <span style="color:#6b7280;font-size:.82rem;flex-shrink:0;margin-right:8px">${esc(label)}</span>
      <span style="color:#e5e7eb;font-size:.82rem;text-align:right">${esc(String(value))}</span>
    </div>`;

  container.innerHTML = wrap(`
    ${hdr(8, 'Your 7-day track setup')}
    <div style="margin-bottom:20px">
      ${row('Goal category', catLabel)}
      ${row('Goal', goal || '—')}
      ${row('Main blocker', blkLabel)}
      ${row('Daily time', intLabel)}
      ${row('Rules', ruleTexts || '—')}
      ${row('Telegram ping', `${pingLabel} · ${draft.pingHour}:00 UTC${tg.connected ? ' (connected)' : ' (not connected)'}`)}
      ${row('If absent 2 days', escLabel)}
    </div>
    ${errText ? `<div style="font-size:.8rem;color:#f87171;margin-bottom:12px">${esc(errText)}</div>` : ''}
    ${nextBtn(loading ? 'Building your track…' : 'Build my 7-day track', loading)}
    ${backBtn()}`);

  container.querySelector('#ob-next')?.addEventListener('click', async () => {
    if (!goal.trim()) { return; }
    const btn = container.querySelector('#ob-next');
    if (btn) { btn.disabled = true; btn.textContent = 'Building your track…'; btn.style.background = '#1f2937'; btn.style.color = '#6b7280'; }
    await lastActions?.onGenerate?.({ ...draft, goal: goal.trim() });
  });
  container.querySelector('#ob-back')?.addEventListener('click', () => go(7, container));
}

// ── Utils ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
