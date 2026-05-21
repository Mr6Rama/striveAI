export function render(container, _state, actions) {
  container.innerHTML = `
    <div class="v2-page-center" style="text-align:center;padding-top:4rem">
      <div class="v2-kicker v2-kicker--muted" style="margin-bottom:16px">StriveAI</div>
      <div style="font-family:var(--v2-fhead);font-size:3rem;font-weight:900;color:var(--v2-surface-3);line-height:1;margin-bottom:12px">404</div>
      <h1 class="v2-h1" style="margin-bottom:10px">Page not found</h1>
      <p class="v2-sub" style="margin-bottom:28px">
        That route doesn't exist. Use the button below to get back on track.
      </p>
      <button data-route="/today" class="v2-btn v2-btn--primary v2-btn--lg">
        Go to Today →
      </button>
    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
}
