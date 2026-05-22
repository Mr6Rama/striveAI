let bound = false;

export function bindSettingsHandlers({ onSave, onRebuild }) {
  if (bound) return;
  bound = true;

  document.getElementById('set-save-btn')?.addEventListener('click', () => {
    const name          = String(document.getElementById('set-name-in')?.value || '').trim();
    const goal          = String(document.getElementById('set-goal-in')?.value || '').trim();
    const deadline      = String(document.getElementById('set-deadline-in')?.value || '').trim();
    const niche         = String(document.getElementById('set-niche-in')?.value || '').trim();
    const executionStyle = String(document.getElementById('set-style-in')?.value || '').trim();
    onSave({ name, goal, deadline, niche, executionStyle });
  });

  document.getElementById('set-rebuild-btn')?.addEventListener('click', onRebuild);
}

// v2 render
export function render(container, state, actions) {
  const user     = state.user;
  const telegram = state.telegram;

  container.innerHTML = `
    <div class="v2-page">

      <div class="v2-kicker v2-kicker--muted" style="margin-bottom:8px">Settings</div>
      <h1 class="v2-h1" style="margin-bottom:24px">Your account</h1>

      <section style="margin-bottom:28px">
        <div class="v2-section-label" style="margin-bottom:12px">Profile</div>
        <div class="v2-card">
          <div class="v2-meta-row">
            <span class="v2-muted-text">Email</span>
            <span class="v2-body-text" style="font-family:var(--v2-fmono);font-size:.82rem">${escHtml(user.email || '—')}</span>
          </div>
          <div class="v2-meta-row">
            <span class="v2-muted-text">Experience level</span>
            <span class="v2-body-text" style="text-transform:capitalize">${escHtml(user.experienceLevel || 'intermediate')}</span>
          </div>
        </div>
      </section>

      <section style="margin-bottom:28px">
        <div class="v2-section-label" style="margin-bottom:12px">Telegram</div>
        <div class="v2-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:16px">
            <div>
              <p class="v2-body-text">${telegram.connected ? `Connected as @${escHtml(telegram.username || 'unknown')}` : 'Not connected'}</p>
              <p class="v2-muted-text" style="margin-top:3px">Daily pings at ${telegram.pingHour ?? 9}:00 UTC</p>
            </div>
            ${telegram.connected
              ? `<button id="v2-tg-disconnect" class="v2-btn v2-btn--ghost v2-btn--sm">Disconnect</button>`
              : `<button id="v2-tg-connect"    class="v2-btn v2-btn--primary v2-btn--sm">Connect</button>`}
          </div>
        </div>
      </section>

      <section style="margin-bottom:24px">
        <div class="v2-section-label" style="margin-bottom:12px">Account</div>
        <div class="v2-card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <p class="v2-muted-text">Sign out of StriveAI</p>
            <button id="v2-signout" class="v2-btn v2-btn--danger v2-btn--sm">Sign out</button>
          </div>
        </div>
      </section>

      <section style="margin-bottom:24px">
        <div class="v2-section-label" style="margin-bottom:12px">Danger zone</div>
        <div class="v2-card" style="border-color:rgba(220,38,38,.25)">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:16px">
            <div>
              <p class="v2-body-text">Reset progress</p>
              <p class="v2-muted-text" style="margin-top:3px">Erases your current 7-day track and all progress. Account stays. You'll start onboarding fresh.</p>
            </div>
            <button id="v2-reset-progress" class="v2-btn v2-btn--danger v2-btn--sm">Reset</button>
          </div>
        </div>
      </section>

    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
  container.querySelector('#v2-signout')?.addEventListener('click', () => actions.onSignOut?.());
  container.querySelector('#v2-tg-connect')?.addEventListener('click', () => actions.onNavigate?.('/today'));
  container.querySelector('#v2-tg-disconnect')?.addEventListener('click', () => actions.onTelegramDisconnect?.());
  container.querySelector('#v2-reset-progress')?.addEventListener('click', () => {
    const ok = window.confirm('This will erase your current 7-day track and all progress. Your account stays. Continue?');
    if (ok) actions.onResetProgress?.();
  });
}

export function renderSettings(state) {
  setText('set-name', state.user.name || '—');
  setText('set-proj', state.user.project || '—');
  setText('set-plan', state.user.planType || 'Free');
  setInput('set-name-in', state.user.name || '');
  setInput('set-goal-in', state.plan.goal || '');
  setInput('set-deadline-in', state.plan.deadline || '');
  setInput('set-niche-in', state.plan.niche || '');
  setInput('set-style-in', state.plan.executionStyle || '');
  setText('set-status', state.ui.message || '');
  setText('set-error', state.ui.error || '');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '';
}

function setInput(id, value) {
  const el = document.getElementById(id);
  if (el && document.activeElement !== el) el.value = value || '';
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
