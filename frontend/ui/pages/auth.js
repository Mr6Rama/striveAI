// Combined sign-in / create-account screen.
// Reads ?mode=signup from URL to pre-select the Create account tab.
export function render(container, _state, actions) {
  const params    = new URLSearchParams(window.location.search);
  const initMode  = params.get('mode') === 'signup' ? 'signup' : 'signin';

  container.innerHTML = `
    <div style="max-width:360px;margin:4rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:24px">StriveAI</div>

      <div style="display:flex;gap:0;margin-bottom:24px;border-bottom:1px solid #1f2937">
        <button id="v2-tab-signin"
          style="flex:1;padding:10px;background:transparent;border:none;border-bottom:2px solid transparent;font-size:.9rem;font-weight:600;cursor:pointer;transition:color .15s">
          Sign in
        </button>
        <button id="v2-tab-signup"
          style="flex:1;padding:10px;background:transparent;border:none;border-bottom:2px solid transparent;font-size:.9rem;font-weight:600;cursor:pointer;transition:color .15s">
          Create account
        </button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:.8rem;font-weight:600;color:#9ca3af;display:block;margin-bottom:4px">Email</label>
          <input id="v2-auth-email" type="email" placeholder="you@example.com" autocomplete="email"
            style="width:100%;padding:10px 12px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.9rem;box-sizing:border-box"/>
        </div>
        <div id="v2-pw-wrap">
          <label style="font-size:.8rem;font-weight:600;color:#9ca3af;display:block;margin-bottom:4px">Password</label>
          <input id="v2-auth-password" type="password" placeholder="Minimum 6 characters" autocomplete="current-password"
            style="width:100%;padding:10px 12px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.9rem;box-sizing:border-box"/>
        </div>
        <div id="v2-auth-error"   style="font-size:.8rem;color:#f87171;min-height:1.2em"></div>
        <div id="v2-auth-success" style="font-size:.8rem;color:#22c55e;min-height:1.2em"></div>
        <button id="v2-auth-submit"
          style="padding:11px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:.9rem;cursor:pointer;margin-top:4px">
        </button>
        <button id="v2-reset-link"
          style="padding:6px;background:transparent;color:#6b7280;border:none;font-size:.8rem;cursor:pointer;text-align:left;display:none">
          Forgot password?
        </button>
        <button data-route="/landing"
          style="padding:8px;background:transparent;color:#6b7280;border:none;font-size:.8rem;cursor:pointer;text-align:left">
          ← Back
        </button>
      </div>
    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });

  let mode = initMode;

  const tabSignin  = container.querySelector('#v2-tab-signin');
  const tabSignup  = container.querySelector('#v2-tab-signup');
  const submitBtn  = container.querySelector('#v2-auth-submit');
  const resetLink  = container.querySelector('#v2-reset-link');
  const errEl      = container.querySelector('#v2-auth-error');
  const okEl       = container.querySelector('#v2-auth-success');

  function setMode(m) {
    mode = m;
    const active   = '#f9fafb';
    const inactive = '#6b7280';
    const activeBorder   = '2px solid #3b82f6';
    const inactiveBorder = '2px solid transparent';

    tabSignin.style.color        = m === 'signin' ? active : inactive;
    tabSignin.style.borderBottom = m === 'signin' ? activeBorder : inactiveBorder;
    tabSignup.style.color        = m === 'signup' ? active : inactive;
    tabSignup.style.borderBottom = m === 'signup' ? activeBorder : inactiveBorder;

    submitBtn.textContent     = m === 'signin' ? 'Sign in' : 'Create account';
    resetLink.style.display   = m === 'signin' ? 'block' : 'none';

    if (errEl) errEl.textContent = '';
    if (okEl)  okEl.textContent  = '';
  }

  setMode(mode);

  tabSignin.addEventListener('click', () => setMode('signin'));
  tabSignup.addEventListener('click', () => setMode('signup'));

  submitBtn.addEventListener('click', async () => {
    const email    = String(container.querySelector('#v2-auth-email')?.value || '').trim();
    const password = String(container.querySelector('#v2-auth-password')?.value || '').trim();
    if (errEl) errEl.textContent = '';
    if (okEl)  okEl.textContent  = '';

    if (!email || !password) {
      if (errEl) errEl.textContent = 'Enter your email and password.';
      return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = mode === 'signin' ? 'Signing in…' : 'Creating account…';

    try {
      if (mode === 'signin') {
        await actions.onSignIn?.({ email, password });
      } else {
        await actions.onSignUp?.({ email, password });
      }
    } catch (err) {
      if (errEl) errEl.textContent = String(err?.message || 'Something went wrong.');
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = mode === 'signin' ? 'Sign in' : 'Create account';
    }
  });

  resetLink.addEventListener('click', async () => {
    const email = String(container.querySelector('#v2-auth-email')?.value || '').trim();
    if (errEl) errEl.textContent = '';
    if (okEl)  okEl.textContent  = '';
    if (!email) {
      if (errEl) errEl.textContent = 'Enter your email above first.';
      return;
    }
    try {
      await actions.onPasswordReset?.({ email });
      if (okEl) okEl.textContent = 'Reset email sent — check your inbox.';
    } catch (err) {
      if (errEl) errEl.textContent = String(err?.message || 'Could not send reset email.');
    }
  });
}
