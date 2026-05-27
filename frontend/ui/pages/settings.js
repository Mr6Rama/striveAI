// Settings — /settings

export function render(container, state, actions) {
  const user     = state.user;
  const telegram = state.telegram;

  container.innerHTML = buildPage(user, telegram);
  wireEvents(container, state, actions, telegram);
}

// ── Page builder ───────────────────────────────────────────────────────────

function buildPage(user, telegram) {
  return `
    <div class="v2-page">

      <div class="v2-kicker v2-kicker--muted" style="margin-bottom:8px">Settings</div>
      <h1 class="v2-h1" style="margin-bottom:24px">Your account</h1>

      <section style="margin-bottom:28px">
        <div class="v2-section-label" style="margin-bottom:12px">Profile</div>
        <div class="v2-card">
          <div class="v2-meta-row">
            <span class="v2-muted-text">Email</span>
            <span class="v2-body-text">${esc(user.email || '—')}</span>
          </div>
          <div class="v2-meta-row">
            <span class="v2-muted-text">Experience</span>
            <span class="v2-body-text" style="text-transform:capitalize">${esc(user.experienceLevel || 'intermediate')}</span>
          </div>
        </div>
      </section>

      <section style="margin-bottom:28px">
        <div class="v2-section-label" style="margin-bottom:12px">Telegram accountability</div>
        ${telegram.connected ? renderTelegramConnected(telegram) : renderTelegramDisconnected()}
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
              <p class="v2-muted-text" style="margin-top:3px">Erases your current track and all progress. Account stays. You'll start onboarding fresh.</p>
            </div>
            <button id="v2-reset-progress" class="v2-btn v2-btn--danger v2-btn--sm">Reset</button>
          </div>
        </div>
      </section>

    </div>`;
}

// ── Telegram sub-sections ──────────────────────────────────────────────────

