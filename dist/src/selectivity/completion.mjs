// completion.mjs — when does a historical run COMPLETE a selectivity step?
//
// A selectivity step is an experiment: "run the same sample, on the same
// column, in this solvent, at this temperature, at the composition under
// development, and look at what happened to the spacing." A run is evidence
// that the step was done only if it actually was that experiment and if it can
// be read. Matching the column, the solvent and the temperature is not enough:
// a run at another composition answers a different question, a run on another
// sample answers it for another sample, and a run that breached the
// back-pressure specification is not a method anyone may repeat.
//
// Five verdicts are kept apart, because they lead to different actions:
//   'completed'     — performed, valid and evaluable: the step is done.
//   'invalid'       — performed, but it cannot stand as evidence for THIS step
//                     (wrong composition, another sample, a breached limit…).
//   'inconclusive'  — performed and admissible, but it cannot be read
//                     (no peaks, no resolution under the selected basis,
//                     unknown temperature…).
//   'not-this-step' — a run that simply belongs to another step.
//   (a step itself can also be 'unavailable'; that is decided in progression.)
//
// Nothing here guesses. Where a quantity is unknown, the verdict says so
// instead of assuming the quantity matches.
import { runColumn, organicOf, percentBOf, effectiveTemperature, modeOf, relevantPeaks, isBlank, flowOf } from '../data-model/derive.mjs';
import { usable, knownValue } from '../data-model/conditions.mjs';
import { compare, OPERATORS, adjacentResolutions } from '../rules.mjs';
import { sampleCompare } from '../data-model/comparability.mjs';

export const VERDICT = {
  COMPLETED: 'completed',
  INVALID: 'invalid',
  INCONCLUSIVE: 'inconclusive',
  OTHER_STEP: 'not-this-step',
};

// What may differ between the run and the current conditions without changing
// the question the step asks, and what may not. Stated here so the contract is
// readable in one place rather than implied by a chain of conditions.
export const COMPLETION_CONTRACT = {
  id: 'rule.stepCompletion',
  label: 'What makes a historical run evidence that a selectivity step was completed',
  mustMatch: [
    'the explicitly declared sample/study ID or a recorded user equivalence: sample type/name alone cannot establish identity',
    'the physical column, confirmed, with its stationary phase recorded (the ligand step is the exception: it needs a different, recorded ligand)',
    'the organic solvent of the step, confirmed',
    'the composition under development: the step changes temperature or solvent, NOT %B, so the run must be at the current %B — or, for a solvent step, at the nomogram-converted composition within the stated reading allowance',
    'the mobile phase otherwise: pH, additive, additive concentration and phase A where both runs record them',
    'isocratic elution: the step is defined at a fixed composition',
    'the temperature of the step, known and stable within the configured tolerance',
  ],
  mayDiffer: [
    'flow rate — K is unchanged by flow at constant chemistry, and each run carries its own t0',
    'injection volume, sample concentration and detection wavelength — they do not change the separation (they are noted, not counted against the run)',
    'acquisition time, provided the latest peak is inside it',
  ],
  invalidating: [
    'a measured back-pressure that does not meet the configured specification: the run happened, but it is not a method that may be repeated, so it is not evidence that a safe, evaluable step was completed',
    'a different declared sample identity without an equivalence, a different composition, a different mobile phase, a gradient, or an unconfirmed or different column',
  ],
  evaluable: 'A step about selectivity can only be read from a run with at least two relevant peaks and a lowest adjacent-pair resolution calculable under the selected basis. Otherwise the run is INCONCLUSIVE: performed, admissible, but silent on the question.',
  note: 'Tool contract, assembled from the course material (comparability in RETENTION Discovery Book §6 and §8.2, selectivity in SELECTIVITY Discovery Book §2.2–2.7, the back-pressure cut-off in Equipment LAB slides 35–36) and from the FC1 rubric\'s requirement that the history be read. The rubric does not itself list these conditions.',
};

