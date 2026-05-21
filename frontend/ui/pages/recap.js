// Day 7 Recap — /recap
// Shown when track.status === 'complete'.

let exportCopied = false;

export function render(container, state, actions) {
  const { track, history, telegram, ui } = state;

  if (!track?.id) { actions.onNavigate?.('/onboarding'); return; }

  const entries        = Array.isArray(history?.entries)        ? history.entries        : [];
  const patterns       = Array.isArray(history?.failurePatterns)? history.failurePatterns: [];
  const days           = Array.isArray(track.days)              ? track.days              : [];
  const stats          = computeStats(track, entries, days);
  const patternSummary = topPattern(patterns);
  const bestFormat     = bestWorkingFormat(entries);
  const recapText      = state.recapText || '';
  const recapLoading   = Boolean(ui?.recapLoading);
  const continuing     = Boolean(ui?.trackContinuing);

  container.innerHTML = buildPage(track, stats, patternSummary, bestFormat, recapText, recapLoading, continuing, telegram);
  wireEvents(container, state, actions, track, recapText, patterns);
}

// ── Page builder ──────────────────────────────────────────────────────────────

function buildPage(track, stats, patternSummary, bestFormat, recapText, recapLoading, continuing, telegram) {
  return `
    <div class="v2-page">

      <div class="v2-kicker" style="margin-bottom:8px">
        <span class="v2-badge v2-badge--done">Week complete</span>
      </div>
      <h1 class="v2-h1" style="margin-bottom:6px">Your 7-day track is complete.</h1>
      <p class="v2-sub">${esc(track.goal || '')}</p>

      ${renderResultGrid(stats)}
      ${patternSummary ? renderPatternCard(patternSummary) : ''}
      ${bestFormat     ? renderFormatCard(bestFormat)      : ''}
      ${renderAIReflection(recapText, recapLoading)}
      ${renderCTAs(continuing, telegram)}

    </div>`;
}

// ── Stats grid ────────────────────────────────────────────────────────────────

function computeStats(track, entries, days) {
  const te = entries.filter((e) => e.trackId === track.id);
  return {
    total:         days.length || 7,
    daysReturned:  te.length,
    done:          te.filter((e) => e.outcome === 'done').length,
    rescued:       te.filter((e) => e.outcome === 'rescued').length,
    missed:        te.filter((e) => e.outcome === 'missed').length,
    skipped:       te.filter((e) => e.outcome === 'skipped').length,
    unanswered:    days.filter((d) => d.status === 'pending').length,
    agentSessions: te.filter((e) => e.agentUsed).length,
  };
}

