// Plan preview — shown immediately after onboarding track generation.
// Reads persisted v2 track. Redirects to /onboarding if no track found.

const INTENSITY_LABELS = {
  '0-1': '10 min/day',
  '1-2': '25 min/day',
  '2-4': '45 min/day',
  '4-6': '60+ min/day',
};

const CATEGORY_LABELS = {
  project: 'Build a project / MVP',
  startup: 'Startup / idea validation',
  content: 'Content / personal brand',
  skill:   'Learn a skill',
  career:  'Career / portfolio',
  study:   'Study / exam',
  habit:   'Habit / self-development',
  fitness: 'Fitness / health',
  other:   'Other',
};

const BLOCKER_LABELS = {
  procrastinate: 'procrastination',
  forget:        'forgetting',
  overwhelmed:   'overwhelm',
  no_start:      "not knowing where to start",
  motivation:    'low motivation',
  avoid:         'task avoidance',
  no_time:       'not enough time',
  too_big:       'plan too big',
};

export function render(container, state, actions) {
  const track = state.track;
  const days  = Array.isArray(track?.days) ? track.days : [];

  if (!track?.id || !days.length) {
    actions.onNavigate?.('/onboarding');
    return;
  }

  const day1 = days[0] || {};
  const day2 = days[1] || {};
  const rest = days.slice(2);

  const tg           = state.telegram || {};
  const pingHour     = tg.pingHour ?? 9;
  const pingLabel    = pingHour < 12 ? 'Morning' : pingHour < 17 ? 'Afternoon' : 'Evening';
  const pingDisplay  = tg.connected
    ? `${pingLabel} · ${pingHour}:00 UTC (@${esc(tg.username || 'you')})`
    : 'Not connected — add Telegram in Settings';

  const intensity = INTENSITY_LABELS[state.user?.dailyHours] || state.user?.dailyHours || '2–4 hours/day';
  const category  = CATEGORY_LABELS[track.goalCategory]      || track.goalCategory || '';
  const blocker   = BLOCKER_LABELS[track.blockerHint]        || track.blockerHint  || '';

  container.innerHTML = `
    <div style="max-width:560px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">

      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:10px">Plan ready</div>
      <h1 style="font-size:1.6rem;font-weight:900;color:#f9fafb;margin:0 0 6px;line-height:1.2">Your 7-day track is ready</h1>
      <p style="color:#9ca3af;font-size:.88rem;margin:0 0 24px">${esc(track.goal)}</p>

      <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:16px;margin-bottom:20px;display:flex;flex-direction:column;gap:10px">
        ${metaRow('Category',      category)}
        ${metaRow('Blocker',       blocker || '—')}
        ${metaRow('Daily time',    intensity)}
        ${metaRow('Telegram ping', pingDisplay)}
      </div>

      <div style="font-size:.75rem;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;margin-bottom:10px">Your plan</div>

      ${dayCard1(day1)}
      ${dayCard2(day2)}
      ${rest.length ? `<div style="display:flex;flex-direction:column;gap:0;margin-bottom:24px">${rest.map((d) => dayLight(d)).join('')}</div>` : ''}

      ${promiseBlock()}

      <button id="pp-start"
        style="width:100%;padding:14px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:800;font-size:1rem;cursor:pointer;margin-bottom:10px">
        Start Day 1 →
      </button>
      <button data-route="/settings"
        style="width:100%;padding:10px;background:transparent;color:#6b7280;border:none;font-size:.82rem;cursor:pointer">
        Connect Telegram in Settings
      </button>

    </div>`;

  container.querySelector('#pp-start')?.addEventListener('click', () => {
    actions.onStartDay1?.();
  });
  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────

function metaRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;gap:12px">
    <span style="font-size:.8rem;color:#6b7280;flex-shrink:0">${esc(label)}</span>
    <span style="font-size:.8rem;color:#9ca3af;text-align:right">${esc(String(value))}</span>
  </div>`;
}

function dayCard1(day) {
  return `
    <div style="background:#0f172a;border:2px solid #3b82f6;border-radius:10px;padding:18px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="width:32px;height:32px;border-radius:50%;background:#1e3a5f;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;color:#3b82f6;flex-shrink:0">1</div>
        <div style="font-size:.72rem;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:.07em">Day 1 — Start here</div>
      </div>
      <div style="font-weight:800;color:#f9fafb;font-size:1rem;line-height:1.35;margin-bottom:8px">${esc(day.title || '—')}</div>
      ${day.why ? `<p style="color:#9ca3af;font-size:.83rem;line-height:1.55;margin:0 0 10px">${esc(day.why)}</p>` : ''}
      ${day.successCriteria ? `<div style="font-size:.78rem;color:#4b5563;padding:8px 10px;background:#111827;border-left:3px solid #1d4ed8;border-radius:4px;margin-bottom:8px">Done when: ${esc(day.successCriteria)}</div>` : ''}
      <div style="font-size:.76rem;color:#6b7280">${day.estimateMinutes || 60} min · ${esc(day.category || 'task')}</div>
    </div>`;
}

function dayCard2(day) {
  if (!day.title) return '';
  return `
    <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:16px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:28px;height:28px;border-radius:50%;background:#1f2937;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.82rem;color:#6b7280;flex-shrink:0">2</div>
        <div style="font-size:.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em">Day 2 — Up next</div>
      </div>
      <div style="font-weight:700;color:#e5e7eb;font-size:.92rem;line-height:1.35;margin-bottom:6px">${esc(day.title)}</div>
      ${day.why ? `<p style="color:#6b7280;font-size:.8rem;line-height:1.5;margin:0">${esc(day.why)}</p>` : ''}
    </div>`;
}

function dayLight(day) {
  return `
    <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #111827;align-items:flex-start">
      <div style="width:24px;height:24px;border-radius:50%;background:#0f172a;border:1px solid #1f2937;display:flex;align-items:center;justify-content:center;font-size:.75rem;color:#4b5563;font-weight:700;flex-shrink:0;margin-top:1px">${day.dayNumber}</div>
      <div style="font-size:.83rem;color:#6b7280;line-height:1.4">${esc(day.title || '—')}</div>
    </div>`;
}

function promiseBlock() {
  const items = [
    ['Start with Agent',    'Guided micro-steps for each day\'s task'],
    ['Get Action Kit',      'Resources, templates, and shortcuts'],
    ['Prove progress',      'Log your proof of work'],
    ['Recover if blocked',  'Rescue action when things go wrong'],
    ['Adapt the next day',  'Tomorrow adjusts based on today\'s outcome'],
  ];
  return `
    <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:16px;margin-bottom:20px">
      <div style="font-size:.75rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">StriveAI will help you execute each day</div>
      ${items.map(([label, desc]) => `
        <div style="display:flex;gap:10px;margin-bottom:9px;align-items:flex-start">
          <span style="color:#3b82f6;font-size:.82rem;flex-shrink:0;margin-top:1px">→</span>
          <div>
            <span style="font-size:.84rem;font-weight:600;color:#e5e7eb">${esc(label)}</span>
            <span style="font-size:.82rem;color:#6b7280"> — ${esc(desc)}</span>
          </div>
        </div>`).join('')}
    </div>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