function renderTelegramConnected(telegram) {
  const hour = telegram.pingHour ?? 9;
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return `
    <div class="v2-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px">
        <div>
          <p class="v2-body-text" style="font-weight:600">
            <span style="color:var(--v2-green)">●</span>
            Connected as @${esc(telegram.username || 'you')}
          </p>
          ${telegram.connectedAt
            ? `<p class="v2-muted-text" style="margin-top:2px;font-size:.78rem">Since ${esc(new Date(telegram.connectedAt).toLocaleDateString())}</p>`
            : ''}
        </div>
        <button id="v2-tg-disconnect" class="v2-btn v2-btn--ghost v2-btn--sm" style="flex-shrink:0">Disconnect</button>
      </div>

      <div style="margin-bottom:14px">
        <label class="v2-muted-text" style="display:block;margin-bottom:6px">Daily ping time (UTC)</label>
        <div style="display:flex;align-items:center;gap:10px">
          <select id="v2-tg-hour" class="v2-input" style="max-width:120px">
            ${hours.map((h) =>
              `<option value="${h}" ${h === hour ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`
            ).join('')}
          </select>
          <button id="v2-tg-save-hour" class="v2-btn v2-btn--secondary v2-btn--sm">Save</button>
          <span id="v2-tg-hour-note" class="v2-muted-text" style="font-size:.8rem"></span>
        </div>
      </div>

      <button id="v2-tg-test" class="v2-btn v2-btn--ghost v2-btn--sm">
        Send test ping →
      </button>
      <span id="v2-tg-test-note" class="v2-muted-text" style="font-size:.8rem;margin-left:10px"></span>
    </div>`;
}

function renderTelegramDisconnected() {
  return `
    <div class="v2-card">
      <p class="v2-body-text" style="margin-bottom:6px">Get a daily accountability ping in Telegram at your chosen hour.</p>
      <p class="v2-muted-text" style="margin-bottom:14px">Each ping shows today's task, your done-criteria, and how long it should take.</p>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <button id="v2-tg-connect" class="v2-btn v2-btn--primary">Connect Telegram →</button>
        <button id="v2-tg-refresh" class="v2-btn v2-btn--ghost v2-btn--sm">Already connected? Refresh</button>
      </div>
      <p id="v2-tg-note" class="v2-muted-text" style="margin-top:10px;font-size:.85rem"></p>
    </div>`;
}

// ── Event wiring ───────────────────────────────────────────────────────────

function wireEvents(container, state, actions, telegram) {
  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });

  container.querySelector('#v2-signout')?.addEventListener('click', () => actions.onSignOut?.());
  container.querySelector('#v2-reset-progress')?.addEventListener('click', () => {
    const ok = window.confirm('This will erase your current track and all progress. Your account stays. Continue?');
    if (ok) actions.onResetProgress?.();
  });

  // ── Connect flow ──────────────────────────────────────────────────────────
  const note = container.querySelector('#v2-tg-note');

  container.querySelector('#v2-tg-connect')?.addEventListener('click', async () => {
    if (note) note.textContent = 'Opening Telegram…';
    try {
      await actions.onTelegramLink?.();
      if (note) note.textContent = 'Bot opened. Send /start to it, then come back and tap "Refresh".';
      startConnectionPoller(container, actions, note, 6);
    } catch (err) {
      if (note) note.textContent = String(err?.message || 'Could not start connection.');
    }
  });

  container.querySelector('#v2-tg-refresh')?.addEventListener('click', async () => {
    if (note) note.textContent = 'Checking…';
    await actions.onTelegramRefresh?.();
    if (note) note.textContent = '';
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  container.querySelector('#v2-tg-disconnect')?.addEventListener('click', async () => {
    const ok = window.confirm('Disconnect Telegram? Daily pings will stop.');
    if (!ok) return;
    await actions.onTelegramDisconnect?.();
  });

  // ── Ping hour ─────────────────────────────────────────────────────────────
  container.querySelector('#v2-tg-save-hour')?.addEventListener('click', async () => {
    const sel  = container.querySelector('#v2-tg-hour');
    const btn  = container.querySelector('#v2-tg-save-hour');
    const lbl  = container.querySelector('#v2-tg-hour-note');
    const hour = Number(sel?.value ?? 9);
    if (btn)  btn.disabled = true;
    if (lbl)  lbl.textContent = 'Saving…';
    try {
      await actions.onTelegramPingUpdate?.(hour);
      if (lbl) { lbl.textContent = 'Saved ✓'; setTimeout(() => { lbl.textContent = ''; }, 2500); }
    } catch (_e) {
      if (lbl) lbl.textContent = 'Could not save.';
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // ── Test ping ─────────────────────────────────────────────────────────────
  container.querySelector('#v2-tg-test')?.addEventListener('click', async () => {
    const btn  = container.querySelector('#v2-tg-test');
    const lbl  = container.querySelector('#v2-tg-test-note');
    if (btn) btn.disabled = true;
    if (lbl) lbl.textContent = 'Sending…';
    try {
      await actions.onTelegramTestPing?.();
      if (lbl) { lbl.textContent = 'Sent ✓'; setTimeout(() => { lbl.textContent = ''; }, 3000); }
    } catch (err) {
      if (lbl) lbl.textContent = String(err?.message || 'Could not send.');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

// Poll up to `attempts` times at 4-second intervals.
// If state becomes connected, the store triggers a page re-render which
// naturally destroys this container, stopping further polls silently.
function startConnectionPoller(container, actions, noteEl, attempts) {
  let n = 0;
  const poll = async () => {
    if (!container.isConnected) return; // page was re-rendered; stop polling
    n++;
    await actions.onTelegramRefresh?.();
    if (!container.isConnected) return; // re-rendered after refresh
    if (n < attempts) setTimeout(poll, 4000);
    else if (noteEl && noteEl.isConnected) {
      noteEl.textContent = 'Not connected yet. Tap "Refresh" once you\'ve sent /start to the bot.';
    }
  };
  setTimeout(poll, 4000);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
