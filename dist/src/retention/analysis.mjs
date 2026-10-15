// analysis.mjs — the step-by-step Retention analysis (12 items) and the
// retention-side next-experiment options. Pure: returns a structured result.
import { fitEligibility, percentBSummary } from './eligibility.mjs';
import { fitCompounds } from './fit.mjs';
import { evaluateCandidates, intermediateB, predictTR } from './candidates.mjs';
import { positionHypotheses } from './exploratory.mjs';
import { peakStatus, missingCompounds, orderChanges } from '../alignment/correspondence.mjs';
import { LOG_CONVENTION,toPsi } from '../rules.mjs';
import { usable } from '../data-model/conditions.mjs';
import { runColumn, runInstrument, effectiveTemperature } from '../data-model/derive.mjs';
import { columnLimit } from '../data-model/equipment.mjs';
import { documentedLimitStatus, repeatLimitCheck } from '../data-model/limits.mjs';

const measuredP = run => {const p=run?.measured?.pressure,c=toPsi(p?.max,p?.unit);return c.ok?c.psi:null;};
const recordedT = (run, settings) => { const t = effectiveTemperature(run, settings); return t.known ? t.value : null; };

export function retentionAnalysis(session, settings) {
  const spec = settings.specs.lastPeak;
  const elig = fitEligibility(session, settings);
  const ref = elig.reference;
  const eligible = elig.runs.filter(e => e.eligible);
  const res = { status: 'not-started', reasons: [], evidence: [], assumptions: [LOG_CONVENTION, 'K = (tR − t0) / t0 with tR and t0 in minutes.'], missing: [],
    steps: {lastPeakSpec:{...spec}}, issued: null, subset: null, exploratory: null, intermediate: null, plan: null, fits: null, eligibility: elig };

  // 1–3 selection, eligibility, comparability
  res.steps.selected = elig.runs.map(e => ({ label: e.label, runId: e.runId, percentB: e.percentB, isReference: e.isReference }));
  res.steps.eligibility = elig.runs.map(e => ({ label: e.label, eligible: e.eligible, reasons: e.reasons, notes: e.notes }));
  if (elig.referenceUncertain) { res.assumptions.push(`Fit reference: ${elig.referenceBasis}.`); res.missing.push('Acquisition order of the runs in the retention fit, or an explicitly selected fit reference run.'); }
  res.steps.comparability = ref ? { reference: ref.label, referenceBasis: elig.referenceBasis, rule: `Same physical column, organic solvent and isocratic mode; temperatures known and within ${settings.tempMatchTolerance} °C; pH/additive/phase A equal where recorded. Unknown values never match.` } : null;
  // 4 t0
  res.steps.t0 = elig.runs.map(e => ({ label: e.label, ok: e.t0.ok, method: e.t0.method, t0: e.t0.t0 ?? null, text: e.t0.text, proxy: !!e.t0.proxy }));

  if (!elig.runs.length) { res.status = 'not-started'; res.missing.push('Tick "Include in retention fit" for the runs of your %B series.'); res.reasons.push('No run is selected for the retention fit.'); return res; }

  // 5 mapping
  const analytes = session.compounds.filter(c => c.role !== 'marker');
  res.steps.mapping = eligible.map(e => ({ label: e.label, peaks: peakStatus(session, e.run), missing: missingCompounds(session, e.run).map(c => c.name) }));
  res.steps.orderChanges = orderChanges(session, eligible.map(e => e.run)).map(o => ({ a: session.compounds.find(c => c.id === o.a)?.name, b: session.compounds.find(c => c.id === o.b)?.name, runs: o.runs.map(r => r.label) }));

  if (eligible.length < 2) {
    res.status = 'need-information';
    res.reasons.push(`${eligible.length} of ${elig.runs.length} selected run(s) are eligible; at least two comparable runs at different %B are needed for a line.`);
    for (const e of elig.runs.filter(x => !x.eligible)) res.missing.push(`${e.label}: ${e.reasons.join('; ')}`);
    return res;
  }

  const t0Ref = elig.runs.find(e => e.isReference)?.t0;
  const t0Proposed = t0Ref?.ok ? t0Ref.t0 : null;
  const confirmedAny = session.assignments.some(a => a.state === 'confirmed' && eligible.some(e => e.runId === a.runId));
  if (!analytes.length || !confirmedAny) {
    res.status = 'mapping-unresolved';
    res.reasons.push(!analytes.length ? 'No compounds are defined, so no peak can be identified.' : 'No peak in the eligible runs has a confirmed compound identity.');
    res.missing.push('Define the compounds (Retention → Compounds) and assign peaks to them in each eligible run, or accept proposals you have checked.');
    res.exploratory = positionHypotheses(session, settings, elig.runs, t0Proposed, spec);
    res.steps.kData = []; res.steps.fits = [];
    return res;
  }

  // 6–9 K data, fits, residuals, missing compounds
  const fits = fitCompounds(session, settings, elig);
  res.fits = fits;
  res.steps.kData = fits.results.map(r => ({ compound: r.compound.name, points: r.points, excluded: r.excluded }));
  res.steps.fits = fits.results.map(r => ({ compound: r.compound.name, ok: r.fit.ok, slope: r.fit.slope, intercept: r.fit.intercept, S: r.course?.S, a: r.course?.a, r2: r.fit.r2, n: r.fit.n, range: r.fit.ok ? [r.fit.xMin, r.fit.xMax] : null, adequate: r.adequate, quality: r.quality.statement, reasons: r.reasons, proxy: r.proxy }));
  res.steps.residuals = fits.results.filter(r => r.fit.ok).map(r => ({ compound: r.compound.name, residuals: r.fit.residuals.map(x => ({ percentB: x.x, residual: x.residual, run: x.runLabel })), maxAbs: r.fit.maxAbsResidual }));
  res.steps.missing = fits.results.filter(r => !r.adequate).map(r => ({ compound: r.compound.name, why: r.reasons.length ? r.reasons : ['no points'], missingIn: r.missingIn }));
  res.evidence.push(`${fits.eligibleCount} eligible run(s); ${fits.coverage.adequate} of ${fits.coverage.expected} defined analyte(s) adequately modelled under "${fits.policy.label}".`);
  if (fits.anyProxy) res.assumptions.push('At least one point uses the opt-in FIRST-PEAK PROXY for t0 (unconfirmed). Every result below is exploratory.');

  // 10–12 candidate evaluation
  if (!(t0Proposed > 0)) { res.status = 'need-information'; res.missing.push('The fit reference run has no established t0, so retention times at candidate %B cannot be predicted.'); return res; }
  const adequate = fits.results.filter(r => r.adequate).map(r => ({ compoundId: r.compound.id, name: r.compound.name, fit: r.fit }));
  const anyFit = fits.results.filter(r => r.fit.ok && r.fit.slope < 0).map(r => ({ compoundId: r.compound.id, name: r.compound.name, fit: r.fit }));
  res.steps.t0Proposed = { t0: t0Proposed, from: ref.label, text: t0Ref.text };
  const deficient = fits.results.filter(r => r.fit.ok && !r.adequate);

  if (adequate.length) {
    const ev = evaluateCandidates(adequate, t0Proposed, spec);
    const block = { candidates: ev, lines: adequate.map(a => a.name), coverage: fits.coverage };
    if (fits.coverage.complete && !fits.anyProxy) { res.issued = block; res.status = 'model-ready'; }
    else { res.subset = block; res.status = deficient.length ? 'fit-deficient' : 'subset-model'; }
    if (ev.ok && ev.minimum) {
      const upper = Math.max(...adequate.map(a => a.fit.xMax));
      res.intermediate = intermediateB(adequate, t0Proposed, ev.minimum.B, Math.max(upper, ev.minimum.B));
    }
  } else res.status = deficient.length ? 'fit-deficient' : 'mapping-unresolved';
  if (anyFit.length && (deficient.length || !fits.coverage.complete || fits.anyProxy)) {
    res.exploratory = { kind: 'all fitted lines, including those that fail the policy', candidates: evaluateCandidates(anyFit, t0Proposed, spec), lines: anyFit.map(a => a.name),
      label: 'EXPLORATORY — includes lines that do not satisfy the selected fit-quality policy, or covers only part of the sample. Not issued.' };
  }
  if (!fits.coverage.definedComplete) res.reasons.push(`Compound coverage is incomplete: ${fits.coverage.adequate} of ${fits.coverage.expected} analytes adequately modelled (missing: ${fits.coverage.missing.join(', ')}). A minimum from a subset is NOT a whole-sample minimum.`);
  if (fits.coverage.sampleReason) {
    res.reasons.push(`Unidentified peaks: ${fits.coverage.sampleReason}`);
    res.missing.push(`Confirm an identity for, define a compound for, or mark as an artefact: ${fits.coverage.unattributed.map(u => `${u.runLabel} peak ${u.peakNo}`).join(', ')}.`);
  }
  if (deficient.length) res.reasons.push(`${deficient.length} compound line(s) do not satisfy the selected fit policy: ${deficient.map(d => `${d.compound.name} (${d.reasons.join('; ')})`).join(' | ')}.`);
  if (res.status === 'model-ready') res.reasons.push(`All ${fits.coverage.expected} analytes are adequately modelled; ${res.issued.candidates.explanation}`);
  if (deficient.length || (res.status !== 'model-ready' && fits.results.some(r => r.fit.ok)))
    res.plan = retentionPlan(session, settings, { elig, eligible, fits, deficient, t0Proposed, spec, ref, exploratory: res.exploratory });
  return res;
}

