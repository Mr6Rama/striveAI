export function render(container, state, actions) {
  const today   = state.today;
  const session = today.agentSession;
  const steps   = session?.steps ?? [];
  const dayPlan = (state.track.days ?? []).find((d) => d.dayNumber === today.dayNumber) ?? {};

  const stepRows = steps.length
    ? steps.map((s) => `
        <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #1f2937;opacity:${s.status === 'done' ? '.5' : '1'}">
          <div style="width:22px;height:22px;border-radius:50%;border:2px solid ${s.status === 'done' ? '#22c55e' : '#374151'};display:flex;align-items:center;justify-content:center;font-size:.65rem;color:${s.status === 'done' ? '#22c55e' : '#6b7280'};flex-shrink:0;margin-top:2px">
            ${s.status === 'done' ? '✓' : s.index + 1}
          </div>
          <div style="flex:1;color:${s.status === 'done' ? '#6b7280' : '#e5e7eb'};font-size:.9rem;line-height:1.5">${escHtml(s.text)}</div>
        </div>`).join('')
    : `<div style="color:#6b7280;font-size:.9rem;padding:16px 0">
         No steps loaded yet. Steps are generated when you open Agent Mode from Today's Action.
       </div>`;

  container.innerHTML = `
    <div style="max-width:540px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Agent Mode · Day ${today.dayNumber ?? 1} of 7</div>
      <h1 style="font-size:1.4rem;font-weight:800;color:#f9fafb;margin:0 0 6px">${escHtml(dayPlan.title || 'Today\'s task')}</h1>
      <p style="color:#6b7280;font-size:.82rem;margin:0 0 20px">${escHtml(dayPlan.successCriteria || '')}</p>
      <div>${stepRows}</div>
      <div style="display:flex;gap:10px;margin-top:24px">
        <button data-route="/today"
          style="padding:10px 18px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:8px;font-weight:600;cursor:pointer;font-size:.85rem">
          ← Back to Today
        </button>
        <button data-route="/proof"
          style="flex:1;padding:10px;background:#22c55e;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer">
          Mark Done →
        </button>
      </div>
    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
