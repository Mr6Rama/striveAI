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
