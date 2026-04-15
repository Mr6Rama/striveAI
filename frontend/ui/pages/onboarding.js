let bound = false;

export function bindOnboardingHandlers({ onGenerate }) {
  if (bound) return;
  bound = true;
  document.getElementById('ob-generate-btn')?.addEventListener('click', () => {
    const goal = String(document.getElementById('ob-goal')?.value || '').trim();
    const deadline = String(document.getElementById('ob-deadline')?.value || '').trim();
    const name = String(document.getElementById('ob-name')?.value || '').trim();
    const project = String(document.getElementById('ob-project')?.value || '').trim();
    onGenerate({ goal, deadline, name, project });
  });
}

export function renderOnboarding(state) {
  setText('ob-status', state.ui.message || '');
  setText('ob-error', state.ui.error || '');
  const disabled = Boolean(state.ui.loading);
  const btn = document.getElementById('ob-generate-btn');
  if (btn) btn.disabled = disabled;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || '';
}

