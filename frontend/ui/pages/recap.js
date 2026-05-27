// Day 7 Recap — /recap
// Shown when track.status === 'complete'.
import { renderJournal, wireJournal } from '../components/journal.js';

let reflectionRequestedFor = '';

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

  container.innerHTML = buildPage(track, stats, patternSummary, bestFormat, recapText, recapLoading, continuing, telegram, state.user, entries, days);
  wireEvents(container, state, actions, track, recapText, patterns);

  // Auto-trigger reflection generation on first visit per track.
  if (!recapText && !recapLoading && reflectionRequestedFor !== track.id) {
    reflectionRequestedFor = track.id;
    actions.onRecapLoadReflection?.();
  }
}

// ── Page builder ──────────────────────────────────────────────────────────────

function buildPage(track, stats, patternSummary, bestFormat, recapText, recapLoading, continuing, telegram, user, entries, days) {
  const why       = String(user?.whyItMatters || '').trim();
  const weekGoal  = String(user?.weekGoal     || '').trim();
  const isSpark   = track.kind === 'spark';
  const totalDays = track.totalDays || (isSpark ? 7 : 28);
  const typeLabel = isSpark ? '7-day Spark' : `${totalDays}-day Track`;

  return `
    <div class="v2-page">

      <div class="v2-kicker" style="margin-bottom:8px">
        <span class="v2-badge v2-badge--done">${isSpark ? 'Spark complete' : 'Track complete'}</span>
      </div>
      <h1 class="v2-h1" style="margin-bottom:6px">Your ${typeLabel} is complete.</h1>
      <p class="v2-sub">${esc(track.goal || '')}</p>
      ${weekGoal ? `<p class="v2-muted-text" style="margin-top:4px">By Day ${totalDays} you wanted: ${esc(weekGoal)}</p>` : ''}
      ${why ? `<blockquote class="v2-recap-why">${esc(why)}</blockquote>` : ''}

      ${renderResultGrid(stats)}
      ${patternSummary ? renderPatternCard(patternSummary) : ''}
      ${bestFormat     ? renderFormatCard(bestFormat)      : ''}
      ${renderAIReflection(recapText, recapLoading)}
      ${renderArtifactPortfolio(entries, track, user, isSpark)}
      ${renderTimeline(days, entries, track)}
      ${renderCTAs(continuing, telegram, isSpark)}

    </div>`;
}

function renderTimeline(days, entries, track) {
  const isSpark = track.kind === 'spark';
  return `
    <div style="margin-bottom:16px">
      <div class="v2-section-label" style="margin-bottom:12px">${isSpark ? 'Your week, day by day' : 'Your journey, week by week'}</div>
      ${renderJournal({ track, entries, currentDayNumber: track.currentDayNumber || days.length, variant: 'full' })}
    </div>`;
}

// ── Stats grid ────────────────────────────────────────────────────────────────

function computeStats(track, entries, days) {
  const te = entries.filter((e) => e.trackId === track.id);
  return {
    total:         days.length || track.totalDays || 7,
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

// ── Artifact portfolio ────────────────────────────────────────────────────────

function renderArtifactPortfolio(entries, track, user, isSpark) {
  const proofEntries = (Array.isArray(entries) ? entries : [])
    .filter((e) => e.trackId === track.id && String(e.proofValue || '').trim().length > 10)
    .sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0));

  if (!proofEntries.length) return '';

  const goalArtifact = String(user?.goalArtifact || '').trim();

  // Group by week for Track; flat for Spark
  let bodyHtml;
  if (isSpark || !track.phases) {
    bodyHtml = proofEntries.map((e) => proofItem(e)).join('');
  } else {
    const weeks = {};
    proofEntries.forEach((e) => {
      const w = Math.ceil((e.dayNumber || 1) / 7);
      if (!weeks[w]) weeks[w] = [];
      weeks[w].push(e);
    });
    bodyHtml = Object.entries(weeks).map(([w, items]) => {
      const phase = Array.isArray(track.phases) ? track.phases.find((p) => p.weekNumber === Number(w)) : null;
      const label = phase?.name ? `Week ${w} — ${phase.name}` : `Week ${w}`;
      return `<p class="v2-muted-text" style="font-size:.78rem;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.06em">${esc(label)}</p>
              ${items.map((e) => proofItem(e)).join('')}`;
    }).join('');
  }

  return `
    <div class="v2-card" style="margin-bottom:16px" id="recap-portfolio">
      <div class="v2-section-label" style="margin-bottom:10px">What you built</div>
      ${goalArtifact ? `<p class="v2-muted-text" style="margin-bottom:10px;font-size:.85rem">You set out to: ${esc(goalArtifact)}</p>` : ''}
      ${bodyHtml}
      <button id="recap-portfolio-export" class="v2-btn v2-btn--ghost v2-btn--sm" style="margin-top:12px">Export portfolio →</button>
    </div>`;
}

