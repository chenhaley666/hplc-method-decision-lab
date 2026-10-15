// applicability.mjs — may a retention model be applied to THIS run?
//
// A fitted model belongs to the conditions it was fitted on. Transferring a
// minimum %B or a predicted retention time to a run on another column, another
// organic solvent, another temperature or another mobile phase is not
// supported by the model, and predicting a time needs the TARGET run's own t0
// (t0 scales with flow and column volume, not with %B).
import { runColumn, organicOf, effectiveTemperature, t0Of, modeOf, flowOf } from '../data-model/derive.mjs';
import { usable } from '../data-model/conditions.mjs';
import { sampleCompare } from '../data-model/comparability.mjs';

export function modelApplicability(session, settings, run, retention) {
  const reasons = [];
  const ref = retention?.eligibility?.reference || null;
  const lines = (retention?.fits?.results || []).filter(r => r.adequate).map(r => ({ compoundId: r.compound.id, name: r.compound.name, fit: r.fit }));
  const anyLines = (retention?.fits?.results || []).filter(r => r.fit.ok && r.fit.slope < 0).map(r => ({ compoundId: r.compound.id, name: r.compound.name, fit: r.fit }));
  if (!ref) return { ok: false, reasons: ['No retention model has been fitted.'], lines: [], anyLines: [], t0: null };
  const sample = sampleCompare(session, run, ref);
  reasons.push(...sample.reasons);
  if (!lines.length) reasons.push('No compound line satisfies the selected fit policy.');

  const cRun = runColumn(session, run), cRef = runColumn(session, ref);
  if (!cRun.confirmed || !cRef.confirmed || cRun.column?.id !== cRef.column?.id)
    reasons.push(cRun.column?.label===cRef.column?.label&&cRun.column?.id!==cRef.column?.id
      ? `the two physical-column records have the same label "${cRun.column.label}" but different internal identities; identical labels or product types do not establish the same physical column. Associate them explicitly only when your laboratory record confirms it`
      : `the model was fitted on ${cRef.column ? `"${cRef.column.label}"` : 'an unconfirmed column'} and this run uses ${cRun.column ? `"${cRun.column.label}"` : 'no confirmed column'}`);
  if (organicOf(run) !== organicOf(ref))
    reasons.push(`the model was fitted in ${organicOf(ref) || 'an unrecorded solvent'} and this run uses ${organicOf(run) || 'an unrecorded solvent'}`);
  const Ta = effectiveTemperature(run, settings), Tb = effectiveTemperature(ref, settings);
  if (!Ta.known) reasons.push(`this run's column temperature is unknown (${Ta.reason})`);
  else if (!Tb.known) reasons.push(`the model's reference temperature is unknown (${Tb.reason})`);
  else if (Math.abs(Ta.value - Tb.value) > settings.tempMatchTolerance)
    reasons.push(`the model was fitted at ${Tb.value.toFixed(1)} °C and this run is at ${Ta.value.toFixed(1)} °C, more than the ${settings.tempMatchTolerance} °C tolerance`);
  if (modeOf(run) && modeOf(run) !== 'ISO') reasons.push(`this run is ${modeOf(run)}; the log K vs %B model is isocratic`);
  for (const [k, label] of [['pH', 'pH'], ['additiveName', 'additive'], ['additiveConc', 'additive concentration'], ['phaseA', 'phase A']]) {
    const x = run.conditions[k], y = ref.conditions[k];
    if (usable(x) && usable(y) && String(x.value) !== String(y.value)) reasons.push(`different ${label} (${x.value} vs the model's ${y.value})`);
  }
  // the prediction needs THIS run's t0
  const t0 = t0Of(session, run, settings);
  if (!t0.ok) reasons.push(`this run has no established t0, so no retention time can be predicted for it (${t0.text})`);
  const fa = flowOf(run), fb = flowOf(ref);
  const notes = [...sample.notes];
  if (fa !== null && fb !== null && fa !== fb) notes.push(`flow differs from the model's runs (${fa} vs ${fb} mL/min); K is unchanged by flow and this run's own t0 is used, so the prediction remains valid`);
  return { ok: reasons.length === 0 && lines.length > 0, reasons, notes, lines, anyLines, t0: t0.ok ? t0 : null, reference: ref };
}

// Runtime proximity band. The rubric separates "well inside", "approaching"
// and "beyond" the run-time specification but does not define "approaching",
// so the threshold is a TOOL POLICY, editable in settings and labelled as such.
export const RUNTIME_BAND_POLICY = {
  id: 'tool.runtimeApproaching', fraction: 0.75,
  label: 'Run-time proximity policy (tool default, not a course rule)',
  detail: 'A run time is "approaching" the specification when the latest relevant peak is at or beyond this fraction of the limit but still within it; "well inside" below that fraction; "beyond" when it does not meet the specification. The rubric separates these three outcomes but states no threshold, so this fraction is a tool policy and is editable.',
};
export function runtimeBand(lastTR, spec, fraction) {
  const f = Number.isFinite(fraction) ? fraction : RUNTIME_BAND_POLICY.fraction;
  if (lastTR === null || lastTR === undefined || !Number.isFinite(lastTR)) return { band: 'unknown', text: 'The latest relevant peak is not known.' };
  const limit = spec.value;
  const meets = spec.op === '<' ? lastTR < limit : lastTR <= limit;
  if (!meets) return { band: 'beyond', text: `${lastTR.toFixed(3)} min does not meet the ${spec.op === '<' ? '<' : '≤'} ${limit} min specification.`, fraction: f };
  if (lastTR >= f * limit) return { band: 'approaching', text: `${lastTR.toFixed(3)} min is within the limit but at or beyond ${(f * 100).toFixed(0)} % of it (${(f * limit).toFixed(2)} min) — "approaching" by the tool policy.`, fraction: f };
  return { band: 'well-inside', text: `${lastTR.toFixed(3)} min is below ${(f * 100).toFixed(0)} % of the ${limit} min limit (${(f * limit).toFixed(2)} min) — "well inside" by the tool policy.`, fraction: f };
}
