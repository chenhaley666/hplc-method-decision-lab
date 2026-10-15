// rules.mjs — dataset-independent calculations and comparison rules.
//
// Nothing in this file knows about any particular dataset, instrument, column,
// file-naming convention or teaching preset. Every function is pure: it takes
// plain values and returns plain values. Functions that can fail return a
// structured result {ok:false, reason} instead of inventing a number.

export const LOG_CONVENTION = 'log means log10 (base-10 logarithm) throughout. K = 10^(log K).';

// ---------------------------------------------------------------- numbers
export function num(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim();
  if (s === '') return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
export function positive(value) { const n = num(value); return n !== null && n > 0 ? n : null; }
export const isKnown = v => !(v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v)));

// ---------------------------------------------------------------- comparisons
// Specifications carry their own comparison operator so the operator is shown
// and applied, never assumed. Comparison is ALWAYS on the unrounded value.
export const OPERATORS = {
  '<': { label: '<', test: (a, b) => a < b, words: 'strictly less than' },
  '<=': { label: '≤', test: (a, b) => a <= b, words: 'less than or equal to' },
  '>': { label: '>', test: (a, b) => a > b, words: 'strictly greater than' },
  '>=': { label: '≥', test: (a, b) => a >= b, words: 'greater than or equal to' },
  '=': { label: '=', test: (a, b) => a === b, words: 'equal to' },
};
export function compare(value, op, target) {
  const v = num(value), t = num(target);
  const o = OPERATORS[op];
  if (!o) return { known: false, pass: null, reason: `Unknown comparison operator "${op}".` };
  if (v === null) return { known: false, pass: null, reason: 'Value not available.' };
  if (t === null) return { known: false, pass: null, reason: 'Target not set.' };
  return { known: true, pass: o.test(v, t), value: v, target: t, op, opLabel: o.label,
    statement: `${v} ${o.test(v, t) ? 'meets' : 'does not meet'} ${o.label} ${t} (unrounded comparison)` };
}

// A specification the user has edited is checked before it is applied. An
// impossible specification is refused with the offending field named: applying
// it would produce a decision that looks authoritative and means nothing.
// What each specification admits (the quantity, not a course rule):
//   peakCount  a whole number ≥ 0 of peaks
//   lastPeak   a retention time > 0 min
//   minRs      a resolution ≥ 0
//   pressure   a back-pressure > 0 psi
export const SPEC_DOMAINS = {
  peakCount: { label: 'peak count', unit: '', test: v => Number.isInteger(v) && v >= 0, admits: 'a whole number of peaks, 0 or more' },
  lastPeak: { label: 'latest relevant peak', unit: 'min', test: v => v > 0, admits: 'a retention time greater than 0 min' },
  minRs: { label: 'lowest adjacent-pair resolution', unit: '', test: v => v >= 0, admits: 'a resolution of 0 or more' },
  pressure: { label: 'back-pressure', unit: 'psi', test: v => v > 0, admits: 'a back-pressure greater than 0 psi' },
};
export function validateSpecs(specs) {
  const problems = [];
  for (const [key, d] of Object.entries(SPEC_DOMAINS)) {
    const sp = specs?.[key];
    if (!sp || typeof sp !== 'object') { problems.push({ key, text: `The ${d.label} specification is not set.` }); continue; }
    if (!OPERATORS[sp.op]) { problems.push({ key, text: `The ${d.label} specification uses an unknown comparison operator "${sp.op === undefined ? 'none' : sp.op}". Admissible operators: ${Object.keys(OPERATORS).map(o => OPERATORS[o].label).join(' ')}.` }); }
    const v = num(sp.value);
    if (v === null) { problems.push({ key, text: `The ${d.label} specification value "${sp.value === undefined || sp.value === null ? 'empty' : sp.value}" is not a number. It admits ${d.admits}.` }); continue; }
    if (!d.test(v)) problems.push({ key, text: `The ${d.label} specification is ${v}${d.unit ? ' ' + d.unit : ''}, which is outside what the quantity admits (${d.admits}).` });
  }
  return { ok: problems.length === 0, problems };
}

// Pressure units. A limit recorded in bar or MPa is NOT a number of psi, and
// comparing it as one would silently misjudge the limit by an order of
// magnitude. An unrecognised unit is refused rather than assumed.
export const PRESSURE_UNITS = { psi: 1, bar: 14.503773773, mpa: 145.03773773, kpa: 0.14503773773 };
export function toPsi(value, unit) {
  const v = num(value);
  if (v === null) return { ok: false, reason: 'the value is not a number' };
  const key = String(unit ?? '').trim().toLowerCase();
  if (key === '') return { ok: false, reason: 'no unit is recorded with the value, so it cannot be compared with a pressure in psi' };
  const f = PRESSURE_UNITS[key];
  if (!f) return { ok: false, reason: `the unit "${unit}" is not a pressure unit this tool recognises (psi, bar, MPa, kPa)` };
  return { ok: true, psi: v * f, unit: key, factor: f };
}

