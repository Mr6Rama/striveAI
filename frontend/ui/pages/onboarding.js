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
// v2 render — used by pages/index.js when #app-v2 is the root.
export function render(container, state, actions) {
  container.innerHTML = `
    <div style="max-width:520px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Get started</div>
      <h1 style="font-size:1.5rem;font-weight:800;color:#f9fafb;margin:0 0 8px">What are you working on?</h1>
      <p style="color:#9ca3af;font-size:.9rem;line-height:1.6;margin:0 0 24px">
        Tell us your goal and we'll build a concrete 7-day execution plan for you.
      </p>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px">
        <div>
          <label style="font-size:.8rem;font-weight:600;color:#9ca3af;display:block;margin-bottom:4px">What's your goal this week?</label>
          <input id="v2-ob-goal" type="text" placeholder="Ship landing page, learn React hooks, record first episode…"
            style="width:100%;padding:10px 12px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.9rem;box-sizing:border-box"/>
        </div>
        <div>
          <label style="font-size:.8rem;font-weight:600;color:#9ca3af;display:block;margin-bottom:4px">Category</label>
          <select id="v2-ob-category"
            style="width:100%;padding:10px 12px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.9rem;box-sizing:border-box">
            <option value="project">Project</option>
            <option value="startup">Startup</option>
            <option value="content">Content</option>
            <option value="skill">Skill</option>
            <option value="career">Career</option>
            <option value="study">Study</option>
            <option value="habit">Habit</option>
            <option value="fitness">Fitness</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label style="font-size:.8rem;font-weight:600;color:#9ca3af;display:block;margin-bottom:4px">Daily hours available</label>
          <select id="v2-ob-hours"
            style="width:100%;padding:10px 12px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.9rem;box-sizing:border-box">
            <option value="1-2">1–2 hours</option>
            <option value="2-4" selected>2–4 hours</option>
            <option value="4-6">4–6 hours</option>
            <option value="6-8">6–8 hours</option>
            <option value="8+">8+ hours</option>
          </select>
        </div>
        <div id="v2-ob-error" style="font-size:.8rem;color:#f87171;min-height:1.2em"></div>
        <button id="v2-ob-generate"
          style="padding:12px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">
          Generate my 7-day plan →
        </button>
      </div>
    </div>`;

  container.querySelector('#v2-ob-generate')?.addEventListener('click', () => {
    const goal     = String(container.querySelector('#v2-ob-goal')?.value || '').trim();
    const category = container.querySelector('#v2-ob-category')?.value || 'other';
    const hours    = container.querySelector('#v2-ob-hours')?.value || '2-4';
    const errEl    = container.querySelector('#v2-ob-error');
    if (!goal) { if (errEl) errEl.textContent = 'Enter your goal first.'; return; }
    if (errEl) errEl.textContent = '';
    actions.onGenerate?.({ goal, goalCategory: category, dailyHours: hours });
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
