// /blocked?type=blocked  or  /blocked?type=skipped
export function render(container, state, actions) {
  const params  = new URLSearchParams(window.location.search);
  const type    = params.get('type') === 'skipped' ? 'skipped' : 'blocked';
  const dayPlan = (state.track.days ?? []).find((d) => d.dayNumber === state.today.dayNumber) ?? {};

  const isSkip = type === 'skipped';
  const title  = isSkip ? 'Skip today?' : 'Blocked?';
  const body   = isSkip
    ? 'Skipping moves you to tomorrow. You can only skip once per track.'
    : 'Describe what\'s blocking you and get a smaller rescue action you can do right now.';

  container.innerHTML = `
    <div style="max-width:480px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">
        Day ${state.today.dayNumber ?? 1} · ${isSkip ? 'Skip' : 'Blocked'}
      </div>
      <h1 style="font-size:1.4rem;font-weight:800;color:#f9fafb;margin:0 0 8px">${title}</h1>
      <p style="color:#9ca3af;font-size:.9rem;line-height:1.6;margin:0 0 6px">${escHtml(dayPlan.title || '')}</p>
      <p style="color:#6b7280;font-size:.85rem;line-height:1.6;margin:0 0 20px">${body}</p>
      ${!isSkip ? `
        <textarea id="v2-blocked-text" placeholder="What exactly is blocking you?"
          style="width:100%;min-height:72px;padding:10px 12px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.9rem;resize:vertical;box-sizing:border-box;margin-bottom:12px"></textarea>
        <button id="v2-blocked-rescue"
          style="width:100%;padding:12px;background:#f59e0b;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;margin-bottom:10px">
          Get rescue action →
        </button>` : ''}
      <div style="display:flex;gap:10px">
        ${isSkip ? `
          <button id="v2-blocked-confirm"
            style="flex:1;padding:12px;background:#6b7280;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">
            Yes, skip today
          </button>` : ''}
        <button data-route="/today"
          style="flex:1;padding:12px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:8px;font-weight:600;cursor:pointer;font-size:.9rem">
          ← Back to Today
        </button>
      </div>
    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
  container.querySelector('#v2-blocked-rescue')?.addEventListener('click', () => {
    const text = String(container.querySelector('#v2-blocked-text')?.value || '').trim();
    actions.onRescue?.({ blockerText: text });
  });
  container.querySelector('#v2-blocked-confirm')?.addEventListener('click', () => {
    actions.onSkip?.();
  });
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
