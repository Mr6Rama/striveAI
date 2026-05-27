// Vertical Journal Spine — collapsible weekly sections with always-visible day titles.
// Replaces the v2 SVG sinusoid roadmap.
//
// Usage:
//   container.innerHTML = renderJournal({ track, entries, currentDayNumber, variant });
//   wireJournal(container);
//
// variant: 'full' (Progress page — phase headers, week mini-bars, artifact expand)
//          'compact' (Plan preview / Recap — same layout, no artifacts, no expand)
//
// Track: 4 collapsible week sections, active week expanded by default.
// Spark: single un-collapsible section, 7 rows, no phase header.

const STATUS_META = Object.freeze({
  done:        { label: 'Done',        cls: 'v2-badge--done'    },
  rescued:     { label: 'Rescued',     cls: 'v2-badge--rescued' },
  blocked:     { label: 'Blocked',     cls: 'v2-badge--blocked' },
  skipped:     { label: 'Skipped',     cls: 'v2-badge--skipped' },
  missed:      { label: 'Missed',      cls: 'v2-badge--missed'  },
  rest:        { label: 'Rest',        cls: 'v2-badge--pending' },
  in_progress: { label: 'In progress', cls: 'v2-badge--in-prog' },
  pending:     { label: 'Upcoming',    cls: 'v2-badge--pending' },
});

const ROLE_LABELS = {
  setup:    'Setup',
  build:    'Build',
  validate: 'Validate',
  ship:     'Ship',
  review:   'Review',
  rest:     'Rest',
};

export function renderJournal({ track, entries, currentDayNumber, variant = 'full' }) {
  const days = Array.isArray(track?.days) ? track.days : [];
  if (!days.length) return '';

  const entryList = Array.isArray(entries) ? entries : [];
  const today     = Number(currentDayNumber) || track?.currentDayNumber || 1;
  const isSpark   = track?.kind === 'spark';
  const phases    = Array.isArray(track?.phases) ? track.phases : [];

  // Build day rows once with all metadata
  const rows = days.map((day) => buildRow(day, entryList, track, today));

  if (isSpark) {
    return `
      <div class="v2-journal" data-variant="${esc(variant)}">
        ${renderWeekSection({ weekNumber: 1, phase: null, rows, isActive: true, collapsible: false, variant, today })}
      </div>`;
  }

  // Track: group by weekNumber
  const weeks = [1, 2, 3, 4].map((w) => {
    const weekRows = rows.filter((r) => (r.day.weekNumber || weekFromDayNum(r.day.dayNumber)) === w);
    const phase    = phases.find((p) => p.weekNumber === w) || null;
    return { weekNumber: w, phase, rows: weekRows };
  });

  const activeWeek = weeks.find((w) => w.rows.some((r) => r.isToday))?.weekNumber || 1;

  return `
    <div class="v2-journal" data-variant="${esc(variant)}">
      ${weeks.map((w) => renderWeekSection({
        ...w,
        isActive:    w.weekNumber === activeWeek,
        collapsible: true,
        variant,
        today,
      })).join('')}
    </div>`;
}

// ── Week section ───────────────────────────────────────────────────────────

function renderWeekSection({ weekNumber, phase, rows, isActive, collapsible, variant, today }) {
  const total      = rows.length;
  const doneCount  = rows.filter((r) => r.status === 'done' || r.status === 'rescued').length;
  const workDays   = rows.filter((r) => !r.day.isRestDay).length || total;
  const pct        = workDays ? Math.round((doneCount / workDays) * 100) : 0;
  const isFuture   = rows.every((r) => r.day.dayNumber > today);
  const dimCls     = isFuture && collapsible ? ' v2-journal-week--dim' : '';
  const openCls    = isActive ? ' v2-journal-week--open' : '';
  const phaseName  = phase?.name || '';
  const role       = phase?.role || '';
  const roleLabel  = ROLE_LABELS[role] || role;

  const header = `
    <button class="v2-journal-week__head" type="button"
            data-journal-week="${weekNumber}"
            aria-expanded="${isActive ? 'true' : 'false'}"
            ${collapsible ? '' : 'disabled'}>
      <div class="v2-journal-week__head-l">
        <div class="v2-kicker v2-kicker--muted">Week ${weekNumber}</div>
        <div class="v2-journal-week__title">
          ${phaseName ? esc(phaseName) : `Days ${rows[0]?.day.dayNumber || ''}–${rows[rows.length - 1]?.day.dayNumber || ''}`}
          ${roleLabel ? `<span class="v2-journal-week__role">${esc(roleLabel)}</span>` : ''}
        </div>
      </div>
      <div class="v2-journal-week__head-r">
        <div class="v2-journal-week__mini">
          <div class="v2-journal-week__mini-fill" style="width:${pct}%"></div>
        </div>
        <div class="v2-journal-week__count">${doneCount}/${workDays}</div>
        ${collapsible ? `<span class="v2-journal-week__chev" aria-hidden="true">▾</span>` : ''}
      </div>
    </button>`;

  const body = `
    <div class="v2-journal-week__body" ${isActive ? '' : 'hidden'}>
      ${rows.map((r) => renderDayRow(r, variant)).join('')}
    </div>`;

  return `<section class="v2-journal-week${openCls}${dimCls}">${header}${body}</section>`;
}

