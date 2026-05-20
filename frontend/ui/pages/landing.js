export function render(container, _state, actions) {
  container.innerHTML = `
    <div style="max-width:480px;margin:4rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif;text-align:center">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:24px">StriveAI</div>
      <h1 style="font-size:2.25rem;font-weight:900;color:#f9fafb;margin:0 0 16px;line-height:1.15">Stay on track<br>for 7 days.</h1>
      <p style="color:#9ca3af;line-height:1.6;margin:0 0 12px;font-size:.95rem">
        StriveAI helps you plan, start, complete, and recover when you fall behind.
      </p>
      <p style="color:#6b7280;line-height:1.5;margin:0 0 36px;font-size:.85rem">
        Built for students, creators, founders, and builders who keep losing momentum.
      </p>
      <div style="display:flex;flex-direction:column;gap:12px;max-width:280px;margin:0 auto">
        <button id="v2-land-start"
          style="padding:13px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:.95rem;cursor:pointer">
          Start 7-day track
        </button>
        <button id="v2-land-signin"
          style="padding:12px 24px;background:transparent;color:#9ca3af;border:1px solid #374151;border-radius:8px;font-weight:600;font-size:.9rem;cursor:pointer">
          Sign in
        </button>
      </div>
    </div>`;

  container.querySelector('#v2-land-start')?.addEventListener('click', () => {
    actions.onNavigate?.('/auth?mode=signup');
  });
  container.querySelector('#v2-land-signin')?.addEventListener('click', () => {
    actions.onNavigate?.('/auth');
  });
}
