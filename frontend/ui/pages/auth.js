// Sign-in skeleton. Full auth logic wired in app.js via Firebase onAuthChanged.
export function render(container, _state, actions) {
  container.innerHTML = `
    <div style="max-width:360px;margin:4rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:24px">StriveAI</div>
      <h1 style="font-size:1.5rem;font-weight:800;color:#f9fafb;margin:0 0 24px">Sign in</h1>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:.8rem;font-weight:600;color:#9ca3af;display:block;margin-bottom:4px">Email</label>
          <input id="v2-auth-email" type="email" placeholder="you@example.com" autocomplete="email"
            style="width:100%;padding:10px 12px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.9rem;box-sizing:border-box"/>
        </div>
        <div>
          <label style="font-size:.8rem;font-weight:600;color:#9ca3af;display:block;margin-bottom:4px">Password</label>
          <input id="v2-auth-password" type="password" placeholder="Minimum 6 characters" autocomplete="current-password"
            style="width:100%;padding:10px 12px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.9rem;box-sizing:border-box"/>
        </div>
        <div id="v2-auth-error" style="font-size:.8rem;color:#f87171;min-height:1.2em"></div>
        <button id="v2-auth-submit"
          style="padding:11px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:.9rem;cursor:pointer;margin-top:4px">
          Sign in
        </button>
        <button data-route="/landing"
          style="padding:8px;background:transparent;color:#6b7280;border:none;font-size:.8rem;cursor:pointer">
          ← Back
        </button>
      </div>
    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });

  container.querySelector('#v2-auth-submit')?.addEventListener('click', () => {
    const email    = String(container.querySelector('#v2-auth-email')?.value || '').trim();
    const password = String(container.querySelector('#v2-auth-password')?.value || '').trim();
    const errEl    = container.querySelector('#v2-auth-error');
    if (!email || !password) {
      if (errEl) errEl.textContent = 'Enter your email and password.';
      return;
    }
    if (errEl) errEl.textContent = '';
    actions.onSignIn?.({ email, password });
  });
}
