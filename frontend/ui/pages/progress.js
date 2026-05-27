// Progress — /progress
// Vertical Journal Spine + completion bar + stats + recurring-pattern note.
import { renderJournal, wireJournal } from '../components/journal.js';

export function render(container, state, actions) {
  const { track, history, telegram } = state;

  if (!track?.id || !Array.isArray(track.days) || !track.days.length) {
    actions.onNavigate?.('/onboarding');
    return;
  }

  const entries  = Array.isArray(history?.entries) ? history.entries : [];
  const patterns = Array.isArray(history?.failurePatterns) ? history.failurePatterns : [];
  const stats    = computeStats(track, entries, telegram);

  // Completion excludes rest days from the denominator
  const workDays  = track.days.filter((d) => !d.isRestDay);
  const total     = workDays.length || track.days.length;
  const done      = workDays.filter((d) => d.status === 'done' || d.status === 'rescued').length;
  const pct       = total ? Math.round((done / total) * 100) : 0;

  const user      = state.user || {};
  const weekGoal  = String(user.weekGoal || '').trim();
  const isSpark   = track.kind === 'spark';
  const totalDays = track.totalDays || (isSpark ? 7 : 28);
  const trackType = isSpark ? '7-Day Spark' : `${totalDays}-Day Track`;
  const currentDay = track.currentDayNumber || 1;

  const phaseLine = !isSpark
    ? buildPhaseLine(track, currentDay, totalDays)
    : '';

  container.innerHTML = `
    <div class="v2-page">

      <div class="v2-section-head" style="margin-bottom:20px">
        <div>
          <div class="v2-kicker v2-kicker--muted">${esc(trackType)}</div>
          <h1 class="v2-h1" style="margin-bottom:4px">${isSpark ? 'Your week' : 'Your journey'}</h1>
          <p class="v2-sub" style="margin:0">${esc(track.goal || '')}</p>
          ${phaseLine ? `<p class="v2-muted-text" style="margin:4px 0 0">${phaseLine}</p>` : ''}
          ${weekGoal ? `<p class="v2-muted-text" style="margin:4px 0 0">By Day ${totalDays}: ${esc(weekGoal)}</p>` : ''}
        </div>
        ${track.status === 'complete'
          ? `<button data-route="/recap" class="v2-btn v2-btn--primary">View Recap →</button>`
          : ''}
      </div>

      <div class="v2-card" style="margin-bottom:20px">
        <div class="v2-section-label" style="margin-bottom:12px">Completion</div>
        <div class="v2-progress" style="margin-bottom:8px"><div class="v2-progress-fill" style="width:${pct}%"></div></div>
        <p class="v2-muted-text">${done} of ${total} days complete · ${pct}%</p>
      </div>

      ${renderStats(stats, isSpark)}

      <div class="v2-section-label" style="margin-bottom:12px;margin-top:24px">
        ${isSpark ? 'Your week, day by day' : 'Your journey, week by week'}
      </div>
      ${renderJournal({ track, entries, currentDayNumber: currentDay, variant: 'full' })}

      ${renderPatternNote(patterns)}

      <button data-route="/today" class="v2-btn v2-btn--ghost">← Back to Today</button>

    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });

  wireJournal(container);
}

// ── Phase context line ────────────────────────────────────────────────────

function buildPhaseLine(track, currentDay, totalDays) {
  const week = Math.ceil(currentDay / 7);
  const phase = Array.isArray(track.phases) ? track.phases.find((p) => p.weekNumber === week) : null;
  const name = phase?.name ? ` — ${esc(phase.name)}` : '';
  return `Day ${currentDay} of ${totalDays} · Week ${week}${name}`;
}

// ── Stats ─────────────────────────────────────────────────────────────────

function computeStats(track, entries, telegram) {
  const te = entries.filter((e) => e.trackId === track.id);
  const restCount = (track.days || []).filter((d) => d.status === 'rest').length;
  return {
    done:          te.filter((e) => e.outcome === 'done').length,
    rescued:       te.filter((e) => e.outcome === 'rescued').length,
    missed:        te.filter((e) => e.outcome === 'missed').length,
    skipped:       te.filter((e) => e.outcome === 'skipped').length,
    rest:          restCount,
    agentSessions: te.filter((e) => e.agentUsed).length,
    telegramPings: telegram?.lastPingSentAt ? 1 : 0,
  };
}

function renderStats(s, isSpark) {
  const items = [
    { label: 'Done',           value: s.done,           color: 'var(--v2-green)'  },
    { label: 'Rescued',        value: s.rescued,        color: 'var(--v2-blue)'   },
    { label: 'Missed',         value: s.missed,         color: 'var(--v2-red)'    },
    { label: 'Skipped',        value: s.skipped,        color: 'var(--v2-muted)'  },
  ];
  if (!isSpark) items.push({ label: 'Rest days', value: s.rest, color: 'var(--v2-dim)' });
  items.push({ label: 'Agent sessions', value: s.agentSessions, color: 'var(--v2-violet)' });

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