const opl = op => OPERATORS[op]?.label || op;

// Is the composition of `run` the one the step is asked at?
// For a step on the base solvent that is the current run's own %B. For a step
// that changes solvent it is the nomogram-converted composition, within the
// stated reading allowance of the digitised figure.
// A step is a COMPARISON, so it needs its control at the same composition: a
// temperature step is read against the same sample at the same composition in
// the same solvent at the base temperature, and a solvent step is read against
// the base-solvent condition it was converted from. `ctx.targets` carries the
// admissible compositions with the run each one comes from, built by
// `compositionTargets()` below. Nothing is anchored to the run being judged, so
// a run can never justify itself.
function compositionCheck(run, step, targets) {
  const b = percentBOf(run);
  if (b === null) return { ok: false, hard: true, text: 'its %B is not confirmed, so the composition it was run at is unknown' };
  if (!targets || targets.kind === 'unestablished')
    return { ok: false, hard: false, text: `the composition this step belongs to is not established: ${targets?.reason || 'no comparable condition is recorded'}` };
  if (targets.kind === 'any') return { ok: true, text: `${b} %B (this step does not fix a composition: ${targets.reason})` };
  const hit = targets.list.find(t => Math.abs(b - t.B) <= (t.tolerance ?? 0) + 1e-9);
  if (hit) return { ok: true, text: `${b} %B matches ${hit.B} %B${hit.tolerance ? ` ± ${hit.tolerance}` : ''} — ${hit.basis}`, control: hit };
  const near = [...targets.list].sort((x, y) => Math.abs(b - x.B) - Math.abs(b - y.B)).slice(0, 2);
  return { ok: false, hard: true,
    text: `it was run at ${b} %B, and this step belongs to ${targets.list.length === 1 ? 'the composition' : 'one of the compositions'} ${near.map(t => `${t.B} %B${t.tolerance ? ` ± ${t.tolerance}` : ''} (${t.basis})`).join(' or ')}${targets.list.length > 2 ? `, among ${targets.list.length} admissible compositions` : ''}; a selectivity step changes temperature or solvent, not the composition, so a run at another composition answers a different question and cannot complete this step` };
}

// Which compositions does this step belong to, and on what evidence?
//   * a step with a temperature target → the compositions at which a
//     base-temperature run on the SAME column, solvent and sample exists; that
//     run is the control the step is read against;
//   * a step that moves to the second solvent at the base temperature → the
//     nomogram conversions of those base-solvent control compositions, with
//     the figure's stated reading allowance;
//   * a step with a temperature target on the second solvent → the
//     compositions of its own base-temperature runs on that solvent, falling
//     back to the conversions when the solvent step itself has not been run.
// With nothing to compare against, the result is 'unestablished' and runs are
// neither counted nor rejected on composition.
export function compositionTargets(session, settings, current, step, ctx) {
  const onColumn = (ctx.history || []).filter(r => {
    const col = runColumn(session, r);
    if (!col.confirmed || col.column?.id !== ctx.columnId) return false;
    if (percentBOf(r) === null) return false;
    return sampleCompare(session, r, current).comparable;
  });
  const baseTempRunsIn = solvent => onColumn.filter(r => organicOf(r) === solvent && (ctx.baseTemperature ? ctx.baseTemperature(r).ok : true));
  const dedupe = list => { const seen = new Map(); for (const t of list) if (!seen.has(t.B)) seen.set(t.B, t); return [...seen.values()].sort((a, b) => a.B - b.B); };

  const stepSolvent = step.solventName;
  const base = ctx.baseSolvent;
  const hasTemperature = step.temperature !== null && step.temperature !== undefined;

  if (hasTemperature) {
    const own = baseTempRunsIn(stepSolvent);
    if (own.length) return { kind: 'list', list: dedupe(own.map(r => ({ B: percentBOf(r), tolerance: 0, basis: `the base-temperature control run "${r.label}" at that composition in ${stepSolvent}`, controlRunId: r.id }))) };
    if (stepSolvent !== base) {
      const conv = convertedTargets(baseTempRunsIn(base), base, stepSolvent, ctx);
      if (conv.length) return { kind: 'list', list: dedupe(conv), note: `no base-temperature run in ${stepSolvent} exists yet, so the admissible compositions are the nomogram conversions of the ${base} conditions` };
    }
    return { kind: 'unestablished', reason: `no run on this column in ${stepSolvent} at the base temperature carries a confirmed %B, so this temperature step has no control to be read against` };
  }
  // base temperature on the second solvent: the converted base-solvent conditions
  if (stepSolvent && stepSolvent !== base) {
    const conv = convertedTargets(baseTempRunsIn(base), base, stepSolvent, ctx);
    if (conv.length) return { kind: 'list', list: dedupe(conv) };
    return { kind: 'unestablished', reason: `no ${base} condition on this column can be converted to ${stepSolvent}: ${ctx.conversionReason || 'the nomogram gives no reading for it'}` };
  }
  return { kind: 'any', reason: 'it is the base condition of the base solvent, which the retention series itself establishes' };
}

