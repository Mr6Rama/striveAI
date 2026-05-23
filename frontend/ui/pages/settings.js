// Settings — /settings
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
            <span class="v2-body-text">${escHtml(user.email || '—')}</span>
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
          <p id="v2-tg-note" class="v2-muted-text" style="margin-top:8px"></p>
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

  container.querySelector('#v2-tg-connect')?.addEventListener('click', async () => {
    const note = container.querySelector('#v2-tg-note');
    if (note) note.textContent = 'Opening Telegram…';
    try {
      await actions.onTelegramLink?.();
      if (note) note.textContent = 'Opened. Once you’ve connected, return here and the status will update.';
      setTimeout(() => actions.onTelegramRefresh?.(), 3000);
    } catch (err) {
      if (note) note.textContent = String(err?.message || 'Could not start connection.');
    }
  });

  container.querySelector('#v2-tg-disconnect')?.addEventListener('click', () => actions.onTelegramDisconnect?.());
  container.querySelector('#v2-reset-progress')?.addEventListener('click', () => {
    const ok = window.confirm('This will erase your current 7-day track and all progress. Your account stays. Continue?');
    if (ok) actions.onResetProgress?.();
  });
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
