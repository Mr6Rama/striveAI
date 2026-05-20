// Progress — /progress
// Shows the 7-day track grid, per-day status, and session-level stats.
// Visible any time an active track exists (not gated to Day 7).

const STATUS_META = Object.freeze({
  done:        { label: 'Done',        color: '#22c55e', bg: '#052e16', border: '#166534' },
  rescued:     { label: 'Rescued',     color: '#3b82f6', bg: '#0c1a2e', border: '#1d4ed8' },
  blocked:     { label: 'Blocked',     color: '#f59e0b', bg: '#1a1200', border: '#92400e' },
  skipped:     { label: 'Skipped',     color: '#6b7280', bg: '#111827', border: '#374151' },
  missed:      { label: 'Missed',      color: '#ef4444', bg: '#1a0a0a', border: '#7f1d1d' },
  in_progress: { label: 'In progress', color: '#a78bfa', bg: '#0f0a1e', border: '#6d28d9' },
  pending:     { label: 'Pending',     color: '#4b5563', bg: '#0f172a', border: '#1f2937' },
});

export function render(container, state, actions) {
  const { track, history, telegram } = state;

  if (!track?.id || !Array.isArray(track.days) || !track.days.length) {
    actions.onNavigate?.('/onboarding');
    return;
  }

  const entries  = Array.isArray(history?.entries) ? history.entries : [];
  const patterns = Array.isArray(history?.failurePatterns) ? history.failurePatterns : [];

  const stats    = computeStats(track, entries, patterns, telegram);
  const days     = buildDayRows(track, entries);

  container.innerHTML = `
    <div style="max-width:560px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">

      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Progress</div>
      <h1 style="font-size:1.35rem;font-weight:800;color:#f9fafb;margin:0 0 4px">7-day track</h1>
      <p style="color:#6b7280;font-size:.82rem;margin:0 0 24px;line-height:1.5">${esc(track.goal || '')}</p>

      ${renderDayGrid(days)}
      ${renderStats(stats)}
      ${renderPatternNote(patterns)}

      <div style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap">
        <button data-route="/today"
          style="padding:9px 18px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:8px;font-weight:600;cursor:pointer;font-size:.85rem">
          ← Today
        </button>
        ${track.status === 'complete'
          ? `<button data-route="/recap"
               style="padding:9px 18px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:.85rem;cursor:pointer">
               View Recap →
             </button>`
          : ''}
      </div>

    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
}

// ── Day grid ──────────────────────────────────────────────────────────────

function buildDayRows(track, entries) {
  return track.days.map((day) => {
    // Prefer the day plan's own status as ground truth; fall back to history entry
    const histEntry = entries.find((e) => e.dayNumber === day.dayNumber && e.trackId === track.id);
    const status    = day.status || histEntry?.outcome || 'pending';
    const isToday   = day.dayNumber === track.currentDayNumber;
    return { day, status, isToday, histEntry };
  });
}

function renderDayGrid(rows) {
  const cards = rows.map(({ day, status, isToday }) => {
    const meta = STATUS_META[status] || STATUS_META.pending;
    return `
      <div style="background:${meta.bg};border:1px solid ${isToday ? '#3b82f6' : meta.border};border-radius:8px;padding:12px 14px;position:relative">
        ${isToday ? '<div style="position:absolute;top:8px;right:10px;font-size:.65rem;color:#60a5fa;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Today</div>' : ''}
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">
          <span style="font-size:.68rem;font-weight:700;color:#4b5563;text-transform:uppercase;letter-spacing:.06em">Day ${day.dayNumber}</span>
          <span style="font-size:.68rem;font-weight:700;color:${meta.color};text-transform:uppercase;letter-spacing:.05em">${esc(meta.label)}</span>
        </div>
        <div style="color:#d1d5db;font-size:.87rem;font-weight:600;line-height:1.35;padding-right:${isToday ? '44px' : '0'}">${esc(day.title || '—')}</div>
        ${day.date ? `<div style="color:#4b5563;font-size:.73rem;margin-top:4px">${esc(day.date)}</div>` : ''}
      </div>`;
  }).join('');

  return `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">${cards}</div>`;
}

// ── Stats ─────────────────────────────────────────────────────────────────

function computeStats(track, entries, patterns, telegram) {
  const trackEntries = entries.filter((e) => e.trackId === track.id);

  return {
    daysReturned:    trackEntries.length,
    done:            trackEntries.filter((e) => e.outcome === 'done').length,
    rescued:         trackEntries.filter((e) => e.outcome === 'rescued').length,
    missed:          trackEntries.filter((e) => e.outcome === 'missed').length,
    skipped:         trackEntries.filter((e) => e.outcome === 'skipped').length,
    agentSessions:   trackEntries.filter((e) => e.agentUsed).length,
    actionKitsUsed:  0, // not yet tracked per-entry; reserved for future
    telegramPings:   telegram?.lastPingSentAt ? 1 : 0, // basic signal; full count requires server log
  };
}

function renderStats(s) {
  const items = [
    { label: 'Days returned',    value: s.daysReturned,   color: '#f9fafb' },
    { label: 'Done',             value: s.done,           color: '#22c55e' },
    { label: 'Rescued',          value: s.rescued,        color: '#3b82f6' },
    { label: 'Missed',           value: s.missed,         color: '#ef4444' },
    { label: 'Skipped',          value: s.skipped,        color: '#6b7280' },
    { label: 'Agent sessions',   value: s.agentSessions,  color: '#a78bfa' },
  ];

  return `
    <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:16px;margin-bottom:16px">
      <div style="font-size:.7rem;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;margin-bottom:12px">Stats</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        ${items.map((item) => `
          <div>
            <div style="font-size:1.25rem;font-weight:800;color:${item.color}">${item.value}</div>
            <div style="font-size:.7rem;color:#4b5563;margin-top:1px">${esc(item.label)}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ── Pattern note ──────────────────────────────────────────────────────────

function renderPatternNote(patterns) {
  if (!patterns.length) return '';

  const counts = {};
  patterns.forEach((p) => {
    const c = p.blockerCategory || 'other';
    counts[c] = (counts[c] || 0) + 1;
  });
  const [top, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  if (!top || topCount < 2) return '';

  const LABELS = {
    time: 'Not enough time', unclear: 'Unclear how to start',
    motivation: 'Low energy / avoidance', skill_gap: 'Skill gap',
    no_access: 'Access / tool issues', external: 'External dependency', other: 'General',
  };

  return `
    <div style="background:#1a1200;border:1px solid #92400e;border-radius:8px;padding:12px 14px;margin-bottom:8px">
      <div style="font-size:.7rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">Recurring pattern</div>
      <div style="color:#fbbf24;font-size:.85rem;font-weight:600">${esc(LABELS[top] || top)} · appeared ${topCount}×</div>
    </div>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
