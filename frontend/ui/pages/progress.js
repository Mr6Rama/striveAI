// Progress — /progress
// 7-day track timeline with polished cards and stats.
import { renderRoadmap } from '../components/roadmap.js';

const STATUS_META = Object.freeze({
  done:        { label: 'Done',        cls: 'v2-badge--done',     cardCls: 'v2-day-card--done'    },
  rescued:     { label: 'Rescued',     cls: 'v2-badge--rescued',  cardCls: 'v2-day-card--rescued' },
  blocked:     { label: 'Blocked',     cls: 'v2-badge--blocked',  cardCls: 'v2-day-card--blocked' },
  skipped:     { label: 'Skipped',     cls: 'v2-badge--skipped',  cardCls: 'v2-day-card--skipped' },
  missed:      { label: 'Missed',      cls: 'v2-badge--missed',   cardCls: 'v2-day-card--missed'  },
  in_progress: { label: 'In progress', cls: 'v2-badge--in-prog',  cardCls: ''                     },
  pending:     { label: 'Pending',     cls: 'v2-badge--pending',  cardCls: ''                     },
});

export function render(container, state, actions) {
  const { track, history, telegram } = state;

  if (!track?.id || !Array.isArray(track.days) || !track.days.length) {
    actions.onNavigate?.('/onboarding');
    return;
  }

  const entries  = Array.isArray(history?.entries) ? history.entries : [];
  const patterns = Array.isArray(history?.failurePatterns) ? history.failurePatterns : [];
  const stats    = computeStats(track, entries, telegram);
  const days     = buildDayRows(track, entries);
  const done     = days.filter((d) => d.status === 'done' || d.status === 'rescued').length;
  const total    = days.length;
  const pct      = total ? Math.round((done / total) * 100) : 0;

  container.innerHTML = `
    <div class="v2-page">

      <div class="v2-section-head" style="margin-bottom:20px">
        <div>
          <div class="v2-kicker v2-kicker--muted">7-Day Track</div>
          <h1 class="v2-h1" style="margin-bottom:4px">Your progress</h1>
          <p class="v2-sub" style="margin:0">${esc(track.goal || '')}</p>
        </div>
        ${track.status === 'complete'
          ? `<button data-route="/recap" class="v2-btn v2-btn--primary">View Recap →</button>`
          : ''}
      </div>

      ${renderRoadmap({
        days: track.days.map((d) => ({ dayNumber: d.dayNumber, status: d.status || 'pending', title: d.title })),
        currentDay: track.currentDayNumber || 1,
        variant: 'full',
      })}

      <div class="v2-card" style="margin-bottom:20px">
        <div class="v2-section-label" style="margin-bottom:12px">Completion</div>
        <div class="v2-progress" style="margin-bottom:8px"><div class="v2-progress-fill" style="width:${pct}%"></div></div>
        <p class="v2-muted-text">${done} of ${total} days complete · ${pct}%</p>
      </div>

      ${renderStats(stats)}

      <div class="v2-section-label" style="margin-bottom:12px;margin-top:24px">7-Day Timeline</div>
      <div class="v2-timeline">
        ${days.map(renderDayCard).join('')}
      </div>

      ${renderPatternNote(patterns)}

      <button data-route="/today" class="v2-btn v2-btn--ghost">← Back to Today</button>

    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
}

// ── Day cards ─────────────────────────────────────────────────────────────

function buildDayRows(track, entries) {
  return track.days.map((day) => {
    const histEntry = entries.find((e) => e.dayNumber === day.dayNumber && e.trackId === track.id);
    const status    = day.status || histEntry?.outcome || 'pending';
    const isToday   = day.dayNumber === track.currentDayNumber;
    return { day, status, isToday, histEntry };
  });
}

function renderDayCard({ day, status, isToday }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  const todayCls  = isToday ? ' v2-day-card--today' : '';
  const statusCls = meta.cardCls ? ` ${meta.cardCls}` : '';
  const bracketEl = isToday ? '<span class="v2-br-tr"></span><span class="v2-br-bl"></span>' : '';

  return `
    <div class="v2-day-card${todayCls}${statusCls}${isToday ? ' v2-bracketed' : ''}" style="overflow:visible">
      ${bracketEl}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="v2-section-label" style="margin:0">Day ${day.dayNumber}</span>
          <span class="v2-badge ${meta.cls}">${esc(meta.label)}</span>
        </div>
        ${isToday ? `<span class="v2-badge v2-badge--today">Today</span>` : ''}
      </div>
      <p class="v2-body-text" style="margin:0">${esc(day.title || '—')}</p>
      ${day.date ? `<p class="v2-muted-text" style="margin:4px 0 0">${esc(day.date)}</p>` : ''}
    </div>`;
}

// ── Stats ─────────────────────────────────────────────────────────────────

function computeStats(track, entries, telegram) {
  const te = entries.filter((e) => e.trackId === track.id);
  return {
    daysReturned:  te.length,
    done:          te.filter((e) => e.outcome === 'done').length,
    rescued:       te.filter((e) => e.outcome === 'rescued').length,
    missed:        te.filter((e) => e.outcome === 'missed').length,
    skipped:       te.filter((e) => e.outcome === 'skipped').length,
    agentSessions: te.filter((e) => e.agentUsed).length,
    telegramPings: telegram?.lastPingSentAt ? 1 : 0,
  };
}

function renderStats(s) {
  const items = [
    { label: 'Days returned',  value: s.daysReturned,  color: 'var(--v2-text)'   },
    { label: 'Done',           value: s.done,           color: 'var(--v2-green)'  },
    { label: 'Rescued',        value: s.rescued,        color: 'var(--v2-blue)'   },
    { label: 'Missed',         value: s.missed,         color: 'var(--v2-red)'    },
    { label: 'Skipped',        value: s.skipped,        color: 'var(--v2-muted)'  },
    { label: 'Agent sessions', value: s.agentSessions,  color: 'var(--v2-violet)' },
  ];

  return `
    <div class="v2-card">
      <div class="v2-section-label" style="margin-bottom:14px">Session stats</div>
      <div class="v2-stats-grid">
        ${items.map((item) => `
          <div class="v2-stat-cell">
            <div style="font-family:var(--v2-fhead);font-size:1.5rem;font-weight:800;color:${item.color};line-height:1">${item.value}</div>
            <div class="v2-muted-text" style="margin-top:4px">${esc(item.label)}</div>
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
    <div class="v2-card v2-card--amber" style="margin-bottom:16px;margin-top:16px">
      <div class="v2-section-label" style="margin-bottom:6px">Recurring pattern</div>
      <p style="color:var(--v2-amber);font-weight:700;font-size:.875rem;margin:0">${esc(LABELS[top] || top)} · appeared ${topCount}×</p>
    </div>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
