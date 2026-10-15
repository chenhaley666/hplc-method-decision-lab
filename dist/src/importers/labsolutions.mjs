// labsolutions.mjs — Shimadzu LabSolutions ASCII (CSV) export reader.
//
// Reads ONLY what the file states: the peak table, the detector trace, status
// traces (pump pressure, oven and room temperature), injection volume and file
// metadata. It never derives chemistry, column identity or instrument identity
// from the filename, the sample name or the method-file name. Those strings are
// kept as metadata so a user, or an explicitly selected import profile, can use
// them with stated provenance.
import { csvRows } from './csv.mjs';
import { num } from '../rules.mjs';
import { cond } from '../data-model/conditions.mjs';

export const FORMAT_ID = 'labsolutions';

export function looksLikeLabSolutions(text) {
  const head = String(text).slice(0, 4000);
  return /^﻿?\[Header\]/m.test(head) && /Application Name,\s*LabSolutions/i.test(head)
    || /\[Peak Table\(Detector [A-Z]\)\]/.test(String(text));
}

function sections(rows) {
  const out = new Map(); let cur = null;
  for (const r of rows) {
    const h = (r[0] || '').trim();
    if (/^\[.+\]$/.test(h) && r.slice(1).every(x => x.trim() === '')) { cur = h; if (!out.has(cur)) out.set(cur, []); else out.set(cur + '#dup', []); continue; }
    if (cur) out.get(cur).push(r);
  }
  return out;
}
const kv = (block, name) => { const r = (block || []).find(x => (x[0] || '').trim().toLowerCase() === name.toLowerCase()); return r ? (r[1] ?? '').trim() : null; };

function trace(block) {
  if (!block || !block.length) return null;
  const mult = num(kv(block, 'Intensity Multiplier')) ?? 1;
  const units = kv(block, 'Intensity Units') || '';
  const start = num(kv(block, 'Start Time(min)')), end = num(kv(block, 'End Time(min)'));
  const head = block.findIndex(r => (r[0] || '').trim() === 'R.Time (min)');
  if (head < 0) return { units, mult, start, end, t: [], y: [] };
  const t = [], y = [];
  for (const r of block.slice(head + 1)) { const a = num(r[0]), b = num(r[1]); if (a !== null && b !== null) { t.push(a); y.push(b * mult); } }
  return { units, mult, start, end, t, y };
}
const stats = y => y.length ? { mean: y.reduce((a, b) => a + b, 0) / y.length, min: Math.min(...y), max: Math.max(...y), n: y.length } : null;

// A status trace may begin before the separation does (oven warm-up,
// equilibration) and may run on after it. Where the exported timing allows it,
// the statistics are also computed over the ANALYSED INTERVAL — the window of
// the detector chromatogram — so warm-up before the separation is not reported
// as instability during it. The excluded points are counted, never discarded
// silently, and the window is stated. Where the timing does not allow it, the
// window is null and the caller must say that the whole trace was used.
function windowStats(tr, from, to) {
  if (!tr || !tr.t.length || from === null || from === undefined || to === null || to === undefined || !(to > from)) return null;
  const y = [], t = [];
  let before = 0, after = 0;
  for (let i = 0; i < tr.t.length; i++) {
    if (tr.t[i] < from) { before++; continue; }
    if (tr.t[i] > to) { after++; continue; }
    t.push(tr.t[i]); y.push(tr.y[i]);
  }
  const s = stats(y);
  if (!s) return null;
  // How well do the readings cover the interval? A small observed range tells
  // us nothing if there were only two readings, or if they stop a third of the
  // way through, so the gaps are measured and reported with the statistics.
  let maxGap = 0, gapAt = null;
  const span = to - from;
  const edges = [from, ...t, to];
  for (let i = 1; i < edges.length; i++) { const g = edges[i] - edges[i - 1]; if (g > maxGap) { maxGap = g; gapAt = [edges[i - 1], edges[i]]; } }
  return { ...s, from, to, excludedBefore: before, excludedAfter: after, firstT: t[0], lastT: t.at(-1),
    span, maxGap, maxGapFraction: span > 0 ? maxGap / span : null, maxGapAt: gapAt };
}

