// csv.mjs — RFC-4180-style CSV row parser (quoted fields, embedded commas,
// doubled quotes, CR/LF). Throws on an unclosed quoted field.
export function csvRows(text, { keepEmpty = false } = {}) {
  const rows = []; let row = [], field = '', quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); if (keepEmpty || row.some(x => x.trim() !== '')) rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(field); if (keepEmpty || row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}
