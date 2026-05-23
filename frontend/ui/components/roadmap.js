// 7-day roadmap visualization: smooth SVG curve with role-shaped, status-colored nodes.
// Roles give each day a narrative weight — the week reads as an arc, not a metro map.

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

// Role-specific glyph rendered inside the node. Pure SVG, no external icons.
const ROLE_GLYPH = {
  setup:    { glyph: '○', label: 'setup'    },
  build:    { glyph: '▍', label: 'build'    },
  validate: { glyph: '?', label: 'validate' },
  ship:     { glyph: '★', label: 'ship'     },
  review:   { glyph: '↺', label: 'review'   },
  recover:  { glyph: '~', label: 'recover'  },
};

// Per-role node radius — adds subtle visual hierarchy. ship/validate are bigger
// because they are the load-bearing days of the week.
function radiusForRole(role, isToday) {
  const base = ({ ship: 19, validate: 18, recover: 14 })[role] || 16;
  return isToday ? base + 6 : base;
}

// days: [{ dayNumber, status, title, role }]
// currentDay: number
// variant: 'compact' | 'full'
export function renderRoadmap({ days = [], currentDay = 1, variant = 'compact' } = {}) {
  const total = 7;
  const list  = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const existing = days.find((d) => d.dayNumber === n) || {};
    return {
      dayNumber: n,
      status:    existing.status || 'pending',
      title:     existing.title  || '',
      role:      existing.role   || defaultRole(n),
      isToday:   n === currentDay,
    };
  });

  const W    = 780;
  const H    = variant === 'full' ? 250 : 180;
  const padX = 56;
  const midY = variant === 'full' ? 105 : 85;
  const amp  = variant === 'full' ? 42  : 32;

  const positions = list.map((_, i) => {
    const t = i / (total - 1);
    const x = padX + t * (W - padX * 2);
    const y = midY + Math.sin(t * Math.PI * 1.5) * amp;
    return { x, y };
  });

  // Smooth path through all points.
  let path = `M ${positions[0].x} ${positions[0].y}`;
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1];
    const curr = positions[i];
    const cx = (prev.x + curr.x) / 2;
    path += ` Q ${cx} ${prev.y} ${cx} ${(prev.y + curr.y) / 2} T ${curr.x} ${curr.y}`;
  }

  const nodes = list.map((d, i) => {
    const { x, y } = positions[i];
    const key   = d.isToday ? 'today' : d.status;
    const color = NODE_COLOR[key] || NODE_COLOR.pending;
    const r     = radiusForRole(d.role, d.isToday);

    const ring = d.isToday
      ? `<circle cx="${x}" cy="${y}" r="${r + 9}" fill="none" stroke="${color.stroke}" stroke-width="2" opacity=".35"/>`
      : '';
    const inner = `<circle cx="${x}" cy="${y}" r="${r}" fill="${color.fill}" stroke="${color.stroke}" stroke-width="2.5"/>`;

    const isFilled = d.status === 'done' || d.status === 'rescued' || d.isToday;
    const numFill  = isFilled ? '#fff' : '#475569';
    const num      = `<text x="${x}" y="${y + 5}" text-anchor="middle" font-family="var(--v2-fhead)" font-size="14" font-weight="800" fill="${numFill}">${d.dayNumber}</text>`;

    // Role hint above the node — quiet but visible (no hover required).
    const roleMeta = ROLE_GLYPH[d.role] || ROLE_GLYPH.build;
    const roleFill = d.isToday ? '#2a36c8' : '#7b8392';
    const roleY    = y - r - 10;
    const roleLabel = variant === 'full' || d.isToday
      ? `<text x="${x}" y="${roleY}" text-anchor="middle" font-family="var(--v2-fbody)" font-size="10" font-weight="${d.isToday ? '700' : '500'}" fill="${roleFill}" letter-spacing=".04em">${esc(roleMeta.label)}</text>`
      : '';

    const tipParts = [
      `Day ${d.dayNumber} · ${roleMeta.label}`,
      d.title  ? `— ${d.title}` : '',
      d.isToday ? '(today)'     : '',
    ].filter(Boolean).join(' ');
    const tooltip = `<title>${esc(tipParts)}</title>`;
    return `<g>${tooltip}${ring}${inner}${num}${roleLabel}</g>`;
  }).join('');

  // In 'full' variant, render day titles below the curve with proper wrapping.
  let labels = '';
  if (variant === 'full') {
    labels = list.map((d, i) => {
      const { x, y } = positions[i];
      const ly = y + radiusForRole(d.role, d.isToday) + 24;
      const lines = wrapTitle(d.title || '', 14, 2);
      return lines.map((line, li) =>
        `<text x="${x}" y="${ly + li * 13}" text-anchor="middle" font-family="var(--v2-fbody)" font-size="11" fill="${d.isToday ? '#2a36c8' : '#475569'}" font-weight="${d.isToday ? '600' : '400'}">${esc(line)}</text>`
      ).join('');
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

// Build a single-line week summary from roles: "2 days of setup · 3 build · 1 validate · 1 ship"
export function weekArcSummary(days) {
  const counts = {};
  (days || []).forEach((d) => {
    const r = d?.role || defaultRole(d?.dayNumber);
    counts[r] = (counts[r] || 0) + 1;
  });
  const order = ['setup', 'build', 'validate', 'recover', 'review', 'ship'];
  return order
    .filter((r) => counts[r])
    .map((r) => `${counts[r]} ${r}`)
    .join(' · ');
}

function defaultRole(n) {
  return ({ 1: 'setup', 2: 'build', 3: 'build', 4: 'validate', 5: 'build', 6: 'build', 7: 'ship' })[n] || 'build';
}

function wrapTitle(text, maxPerLine, maxLines) {
  if (!text) return [];
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (lines.length === maxLines - 1 && (cur + ' ' + w).trim().length > maxPerLine) {
      // last line, must fit
      if ((cur + ' ' + w).trim().length > maxPerLine) {
        lines.push((cur + (cur ? ' ' : '') + w).slice(0, maxPerLine - 1) + '…');
        return lines;
      }
    }
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= maxPerLine) { cur += ' ' + w; continue; }
    lines.push(cur);
    cur = w;
    if (lines.length >= maxLines) return lines.slice(0, maxLines);
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
