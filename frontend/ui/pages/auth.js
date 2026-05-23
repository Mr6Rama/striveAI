// Combined sign-in / create-account screen.
// Reads ?mode=signup from URL to pre-select the Create account tab.
export function render(container, _state, actions) {
  const params   = new URLSearchParams(window.location.search);
  const initMode = params.get('mode') === 'signup' ? 'signup' : 'signin';

  container.innerHTML = `
    <div class="v2-auth-screen">
      <div class="v2-auth-card">

        <div class="v2-auth-logo">
          <div class="v2-nav-logo-mark" style="border-radius:7px;width:28px;height:28px;font-size:13px">S</div>
          <span style="font-family:var(--v2-fhead);font-size:16px;font-weight:800;color:var(--v2-text)">StriveAI</span>
        </div>

        <div class="v2-tabs">
          <button id="v2-tab-signin" class="v2-tab">Sign in</button>
          <button id="v2-tab-signup" class="v2-tab">Create account</button>
        </div>

        <div class="v2-field">
          <label class="v2-label">Email</label>
          <input id="v2-auth-email" type="email" placeholder="you@example.com" autocomplete="email" class="v2-input"/>
        </div>

        <div class="v2-field" id="v2-pw-wrap">
          <label class="v2-label">Password</label>
          <input id="v2-auth-password" type="password" placeholder="Minimum 6 characters" autocomplete="current-password" class="v2-input"/>
        </div>

        <div id="v2-auth-error"   class="v2-err"></div>
        <div id="v2-auth-success" class="v2-ok"></div>

        <button id="v2-auth-submit" class="v2-btn v2-btn--primary v2-btn--full v2-btn--lg" style="margin-top:8px"></button>

        <button id="v2-reset-link" class="v2-btn v2-btn--ghost v2-btn--sm" style="display:none;margin-top:4px;text-align:left">
          Forgot password?
        </button>

        <button data-route="/landing" class="v2-btn v2-btn--ghost v2-btn--sm" style="margin-top:4px">
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

  const pwInput = container.querySelector('#v2-auth-password');
  function setMode(m) {
    mode = m;
    tabSignin.className = `v2-tab${m === 'signin' ? ' v2-tab--active' : ''}`;
    tabSignup.className = `v2-tab${m === 'signup' ? ' v2-tab--active' : ''}`;
    submitBtn.textContent   = m === 'signin' ? 'Sign in' : 'Create account';
    resetLink.style.display = m === 'signin' ? 'inline-flex' : 'none';
    if (pwInput) pwInput.setAttribute('autocomplete', m === 'signin' ? 'current-password' : 'new-password');
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
      if (mode === 'signin') await actions.onSignIn?.({ email, password });
      else                   await actions.onSignUp?.({ email, password });
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
    if (!email) { if (errEl) errEl.textContent = 'Enter your email above first.'; return; }
    try {
      await actions.onPasswordReset?.({ email });
      if (okEl) okEl.textContent = 'Reset email sent — check your inbox.';
    } catch (err) {
      if (errEl) errEl.textContent = String(err?.message || 'Could not send reset email.');
    }
  });
}
