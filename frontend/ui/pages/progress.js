export function render(container, state, actions) {
  const history = state.history;
  const entries = Array.isArray(history.entries) ? history.entries : [];

  const outcomeColor = { done: '#22c55e', blocked: '#f59e0b', skipped: '#6b7280', missed: '#ef4444', rescued: '#3b82f6' };

  const rows = entries.length
    ? [...entries].reverse().slice(0, 30).map((e) => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #111827">
          <div style="width:8px;height:8px;border-radius:50%;background:${outcomeColor[e.outcome] || '#6b7280'};flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.85rem;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(e.taskTitle || 'Task')}</div>
            <div style="font-size:.75rem;color:#6b7280">Day ${e.dayNumber} · ${e.date}</div>
          </div>
          <div style="font-size:.75rem;font-weight:700;color:${outcomeColor[e.outcome] || '#6b7280'};text-transform:uppercase;flex-shrink:0">${e.outcome}</div>
        </div>`).join('')
    : `<div style="color:#6b7280;font-size:.9rem;padding:20px 0">
         No history yet. Complete your first day to see it here.
       </div>`;

  container.innerHTML = `
    <div style="max-width:540px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Progress</div>
      <h1 style="font-size:1.5rem;font-weight:800;color:#f9fafb;margin:0 0 20px">Your history</h1>
      <div style="display:flex;gap:24px;margin-bottom:28px">
        <div style="text-align:center">
          <div style="font-size:1.5rem;font-weight:800;color:#22c55e">${history.successStreak ?? 0}</div>
          <div style="font-size:.75rem;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Streak</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:1.5rem;font-weight:800;color:#f9fafb">${entries.filter((e) => e.outcome === 'done').length}</div>
          <div style="font-size:.75rem;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Done</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:1.5rem;font-weight:800;color:#f9fafb">${entries.length}</div>
          <div style="font-size:.75rem;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Total days</div>
        </div>
      </div>
      <div>${rows}</div>
      <div style="margin-top:24px">
        <button data-route="/today"
          style="padding:10px 18px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:8px;font-weight:600;cursor:pointer;font-size:.85rem">
          ← Back to Today
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