// The file states a LOCAL calendar time, not a UTC instant. Both minute and
// second precision occur in LabSolutions exports. Keep that precision and do
// not let Date normalise impossible dates (31 February) or invent a timezone.
export function parseAcquiredTimestamp(value) {
  const raw = value === null || value === undefined ? null : String(value);
  const unknown = reason => ({ raw, valid: false, local: null, precision: null,
    timezone: null, timezoneRecorded: false, components: null, reason });
  if (!raw || !raw.trim()) return unknown('No acquisition time is recorded in the file.');
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(raw.trim());
  if (!m) return unknown('Acquisition time is recorded but its format is unsupported; expected D/M/YYYY H:mm[:ss] with optional AM/PM. No timezone is stated.');
  const [, ds, ms, ys, hs, mins, secs, ap] = m;
  const day = Number(ds), month = Number(ms), year = Number(ys), minute = Number(mins);
  const second = secs === undefined ? null : Number(secs);
  let hour = Number(hs);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > (days[month - 1] || 0))
    return unknown('Acquisition time has an invalid calendar date; it was not normalised to a different day.');
  if (minute > 59 || (second !== null && second > 59) || (ap ? hour < 1 || hour > 12 : hour > 23))
    return unknown('Acquisition time has an invalid hour/minute/second or AM/PM value.');
  if (ap) { if (/pm/i.test(ap) && hour < 12) hour += 12; if (/am/i.test(ap) && hour === 12) hour = 0; }
  const pad = n => String(n).padStart(2, '0');
  const precision = second === null ? 'minute' : 'second';
  const local = `${ys}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}${second === null ? '' : `:${pad(second)}`}`;
  return { raw, valid: true, local, precision, timezone: null, timezoneRecorded: false,
    components: { year, month, day, hour, minute, second },
    reason: `Local calendar time recorded to ${precision} precision. Timezone is NOT RECORDED; no UTC conversion or missing seconds have been inferred.` };
}

