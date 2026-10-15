// dom.mjs — minimal safe DOM builders. Imported strings are only ever inserted
// as text nodes or attribute values; innerHTML is never used with data.
const SVGNS = 'http://www.w3.org/2000/svg';

function apply(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}
function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  apply(el, attrs); append(el, kids); return el;
}
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, String(v));
  }
  for (const c of kids.flat(Infinity)) { if (c === null || c === undefined || c === false) continue; el.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); }
  return el;
}
export const f = (v, dp = 3) => (v === null || v === undefined || !Number.isFinite(Number(v))) ? '—' : Number(v).toFixed(dp);
export const chip = (text, kind = '') => h('span', { class: `chip ${kind}` }, text);
// This verdict concerns evidence for one comparison step, not whether the
// chromatogram or its measured numerical criteria are valid experimental data.
export function comparisonVerdictLabel(record) {
  if (record?.unsafePressure) return 'UNSAFE ATTEMPT — NOT COUNTED';
  if (record?.verdict === 'invalid') return 'NOT COUNTED FOR THIS STEP';
  return String(record?.verdict || 'not established').toUpperCase();
}
export function section(title, ...kids) { return h('section', { class: 'card' }, h('h3', title), ...kids); }
export function details(summary, open, ...kids) { const d = h('details', { class: 'fold' }, h('summary', summary), ...kids); if (open) d.open = true; return d; }
export function table(headers, rows, attrs = {}) {
  return h('div', { class: 'table-wrap' }, h('table', attrs, h('thead', h('tr', headers.map(x => h('th', x)))), h('tbody', rows)));
}
export function field(label, input, hint) { return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null); }
export function sourceList(sources) {
  if (!sources || !sources.length) return null;
  return h('ul', { class: 'sources' }, sources.map(c => h('li', chip(c.kind, `src-${c.kind}`), ' ',
    /^https:\/\//.test(c.url || '') ? h('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, c.title) : c.title,
    c.loc ? `, ${c.loc}` : '', c.checkedAt ? ` (checked ${c.checkedAt})` : '')));
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
