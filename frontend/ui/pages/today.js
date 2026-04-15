let bound = false;

export function bindTodayHandlers({ onDone, onMissed, onBlocked, onSkip }) {
  if (bound) return;
  bound = true;
  document.getElementById('today-done-btn')?.addEventListener('click', onDone);
  document.getElementById('today-missed-btn')?.addEventListener('click', onMissed);
  document.getElementById('today-blocked-btn')?.addEventListener('click', onBlocked);
  document.getElementById('today-skip-btn')?.addEventListener('click', onSkip);
}

export function renderToday(state) {
  const today = state.today;
  setText('today-task-text', today.primaryTaskText || 'No task assigned');
  setText('today-reason', today.reason || 'No reason available');
  setText('today-stage-hint', today.stageProgressHint || 'No stage hint');
  setText('today-status', String(today.status || 'pending').toUpperCase());
  setText('today-feedback', state.ui.feedback || '');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || '';
}