// Options for the next RETENTION experiment when the model is deficient.
// Never a fixed "R² fails → run X %B" rule: each option is checked.
export function retentionPlan(session, settings, ctx) {
  const { eligible, fits, deficient, t0Proposed, spec, ref } = ctx;
  const bs = percentBSummary(eligible);
  const step = settings.retentionStep;
  const lowest = bs.values[0], highest = bs.values.at(-1);
  const options = [];
  const checks = [];
  const statement = 'Adding a point may IMPROVE OR WORSEN R². No existing point is removed or down-weighted; the fit is recomputed from all eligible points after the new run.';
  const { model } = runColumn(session, ref);
  const ins = runInstrument(session, ref).instrument;
  const pLimitCol = columnLimit(model, 'pressure');
  const pLimitIns = ins?.limits?.find(l => l.quantity === 'pressure');
  const phaseA = ref.conditions.phaseA;
  const lines = fits.results.filter(r => r.fit.ok && r.fit.slope < 0);
  const predictAt = B => lines.length ? Math.max(...lines.map(r => predictTR(r.fit, t0Proposed, B))) : null;
  const acq = usable(ref.conditions.acquisitionTime) ? Number(ref.conditions.acquisitionTime.value) : null;

  // A. extend below the lowest tested %B
  const lowB = lowest - step;
  if (lowB >= 0 && !bs.values.includes(lowB)) {
    const pred = predictAt(lowB);
    const exMin = ctx.exploratory?.candidates?.minimum?.B ?? null;
    const why = exMin !== null && exMin < lowest ? `The exploratory minimum (${exMin} %B) lies BELOW the lowest tested composition (${lowest} %B), i.e. it is an extrapolation; a measured point at ${lowB} %B brings that region inside the fitted range.`
      : `The fitted range is ${lowest}–${highest} %B; a point at ${lowB} %B extends the range by one ${step}-point step (Selectivity ED slide 16 ladder).`;
    const opt = { id: 'extend-low', action: `Inject the sample at ${lowB} %B (one ${step}-point step below the lowest tested ${lowest} %B)`, percentB: lowB, why, checks: [] };
    opt.checks.push(pred === null ? 'No fitted line to predict retention at this %B.' : `Exploratory prediction (from ALL fitted lines, including deficient ones): last peak ≈ ${pred.toFixed(2)} min at ${lowB} %B. ${pred > spec.value ? `This exceeds the ${spec.value} min runtime specification: the run is a MODELLING point, not a candidate method.` : 'Within the runtime specification.'}`);
    opt.checks.push(acq === null ? 'Acquisition time of the reference run is not recorded; set the acquisition time longer than the predicted last peak.' : pred !== null && pred > acq ? `The reference run acquired for ${acq.toFixed(1)} min; extend acquisition beyond ${pred.toFixed(1)} min or late peaks will be missed.` : `Reference acquisition ${acq.toFixed(1)} min covers the prediction.`);
    opt.checks.push(usable(phaseA) ? `Phase A is recorded as "${phaseA.value}"; lowering %B increases the proportion of phase A.` : 'Phase A is not recorded. Lowering %B increases the aqueous proportion; confirm phase A is the aqueous line before proposing this run.');
    opt.checks.push('Back-pressure at a lower %B cannot be predicted here: mobile-phase viscosity changes with composition and no viscosity data are supplied. Measure it.');
    const dsA = documentedLimitStatus(session, settings, ref);
    opt.checks.push(...dsA.checks);
    opt.checks.push('The marker must still be identifiable at the new composition (it does not move with %B, RETENTION Discovery Book §5.2), and peak identities in the new run must be assigned before the point can enter the fit.');
    opt.limitsUnverified = dsA.limitsUnverified;
    opt.needsInfo = !usable(phaseA);
    options.push(opt);
  } else if (lowB < 0) checks.push(`No lower step is possible: ${lowest} %B minus ${step} is below 0 %B.`);
  else checks.push(`${lowB} %B has already been tested.`);

  // B. repeat the point with the largest residual
  let worst = null;
  for (const d of deficient) for (const r of d.fit.residuals) if (!worst || Math.abs(r.residual) > Math.abs(worst.r.residual)) worst = { d, r };
  if (worst) {
    const dupe = bs.duplicates.find(x => x.percentB === worst.r.x);
    const wRun = eligible.find(e => e.runId === worst.r.runId)?.run || ref;  // by id: a label is an annotation and may be edited or duplicated
    const rl = repeatLimitCheck(session, settings, wRun, { measuredPressurePsi: measuredP(wRun), temperatureC: recordedT(wRun, settings) });
    options.push({ id: 'repeat-worst', percentB: worst.r.x,
      action: `Repeat the injection at ${worst.r.x} %B`,
      why: `The largest residual among the deficient lines is ${worst.r.residual.toFixed(4)} (log units) for ${worst.d.compound.name} at ${worst.r.x} %B (run "${worst.r.runLabel}"). ${dupe ? `That condition already has ${dupe.n} runs; a further repeat adds less information.` : 'A replicate tests whether that point is reproducible.'}`,
      checks: ['Same column, solvent, temperature and flow as the reference run.', ...rl.checks],
      limitsUnverified: rl.limitsUnverified, needsInfo: false });
  }
  // C. fill the widest gap
  let gap = null;
  for (let i = 1; i < bs.values.length; i++) { const g = bs.values[i] - bs.values[i - 1]; if (!gap || g > gap.g) gap = { g, lo: bs.values[i - 1], hi: bs.values[i] }; }
  if (gap && gap.g > step) {
    const mid = Math.round((gap.lo + gap.hi) / 2);
    const ds = documentedLimitStatus(session, settings, ref);
    options.push({ id: 'fill-gap', percentB: mid, action: `Inject at ${mid} %B to fill the ${gap.g}-point gap between ${gap.lo} and ${gap.hi} %B`,
      why: 'A point inside the range shows whether the line is straight between the tested compositions.',
      checks: [`${mid} %B lies between tested compositions, but it has NOT itself been run: mobile-phase viscosity changes with composition, so the back-pressure of this run is not known from the runs either side of it. Measure it.`, ...ds.checks],
      limitsUnverified: ds.limitsUnverified, needsInfo: false });
  }
  // preferred
  let preferred = null;
  const exMin = ctx.exploratory?.candidates?.minimum?.B ?? null;
  const extend = options.find(o => o.id === 'extend-low');
  if (extend && exMin !== null && exMin < lowest) preferred = extend;
  else preferred = options.find(o => o.id === 'fill-gap') || options.find(o => o.id === 'repeat-worst') || extend || null;
  return { existingPercentB: bs.values, duplicates: bs.duplicates, options, preferred, statement, checks,
    rule: 'Preferred option: extend below the lowest tested %B only when the exploratory minimum lies below it (an extrapolation); otherwise fill a gap wider than one step; otherwise replicate the worst-residual point.' };
}