function renderResultGrid(s) {
  const cells = [
    { label: 'Days returned',  value: s.daysReturned, color: 'var(--v2-text)'   },
    { label: 'Done',           value: s.done,          color: 'var(--v2-green)'  },
    { label: 'Rescued',        value: s.rescued,       color: 'var(--v2-blue-l)' },
    { label: 'Missed',         value: s.missed,        color: 'var(--v2-red)'    },
    { label: 'Unanswered',     value: s.unanswered,    color: 'var(--v2-muted)'  },
    { label: 'Agent sessions', value: s.agentSessions, color: 'var(--v2-violet)' },
  ];
  return `
    <div class="v2-card" style="margin-bottom:16px">
      <div class="v2-section-label" style="margin-bottom:14px">Results</div>
      <div class="v2-stats-grid">
        ${cells.map((c) => `
          <div class="v2-stat-cell">
            <div style="font-family:var(--v2-fhead);font-size:1.5rem;font-weight:800;color:${c.color};line-height:1">${c.value}</div>
            <div class="v2-muted-text" style="margin-top:4px">${esc(c.label)}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ── Pattern card ──────────────────────────────────────────────────────────────

function topPattern(patterns) {
  if (!patterns.length) return null;
  const counts = {};
  patterns.forEach((p) => {
    const c = p.blockerCategory || 'other';
    counts[c] = (counts[c] || 0) + 1;
  });
  const [cat, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  if (!cat || count < 1) return null;

  const LABELS = {
    time: 'Not enough time', unclear: 'Unclear how to start',
    motivation: 'Low energy or avoidance', skill_gap: 'Skill gap',
    no_access: 'Access or tool issues', external: 'External dependency', other: 'General friction',
  };
  return { category: cat, count, label: LABELS[cat] || cat };
}

function renderPatternCard(p) {
  return `
    <div class="v2-card v2-card--amber" style="margin-bottom:12px">
      <div class="v2-section-label" style="margin-bottom:6px">Main friction pattern</div>
      <p style="color:var(--v2-amber);font-weight:700;font-size:.875rem;margin:0">${esc(p.label)}</p>
      <p class="v2-muted-text" style="margin-top:4px">Came up ${p.count}× across the week</p>
    </div>`;
}

// ── Best working format ───────────────────────────────────────────────────────

function bestWorkingFormat(entries) {
  const done = entries.filter((e) => e.outcome === 'done' || e.outcome === 'rescued');
  if (!done.length) return null;
  const agentCount = done.filter((e) => e.agentUsed).length;
  const total      = done.length;
  if (total < 2) return null;
  const pct = Math.round((agentCount / total) * 100);
  if (pct >= 60) return 'Agent mode — guided steps helped you finish more days.';
  if (pct <= 30) return 'Self-directed — you completed most days without Agent guidance.';
  return 'Mixed — you used Agent on hard days and worked solo otherwise.';
}

function renderFormatCard(text) {
  return `
    <div class="v2-card" style="margin-bottom:12px">
      <div class="v2-section-label" style="margin-bottom:6px">Best working format</div>
      <p class="v2-body-text" style="margin:0">${esc(text)}</p>
    </div>`;
}

// ── AI reflection ─────────────────────────────────────────────────────────────

function renderAIReflection(text, loading) {
  if (loading) {
    return `
      <div class="v2-card" style="margin-bottom:20px">
        <div class="v2-loading-center" style="padding:24px">
          <div class="v2-spin"></div>
          <p class="v2-muted-text">Generating reflection…</p>
        </div>
      </div>`;
  }
  if (!text) {
    return `
      <div class="v2-card" style="margin-bottom:20px">
        <div class="v2-section-label" style="margin-bottom:8px">Reflection</div>
        <button id="recap-load-reflection" class="v2-btn v2-btn--ghost v2-btn--sm" style="color:var(--v2-blue);padding:0">
          Generate reflection →
        </button>
      </div>`;
  }
  return `
    <div class="v2-card" style="margin-bottom:20px">
      <div class="v2-section-label" style="margin-bottom:10px">Reflection</div>
      <p class="v2-body-text" style="margin:0;line-height:1.7">${esc(text)}</p>
    </div>`;
}

// ── CTAs ──────────────────────────────────────────────────────────────────────

function renderCTAs(continuing, telegram) {
  return `
    <div class="v2-row v2-row--col" style="gap:10px;margin-bottom:12px">
      <button id="recap-continue" ${continuing ? 'disabled' : ''} class="v2-btn v2-btn--primary v2-btn--lg v2-btn--full">
        ${esc(continuing ? 'Generating next week…' : 'Continue this goal — next 7 days →')}
      </button>
      <button id="recap-new" class="v2-btn v2-btn--secondary v2-btn--full">
        Start a new 7-day track
      </button>
    </div>

    <div class="v2-row" style="margin-bottom:24px">
      <button id="recap-export" class="v2-btn v2-btn--ghost" style="flex:1">
        Export my pattern
      </button>
      ${telegram?.connected
        ? `<button id="recap-telegram" class="v2-btn v2-btn--ghost" style="flex:1">
             Adjust Telegram ping
           </button>`
        : ''}
    </div>

    <button data-route="/progress" class="v2-btn v2-btn--ghost">View full progress →</button>`;
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function wireEvents(container, state, actions, track, recapText, patterns) {
  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });

  container.querySelector('#recap-continue')?.addEventListener('click', () => {
    if (state.ui?.trackContinuing) return;
    actions.onRecapContinue?.({ recapText });
  });

  container.querySelector('#recap-new')?.addEventListener('click', () => actions.onRecapNewTrack?.());
  container.querySelector('#recap-load-reflection')?.addEventListener('click', () => actions.onRecapLoadReflection?.());

  container.querySelector('#recap-export')?.addEventListener('click', () => {
    const text = buildExportText(track, state.history);
    navigator.clipboard?.writeText(text).then(() => {
      const btn = container.querySelector('#recap-export');
      if (btn) {
        btn.textContent = 'Copied to clipboard';
        setTimeout(() => { btn.textContent = 'Export my pattern'; }, 2000);
      }
    }).catch(() => {});
  });

  container.querySelector('#recap-telegram')?.addEventListener('click', () => actions.onNavigate?.('/settings'));
}

// ── Export text builder ───────────────────────────────────────────────────────

function buildExportText(track, history) {
  const entries  = Array.isArray(history?.entries)         ? history.entries         : [];
  const patterns = Array.isArray(history?.failurePatterns) ? history.failurePatterns : [];
  const te       = entries.filter((e) => e.trackId === track.id);

  const done    = te.filter((e) => e.outcome === 'done').length;
  const rescued = te.filter((e) => e.outcome === 'rescued').length;
  const missed  = te.filter((e) => e.outcome === 'missed').length;

  const patternSummary = (() => {
    if (!patterns.length) return 'None recorded.';
    const counts = {};
    patterns.forEach((p) => { const c = p.blockerCategory || 'other'; counts[c] = (counts[c] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} (×${n})`).join(', ');
  })();

  return [
    'StriveAI — 7-Day Pattern Export',
    `Goal: ${track.goal || '—'}`,
    `Category: ${track.goalCategory || '—'}`,
    `Start: ${track.startDate || '—'}`,
    '',
    `Results: ${done} done, ${rescued} rescued, ${missed} missed`,
    `Friction patterns: ${patternSummary}`,
    '',
    'Generated by StriveAI',
  ].join('\n');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
