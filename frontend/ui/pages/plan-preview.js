export function render(container, state, actions) {
  const track = state.track;
  const days  = Array.isArray(track.days) ? track.days : [];

  const rows = days.length
    ? days.map((d) => `
        <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #1f2937">
          <div style="width:36px;height:36px;border-radius:50%;background:#1f2937;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;color:#9ca3af;flex-shrink:0">
            ${d.dayNumber}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;color:#f9fafb;font-size:.9rem;margin-bottom:2px">${escHtml(d.title || '—')}</div>
            <div style="font-size:.78rem;color:#6b7280">${escHtml(d.why || '')}</div>
            <div style="font-size:.75rem;color:#4b5563;margin-top:2px">${d.estimateMinutes || 60} min · ${escHtml(d.category || '')}</div>
          </div>
        </div>`).join('')
    : `<div style="color:#6b7280;font-size:.9rem;padding:16px 0">No plan generated yet. Complete onboarding first.</div>`;

  container.innerHTML = `
    <div style="max-width:560px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">7-Day Plan</div>
      <h1 style="font-size:1.5rem;font-weight:800;color:#f9fafb;margin:0 0 4px">${escHtml(track.goal || 'Your plan')}</h1>
      <p style="color:#6b7280;font-size:.85rem;margin:0 0 20px">Review all 7 days before you begin.</p>
      <div>${rows}</div>
      <div style="display:flex;gap:10px;margin-top:24px">
        <button data-route="/confirm-track"
          style="flex:1;padding:12px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">
          Looks good — start →
        </button>
        <button data-route="/onboarding"
          style="padding:12px 16px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:8px;font-weight:600;cursor:pointer;font-size:.85rem">
          Regenerate
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
