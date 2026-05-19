export function render(container, _state, actions) {
  container.innerHTML = `
    <div style="max-width:480px;margin:4rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif;text-align:center">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:16px">StriveAI</div>
      <h1 style="font-size:2rem;font-weight:900;color:#f9fafb;margin:0 0 12px;line-height:1.15">7 days.<br>One goal.<br>Daily action.</h1>
      <p style="color:#9ca3af;line-height:1.6;margin:0 0 32px;font-size:.95rem">
        Pick a goal. Get a concrete 7-day execution plan. Do one thing every day.
        No roadmaps. No endless planning. Just the next step.
      </p>
      <div style="display:flex;flex-direction:column;gap:12px;max-width:280px;margin:0 auto">
        <button data-route="/auth"
          style="padding:12px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:.95rem;cursor:pointer">
          Get started
        </button>
        <button data-route="/auth"
          style="padding:12px 24px;background:transparent;color:#9ca3af;border:1px solid #374151;border-radius:8px;font-weight:600;font-size:.9rem;cursor:pointer">
          Sign in
        </button>
      </div>
    </div>`;
  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
}