// The tool's own configurable policies. They are not course rules, so the one
// thing the tool must do is refuse a setting that cannot mean anything, rather
// than produce a confident decision from it.
export const POLICY_DOMAINS = {
  runtimeApproachingFraction: { label: 'run-time "approaching" fraction', admits: 'a fraction strictly between 0 and 1 (0.75 by default)', test: v => Number.isFinite(v) && v > 0 && v < 1, optional: true },
  tempStabilityTolerance: { label: 'oven stability tolerance', unit: '°C', admits: 'a positive number of °C', test: v => Number.isFinite(v) && v > 0 },
  tempMatchTolerance: { label: 'temperature comparability tolerance', unit: '°C', admits: 'a positive number of °C', test: v => Number.isFinite(v) && v > 0 },
  retentionStep: { label: '%B ladder step', unit: '%', admits: 'a positive number of percentage points', test: v => Number.isFinite(v) && v > 0 },
  minFitPoints: { label: 'minimum points per compound fit', admits: 'a whole number of 2 or more (with two points R² is always 1)', test: v => Number.isInteger(v) && v >= 2 },
  ovenMinReadings: { label: 'minimum oven readings inside the analysed interval', admits: 'a whole number of 2 or more', test: v => Number.isInteger(v) && v >= 2, optional: true },
  ovenMaxGapFraction: { label: 'largest admissible gap between oven readings', admits: 'a fraction strictly between 0 and 1 of the analysed interval', test: v => Number.isFinite(v) && v > 0 && v < 1, optional: true },
};
export function validatePolicies(settings) {
  const problems = [];
  for (const [key, d] of Object.entries(POLICY_DOMAINS)) {
    const v = settings?.[key];
    if (v === undefined || v === null) { if (!d.optional) problems.push({ key, text: `The ${d.label} is not set. It admits ${d.admits}.` }); continue; }
    if (!d.test(typeof v === 'string' ? num(v) : v)) problems.push({ key, text: `The ${d.label} is ${JSON.stringify(v)}, which cannot be applied: it admits ${d.admits}.` });
  }
  const steps = settings?.temperatureSteps;
  if (!Array.isArray(steps) || steps.length !== 2) problems.push({ key: 'temperatureSteps', text: `The temperature steps must be exactly two values; ${Array.isArray(steps) ? `${steps.length} were given` : 'none were given'}.` });
  else if (!steps.every(x => Number.isFinite(num(x)))) problems.push({ key: 'temperatureSteps', text: `The temperature steps ${JSON.stringify(steps)} are not both numbers.` });
  else if (!(num(steps[0]) < num(steps[1]))) problems.push({ key: 'temperatureSteps', text: `The temperature steps ${steps[0]} and ${steps[1]} °C are not in increasing order with two distinct values, so "temperature 1" and "temperature 2" would not be two different experiments.` });
  const sol = settings?.availableSolvents;
  if (!Array.isArray(sol) || !sol.length) problems.push({ key: 'availableSolvents', text: 'No organic solvent is listed as available, so no solvent step can be planned.' });
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------- retention
// K = (tR − t0) / t0. Both in minutes; K is dimensionless.
export function retentionFactor(tR, t0) {
  const t = num(tR), z = positive(t0);
  if (t === null) return { ok: false, reason: 'Retention time missing.' };
  if (z === null) return { ok: false, reason: 't0 is not established (missing or not positive).' };
  const k = (t - z) / z;
  if (!(k > 0)) return { ok: false, k, reason: `K = (${t} − ${z}) / ${z} = ${k.toFixed(4)} is not positive; log K is undefined. The peak elutes at or before t0.` };
  return { ok: true, k, logK: Math.log10(k) };
}
export const tRFromK = (k, t0) => t0 * (1 + k);

// Ordinary least squares y = a + b x, with R², residuals and fitted range.
export function linearFit(points) {
  const pts = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  const xs = [...new Set(pts.map(p => p.x))];
  if (n < 2 || xs.length < 2) return { ok: false, n, reason: `A straight line needs at least two distinct %B values; ${xs.length} available.` };
  const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2; }
  const b = sxy / sxx, a = my - b * mx;
  const residuals = pts.map(p => ({ ...p, fitted: a + b * p.x, residual: p.y - (a + b * p.x) }));
  const sse = residuals.reduce((s, r) => s + r.residual ** 2, 0);
  const r2 = syy === 0 ? null : 1 - sse / syy;
  return { ok: true, n, distinctX: xs.length, intercept: a, slope: b, r2, sse,
    rmse: Math.sqrt(sse / n), residuals,
    xMin: Math.min(...xs), xMax: Math.max(...xs),
    maxAbsResidual: Math.max(...residuals.map(r => Math.abs(r.residual))) };
}

