export function render(container, _state, actions) {
  container.innerHTML = `
    <div style="max-width:400px;margin:4rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif;text-align:center">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:16px">StriveAI</div>
      <div style="font-size:2.5rem;font-weight:900;color:#374151;margin-bottom:12px">404</div>
      <h1 style="font-size:1.25rem;font-weight:700;color:#f9fafb;margin:0 0 10px">Page not found</h1>
      <p style="color:#6b7280;font-size:.9rem;line-height:1.6;margin:0 0 28px">
        That route doesn't exist. Use the button below to get back on track.
      </p>
      <button data-route="/today"
        style="padding:11px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">
        Go to Today →
      </button>
    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
}
