let bound = false;

// FIX: bindTodayHandlers was completely empty — added binding for all buttons (onDone, onMissed, onBlocked, onSkip)
export function bindTodayHandlers({ onDone, onMissed, onBlocked, onSkip } = {}) {
  if (bound) return;
  bound = true;

  document.getElementById('btn-done')?.addEventListener('click', () => {
    if (typeof onDone === 'function') onDone();
  });

  document.getElementById('btn-missed')?.addEventListener('click', () => {
    if (typeof onMissed === 'function') onMissed();
  });

  document.getElementById('btn-blocked')?.addEventListener('click', () => {
    if (typeof onBlocked === 'function') onBlocked();
  });

  document.getElementById('btn-skip')?.addEventListener('click', () => {
    if (typeof onSkip === 'function') onSkip();
  });
}

export function renderToday(state) {
  const today = state.today;

  setText('mc-title', today.primaryTaskText || 'Complete onboarding to generate your plan');
  setText('mc-detail', today.reason || 'Set your goal, deadline, and work preferences during onboarding, then build your roadmap.');
  setText('mc-tag1', `Status: ${String(today.status || 'Ready').toUpperCase()}`);
  setText('mc-tag2', today.stageProgressHint ? `Progress: ${today.stageProgressHint}` : 'Priority: —');
  setText('today-task-text', today.primaryTaskText || 'No task assigned');
  setText('today-status', String(today.status || 'pending').toUpperCase());
  setText('today-feedback', state.ui.feedback || '');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || '';
}

// v2 render — used by pages/index.js when #app-v2 is the root.
export function render(container, state, actions) {
  const today   = state.today;
  const dayPlan = (state.track.days ?? []).find((d) => d.dayNumber === today.dayNumber) ?? {};
  const status  = today.status || 'pending';
  const statusColor = { done: '#22c55e', blocked: '#f59e0b', skipped: '#6b7280', missed: '#ef4444', in_progress: '#3b82f6' };

  container.innerHTML = `
    <div style="max-width:560px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:6px">
        Day ${today.dayNumber ?? 1} of 7 · <span style="color:${statusColor[status] || '#6b7280'}">${status.toUpperCase().replace('_', ' ')}</span>
      </div>
      <h1 style="font-size:1.4rem;font-weight:800;color:#f9fafb;margin:0 0 6px;line-height:1.3">${escHtml(dayPlan.title || 'No task assigned')}</h1>
      <p style="color:#9ca3af;font-size:.85rem;line-height:1.6;margin:0 0 6px">${escHtml(dayPlan.why || '')}</p>
      ${dayPlan.successCriteria ? `<p style="color:#6b7280;font-size:.8rem;margin:0 0 20px;padding:8px 12px;background:#111827;border-left:3px solid #374151;border-radius:4px">Done means: ${escHtml(dayPlan.successCriteria)}</p>` : '<div style="margin-bottom:20px"></div>'}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button data-route="/agent"
          style="flex:1;min-width:120px;padding:11px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">
          Start with Agent
        </button>
        <button data-route="/proof"
          style="flex:1;min-width:120px;padding:11px;background:#22c55e;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer">
          Mark Done
        </button>
        <button data-route="/blocked?type=blocked"
          style="padding:11px 14px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:8px;font-weight:600;cursor:pointer;font-size:.85rem">
          Blocked
        </button>
        <button data-route="/blocked?type=skipped"
          style="padding:11px 14px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:8px;font-weight:600;cursor:pointer;font-size:.85rem">
          Skip
        </button>
      </div>
      <div style="display:flex;gap:16px;margin-top:20px">
        <button data-route="/action-kit"
          style="padding:8px 14px;background:transparent;color:#6b7280;border:1px solid #1f2937;border-radius:6px;font-size:.8rem;cursor:pointer">
          Action Kit
        </button>
        <button data-route="/progress"
          style="padding:8px 14px;background:transparent;color:#6b7280;border:1px solid #1f2937;border-radius:6px;font-size:.8rem;cursor:pointer">
          Progress
        </button>
        <button data-route="/settings"
          style="padding:8px 14px;background:transparent;color:#6b7280;border:1px solid #1f2937;border-radius:6px;font-size:.8rem;cursor:pointer">
          Settings
        </button>
      </div>
    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