// ---------------------------------------------------------------- resolution
// RESOLUTION Discovery Book §4.2: Rs = 2 (tR2 − tR1) / (Wb1 + Wb2)  (base widths)
// RESOLUTION Discovery Book §4.4: Rs = 1.18 (tR2 − tR1) / (Wh1 + Wh2) (half-height widths, USP ⟨621⟩)
// Plate-derived: for an ideal (Gaussian) peak N = 16 (tR / Wb)², so Wb = 4 tR / √N.
// This is an IDEAL-SHAPE assumption: Wb = 1.7 Wh stops holding once a peak tails
// (RESOLUTION Discovery Book §3.3).
export const RS_BASES = {
  'base-width': { label: 'Base width (Wb), Rs = 2Δt / (Wb1 + Wb2)', needs: 'widthBase', source: 'RESOLUTION Discovery Book §4.2' },
  'half-width': { label: 'Half-height width (Wh), Rs = 1.18Δt / (Wh1 + Wh2)', needs: 'widthHalf', source: 'RESOLUTION Discovery Book §4.4 (USP ⟨621⟩ form)' },
  'plate-gaussian': { label: 'Gaussian-equivalent base width from exported plate number, Wb = 4tR/√N, then Rs = 2Δt/(Wb1+Wb2)', needs: 'plates', source: 'RESOLUTION Discovery Book §4.2 with N = 16(tR/Wb)²; ideal peak shape assumed' },
  'exported': { label: 'Instrument-exported resolution (as reported for each peak against the previous peak)', needs: 'exportedRs', source: 'Instrument export; RESOLUTION Discovery Book §3.4 states the software used in this unit calculates Rs from base width' },
};
export function pairRs(p, q, basis) {
  const dt = num(q.tR) - num(p.tR);
  if (!(dt > 0)) return { ok: false, reason: 'Retention times are not increasing.' };
  if (basis === 'base-width') {
    const w1 = positive(p.widthBase), w2 = positive(q.widthBase);
    if (w1 === null || w2 === null) return { ok: false, reason: 'Base width missing for one of the two peaks.' };
    return { ok: true, rs: 2 * dt / (w1 + w2), formula: `2 × ${dt.toFixed(4)} / (${w1} + ${w2})` };
  }
  if (basis === 'half-width') {
    const w1 = positive(p.widthHalf), w2 = positive(q.widthHalf);
    if (w1 === null || w2 === null) return { ok: false, reason: 'Half-height width missing for one of the two peaks.' };
    return { ok: true, rs: 1.18 * dt / (w1 + w2), formula: `1.18 × ${dt.toFixed(4)} / (${w1} + ${w2})` };
  }
  if (basis === 'plate-gaussian') {
    const n1 = positive(p.plates), n2 = positive(q.plates);
    if (n1 === null || n2 === null) return { ok: false, reason: 'Plate number missing or zero for one of the two peaks (an exported 0 means "not calculated", not zero).' };
    const w1 = 4 * num(p.tR) / Math.sqrt(n1), w2 = 4 * num(q.tR) / Math.sqrt(n2);
    return { ok: true, rs: 2 * dt / (w1 + w2), formula: `2 × ${dt.toFixed(4)} / (${w1.toFixed(4)} + ${w2.toFixed(4)}) [Wb = 4tR/√N]` };
  }
  if (basis === 'exported') {
    if(p.originalIndex!==undefined && q.originalIndex!==p.originalIndex+1) return {ok:false,reason:'Filtering made a new adjacent pair. Exported Rs belongs to the original previous peak; supply widths or use a documented recalculation basis.'};
    const r = positive(q.exportedRs);
    if (r === null) return { ok: false, reason: 'No exported resolution for the later peak (an exported 0 means "not calculated").' };
    return { ok: true, rs: r, formula: 'exported value' };
  }
  return { ok: false, reason: `Unknown resolution basis "${basis}".` };
}
// All adjacent pairs; the chromatogram's resolution is the LOWEST adjacent pair
// (RESOLUTION Discovery Book §5.5). The closest pair is not assumed to be the worst.
export function adjacentResolutions(peaks, basis) {
  const pairs = [];
  for (let i = 1; i < peaks.length; i++) {
    const r = pairRs(peaks[i - 1], peaks[i], basis);
    pairs.push({ from: peaks[i - 1].no, to: peaks[i].no, tR1: peaks[i - 1].tR, tR2: peaks[i].tR, gap: num(peaks[i].tR) - num(peaks[i - 1].tR), ...r });
  }
  const missing = pairs.filter(p => !p.ok);
  const valid = pairs.filter(p => p.ok);
  let limiting = null;
  if (pairs.length && !missing.length) limiting = valid.reduce((m, p) => (p.rs < m.rs ? p : m));
  const closest = pairs.length ? pairs.reduce((m, p) => (p.gap < m.gap ? p : m)) : null;
  return { basis, pairs, complete: pairs.length > 0 && !missing.length, missing,
    minRs: limiting ? limiting.rs : null, limiting,
    lowestKnown: valid.length ? valid.reduce((m, p) => (p.rs < m.rs ? p : m)) : null,
    closest, closestIsLimiting: !!(limiting && closest && limiting.from === closest.from) };
}

