export function render(container, state, actions) {
  const track = state.track;
  const goal  = track.goal || 'your goal';

  container.innerHTML = `
    <div style="max-width:520px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Ready to start</div>
      <h1 style="font-size:1.5rem;font-weight:800;color:#f9fafb;margin:0 0 8px">Your 7-day track is ready.</h1>
      <p style="color:#9ca3af;margin:0 0 24px;font-size:.9rem;line-height:1.6">
        Goal: <strong style="color:#e5e7eb">${escHtml(goal)}</strong>
      </p>
      <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:16px;margin-bottom:24px">
        <div style="font-size:.8rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">7 days planned</div>
        <div id="v2-ct-days" style="color:#9ca3af;font-size:.85rem;line-height:1.8"></div>
      </div>
      <div style="display:flex;gap:10px">
        <button id="v2-ct-start"
          style="flex:1;padding:12px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">
          Start Day 1 →
        </button>
        <button data-route="/plan-preview"
          style="padding:12px 16px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:8px;font-weight:600;cursor:pointer;font-size:.85rem">
          Preview plan
        </button>
      </div>
    </div>`;

  const daysEl = container.querySelector('#v2-ct-days');
  if (daysEl) {
    const days = Array.isArray(track.days) ? track.days : [];
    daysEl.innerHTML = days.length
      ? days.map((d) => `<div>Day ${d.dayNumber}: ${escHtml(d.title || '—')}</div>`).join('')
      : '<div style="color:#4b5563">No days generated yet.</div>';
  }

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
  container.querySelector('#v2-ct-start')?.addEventListener('click', () => {
    actions.onNavigate?.('/today');
  });
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
