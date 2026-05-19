let bound = false;

export function bindSettingsHandlers({ onSave, onRebuild }) {
  if (bound) return;
  bound = true;

  document.getElementById('set-save-btn')?.addEventListener('click', () => {
    const name = String(document.getElementById('set-name-in')?.value || '').trim();
    const goal = String(document.getElementById('set-goal-in')?.value || '').trim();
    const deadline = String(document.getElementById('set-deadline-in')?.value || '').trim();
    const niche = String(document.getElementById('set-niche-in')?.value || '').trim();
    const executionStyle = String(document.getElementById('set-style-in')?.value || '').trim();

    onSave({ name, goal, deadline, niche, executionStyle });
  });

  document.getElementById('set-rebuild-btn')?.addEventListener('click', onRebuild);
}

// v2 render — used by pages/index.js when #app-v2 is the root.
export function render(container, state, actions) {
  const user     = state.user;
  const telegram = state.telegram;

  container.innerHTML = `
    <div style="max-width:540px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Settings</div>
      <h1 style="font-size:1.5rem;font-weight:800;color:#f9fafb;margin:0 0 24px">Your account</h1>

      <section style="margin-bottom:28px">
        <div style="font-size:.8rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">Profile</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #111827">
            <span style="color:#9ca3af;font-size:.85rem">Email</span>
            <span style="color:#e5e7eb;font-size:.85rem;font-family:monospace">${escHtml(user.email || '—')}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #111827">
            <span style="color:#9ca3af;font-size:.85rem">Experience level</span>
            <span style="color:#e5e7eb;font-size:.85rem;text-transform:capitalize">${escHtml(user.experienceLevel || 'intermediate')}</span>
          </div>
        </div>
      </section>

      <section style="margin-bottom:28px">
        <div style="font-size:.8rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">Telegram</div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #111827">
          <div>
            <div style="color:#e5e7eb;font-size:.85rem">${telegram.connected ? `Connected as @${escHtml(telegram.username || 'unknown')}` : 'Not connected'}</div>
            <div style="color:#6b7280;font-size:.75rem;margin-top:2px">Daily pings at ${telegram.pingHour ?? 9}:00 UTC</div>
          </div>
          ${telegram.connected
            ? `<button id="v2-tg-disconnect" style="padding:6px 12px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:6px;font-size:.78rem;cursor:pointer">Disconnect</button>`
            : `<button id="v2-tg-connect" style="padding:6px 12px;background:#3b82f6;color:#fff;border:none;border-radius:6px;font-size:.78rem;cursor:pointer">Connect</button>`}
        </div>
      </section>

      <section>
        <button id="v2-signout"
          style="padding:10px 20px;background:transparent;color:#f87171;border:1px solid #374151;border-radius:8px;font-weight:600;cursor:pointer;font-size:.85rem">
          Sign out
        </button>
      </section>

      <div style="margin-top:24px">
        <button data-route="/today"
          style="padding:8px 14px;background:transparent;color:#6b7280;border:none;font-size:.8rem;cursor:pointer">
          ← Back to Today
        </button>
      </div>
    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
  container.querySelector('#v2-signout')?.addEventListener('click', () => actions.onSignOut?.());
  container.querySelector('#v2-tg-connect')?.addEventListener('click', () => actions.onNavigate?.('/today'));
  container.querySelector('#v2-tg-disconnect')?.addEventListener('click', () => actions.onTelegramDisconnect?.());
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
  const element = document.getElementById(id);
  if (element) element.textContent = value || '';
}

function setInput(id, value) {
  const element = document.getElementById(id);
  if (element && document.activeElement !== element) {
    element.value = value || '';
  }
}
