// charts.mjs — dependency-free SVG charts with axes, units, legends, zoom and
// visibility. Charts draw only data they are given: a run with no trace is
// listed as "no trace" and never drawn as a fabricated line.
import { s, h } from './dom.mjs';

export const PALETTE = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22'];
export const DASHES = ['', '6 3', '2 2', '8 3 2 3'];
export const styleFor = i => ({ color: PALETTE[i % PALETTE.length], dash: DASHES[Math.floor(i / PALETTE.length) % DASHES.length] });

function ticks(min, max, n = 6) {
  if (!(max > min)) return [min];
  const raw = (max - min) / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= raw) || raw;
  const out = []; for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
const tickLabel = v => Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);

// series: [{id,label,color,dash,points:[[x,y]],kind:'line'|'points',offset}]
export function lineChart({ series, xLabel, yLabel, width = 760, height = 320, xRange = null, yRange = null, markers = [], bands = [], title = '', onBrush = null, testid = '' }) {
  const m = { l: 62, r: 14, t: title ? 26 : 12, b: 44 };
  const W = width - m.l - m.r, H = height - m.t - m.b;
  const all = series.flatMap(se => se.points);
  let [x0, x1] = xRange && Number.isFinite(xRange[0]) && Number.isFinite(xRange[1]) ? xRange : [Math.min(...all.map(p => p[0])), Math.max(...all.map(p => p[0]))];
  const inX = all.filter(p => p[0] >= x0 && p[0] <= x1);
  // A linked time window may lie outside a shorter trace's acquisition.
  // Retain a finite source-based scale even when that panel has no samples
  // inside the window; the caller reports the empty window explicitly.
  const yPoints = inX.length ? inX : all;
  let [y0, y1] = yRange || [Math.min(...yPoints.map(p => p[1])), Math.max(...yPoints.map(p => p[1]))];
  if (!all.length) { x0 = 0; x1 = 1; y0 = 0; y1 = 1; }
  if (!(x1 > x0)) { x0 -= 0.5; x1 += 0.5; }
  if (!(y1 > y0)) { y0 -= 0.5; y1 += 0.5; }
  const pad = (y1 - y0) * 0.06; y0 -= pad; y1 += pad;
  const X = x => m.l + (x - x0) / (x1 - x0) * W, Y = y => m.t + H - (y - y0) / (y1 - y0) * H;
  const clipId = 'c' + Math.random().toString(36).slice(2, 8);
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'img', 'aria-label': title || yLabel, 'data-testid': testid || null });
  svg.appendChild(s('defs', {}, s('clipPath', { id: clipId }, s('rect', { x: m.l, y: m.t, width: W, height: H }))));
  if (title) svg.appendChild(s('text', { x: m.l, y: 16, class: 'ctitle' }, title));
  for (const b of bands) svg.appendChild(s('rect', { x: X(Math.max(b.x1, x0)), y: m.t, width: Math.max(0, X(Math.min(b.x2, x1)) - X(Math.max(b.x1, x0))), height: H, fill: b.color || '#f5c542', opacity: 0.25 }));
  const g = s('g', { class: 'axes' });
  g.appendChild(s('line', { x1: m.l, y1: m.t + H, x2: m.l + W, y2: m.t + H, stroke: 'currentColor' }));
  g.appendChild(s('line', { x1: m.l, y1: m.t, x2: m.l, y2: m.t + H, stroke: 'currentColor' }));
  for (const t of ticks(x0, x1)) { g.appendChild(s('line', { x1: X(t), y1: m.t + H, x2: X(t), y2: m.t + H + 4, stroke: 'currentColor' })); g.appendChild(s('text', { x: X(t), y: m.t + H + 16, 'text-anchor': 'middle', class: 'tick' }, tickLabel(t))); }
  for (const t of ticks(y0, y1, 5)) { g.appendChild(s('line', { x1: m.l - 4, y1: Y(t), x2: m.l, y2: Y(t), stroke: 'currentColor' })); g.appendChild(s('text', { x: m.l - 6, y: Y(t) + 4, 'text-anchor': 'end', class: 'tick' }, tickLabel(t))); }
  g.appendChild(s('text', { x: m.l + W / 2, y: height - 6, 'text-anchor': 'middle', class: 'alabel' }, xLabel));
  g.appendChild(s('text', { x: 14, y: m.t + H / 2, 'text-anchor': 'middle', class: 'alabel', transform: `rotate(-90 14 ${m.t + H / 2})` }, yLabel));
  svg.appendChild(g);
  const plot = s('g', { 'clip-path': `url(#${clipId})` });
  for (const se of series) {
    if (!se.points.length) continue;
    if (se.kind === 'points') for (const p of se.points) plot.appendChild(s('circle', { cx: X(p[0]), cy: Y(p[1]), r: 3.5, fill: se.color, 'data-series': se.id }, s('title', {}, `${se.label}: (${p[0]}, ${Number(p[1]).toFixed(4)})`)));
    else {
      const pts = se.points.filter((p, i, arr) => (p[0] >= x0 - (x1 - x0) * 0.02 && p[0] <= x1 + (x1 - x0) * 0.02) || (arr[i + 1] && arr[i + 1][0] >= x0) || (arr[i - 1] && arr[i - 1][0] <= x1));
      const step = Math.max(1, Math.ceil(pts.length / 1500));
      const d = pts.filter((_, i) => i % step === 0).map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
      plot.appendChild(s('path', { d, fill: 'none', stroke: se.color, 'stroke-width': se.width || 1.3, 'stroke-dasharray': se.dash || null, 'data-series': se.id }));
    }
  }
  for (const mk of markers) {
    const x = X(mk.x);
    plot.appendChild(s('line', { x1: x, y1: m.t, x2: x, y2: m.t + H, stroke: mk.color || '#555', 'stroke-dasharray': '3 3' }));
    if (mk.label) plot.appendChild(s('text', { x: x + 3, y: m.t + 12 + (mk.row || 0) * 12, class: 'mlabel', fill: mk.color || '#555' }, mk.label));
  }
  svg.appendChild(plot);
  if (onBrush) {
    const rect = s('rect', { x: m.l, y: m.t, width: W, height: H, fill: 'transparent', class: 'brush', 'data-testid': testid ? testid + '-brush' : null });
    const sel = s('rect', { x: 0, y: m.t, width: 0, height: H, fill: '#4a90d9', opacity: 0.18, 'pointer-events': 'none' });
    let start = null;
    const toX = ev => { const r = svg.getBoundingClientRect(); return (ev.clientX - r.left) / r.width * width; };
    rect.addEventListener('mousedown', ev => { start = toX(ev); sel.setAttribute('x', start); sel.setAttribute('width', 0); });
    rect.addEventListener('mousemove', ev => { if (start === null) return; const x = toX(ev); sel.setAttribute('x', Math.min(start, x)); sel.setAttribute('width', Math.abs(x - start)); });
    const end = ev => { if (start === null) return; const x = toX(ev); const a = Math.min(start, x), b = Math.max(start, x); start = null; sel.setAttribute('width', 0);
      if (b - a > 6) { const inv = px => x0 + (px - m.l) / W * (x1 - x0); onBrush([inv(a), inv(b)]); } };
    rect.addEventListener('mouseup', end); rect.addEventListener('mouseleave', () => { start = null; sel.setAttribute('width', 0); });
    svg.appendChild(sel); svg.appendChild(rect);
  }
  return svg;
}

export function legend(items, onToggle) {
  return h('div', { class: 'legend' }, items.map(it => h('label', { class: 'leg','data-series-id':it.id },
    onToggle ? h('input', { type: 'checkbox', checked: !it.hidden, onchange: e => onToggle(it.id, !e.target.checked), 'aria-label': `show ${it.label}` }) : null,
    s('svg',{class:'legend-swatch',width:28,height:10,viewBox:'0 0 28 10','aria-hidden':'true'},s('line',{x1:1,y1:5,x2:27,y2:5,stroke:it.color,'stroke-width':3,'stroke-dasharray':it.dash||null})), ' ', it.label, it.note ? h('span', { class: 'hint' }, ` — ${it.note}`) : null)));
}