function proofItem(e) {
  const proof = String(e.proofValue || '').trim().slice(0, 200);
  const isUrl = /^https?:\/\//.test(proof);
  const proofHtml = isUrl
    ? `<a href="${esc(proof)}" target="_blank" rel="noopener" style="color:var(--v2-blue);font-size:.82rem;word-break:break-all">${esc(proof.slice(0, 80))}…</a>`
    : `<span style="font-size:.82rem">${esc(proof)}</span>`;
  return `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">
    <span class="v2-muted-text" style="flex-shrink:0;font-size:.78rem;padding-top:1px">Day ${e.dayNumber}</span>
    <div><span class="v2-body-text" style="font-size:.82rem;display:block">${esc(String(e.taskTitle || '').slice(0, 70))}</span>${proofHtml}</div>
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

function renderCTAs(continuing, telegram, isSpark) {
  const continueLbl = continuing
    ? (isSpark ? 'Building your 28-day Track…' : 'Generating next 30 days…')
    : (isSpark ? 'Continue → 28-day Track' : 'Extend +30 days →');
  const newLbl = isSpark ? 'Start something new' : 'Pivot to new goal';

  return `
    <div class="v2-row v2-row--col" style="gap:10px;margin-bottom:12px">
      <button id="recap-continue" ${continuing ? 'disabled' : ''} class="v2-btn v2-btn--primary v2-btn--lg v2-btn--full">
        ${esc(continueLbl)}
      </button>
      <button id="recap-new" class="v2-btn v2-btn--secondary v2-btn--full">
        ${esc(newLbl)}
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

  wireJournal(container);

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

  container.querySelector('#recap-portfolio-export')?.addEventListener('click', () => {
    const text = buildPortfolioExportText(track, state.history?.entries || [], state.user);
    navigator.clipboard?.writeText(text).then(() => {
      const btn = container.querySelector('#recap-portfolio-export');
      if (btn) {
        btn.textContent = 'Copied ✓';
        setTimeout(() => { btn.textContent = 'Export portfolio →'; }, 2000);
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

  const exportKind = track.kind === 'spark' ? '7-day Spark' : `${track.totalDays || 28}-day Track`;
  return [
    `StriveAI — ${exportKind} Export`,
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

function buildPortfolioExportText(track, entries, user) {
  const proofEntries = (Array.isArray(entries) ? entries : [])
    .filter((e) => e.trackId === track.id && String(e.proofValue || '').trim().length > 10)
    .sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0));

  const goalArtifact = String(user?.goalArtifact || '').trim();
  const exportKind   = track.kind === 'spark' ? '7-day Spark' : `${track.totalDays || 28}-day Track`;

  const lines = [
    `StriveAI — Portfolio Export`,
    `${exportKind}: ${track.goal || '—'}`,
    goalArtifact ? `Artifact goal: ${goalArtifact}` : '',
    '',
    ...proofEntries.map((e) => `Day ${e.dayNumber} · ${e.taskTitle || ''} → ${String(e.proofValue || '').trim().slice(0, 300)}`),
    '',
    'Generated by StriveAI',
  ].filter((l) => l !== undefined);

  return lines.join('\n');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
