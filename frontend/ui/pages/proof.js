export function render(container, state, actions) {
  const dayPlan = (state.track.days ?? []).find((d) => d.dayNumber === state.today.dayNumber) ?? {};
  const criteria = dayPlan.successCriteria || '';

  container.innerHTML = `
    <div style="max-width:480px;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Submit proof · Day ${state.today.dayNumber ?? 1}</div>
      <h1 style="font-size:1.4rem;font-weight:800;color:#f9fafb;margin:0 0 6px">Mark as done</h1>
      ${criteria ? `<p style="color:#6b7280;font-size:.85rem;margin:0 0 20px;padding:10px 12px;background:#111827;border-left:3px solid #3b82f6;border-radius:4px">Done means: ${escHtml(criteria)}</p>` : ''}
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 12px;border:1px solid #374151;border-radius:6px">
          <input type="radio" name="proof-type" value="statement" checked style="accent-color:#3b82f6"/>
          <span style="color:#e5e7eb;font-size:.9rem">Written statement — describe what you completed</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 12px;border:1px solid #374151;border-radius:6px">
          <input type="radio" name="proof-type" value="link" style="accent-color:#3b82f6"/>
          <span style="color:#e5e7eb;font-size:.9rem">Link — share a URL (repo, doc, post, etc.)</span>
        </label>
      </div>
      <textarea id="v2-proof-text" placeholder="Describe what you completed or paste a link…"
        style="width:100%;min-height:80px;padding:10px 12px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#f9fafb;font-size:.9rem;resize:vertical;box-sizing:border-box"></textarea>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button id="v2-proof-submit"
          style="flex:1;padding:12px;background:#22c55e;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer">
          Submit proof →
        </button>
        <button data-route="/today"
          style="padding:12px 16px;background:transparent;color:#6b7280;border:1px solid #374151;border-radius:8px;font-weight:600;cursor:pointer;font-size:.85rem">
          Cancel
        </button>
      </div>
    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
  container.querySelector('#v2-proof-submit')?.addEventListener('click', () => {
    const type  = container.querySelector('input[name="proof-type"]:checked')?.value || 'statement';
    const value = String(container.querySelector('#v2-proof-text')?.value || '').trim();
    if (!value) return;
    actions.onProofSubmit?.({ type, value });
  });
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
