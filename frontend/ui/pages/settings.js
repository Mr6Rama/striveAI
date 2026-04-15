let bound = false;

export function bindSettingsHandlers({ onSave, onRebuild }) {
  if (bound) return;
  bound = true;
  document.getElementById('set-save-btn')?.addEventListener('click', () => {
    const name = String(document.getElementById('set-name')?.value || '').trim();
    const goal = String(document.getElementById('set-goal')?.value || '').trim();
    const deadline = String(document.getElementById('set-deadline')?.value || '').trim();
    onSave({ name, goal, deadline });
  });
  document.getElementById('set-rebuild-btn')?.addEventListener('click', onRebuild);
}

export function renderSettings(state) {
  setInput('set-name', state.user.name || '');
  setInput('set-goal', state.user.goal || state.plan.goal || '');
  setInput('set-deadline', state.user.deadline || state.plan.deadline || '');
  setText('set-status', state.ui.message || '');
  setText('set-error', state.ui.error || '');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || '';
}

function setInput(id, value) {
  const element = document.getElementById(id);
  if (element && document.activeElement !== element) element.value = value || '';
}

