export function render(container, _state, actions) {
  container.innerHTML = `
    <div class="v2-land-screen">
      <div class="v2-land-hero">

        <div class="v2-land-logo">
          <div class="v2-land-logo-mark">S</div>
          <span class="v2-land-logo-name">StriveAI</span>
        </div>

        <h1 class="v2-land-h1">Stay on track<br>for <span>7 days.</span></h1>

        <p class="v2-sub" style="max-width:380px;margin:0 auto 28px">
          A 7-day AI execution agent. Plan, start, recover, and actually finish — one day at a time.
        </p>

        <div class="v2-land-btns">
          <button id="v2-land-start" class="v2-btn v2-btn--primary v2-btn--lg v2-btn--full">
            Start your 7-day track
          </button>
          <button id="v2-land-signin" class="v2-btn v2-btn--secondary v2-btn--full">
            Sign in
          </button>
        </div>

        <div class="v2-features">
          ${feat('→', 'Today\'s Action', 'One clear task each day — guided execution, not a to-do list.')}
          ${feat('→', 'Agent Mode', 'Guided 3–5 micro-steps when you need help getting started.')}
          ${feat('→', 'Rescue when blocked', 'Smaller action generated when you\'re stuck or out of time.')}
          ${feat('→', 'Adapts after each day', 'Tomorrow\'s task adjusts based on what happened today.')}
          ${feat('→', 'Built for anyone', 'Students, builders, creators, learners — any goal, any timeline.')}
        </div>

      </div>
    </div>`;

  container.querySelector('#v2-land-start')?.addEventListener('click', () => {
    actions.onNavigate?.('/auth?mode=signup');
  });
  container.querySelector('#v2-land-signin')?.addEventListener('click', () => {
    actions.onNavigate?.('/auth');
  });
}

function feat(icon, title, desc) {
  return `<div class="v2-feature-row">
    <span style="color:var(--v2-blue);flex-shrink:0;font-weight:700">${icon}</span>
    <div>
      <span style="color:var(--v2-text);font-weight:600">${title}</span>
      <span class="v2-muted-text"> — ${desc}</span>
    </div>
  </div>`;
}
