export function render(container, state, actions) {
  const track = state.track;
  const goal  = track.goal || 'your goal';
  const days  = Array.isArray(track.days) ? track.days : [];

  container.innerHTML = `
    <div class="v2-page-center">

      <div class="v2-kicker v2-kicker--muted" style="margin-bottom:8px">Ready to start</div>
      <h1 class="v2-h1" style="margin-bottom:8px">Your 7-day track is ready.</h1>
      <p class="v2-sub" style="margin-bottom:24px">
        Goal: <strong style="color:var(--v2-text)">${escHtml(goal)}</strong>
      </p>

      <div class="v2-card" style="margin-bottom:24px">
        <div class="v2-section-label" style="margin-bottom:12px">7 days planned</div>
        <div id="v2-ct-days">
          ${days.length
            ? days.map((d) => `
                <div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--v2-border);align-items:center">
                  <span class="v2-muted-text" style="min-width:52px;flex-shrink:0">Day ${d.dayNumber}</span>
                  <span class="v2-body-text">${escHtml(d.title || '—')}</span>
                </div>`).join('')
            : '<p class="v2-muted-text">No days generated yet.</p>'}
        </div>
      </div>

      <div class="v2-row" style="gap:10px">
        <button id="v2-ct-start" class="v2-btn v2-btn--primary v2-btn--lg" style="flex:1">
          Start Day 1 →
        </button>
        <button data-route="/plan-preview" class="v2-btn v2-btn--ghost">
          Preview plan
        </button>
      </div>

    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
  container.querySelector('#v2-ct-start')?.addEventListener('click', () => {
    actions.onNavigate?.('/today');
  });
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
