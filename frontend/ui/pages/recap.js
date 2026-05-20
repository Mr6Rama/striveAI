// Day 7 Recap — /recap
// Shown when track.status === 'complete'.
// AI recap text is generated once and stored in state.today.recapText (or state.recap.text).
// Two continuation flows: continue same goal, or start a new track.

// Module state for the "Export pattern" clipboard interaction
let exportCopied = false;

export function render(container, state, actions) {
  const { track, history, telegram, ui } = state;

  if (!track?.id) {
    actions.onNavigate?.('/onboarding');
    return;
  }

  const entries  = Array.isArray(history?.entries) ? history.entries : [];
  const patterns = Array.isArray(history?.failurePatterns) ? history.failurePatterns : [];
  const days     = Array.isArray(track.days) ? track.days : [];

  const stats    = computeStats(track, entries, days);
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
    <div style="max-width:560px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">

      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">
        Week complete
      </div>
      <h1 style="font-size:1.4rem;font-weight:900;color:#f9fafb;margin:0 0 6px">Your 7-day track is complete.</h1>
      <p style="color:#9ca3af;font-size:.85rem;margin:0 0 24px;line-height:1.5">${esc(track.goal || '')}</p>

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
    actionKits:    0, // reserved; not yet tracked per-entry
  };
}

function renderResultGrid(s) {
  const cells = [
    { label: 'Days returned', value: s.daysReturned, color: '#f9fafb' },
    { label: 'Done',          value: s.done,          color: '#22c55e' },
    { label: 'Rescued',       value: s.rescued,       color: '#3b82f6' },
    { label: 'Missed',        value: s.missed,        color: '#ef4444' },
    { label: 'Unanswered',    value: s.unanswered,    color: '#6b7280' },
    { label: 'Agent sessions',value: s.agentSessions, color: '#a78bfa' },
  ];
  return `
    <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:16px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
        ${cells.map((c) => `
          <div>
            <div style="font-size:1.4rem;font-weight:800;color:${c.color}">${c.value}</div>
            <div style="font-size:.7rem;color:#4b5563;margin-top:2px">${esc(c.label)}</div>
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
    time:       'Not enough time',
    unclear:    'Unclear how to start',
    motivation: 'Low energy or avoidance',
    skill_gap:  'Skill gap',
    no_access:  'Access or tool issues',
    external:   'External dependency',
    other:      'General friction',
  };
  return { category: cat, count, label: LABELS[cat] || cat };
}

function renderPatternCard(p) {
  return `
    <div style="background:#1a1200;border:1px solid #92400e;border-radius:10px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">Main friction pattern</div>
      <div style="color:#fbbf24;font-weight:700;font-size:.9rem">${esc(p.label)}</div>
      <div style="color:#92400e;font-size:.78rem;margin-top:2px">Came up ${p.count}× across the week</div>
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
    <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">Best working format</div>
      <div style="color:#d1d5db;font-size:.87rem;line-height:1.5">${esc(text)}</div>
    </div>`;
}

// ── AI reflection ─────────────────────────────────────────────────────────────

function renderAIReflection(text, loading) {
  if (loading) {
    return `
      <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:16px;margin-bottom:20px;text-align:center">
        <div style="color:#6b7280;font-size:.85rem;margin-bottom:12px">Generating reflection…</div>
        <div style="display:inline-block;width:16px;height:16px;border:2px solid #1f2937;border-top-color:#3b82f6;border-radius:50%;animation:spin .8s linear infinite"></div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      </div>`;
  }
  if (!text) {
    return `
      <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:16px;margin-bottom:20px">
        <div style="font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Reflection</div>
        <div id="recap-load-reflection"
          style="color:#3b82f6;font-size:.85rem;cursor:pointer;font-weight:600">
          Generate reflection →
        </div>
      </div>`;
  }
  return `
    <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:16px;margin-bottom:20px">
      <div style="font-size:.68rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Reflection</div>
      <div style="color:#d1d5db;font-size:.87rem;line-height:1.7">${esc(text)}</div>
    </div>`;
}

// ── CTAs ──────────────────────────────────────────────────────────────────────

function renderCTAs(continuing, telegram) {
  const continueLabel = continuing ? 'Generating next week…' : 'Continue this goal — next 7 days →';

  return `
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
      <button id="recap-continue" ${continuing ? 'disabled' : ''}
        style="padding:13px;background:${continuing ? '#1f2937' : '#3b82f6'};color:${continuing ? '#4b5563' : '#fff'};border:none;border-radius:8px;font-weight:700;font-size:.9rem;cursor:${continuing ? 'default' : 'pointer'}">
        ${esc(continueLabel)}
      </button>
      <button id="recap-new"
        style="padding:12px;background:transparent;color:#9ca3af;border:1px solid #374151;border-radius:8px;font-weight:600;font-size:.88rem;cursor:pointer">
        Start a new 7-day track
      </button>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px">
      <button id="recap-export"
        style="flex:1;min-width:140px;padding:10px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:8px;font-weight:600;font-size:.8rem;cursor:pointer">
        Export my pattern
      </button>
      ${telegram?.connected
        ? `<button id="recap-telegram"
             style="flex:1;min-width:140px;padding:10px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:8px;font-weight:600;font-size:.8rem;cursor:pointer">
             Adjust Telegram ping
           </button>`
        : ''}
    </div>

    <button data-route="/progress"
      style="padding:8px 0;background:transparent;color:#4b5563;border:none;font-size:.78rem;cursor:pointer">
      View full progress →
    </button>`;
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

  container.querySelector('#recap-new')?.addEventListener('click', () => {
    actions.onRecapNewTrack?.();
  });

  container.querySelector('#recap-load-reflection')?.addEventListener('click', () => {
    actions.onRecapLoadReflection?.();
  });

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

  container.querySelector('#recap-telegram')?.addEventListener('click', () => {
    actions.onNavigate?.('/settings');
  });
}

// ── Export text builder ───────────────────────────────────────────────────────

function buildExportText(track, history) {
  const entries  = Array.isArray(history?.entries) ? history.entries : [];
  const patterns = Array.isArray(history?.failurePatterns) ? history.failurePatterns : [];
  const te       = entries.filter((e) => e.trackId === track.id);

  const done    = te.filter((e) => e.outcome === 'done').length;
  const rescued = te.filter((e) => e.outcome === 'rescued').length;
  const missed  = te.filter((e) => e.outcome === 'missed').length;

  const patternSummary = (() => {
    if (!patterns.length) return 'None recorded.';
    const counts = {};
    patterns.forEach((p) => {
      const c = p.blockerCategory || 'other';
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c} (×${n})`)
      .join(', ');
  })();

  return [
    `StriveAI — 7-Day Pattern Export`,
    `Goal: ${track.goal || '—'}`,
    `Category: ${track.goalCategory || '—'}`,
    `Start: ${track.startDate || '—'}`,
    ``,
    `Results: ${done} done, ${rescued} rescued, ${missed} missed`,
    `Friction patterns: ${patternSummary}`,
    ``,
    `Generated by StriveAI`,
  ].join('\n');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
