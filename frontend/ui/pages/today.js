let bound = false;

export function bindTodayHandlers() {
  if (bound) return;
  bound = true;
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
