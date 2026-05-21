// Landing page — paper editorial style

export function render(container, _state, actions) {
  container.innerHTML = `
    <div class="v2-land-screen">
      <div class="v2-land-hero v2-bracketed">
        <span class="v2-br-tr"></span><span class="v2-br-bl"></span>

        <div class="v2-land-logo">
          <div class="v2-land-logo-mark">S</div>
          <span class="v2-land-logo-name">StriveAI</span>
        </div>

        <div style="font-family:var(--v2-fmono);font-size:.65rem;letter-spacing:.2em;text-transform:uppercase;color:var(--v2-blue);margin-bottom:20px;display:flex;align-items:center;gap:8px;justify-content:center">
          <span style="width:6px;height:6px;border-radius:50%;background:var(--v2-blue);display:inline-block"></span>
          7-day AI execution agent
        </div>

        <h1 class="v2-land-h1">
          Stop missing<br/><em>your own</em> deadlines.
        </h1>

        <p class="v2-land-sub">
          Not a planner. An AI that holds you to your own roadmap —
          daily micro-steps, honest proof, adapts when you fall behind.
        </p>

        <div class="v2-land-btns">
          <button data-route="/register" class="v2-btn v2-btn--primary v2-btn--lg">
            Start 7-day track →
          </button>
          <button data-route="/auth" class="v2-btn v2-btn--ghost v2-btn--lg">
            Sign in
          </button>
        </div>

        <div class="v2-features">
          ${feat("Today's Action", "One focused task per day — specific, time-estimated, no overwhelm")}
          ${feat("Agent Mode", "3–5 guided micro-steps to start and finish each day's work")}
          ${feat("Rescue when blocked", "Smaller rescue task when you're stuck or low energy")}
          ${feat("Adapts after each day", "Tomorrow adjusts based on what actually happened today")}
          ${feat("Proof of progress", "Log your work — builds a record of what you shipped")}
        </div>

      </div>
    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
}

function feat(label, desc) {
  return `
    <div class="v2-feature-row">
      <span class="v2-feature-dot">→</span>
      <div><strong>${esc(label)}</strong> — ${esc(desc)}</div>
    </div>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
