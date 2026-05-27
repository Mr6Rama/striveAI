// Action Kit — /action-kit
// Generates practical, task-specific material to help the user start or finish today's action.

const TYPE_META = Object.freeze({
  template:  { label: 'Template',     cls: 'v2-kit-item--template', mono: true  },
  reference: { label: 'Reference',    cls: 'v2-kit-item--reference', mono: false },
  question:  { label: 'Ask yourself', cls: 'v2-kit-item--question',  mono: false },
  tool:      { label: 'Tool',         cls: 'v2-kit-item--tool',      mono: false },
  tip:       { label: 'Quick tip',    cls: 'v2-kit-item--tip',       mono: false },
});

export function render(container, state, actions) {
  const track   = state.track;
  const today   = state.today;
  const loading = Boolean(state.ui?.kitLoading);

  if (!track?.id || !Array.isArray(track.days) || !track.days.length) {
    actions.onNavigate?.('/onboarding');
    return;
  }

  const dayNum  = track.currentDayNumber || today.dayNumber || 1;
  const dayPlan = track.days.find((d) => d.dayNumber === dayNum) ?? track.days[0] ?? {};
  const kit     = today?.actionKit;
  const hasKit  = Array.isArray(kit) && kit.length > 0;

  container.innerHTML = `
    <div class="v2-page">

      <div class="v2-kicker v2-kicker--muted" style="margin-bottom:8px">Action Kit · Day ${dayNum} of ${track.totalDays || 7}</div>
      <h1 class="v2-h1" style="margin-bottom:6px">Tools for today</h1>
      <p class="v2-sub">${esc(dayPlan.title || 'your task')}</p>

      ${hasKit ? renderItems(kit) : renderEmpty(loading)}

      <div class="v2-row" style="margin-top:24px">
        <button data-route="/agent" class="v2-btn v2-btn--primary" style="flex:1">
          Start with Agent
        </button>
        ${hasKit ? `<button id="ak-used" class="v2-btn v2-btn--secondary" style="flex:1">
          I used this
        </button>` : ''}
      </div>

      <button data-route="/today" class="v2-btn v2-btn--ghost" style="margin-top:8px">
        ← Back to Today
      </button>

    </div>`;

  if (!hasKit && !loading) {
    container.querySelector('#ak-generate')?.addEventListener('click', () => actions.onKitGenerate?.());
  }

  container.querySelector('#ak-used')?.addEventListener('click', () => actions.onNavigate?.('/today'));

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });

  container.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = decodeURIComponent(btn.getAttribute('data-copy') || '');
      navigator.clipboard?.writeText(text).then(() => {
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
      }).catch(() => {});
    });
  });
}

// ── Sub-renderers ──────────────────────────────────────────────────────────

function renderEmpty(loading) {
  if (loading) {
    return `<div class="v2-loading-center">
      <div class="v2-spin"></div>
      <p class="v2-muted-text">Generating your kit…</p>
    </div>`;
  }
  return `
    <div class="v2-card" style="text-align:center;padding:24px">
      <p class="v2-sub" style="margin-bottom:16px">
        Generate a kit with templates, questions, and quick tips tailored to today's task.
      </p>
      <button id="ak-generate" class="v2-btn v2-btn--primary v2-btn--lg">
        Generate Action Kit
      </button>
    </div>`;
}

function renderItems(items) {
  return `<div>${items.map((item) => renderItem(item)).join('')}</div>`;
}

function renderItem(item) {
  const meta    = TYPE_META[item.type] || TYPE_META.tip;
  const content = esc(item.content);
  const encoded = encodeURIComponent(item.content);

  return `
    <div class="v2-kit-item ${meta.cls}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span class="v2-section-label" style="margin:0">${esc(meta.label)}${item.label ? ` · ${esc(item.label)}` : ''}</span>
        ${meta.mono
          ? `<button data-copy="${encoded}" class="v2-btn v2-btn--ghost v2-btn--sm">Copy</button>`
          : ''}
      </div>
      <div class="v2-body-text" style="${meta.mono ? 'font-family:var(--v2-fmono);white-space:pre-wrap;font-size:.82rem;' : ''}">
        ${content}
      </div>
    </div>`;
}

// ── Utils ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