// A folder explicitly named CYCLE-N is a source-folder statement. It is not
// inferred from the HPLC-number token, from chromatography or from a run name;
// it neither completes that cycle nor chooses the engine's next action.
export function sourceCycleFromPaths(paths = []) {
  const evidence = [];
  for (const { field, path } of paths) {
    if (typeof path !== 'string' || !/[\\/]/.test(path)) continue;
    const folders = path.split(/[\\/]/).filter(Boolean).slice(0, -1);
    for (const segment of folders) {
      const match = /^CYCLE[-_\s]+(\d{1,2})(?=$|\s|[(_-])/i.exec(segment.trim());
      if (match) evidence.push({ field, path, segment, cycle: Number(match[1]) });
    }
  }
  const cycles = [...new Set(evidence.map(e => e.cycle))];
  const names = { 0: 'Equipment', 1: 'Retention', 2: 'Selectivity', 3: 'Efficiency', 4: 'Gradient' };
  const cycle = cycles.length === 1 ? cycles[0] : null;
  return { status: !cycles.length ? 'not-recorded' : cycles.length > 1 ? 'conflict' : 'recorded', cycle,
    label: cycle === null ? null : `Cycle ${cycle}${names[cycle] ? ` — ${names[cycle]}` : ''}`,
    evidence, note: !cycles.length ? 'No explicit CYCLE-N source folder is recorded in the original file paths.'
      : cycles.length > 1 ? 'Original file paths name different cycles; no source cycle was selected.'
      : 'Source folder as stated in the original export, not proof of experiment purpose, completed-cycle status or the next decision route.' };
}

export function baseName(p) { return String(p || '').replace(/^.*[\\/]/, '').replace(/\.(lcd|csv|txt)$/i, ''); }

// Returns {ok, run:{measured, conditions, fileMeta, warnings}, error}
export function parseLabSolutions(text, fileName) {
  let rows;
  try { rows = csvRows(text); } catch (e) { return { ok: false, error: e.message }; }
  const sec = sections(rows);
  const peakKeys = [...sec.keys()].filter(k => /^\[Peak Table\(Detector [A-Z]\)\]/.test(k));
  if (!peakKeys.length) return { ok: false, error: 'No [Peak Table(Detector …)] section found; this is not a LabSolutions peak export.' };
  const warnings = [];
  if (peakKeys.length > 1) warnings.push(`File contains ${peakKeys.length} detector peak tables; only ${peakKeys[0]} was read.`);
  const block = sec.get(peakKeys[0]);
  const detector = /Detector ([A-Z])/.exec(peakKeys[0])[1];
  const declared = num(kv(block, '# of Peaks'));
  const hi = block.findIndex(r => (r[0] || '').trim() === 'Peak#');
  if (declared === null) return { ok: false, error: 'Peak table has no "# of Peaks" line.' };
  if (hi < 0 && declared !== 0) return { ok: false, error: 'Peak table has no "Peak#" header row.' };
  const header = hi < 0 ? [] : block[hi].map(x => x.trim());
  const col = name => header.indexOf(name);
  if (declared > 0 && col('R.Time') < 0) return { ok: false, error: 'Peak table lacks the required R.Time column.' };
  const peaks = [];
  for (const r of hi < 0 ? [] : block.slice(hi + 1)) {
    if (!/^\d+$/.test((r[0] || '').trim())) continue;
    const g = n => col(n) < 0 ? null : num(r[col(n)]);
    peaks.push({ no: Number(r[0]), tR: g('R.Time'), area: g('Area'), height: g('Height'),
      plates: g('Plate #'), exportedRs: g('Resolution'), exportedK: g("k'"), tailing: g('Tailing'),
      widthBase: null, widthHalf: null,
      mark: col('Mark') < 0 ? '' : (r[col('Mark')] || '').trim(), fileName: col('Name') < 0 ? '' : (r[col('Name')] || '').trim() });
  }
  if (peaks.length !== declared) return { ok: false, error: `Peak count mismatch: header declares ${declared}, ${peaks.length} peak rows read.` };
  if (peaks.some(p => p.tR === null)) return { ok: false, error: 'A peak lacks a numeric retention time.' };
  for (let i = 1; i < peaks.length; i++) if (!(peaks[i].tR > peaks[i - 1].tR)) return { ok: false, error: `Retention times are not strictly increasing at peak ${peaks[i].no}.` };
  if (col('Plate #') < 0) warnings.push('No "Plate #" column: plate-derived resolution is unavailable for this file.');
  if (col('Resolution') < 0) warnings.push('No "Resolution" column: exported resolution is unavailable for this file.');

  const chromKey = [...sec.keys()].find(k => k.startsWith(`[LC Chromatogram(Detector ${detector}`)) || [...sec.keys()].find(k => k.startsWith('[LC Chromatogram('));
  const tr = chromKey ? trace(sec.get(chromKey)) : null;
  const pres = trace(sec.get('[LC Status Trace(Pump A Pressure)]'));
  const oven = trace(sec.get('[LC Status Trace(Oven Temp.)]'));
  const room = trace(sec.get('[LC Status Trace(Room Temp.)]'));
  const ps = pres ? stats(pres.y) : null, os = oven ? stats(oven.y) : null, rs = room ? stats(room.y) : null;

  const H = sec.get('[Header]'), S = sec.get('[Sample Information]'), O = sec.get('[Original Files]'), C = sec.get('[Configuration]');
  const acquiredTimestamp = parseAcquiredTimestamp(kv(S, 'Acquired'));
  const fileMeta = {
    application: kv(H, 'Application Name'), version: kv(H, 'Version'),
    dataFileName: kv(H, 'Data File Name'), sampleName: kv(S, 'Sample Name'), sampleId: kv(S, 'Sample ID'),
    acquired: kv(S, 'Acquired'), acquiredIso: acquiredTimestamp.local,
    acquiredPrecision: acquiredTimestamp.precision, acquiredTimezone: null, acquiredTimestamp,
    originalDataFileName: kv(O, 'Data File'),
    methodFileName: kv(O, 'Method File'), instrumentName: kv(C, 'Instrument Name'),
    vial: kv(S, 'Vial#'), detector: `Detector ${detector}`,
    chromatogramChannel: chromKey || null,
  };
  const fBase = baseName(fileName), sBase = baseName(fileMeta.sampleName), dBase = baseName(fileMeta.dataFileName);
  const stripCopy = s => s.replace(/\s*\(\d+\)$/, '');
  fileMeta.nameSources = { fileName: { value: fileName || null, base: fBase, source: 'uploaded filename' },
    sampleName: { value: fileMeta.sampleName, base: sBase, source: '[Sample Information] Sample Name' },
    dataFileName: { value: fileMeta.dataFileName, base: dBase, source: '[Header] Data File Name' } };
  fileMeta.nameConflicts = [];
  if (fileMeta.sampleName && stripCopy(fBase) !== stripCopy(sBase)) {
    fileMeta.nameConflicts.push({ left: 'fileName', right: 'sampleName', leftValue: fileName || null, rightValue: fileMeta.sampleName,
      leftBase: fBase, rightBase: sBase, kind: 'different-recorded-names', resolved: false });
    warnings.push(`NAME CONFLICT: the file is named "${fBase}" but its internal Sample Name is "${sBase}". Neither name is used to set conditions unless an import profile is explicitly selected; select the source and record why it describes this injection. Original strings are kept unchanged.`);
  }
  if (fileMeta.dataFileName && stripCopy(dBase) !== stripCopy(sBase) && fileMeta.sampleName) {
    fileMeta.nameConflicts.push({ left: 'dataFileName', right: 'sampleName', leftValue: fileMeta.dataFileName, rightValue: fileMeta.sampleName,
      leftBase: dBase, rightBase: sBase, kind: 'different-recorded-names', resolved: false });
    warnings.push(`NAME CONFLICT: internal Data File Name "${dBase}" differs from Sample Name "${sBase}".`);
  }
  fileMeta.sourceCycle = sourceCycleFromPaths([{ field: '[Header] Data File Name', path: fileMeta.dataFileName },
    { field: '[Original Files] Data File', path: fileMeta.originalDataFileName },
    { field: '[Original Files] Method File', path: fileMeta.methodFileName }]);
  if (fileMeta.sourceCycle.status === 'conflict') warnings.push(`SOURCE CYCLE CONFLICT: ${fileMeta.sourceCycle.note}`);
  if (fileMeta.acquired && !acquiredTimestamp.valid) warnings.push(`ACQUISITION TIME NOT USED FOR ORDERING: ${acquiredTimestamp.reason} Original value: "${fileMeta.acquired}".`);
  if (fileMeta.methodFileName) warnings.push(`Method file recorded as "${baseName(fileMeta.methodFileName)}". Method-file names are shown for reference only and are never used to set conditions.`);

  const injV = num(kv(S, 'Injection Volume'));
  const conditions = {
    injVolume: cond(injV, 'file', { unit: 'µL', note: 'From [Sample Information] Injection Volume; the export does not state the unit (µL assumed as the LabSolutions convention).' }),
    acquisitionTime: cond(tr && tr.end !== null ? tr.end : null, 'file', { unit: 'min', note: `End time of ${chromKey || 'chromatogram'} block.` }),
  };
  const measured = {
    peaks,
    trace: tr && tr.t.length ? { t: tr.t, y: tr.y, unit: tr.units || 'intensity', channel: chromKey } : null,
    pressure: ps ? { max: ps.max, mean: ps.mean, min: ps.min, unit: pres.units || 'unknown', source: 'file: [LC Status Trace(Pump A Pressure)] × Intensity Multiplier', series: {t:[...pres.t],y:[...pres.y]} } : null,
    oven: os ? { ...os, unit: oven.units || 'C', source: 'file: [LC Status Trace(Oven Temp.)] (oven sensor)',
      span: oven.t.length ? { from: oven.t[0], to: oven.t.at(-1) } : null,
      window: windowStats(oven, tr?.t?.length ? tr.t[0] : tr?.start ?? null, tr?.t?.length ? tr.t.at(-1) : tr?.end ?? null),
      windowSource: tr ? `the detector chromatogram window of ${chromKey || 'the trace'}` : null,
      series: downsample(oven.t, oven.y, 300) } : null,
    room: rs ? { ...rs, unit: room.units || 'C', source: 'file: [LC Status Trace(Room Temp.)]' } : null,
    acquisitionEnd: tr ? tr.end : null,
  };
  if (!measured.trace) warnings.push('No chromatogram trace in the file; overlays are unavailable for this run.');
  if (!measured.pressure) warnings.push('No pump-pressure trace in the file; the pressure check needs a user-entered value.');
  return { ok: true, run: { measured, conditions, fileMeta, warnings } };
}

function downsample(t, y, n) {
  if (t.length <= n) return { t: [...t], y: [...y] };
  const step = Math.ceil(t.length / n), ot = [], oy = [];
  for (let i = 0; i < t.length; i += step) { ot.push(t[i]); oy.push(y[i]); }
  return { t: ot, y: oy };
}
