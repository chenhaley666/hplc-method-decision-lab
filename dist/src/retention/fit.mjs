// fit.mjs — one log K vs %B line PER IDENTIFIED COMPOUND.
//
// Points come only from CONFIRMED peak-to-compound assignments in eligible,
// comparable runs. Co-eluted peaks and peaks with K ≤ 0 are excluded with a
// reason. No point is ever removed to improve a fit: every eligible point is
// used. log means log10.
import { retentionFactor, linearFit, compare } from '../rules.mjs';
import { confirmedPeakOf, peakStatus } from '../alignment/correspondence.mjs';
import { R2_POLICIES } from '../presets/bps2032.mjs';
import { peakExcluded } from '../data-model/peak-filter.mjs';

export function activeR2Policy(settings) {
  const p = settings.r2Policy || { mode: 'none' };
  if (p.mode === 'none') return { mode: 'none', target: null, op: '>=', label: R2_POLICIES.none.label, judged: false };
  if (p.mode === 'project') return { mode: 'project', target: 0.995, op: '>=', decimals:3, label: R2_POLICIES.project.label, judged: true };
  if (p.mode === 'custom' && Number.isFinite(p.target)) return { mode: 'custom', target: p.target, op: p.op || '>=', label: `R² ${p.op || '>='} ${p.target} — user criterion`, judged: true };
  return { mode: 'none', target: null, op: '>=', label: 'Custom target not set — no criterion applied', judged: false };
}
// User-confirmed project convention (2026-10-12), not a course-wide rule.
// Measured/fit R² remains unmodified; only the acceptance value is rounded.
export function projectR2(r2) {return Number.isFinite(r2)?Math.round((r2+Number.EPSILON)*1000)/1000:null;}

export function fitCompounds(session, settings, eligibility) {
  const eligible = eligibility.runs.filter(e => e.eligible);
  const policy = activeR2Policy(settings);
  const analytes = session.compounds.filter(c => c.role !== 'marker');
  const results = [];
  for (const c of analytes) {
    const points = [], excluded = [], missingIn = [];
    for (const e of eligible) {
      const pk = confirmedPeakOf(session, e.run, c.id);
      if (!pk) { missingIn.push(e.label); continue; }
      const note = e.run.peakNotes?.[pk.no] || {};
      if (note.coeluted) { excluded.push({ runLabel: e.label, percentB: e.percentB, reason: 'peak marked as co-eluted' }); continue; }
      if (peakExcluded(e.run,pk)) { excluded.push({ runLabel: e.label, percentB: e.percentB, reason: `peak excluded by user annotation or height filter: ${note.reason || 'selected height threshold'}` }); continue; }
      const k = retentionFactor(pk.tR, e.t0.t0);
      if (!k.ok) { excluded.push({ runLabel: e.label, percentB: e.percentB, reason: k.reason }); continue; }
      points.push({ runId: e.runId, runLabel: e.label, x: e.percentB, y: k.logK, tR: pk.tR, t0: e.t0.t0, k: k.k, peakNo: pk.no, proxy: !!e.t0.proxy, estimate: !!e.t0.estimate });
    }
    const fit = linearFit(points);
    const reasons = [];
    let quality = { judged: false, pass: null, statement: '' };
    if (!fit.ok) reasons.push(fit.reason);
    else {
      if (fit.n < settings.minFitPoints) reasons.push(`${fit.n} point(s); the minimum for a judged fit is ${settings.minFitPoints} (with two points R² is always 1)`);
      if (!(fit.slope < 0)) reasons.push(`slope ${fit.slope.toFixed(5)} is not negative; the course relationship has log K FALLING as %B rises (RETENTION Discovery Book §8.2), so this line is not a usable retention model — check the assignments`);
      if (policy.judged) {
        if (fit.r2 === null) { quality = { judged: true, pass: false, statement: 'R² undefined (no variation in log K).' }; reasons.push(quality.statement); }
        else {
          const compared=policy.mode==='project'?projectR2(fit.r2):fit.r2,cmp = compare(compared, policy.op, policy.target);
          quality = { judged: true, pass: cmp.pass, statement: `R² = ${fit.r2.toFixed(6)} ${cmp.pass ? 'meets' : 'does NOT meet'} ${cmp.opLabel} ${policy.target} (${policy.mode==='project'?`project acceptance value rounded to 3 decimals: ${compared.toFixed(3)}; raw R²: ${fit.r2}`:`compared unrounded: ${fit.r2}`})` };
          if (!cmp.pass) reasons.push(quality.statement);
        }
      } else quality = { judged: false, pass: null, statement: `R² = ${fit.r2 === null ? 'undefined' : fit.r2.toFixed(6)} (no fit-quality criterion selected; not judged)` };
    }
    const proxy = points.some(p => p.proxy), estimate = points.some(p => p.estimate);
    const adequate = fit.ok && reasons.length === 0;
    results.push({ compound: c, points, excluded, missingIn, fit, quality, reasons, adequate, proxy, estimate,
      // S and a in the course sign convention: log K = a − S × %B
      course: fit.ok ? { a: fit.intercept, S: -fit.slope } : null });
  }
  const modelled = results.filter(r => r.adequate);
  // Coverage of the DEFINED analytes is not coverage of the SAMPLE. A peak
  // that carries no confirmed identity is a component of the sample that is
  // not in the compound list, so a line for every defined compound is still
  // not a whole-sample model. Peaks marked as artefacts or as co-elutions are
  // accounted for with a reason and are listed separately.
  const unattributed = [];
  for (const e of eligible) for (const p of peakStatus(session, e.run)) {
    if (p.state === 'unmatched' || p.state === 'proposed' || p.state === 'ambiguous')
      unattributed.push({ runId: e.runId, runLabel: e.label, percentB: e.percentB, peakNo: p.no, tR: p.tR, state: p.state });
  }
  const definedComplete = analytes.length > 0 && modelled.length === analytes.length;
  const coverage = { expected: analytes.length || null, adequate: modelled.length, fitted: results.filter(r => r.fit.ok).length,
    definedComplete, unattributed,
    unattributedRuns: [...new Set(unattributed.map(u => u.runLabel))],
    // "complete" is used by the decision layer as "a whole-sample model": it
    // requires both every defined analyte modelled AND no unidentified peak.
    complete: definedComplete && unattributed.length === 0,
    sampleReason: unattributed.length === 0 ? null
      : `${unattributed.length} peak(s) in ${[...new Set(unattributed.map(u => u.runLabel))].length} eligible run(s) carry no confirmed identity (${unattributed.slice(0, 6).map(u => `${u.runLabel} peak ${u.peakNo} at ${u.tR.toFixed(2)} min, ${u.state}`).join('; ')}${unattributed.length > 6 ? '; …' : ''}). Each is a component of the sample that is not in the compound list, so a line for every DEFINED compound is not a whole-sample model. Either assign and confirm these peaks, define the missing analytes, or mark each peak as an artefact with a reason.`,
    missing: results.filter(r => !r.adequate).map(r => r.compound.name) };
  return { policy, results, coverage, anyProxy: results.some(r => r.proxy), eligibleCount: eligible.length };
}
