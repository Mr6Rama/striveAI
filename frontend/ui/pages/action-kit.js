// Action Kit — /action-kit
// Generates practical, task-specific material to help the user start or finish today's action.
// Items are AI-generated once per day and persisted — never regenerated on every render.

const TYPE_META = Object.freeze({
  template:  { label: 'Template',     bg: '#0c1a2e', border: '#1d4ed8', mono: true  },
  reference: { label: 'Reference',    bg: '#0f172a', border: '#1f2937', mono: false },
  question:  { label: 'Ask yourself', bg: '#1a1200', border: '#92400e', mono: false },
  tool:      { label: 'Tool',         bg: '#0f172a', border: '#374151', mono: false },
  tip:       { label: 'Quick tip',    bg: '#0a1a0a', border: '#166534', mono: false },
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
    <div style="max-width:600px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">

      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">
        Action Kit · Day ${dayNum} of 7
      </div>
      <h1 style="font-size:1.35rem;font-weight:800;color:#f9fafb;margin:0 0 6px">Tools for today</h1>
      <p style="color:#9ca3af;font-size:.85rem;margin:0 0 20px;line-height:1.5">${esc(dayPlan.title || 'your task')}</p>

      ${hasKit  ? renderItems(kit) : renderEmpty(loading, dayPlan)}

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:24px">
        <button data-route="/agent"
          style="flex:1;min-width:140px;padding:11px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:.88rem;cursor:pointer">
          Start with Agent
        </button>
        ${hasKit ? `<button id="ak-used"
          style="flex:1;min-width:120px;padding:11px;background:#111827;color:#9ca3af;border:1px solid #1f2937;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer">
          I used this
        </button>` : ''}
      </div>

      <div style="margin-top:10px">
        <button data-route="/today" style="padding:8px 0;background:transparent;color:#4b5563;border:none;font-size:.78rem;cursor:pointer">
          ← Back to Today
        </button>
      </div>

    </div>`;

  if (!hasKit && !loading) {
    container.querySelector('#ak-generate')?.addEventListener('click', () => {
      actions.onKitGenerate?.();
    });
  }

  container.querySelector('#ak-used')?.addEventListener('click', () => {
    actions.onNavigate?.('/today');
  });

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });

  // Copy buttons for template items
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
    return `
      <div style="text-align:center;padding:32px 0">
        <div style="color:#6b7280;font-size:.88rem;margin-bottom:16px">Generating your kit…</div>
        <div style="display:inline-block;width:18px;height:18px;border:2px solid #1f2937;border-top-color:#3b82f6;border-radius:50%;animation:spin .8s linear infinite"></div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      </div>`;
  }
  return `
    <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:20px;text-align:center">
      <p style="color:#6b7280;font-size:.88rem;margin:0 0 16px;line-height:1.6">
        Generate a kit with templates, questions, and quick tips tailored to today's task.
      </p>
      <button id="ak-generate"
        style="padding:12px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:.9rem;cursor:pointer">
        Generate Action Kit
      </button>
    </div>`;
}

function renderItems(items) {
  return `<div style="display:flex;flex-direction:column;gap:10px">
    ${items.map((item) => renderItem(item)).join('')}
  </div>`;
}

function renderItem(item) {
  const meta    = TYPE_META[item.type] || TYPE_META.tip;
  const content = esc(item.content);
  const encoded = encodeURIComponent(item.content);

  return `
    <div style="background:${meta.bg};border:1px solid ${meta.border};border-radius:10px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">
          ${esc(meta.label)}${item.label ? ` · ${esc(item.label)}` : ''}
        </div>
        ${meta.mono
          ? `<button data-copy="${encoded}" style="padding:3px 8px;background:transparent;color:#4b5563;border:1px solid #374151;border-radius:4px;font-size:.7rem;cursor:pointer">Copy</button>`
          : ''}
      </div>
      <div style="color:#d1d5db;font-size:.88rem;line-height:1.65;${meta.mono ? 'font-family:monospace;white-space:pre-wrap;font-size:.82rem;' : ''}">
        ${meta.mono ? content : content}
      </div>
    </div>`;
}

// ── Utils ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
