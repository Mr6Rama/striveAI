let bound = false;

export function bindOnboardingHandlers({ onGenerate }) {
  if (bound) return;
  bound = true;
  const genBtn = document.getElementById('ob-gen-btn');
  
  genBtn?.addEventListener('click', () => {
    const name = String(document.getElementById('ob-nm')?.value || '').trim();
    const project = document.getElementById('ob-proj')?.value || '';
    const goal = String(document.getElementById('ob-goal')?.value || '').trim();
    const deadline = String(document.getElementById('ob-deadline')?.value || '').trim();
    const niche = String(document.getElementById('ob-niche')?.value || '').trim();
    const executionStyle = String(document.getElementById('ob-resources')?.value || '').trim();

    onGenerate({ 
      name, 
      project, 
      goal, 
      deadline, 
      niche, 
      executionStyle 
    });
  });
}
export function renderOnboarding(state) {
  const statusEl = document.getElementById('ob-status');
  const errorEl = document.getElementById('ob-error');
  
  if (statusEl) statusEl.textContent = state.ui.message || '';
  if (errorEl) errorEl.textContent = state.ui.error || '';

  const disabled = Boolean(state.ui.loading);
  const btn = document.getElementById('ob-gen-btn');
  if (btn) {
    btn.disabled = disabled;
    btn.textContent = disabled ? 'Generating...' : 'Generate Roadmap';
  }
}
