// eligibility.mjs — which runs may be pooled in a retention fit, and why.
//
// A run joins the fit only if the user ticked "include in retention fit" AND it
// passes every check below against the fit reference run. Unknown values never
// establish comparability: a missing temperature, column or solvent cannot be
// shown to be the same as anything, including another missing value.
import { usable, knownValue, sourceLabel } from '../data-model/conditions.mjs';
import { chronological, chronologyStatus } from '../data-model/session.mjs';
import { runColumn, runInstrument, organicOf, percentBOf, modeOf, isBlank, effectiveTemperature, t0Of, flowOf } from '../data-model/derive.mjs';
import { num } from '../rules.mjs';
import { sampleCompare } from '../data-model/comparability.mjs';

export function fitReference(session, settings) {
  const flagged = session.runs.filter(r => r.flags.fit && !isBlank(r));
  if (!flagged.length) return null;
  if (settings.fitReferenceRunId) { const r = flagged.find(x => x.id === settings.fitReferenceRunId); if (r) return r; }
  return chronological(session, flagged).at(-1);
}

function why(cond, what) {
  if (!knownValue(cond)) return `${what} is not recorded`;
  if (!cond.confirmed) return `${what} (${cond.value}) comes from ${sourceLabel(cond)} — confirm it to use it`;
  return null;
}

export function requiredKnowns(session, settings, run) {
  const missing = [];
  const col = runColumn(session, run);
  if (!col.column) missing.push('physical column not associated (Equipment stage)');
  else if (!col.confirmed) missing.push(`column association "${col.column.label}" is not confirmed (${col.source})`);
  const o = why(run.conditions.organic, 'organic solvent'); if (o) missing.push(o);
  if(/^(mix\b|acn\s*\+\s*meoh|meoh\s*\+\s*acn)/i.test(organicOf(run)||''))missing.push('Mix (ACN + MeOH) is recorded as a mixed solvent. This tool has no defined Mix retention/nomogram model, so it does not issue a minimum %B for Mix.');
  const m = why(run.conditions.mode, 'elution mode'); if (m) missing.push(m);
  else if (modeOf(run) !== 'ISO') missing.push(`elution mode is ${modeOf(run)}; the log K vs %B model applies to isocratic runs`);
  const b = why(run.conditions.percentB, '%B'); if (b) missing.push(b);
  const T = effectiveTemperature(run, settings); if (!T.known) missing.push(`column temperature unknown: ${T.reason}`);
  return { missing, temperature: T, column: col };
}

// Compare a run with the reference. Returns {comparable, reasons[], notes[]}.
export function lineageCompare(session, settings, run, ref) {
  const reasons = [], notes = [];
  const sample = sampleCompare(session, run, ref);
  reasons.push(...sample.reasons); notes.push(...sample.notes);
  const a = requiredKnowns(session, settings, run), b = run === ref ? a : requiredKnowns(session, settings, ref);
  if (a.missing.length) reasons.push(...a.missing);
  if (run !== ref && b.missing.length) reasons.push(`the fit reference run "${ref.label}" lacks: ${b.missing.join('; ')}`);
  if (reasons.length) return { comparable: false, reasons, notes };
  if (run !== ref) {
    if (a.column.column.id !== b.column.column.id) reasons.push(`different physical column ("${a.column.column.label}" vs "${b.column.column.label}")`);
    if (organicOf(run) !== organicOf(ref)) reasons.push(`different organic solvent (${organicOf(run)} vs ${organicOf(ref)})`);
    const dT = Math.abs(a.temperature.value - b.temperature.value);
    if (dT > settings.tempMatchTolerance) reasons.push(`temperature differs by ${dT.toFixed(2)} °C (${a.temperature.value.toFixed(2)} vs ${b.temperature.value.toFixed(2)} °C), more than the ${settings.tempMatchTolerance} °C comparability tolerance`);
    else notes.push(`temperature ${a.temperature.value.toFixed(2)} vs reference ${b.temperature.value.toFixed(2)} °C (within ${settings.tempMatchTolerance} °C)`);
  }
  for (const [k, label] of [['pH', 'pH'], ['additiveName', 'additive'], ['additiveConc', 'additive concentration'], ['phaseA', 'phase A']]) {
    const x = run.conditions[k], y = ref.conditions[k];
    const kx = usable(x), ky = usable(y);
    if (kx && ky && String(x.value) !== String(y.value)) reasons.push(`different ${label} (${x.value} vs ${y.value})`);
    else if (kx !== ky && run !== ref) reasons.push(`${label} is recorded on only one of the two runs, so they cannot be shown to match`);
    else if (!kx && !ky) notes.push(`${label} not recorded (comparability on ${label} is unverified)`);
  }
  if (run !== ref) {
    const fa = flowOf(run), fb = flowOf(ref);
    if (fa !== null && fb !== null && fa !== fb) notes.push(`flow differs (${fa} vs ${fb} mL/min): K is unchanged by flow at constant chemistry (RETENTION Discovery Book §6), and t0 is taken per run`);
    const ia = runInstrument(session, run).instrument, ib = runInstrument(session, ref).instrument;
    if (ia && ib && ia.id !== ib.id) notes.push(`different instrument ("${ia.label}" vs "${ib.label}"): extra-column volume can differ; t0 is taken per run`);
  }
  return { comparable: reasons.length === 0, reasons, notes };
}

export function fitEligibility(session, settings) {
  const ref = fitReference(session, settings);
  const flagged = session.runs.filter(r => r.flags.fit && !isBlank(r));
  const chron = chronologyStatus(session, flagged);
  const out = { reference: ref, runs: [], chronology: chron,
    // The reference affects only comparability and t0, not the line itself,
    // but it must not be chosen by the order files were selected in.
    referenceBasis: settings.fitReferenceRunId && ref?.id === settings.fitReferenceRunId ? 'selected explicitly by the user'
      : chron.ok ? `last run by ${chron.basis}` : `last run in an UNESTABLISHED order (${chron.reason}) — select the reference explicitly`,
    referenceUncertain: !(settings.fitReferenceRunId && ref?.id === settings.fitReferenceRunId) && !chron.ok };
  for (const run of chronological(session, session.runs.filter(r => r.flags.fit))) {
    const reasons = [], notes = [];
    if (isBlank(run)) reasons.push('recorded as a blank — no analyte peaks expected');
    if (!run.measured.peaks.length) reasons.push('no peaks in the peak table');
    const t0 = t0Of(session, run, settings);
    if (!t0.ok) reasons.push(`t0 not established: ${t0.text}`);
    let lin = { comparable: false, reasons: [], notes: [] };
    if (ref) { lin = lineageCompare(session, settings, run, ref); reasons.push(...lin.reasons); notes.push(...lin.notes); }
    out.runs.push({ run, runId: run.id, label: run.label, eligible: reasons.length === 0, reasons, notes, t0,
      lineageOk: !!ref && lin.comparable, blank: isBlank(run), hasPeaks: run.measured.peaks.length > 0,
      percentB: percentBOf(run), temperature: effectiveTemperature(run, settings), isReference: run === ref });
  }
  return out;
}

// Distinct %B values among eligible runs and replicated conditions.
export function percentBSummary(eligibleRuns) {
  const counts = new Map();
  for (const e of eligibleRuns) counts.set(e.percentB, (counts.get(e.percentB) || 0) + 1);
  const values = [...counts.keys()].sort((a, b) => a - b);
  return { values, duplicates: [...counts].filter(([, n]) => n > 1).map(([b, n]) => ({ percentB: b, n })) };
}
export const numOrNull = num;