// ── Day row ────────────────────────────────────────────────────────────────

function renderDayRow(row, variant) {
  const { day, status, isToday, histEntry } = row;
  const meta       = STATUS_META[status] || STATUS_META.pending;
  const stripeCls  = `v2-journal-day--${status}`;
  const todayCls   = isToday ? ' v2-journal-day--today' : '';
  const restCls    = day.isRestDay ? ' v2-journal-day--rest' : '';
  const dim        = day.dayNumber > (row.today || 0) ? ' v2-journal-day--future' : '';

  const expandable = variant === 'full' && Boolean(
    histEntry && (histEntry.proofValue || (histEntry.agentSteps || []).length)
  );

  const completed = histEntry?.createdAt
    ? new Date(histEntry.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  const title = day.isRestDay
    ? 'Rest day — recover and reflect'
    : (day.title || '—');

  return `
    <div class="v2-journal-day ${stripeCls}${todayCls}${restCls}${dim}${expandable ? ' v2-journal-day--clickable' : ''}"
         data-journal-day="${day.dayNumber}"
         ${expandable ? 'role="button" tabindex="0" aria-expanded="false"' : ''}>
      <div class="v2-journal-day__stripe" aria-hidden="true"></div>
      <div class="v2-journal-day__main">
        <div class="v2-journal-day__head">
          <span class="v2-journal-day__num">Day ${day.dayNumber}</span>
          <span class="v2-badge ${meta.cls}">${esc(meta.label)}</span>
          ${isToday ? `<span class="v2-badge v2-badge--today">Today</span>` : ''}
          ${expandable ? `<span class="v2-journal-day__chev" aria-hidden="true">▾</span>` : ''}
        </div>
        <p class="v2-journal-day__title">${esc(title)}</p>
        ${day.date ? `<p class="v2-journal-day__date">${esc(day.date)}</p>` : ''}
      </div>
      ${expandable ? `
        <div class="v2-journal-day__details" data-journal-details="${day.dayNumber}" hidden>
          ${day.successCriteria
            ? `<div class="v2-done-criteria" style="margin:8px 0 10px">Done means: ${esc(day.successCriteria)}</div>`
            : ''}
          ${renderArtifactProof(histEntry)}
          ${renderArtifactSteps(histEntry)}
          ${completed ? `<p class="v2-muted-text" style="margin:10px 0 0;font-size:.78rem">Completed ${esc(completed)}</p>` : ''}
        </div>` : ''}
    </div>`;
}

function renderArtifactProof(entry) {
  const value = String(entry?.proofValue || '').trim();
  if (!value) return '';
  const isLink = entry.proofType === 'link' && /^https?:\/\//i.test(value);
  const body = isLink
    ? `<a href="${esc(value)}" target="_blank" rel="noopener" class="v2-link">${esc(value)}</a>`
    : `<p class="v2-body-text" style="margin:0;white-space:pre-wrap">${esc(value)}</p>`;
  return `
    <div class="v2-day-artifact">
      <div class="v2-section-label" style="margin-bottom:6px">Proof</div>
      ${body}
    </div>`;
}

function renderArtifactSteps(entry) {
  const steps = Array.isArray(entry?.agentSteps) ? entry.agentSteps : [];
  if (!steps.length) return '';
  return `
    <div class="v2-day-artifact">
      <div class="v2-section-label" style="margin-bottom:6px">Agent steps</div>
      <ol class="v2-day-artifact__steps">
        ${steps.map((s) => `
          <li>
            <div>${esc(s.text || '')}</div>
            ${s.userOutput ? `<div class="v2-day-artifact__note">${esc(s.userOutput)}</div>` : ''}
          </li>
        `).join('')}
      </ol>
    </div>`;
}

// ── Event wiring ───────────────────────────────────────────────────────────

export function wireJournal(container) {
  // Week section toggles
  container.querySelectorAll('[data-journal-week]').forEach((btn) => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const section = btn.closest('.v2-journal-week');
      const body    = section?.querySelector('.v2-journal-week__body');
      if (!section || !body) return;
      const open = section.classList.toggle('v2-journal-week--open');
      if (open) {
        body.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
      } else {
        body.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  });

  // Day row expand
  container.querySelectorAll('[data-journal-day]').forEach((row) => {
    if (!row.hasAttribute('role')) return;
    const dayNum = row.getAttribute('data-journal-day');
    const details = container.querySelector(`[data-journal-details="${dayNum}"]`);
    if (!details) return;
    const toggle = () => {
      const isOpen = !details.hasAttribute('hidden');
      if (isOpen) {
        details.setAttribute('hidden', '');
        row.setAttribute('aria-expanded', 'false');
        row.classList.remove('v2-journal-day--open');
      } else {
        details.removeAttribute('hidden');
        row.setAttribute('aria-expanded', 'true');
        row.classList.add('v2-journal-day--open');
      }
    };
    row.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      toggle();
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildRow(day, entries, track, today) {
  const histEntry = entries.find((e) => e.dayNumber === day.dayNumber && e.trackId === track?.id);
  const status    = day.status || histEntry?.outcome || 'pending';
  const isToday   = day.dayNumber === today;
  return { day, status, isToday, histEntry, today };
}

function weekFromDayNum(dayNumber) {
  return Math.floor((dayNumber - 1) / 7) + 1;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