// α = K(later) / K(earlier) for a retained pair (SELECTIVITY Discovery Book §2.2).
export function selectivityFactor(k1, k2) {
  const a = positive(k1), b = positive(k2);
  if (a === null || b === null) return { ok: false, reason: 'Both K values must be positive.' };
  return { ok: true, alpha: b / a };
}

// ---------------------------------------------------------------- t0 estimate
// Equipment LAB deck slide 48: column volume = π r² L × 0.68 / 1000 (mL), the
// 0.68 factor being the mobile-phase (interstitial) fraction given in that deck.
// t0 = volume / flow (RETENTION Discovery Book §5.2).
export const T0_ESTIMATE_FACTOR = 0.68;
export function columnVolumeT0(lengthMm, idMm, flowMlMin, factor = T0_ESTIMATE_FACTOR) {
  const L = positive(lengthMm), d = positive(idMm), F = positive(flowMlMin);
  const missing = [];
  if (L === null) missing.push('column length'); if (d === null) missing.push('internal diameter'); if (F === null) missing.push('flow rate');
  if (missing.length) return { ok: false, reason: `Cannot estimate t0: ${missing.join(', ')} not known.` };
  const vol = Math.PI * (d / 2) ** 2 * L * factor / 1000;
  return { ok: true, t0: vol / F, volume: vol, formula: `π × (${d}/2)² × ${L} × ${factor} / 1000 = ${vol.toFixed(3)} mL; t0 = ${vol.toFixed(3)} / ${F} = ${(vol / F).toFixed(3)} min` };
}

// ---------------------------------------------------------------- temperature rule of thumb
// SELECTIVITY Discovery Book §2.6 and Selectivity ED slides 27–28: tR falls by
// about 1–2 % per 1 °C rise. Reported only as a bracket.
export function temperatureBracket(tR, fromC, toC) {
  const t = positive(tR), a = num(fromC), b = num(toC);
  if (t === null) return { ok: false, reason: 'No measured retention time to scale.' };
  if (a === null) return { ok: false, reason: 'The current column temperature is not known, so no temperature prediction is made. (An unknown temperature is not assumed to be 20 or 25 °C.)' };
  if (b === null) return { ok: false, reason: 'No target temperature.' };
  const dT = b - a, hi = t * (1 - 0.01 * dT), lo = t * (1 - 0.02 * dT);
  if (!(hi > 0 && lo > 0)) return { ok: false, reason: `ΔT ${dT} °C takes the rule of thumb outside its meaningful range.` };
  return { ok: true, dT, min: Math.min(hi, lo), max: Math.max(hi, lo) };
}

// ---------------------------------------------------------------- pressure scaling
// Darcy's law for a packed bed: ΔP ∝ u·η·L/dp² with linear velocity u ∝ F/ID².
// At unchanged mobile phase, temperature and packing:
//   ΔP2/ΔP1 = (F2/F1)(L2/L1)(dp1/dp2)²(ID1/ID2)².
// (v13 used (ID1/ID2)⁴, the open-tube form; corrected in v14.)
// An estimate from one measured point — never clearance to inject.
export function pressureScale(measuredPsi, from, to) {
  const P = positive(measuredPsi);
  if (P === null) return { ok: false, reason: 'No measured back-pressure to scale from.' };
  const names = { flow: 'flow rate', length: 'column length', dp: 'particle size', id: 'internal diameter' };
  for (const k of Object.keys(names)) if (positive(from[k]) === null || positive(to[k]) === null)
    return { ok: false, reason: `Cannot scale: ${names[k]} not known for both the measured and the proposed run.` };
  const est = P * (to.flow / from.flow) * (to.length / from.length) * (from.dp / to.dp) ** 2 * (from.id / to.id) ** 2;
  return { ok: true, estimate: est,
    formula: `${P.toFixed(0)} × (${to.flow}/${from.flow}) × (${to.length}/${from.length}) × (${from.dp}/${to.dp})² × (${from.id}/${to.id})² = ${est.toFixed(0)} psi` };
}

// ---------------------------------------------------------------- formatting
export function fmt(v, dp = 3) { const n = num(v); return n === null ? '—' : n.toFixed(dp); }
