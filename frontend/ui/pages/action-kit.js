export function render(container, state, actions) {
  const dayPlan = (state.track.days ?? []).find((d) => d.dayNumber === state.today.dayNumber) ?? {};

  container.innerHTML = `
    <div style="max-width:540px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Action Kit · Day ${state.today.dayNumber ?? 1}</div>
      <h1 style="font-size:1.4rem;font-weight:800;color:#f9fafb;margin:0 0 6px">Tools for today</h1>
      <p style="color:#9ca3af;font-size:.85rem;margin:0 0 24px">Resources and prompts to help you execute: <em>${escHtml(dayPlan.title || 'your task')}</em></p>
      <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:20px;color:#6b7280;font-size:.9rem;line-height:1.7">
        Kit items load when you open this screen from Today's Action after the AI generates them.
        <br><br>
        Items include: focus questions, starter templates, quick tips, and reference links for your specific task.
      </div>
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