function convertedTargets(baseRuns, base, to, ctx) {
  const out = [];
  for (const r of baseRuns) {
    const b = percentBOf(r);
    const cv = ctx.convert(base, to, b);
    if (cv?.available) out.push({ B: cv.rounded, tolerance: ctx.nomogramTolerance ?? 2, basis: `the nomogram conversion of ${b} %B ${base} (run "${r.label}") into ${to}`, controlRunId: r.id, fromB: b });
  }
  return out;
}

// Can this run be read for a selectivity question at all?
function evaluability(session, settings, run) {
  const peaks = relevantPeaks(run);
  if (peaks.length < 2) return { ok: false, text: `it reports ${peaks.length} relevant peak(s): a spacing question needs at least two` };
  const rs = adjacentResolutions(peaks, settings.rsBasis);
  if (!rs || !rs.complete) {
    const missing = rs?.missing?.length ? rs.missing.map(m => `${m.from}–${m.to}: ${m.reason}`).join('; ') : 'no adjacent pair could be calculated';
    return { ok: false, text: `its lowest adjacent-pair resolution cannot be calculated on the ${settings.rsBasis} basis (${missing}), so the step cannot be read from it` };
  }
  return { ok: true, text: `${peaks.length} relevant peaks and a lowest adjacent Rs of ${rs.minRs.toFixed(3)} on the ${settings.rsBasis} basis` };
}

