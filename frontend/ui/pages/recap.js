export function render(container, state, actions) {
  const track   = state.track;
  const history = state.history;
  const done    = (history.entries ?? []).filter((e) => e.outcome === 'done').length;
  const total   = (track.days ?? []).length || 7;

  container.innerHTML = `
    <div style="max-width:520px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif;text-align:center">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:16px">Week complete</div>
      <div style="font-size:3rem;margin-bottom:8px">◈</div>
      <h1 style="font-size:1.75rem;font-weight:900;color:#f9fafb;margin:0 0 8px;line-height:1.2">7 days done.</h1>
      <p style="color:#9ca3af;font-size:.9rem;margin:0 0 8px">
        Goal: <strong style="color:#e5e7eb">${escHtml(track.goal || '—')}</strong>
      </p>
      <p style="color:#6b7280;font-size:.85rem;margin:0 0 28px">
        ${done} of ${total} days completed.
      </p>
      <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:20px;margin-bottom:28px;text-align:left">
        <div style="font-size:.8rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">AI reflection</div>
        <div id="v2-recap-text" style="color:#9ca3af;font-size:.9rem;line-height:1.7">
          Reflection loads after Day 7 is complete.
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;max-width:320px;margin:0 auto">
        <button id="v2-recap-continue"
          style="padding:12px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">
          Continue same goal (new 7 days) →
        </button>
        <button id="v2-recap-new"
          style="padding:12px;background:transparent;color:#9ca3af;border:1px solid #374151;border-radius:8px;font-weight:600;cursor:pointer">
          Start a new track
        </button>
        <button data-route="/progress"
          style="padding:10px;background:transparent;color:#6b7280;border:none;font-size:.8rem;cursor:pointer">
          View full history →
        </button>
      </div>
    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
  container.querySelector('#v2-recap-continue')?.addEventListener('click', () => actions.onContinue?.());
  container.querySelector('#v2-recap-new')?.addEventListener('click', () => actions.onNavigate?.('/onboarding'));
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
