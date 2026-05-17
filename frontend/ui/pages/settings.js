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