// The one call progression makes, per historical run and per step.
export function classifyRun(session, settings, current, step, run, ctx = {}) {
  const reasons = [], notes = [];
  const push = (v, text) => ({ verdict: v, reasons: [...reasons, text], notes });

  // 0. does it even belong to this step?
  const col = runColumn(session, run);
  const stepSolvent = step.solventName || null;
  if (isBlank(run)) return push(VERDICT.OTHER_STEP, 'it is recorded as a blank, so it carries no analyte information');
  if (!col.column) return push(VERDICT.INVALID, 'no physical column is associated with it');
  if (!col.confirmed) return push(VERDICT.INVALID, `its column association ("${col.column.label}") is not confirmed`);
  if (col.column.id !== ctx.columnId) return push(VERDICT.INVALID, `it was run on a different physical column ("${col.column.label}")`);
  const org = organicOf(run);
  if (stepSolvent && org !== stepSolvent) return push(VERDICT.OTHER_STEP, `its organic solvent is ${org || 'not recorded'}, not ${stepSolvent}`);

  // 1. the sample the step is about
  const sample = sampleCompare(session, run, current);
  if (!sample.comparable) return push(sample.identities.every(x => x.known) ? VERDICT.INVALID : VERDICT.INCONCLUSIVE, sample.reasons.join('; '));
  notes.push(...sample.notes);

  // 2. the stationary phase has to be recorded for the step to mean anything
  if (!col.model?.ligand) notes.push('the stationary phase of this column model is not recorded; the step is still counted on the identity of the physical column, but the phase cannot be stated');

  // 3. isocratic
  const mode = modeOf(run);
  if (mode && mode !== 'ISO') return push(VERDICT.INVALID, `it is ${mode}: a selectivity step is defined at a fixed composition`);

  // 5. the rest of the mobile phase
  for (const [k, label] of [['pH', 'pH'], ['additiveName', 'additive'], ['additiveConc', 'additive concentration'], ['phaseA', 'phase A']]) {
    const a = run.conditions[k], b = current.conditions[k];
    if (usable(a) && usable(b) && String(a.value) !== String(b.value)) return push(VERDICT.INVALID, `its ${label} (${a.value}) differs from the current run's (${b.value})`);
  }

  // 5. the temperature of the step
  const T = effectiveTemperature(run, settings);
  if (step.temperature !== null && step.temperature !== undefined) {
    if (!T.known) return push(VERDICT.INCONCLUSIVE, `its column temperature is not established: ${T.reason}`);
    if (Math.abs(T.value - step.temperature) > settings.tempStabilityTolerance)
      return push(VERDICT.OTHER_STEP, `it ran at ${T.value.toFixed(1)} °C, not at the ${step.temperature} °C of this step`);
    notes.push(`temperature ${T.value.toFixed(1)} °C within ${settings.tempStabilityTolerance} °C of the ${step.temperature} °C step (${T.reason})`);
  } else if (ctx.baseTemperature) {
    const b = ctx.baseTemperature(run);
    if (!b.ok) return push(b.known === false ? VERDICT.INCONCLUSIVE : VERDICT.OTHER_STEP, b.why);
    notes.push(b.why);
  }

  // 6. the composition this step belongs to (checked after the temperature, so a
  //    base-temperature control run is simply another step, not a rejection)
  const comp = compositionCheck(run, step, ctx.targets);
  if (!comp.ok) return push(comp.hard ? VERDICT.INVALID : VERDICT.INCONCLUSIVE, comp.text);
  notes.push(comp.text);
  if (comp.control?.controlRunId === run.id) return push(VERDICT.INVALID, 'it is itself the control this step would be read against, so it cannot also be the step');

  // 7. method constraints: a run that breached the pressure specification is
  //    not a method that may be repeated, so it is not evidence of a safe step
  const P = run.measured?.pressure?.max;
  const spec = settings.specs?.pressure;
  if (spec && Number.isFinite(P)) {
    const c = compare(P, spec.op, spec.value);
    if (c.known && !c.pass) {
      const r = push(VERDICT.INVALID, `its measured back-pressure ${P.toFixed(0)} psi does not meet the configured ${opl(spec.op)} ${spec.value} psi specification: the run happened, but it is not a method that may be repeated, so it is not evidence that a safe, evaluable step was completed`);
      r.unsafePressure = { label: run.label, pressurePsi: P, flow: flowOf(run) };
      return r;
    }
    notes.push(`measured back-pressure ${P.toFixed(0)} psi meets ${opl(spec.op)} ${spec.value} psi`);
  } else if (spec) {
    reasons.push('its back-pressure is not recorded, so it cannot be shown to have been within the specification');
  }

  // 8. can the step be read from it?
  const ev = evaluability(session, settings, run);
  if (!ev.ok) return push(VERDICT.INCONCLUSIVE, ev.text);
  notes.push(ev.text);

  // anything still in `reasons` is a fact that could not be established
  if (reasons.length) return { verdict: VERDICT.INCONCLUSIVE, reasons, notes };
  return { verdict: VERDICT.COMPLETED, reasons: ['the sample, column, solvent, composition, mobile phase, temperature and pressure all match the step, and the run can be read'], notes };
}
