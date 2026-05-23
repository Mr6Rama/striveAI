// 7-day roadmap visualization: smooth SVG curve with status-colored nodes.
// Pure render — returns HTML string.

const NODE_COLOR = {
  done:        { fill: '#16a34a', stroke: '#16a34a' },
  rescued:     { fill: '#2a36c8', stroke: '#2a36c8' },
  blocked:     { fill: '#fff',    stroke: '#d97706' },
  skipped:     { fill: '#fff',    stroke: '#9aa3b2' },
  missed:      { fill: '#fff',    stroke: '#dc2626' },
  in_progress: { fill: '#2a36c8', stroke: '#2a36c8' },
  today:       { fill: '#2a36c8', stroke: '#2a36c8' },
  pending:     { fill: '#fff',    stroke: '#9aa3b2' },
};

// days: [{ dayNumber, status, title }], currentDay: number, variant: 'compact'|'full'
export function renderRoadmap({ days = [], currentDay = 1, variant = 'compact' } = {}) {
  const total = 7;
  const list  = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const existing = days.find((d) => d.dayNumber === n) || {};
    return {
      dayNumber: n,
      status: existing.status || 'pending',
      title: existing.title || '',
      isToday: n === currentDay,
    };
  });

  const W = 760;
  const H = variant === 'full' ? 230 : 170;
  const padX = 50;
  const midY = variant === 'full' ? 100 : 80;
  const amp  = variant === 'full' ? 40 : 30;

  // Compute node positions along a gentle sine curve for organic feel.
  const positions = list.map((_, i) => {
    const t = i / (total - 1);
    const x = padX + t * (W - padX * 2);
    const y = midY + Math.sin(t * Math.PI * 1.5) * amp;
    return { x, y };
  });

  // Smooth path connecting all points with quadratic curves.
  let path = `M ${positions[0].x} ${positions[0].y}`;
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1];
    const curr = positions[i];
    const cx = (prev.x + curr.x) / 2;
    path += ` Q ${cx} ${prev.y} ${cx} ${(prev.y + curr.y) / 2} T ${curr.x} ${curr.y}`;
  }

  const nodes = list.map((d, i) => {
    const { x, y } = positions[i];
    const key = d.isToday ? 'today' : d.status;
    const c = NODE_COLOR[key] || NODE_COLOR.pending;
    const r = d.isToday ? 22 : 16;
    const ring = d.isToday
      ? `<circle cx="${x}" cy="${y}" r="${r + 9}" fill="none" stroke="${c.stroke}" stroke-width="2" opacity=".35"/>`
      : '';
    const inner = `<circle cx="${x}" cy="${y}" r="${r}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2.5"/>`;
    const isFilled = d.status === 'done' || d.status === 'rescued' || d.isToday;
    const dayLabel = `<text x="${x}" y="${y + 5}" text-anchor="middle" font-family="var(--v2-fhead)" font-size="15" font-weight="800" fill="${isFilled ? '#fff' : '#475569'}">${d.dayNumber}</text>`;
    const tooltip = `<title>Day ${d.dayNumber}${d.title ? ` — ${esc(d.title)}` : ''}${d.isToday ? ' (today)' : ''} · ${esc(d.status)}</title>`;
    return `<g>${tooltip}${ring}${inner}${dayLabel}</g>`;
  }).join('');

  let labels = '';
  if (variant === 'full') {
    labels = list.map((d, i) => {
      const { x, y } = positions[i];
      const ly = y + 48;
      const title = (d.title || '').slice(0, 22) + ((d.title || '').length > 22 ? '…' : '');
      return `<text x="${x}" y="${ly}" text-anchor="middle" font-family="var(--v2-fbody)" font-size="12" fill="${d.isToday ? '#2a36c8' : '#475569'}" font-weight="${d.isToday ? '700' : '500'}">${esc(title)}</text>`;
    }).join('');
  }

  return `
    <div class="v2-roadmap v2-roadmap--${variant}" role="img" aria-label="7-day progress roadmap">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
        <path d="${path}" fill="none" stroke="#cbd0db" stroke-width="3" stroke-linecap="round"/>
        ${nodes}
        ${labels}
      </svg>
    </div>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
