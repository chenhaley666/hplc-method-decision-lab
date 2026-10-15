// candidates.mjs — evaluate whole-number %B candidates against the runtime
// specification using every supplied compound line.
//
// Predicted tR(B) = t0 × (1 + 10^(a + b·B))  (RETENTION Discovery Book §8.4).
// The minimum whole-number %B is the smallest integer at which EVERY modelled
// compound is predicted to meet the last-peak specification (and every higher
// integer also does). Lowering %B lengthens the run, so the continuous
// threshold is rounded UP. Comparison uses unrounded predicted times.
import { compare } from '../rules.mjs';

export function predictTR(fit, t0, B) { return t0 * (1 + 10 ** (fit.intercept + fit.slope * B)); }

export function evaluateCandidates(lines, t0, spec, { from = 0, to = 100 } = {}) {
  // lines: [{compoundId, name, fit}] ; spec: {value, op}
  if (!lines.length) return { ok: false, reason: 'No compound line to evaluate.' };
  if (!(t0 > 0)) return { ok: false, reason: 't0 for the proposed run is not established.' };
  const rows = [];
  for (let B = from; B <= to; B++) {
    const preds = lines.map(l => ({ compoundId: l.compoundId, name: l.name, tR: predictTR(l.fit, t0, B) }));
    const top = preds.reduce((m, p) => p.tR > m.tR ? p : m);
    const cmp = compare(top.tR, spec.op, spec.value);
    rows.push({ B, preds, max: top.tR, controlling: top, feasible: !!cmp.pass });
  }
  // smallest B such that it and every higher candidate are feasible
  let minimum = null;
  for (let i = rows.length - 1; i >= 0; i--) { if (rows[i].feasible) minimum = rows[i]; else break; }
  // continuous threshold by bisection on max tR(B) − spec
  const f = B => Math.max(...lines.map(l => predictTR(l.fit, t0, B))) - spec.value;
  let threshold = null;
  if (f(from) > 0 && f(to) <= 0) { let lo = from, hi = to; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; } threshold = hi; }
  const range = l => ({ low: l.fit.xMin, high: l.fit.xMax });
  const position = minimum ? lines.map(l => ({ compoundId: l.compoundId, name: l.name, ...range(l),
    kind: minimum.B >= l.fit.xMin && minimum.B <= l.fit.xMax ? 'interpolation' : 'EXTRAPOLATION' })) : [];
  let explanation;
  if (!minimum) explanation = `No whole-number %B between ${from} and ${to} keeps every modelled compound ${spec.op} ${spec.value} min.`;
  else if (minimum.B === from) explanation = `Every candidate down to ${from} %B is predicted within the limit; the minimum is not bounded by the runtime specification in this range.`;
  else explanation = `Continuous threshold ${threshold === null ? 'n/a' : threshold.toFixed(4)} %B, rounded UP to ${minimum.B} %B because a lower %B lengthens the run. At ${minimum.B} %B the predicted latest elution is ${minimum.controlling.name} at ${minimum.max.toFixed(3)} min; at ${minimum.B - 1} %B it would be ${rows[minimum.B - 1 - from].max.toFixed(3)} min.`;
  return { ok: true, rows, minimum, threshold, position, explanation,
    controlling: minimum ? minimum.controlling : null,
    anyExtrapolation: position.some(p => p.kind === 'EXTRAPOLATION') };
}

// Intermediate %B: among candidates from the minimum up to the highest
// fitted %B, the composition that maximises the smallest predicted adjacent
// selectivity α between modelled compounds (Selectivity ED slides 16–22:
// "find the sweet spot"). Peak widths are not modelled, so this ranks spacing,
// not resolution. Needs at least two modelled compounds.
export function intermediateB(lines, t0, minimumB, upperB) {
  if (lines.length < 2) return { ok: false, reason: 'At least two modelled compounds are needed to compare spacing.' };
  if (minimumB === null || minimumB === undefined) return { ok: false, reason: 'No minimum %B to start from.' };
  let best = null;
  const table = [];
  for (let B = minimumB; B <= upperB; B++) {
    const ks = lines.map(l => ({ name: l.name, k: 10 ** (l.fit.intercept + l.fit.slope * B) })).sort((a, b) => a.k - b.k);
    let minA = Infinity, pair = null;
    for (let i = 1; i < ks.length; i++) { const a = ks[i].k / ks[i - 1].k; if (a < minA) { minA = a; pair = [ks[i - 1].name, ks[i].name]; } }
    const lastTR = t0 * (1 + ks.at(-1).k);
    table.push({ B, minAlpha: minA, pair, lastTR });
    if (!best || minA > best.minAlpha + 1e-12 || (Math.abs(minA - best.minAlpha) <= 1e-12 && B > best.B)) best = { B, minAlpha: minA, pair, lastTR };
  }
  return { ok: true, best, table,
    note: 'Predicted from the fitted lines: ranks the smallest adjacent α (spacing only; widths are not modelled). Predicted order can be wrong where lines cross. Verify by injection.' };
}
