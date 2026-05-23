// 7-day roadmap visualization: smooth sinusoidal SVG curve with status-colored nodes.
// Labels are hidden by default — shown on node click (wired by progress.js).
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
      status:    existing.status || 'pending',
      title:     existing.title || '',
      isToday:   n === currentDay,
    };
  });

  const W    = 900;
  const H    = variant === 'full' ? 300 : 180;
  const padX = 64;
  const midY = variant === 'full' ? 150 : 90;
  const amp  = variant === 'full' ? 85 : 32;

  // True sinusoidal: 2 full periods across 7 nodes → alternating up-down-up-down
  const positions = list.map((_, i) => ({
    x: padX + (i / (total - 1)) * (W - padX * 2),
    y: midY - Math.sin(i * 2 * Math.PI / 3) * amp,
  }));

  // Smooth curve via Catmull-Rom → cubic Bezier conversion
  let path = `M ${f(positions[0].x)} ${f(positions[0].y)}`;
  for (let i = 1; i < positions.length; i++) {
    const p0 = positions[Math.max(0, i - 2)];
    const p1 = positions[i - 1];
    const p2 = positions[i];
    const p3 = positions[Math.min(positions.length - 1, i + 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${f(cp1x)} ${f(cp1y)} ${f(cp2x)} ${f(cp2y)} ${f(p2.x)} ${f(p2.y)}`;
  }

  const nodes = list.map((d, i) => {
    const { x, y } = positions[i];
    const key = d.isToday ? 'today' : d.status;
    const c   = NODE_COLOR[key] || NODE_COLOR.pending;
    const r   = d.isToday ? 22 : 16;
    const ring = d.isToday
      ? `<circle cx="${f(x)}" cy="${f(y)}" r="${r + 9}" fill="none" stroke="${c.stroke}" stroke-width="2" opacity=".35"/>`
      : '';
    const inner    = `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2.5"/>`;
    const isFilled = d.status === 'done' || d.status === 'rescued' || d.isToday;
    const numLabel = `<text x="${f(x)}" y="${f(y + 5)}" text-anchor="middle" font-family="var(--v2-fhead)" font-size="15" font-weight="800" fill="${isFilled ? '#fff' : '#475569'}">${d.dayNumber}</text>`;
    const hitArea  = `<circle cx="${f(x)}" cy="${f(y)}" r="${r + 14}" fill="transparent" style="cursor:pointer"/>`;
    const tooltip  = `<title>Day ${d.dayNumber}${d.title ? ` — ${esc(d.title)}` : ''}${d.isToday ? ' (today)' : ''} · ${esc(d.status)}</title>`;
    return `<g data-day="${d.dayNumber}" style="cursor:pointer">${tooltip}${ring}${inner}${numLabel}${hitArea}</g>`;
  }).join('');

  // Labels: hidden by default, toggled on node click (via progress.js wireRoadmapLabels)
  let labels = '';
  if (variant === 'full') {
    labels = list.map((d, i) => {
      const { x, y } = positions[i];
      const r = d.isToday ? 22 : 16;
      // Nodes above midline get label below (toward center); nodes below get label above
      const labelY = y <= midY ? f(y + r + 20) : f(y - r - 8);
      const title  = (d.title || '').slice(0, 26) + ((d.title || '').length > 26 ? '…' : '');
      return `<text
        data-label-day="${d.dayNumber}"
        x="${f(x)}" y="${labelY}"
        text-anchor="middle"
        font-family="var(--v2-fbody)"
        font-size="11.5"
        fill="${d.isToday ? '#2a36c8' : '#334155'}"
        font-weight="${d.isToday ? '700' : '600'}"
        visibility="hidden"
        style="pointer-events:none"
      >${esc(title)}</text>`;
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

function f(n) { return Number(n).toFixed(1); }

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
