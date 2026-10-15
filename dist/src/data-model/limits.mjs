// limits.mjs — the single operating-limit check used by every proposal.
//
// Any proposed change of a condition passes through here. "Inside the range we
// already ran" is NOT evidence that a limit is verified: a run that was made
// without a documented column or instrument rating was made without one, and
// repeating it inherits exactly the same unverified limit. The software
// pressure cut-off is a method setting, not a hardware rating, and is never
// used as a substitute for one.
import { OPERATORS, compare, toPsi } from '../rules.mjs';
import { runColumn, runInstrument } from './derive.mjs';
import { columnLimit } from './equipment.mjs';
import { labPressureSettings } from '../presets/local-lab.mjs';

const opl = op => OPERATORS[op]?.label || op;

export function limitCheck(session, settings, run, { pressurePsi = null, temperatureC = null } = {}) {
  settings = labPressureSettings(session, settings, run);
  const col = runColumn(session, run), association = runInstrument(session, run);
  const model = col.confirmed ? col.model : null;
  const ins = association.confirmed ? association.instrument : null;
  const notes = [], unverified = [], breaches = [];
  const colP = columnLimit(model, 'pressure'), colT = columnLimit(model, 'temperature');
  const insP = ins?.limits?.find(l => l.quantity === 'pressure') || null;
  if (pressurePsi !== null) {
    // A limit is compared only after its unit is converted to psi. A limit
    // whose unit is missing or unrecognised is NOT compared as a number of
    // psi: it is reported as unusable, which leaves the limit unverified.
    if (colP.known) {
      const u = toPsi(colP.value, colP.unit);
      if (!u.ok) unverified.push(`The column pressure limit is recorded as ${colP.value} ${colP.unit || '(no unit)'} and cannot be used: ${u.reason}.`);
      else { const c = compare(pressurePsi, colP.op, u.psi); (c.pass ? notes : breaches).push(`column pressure limit ${colP.value} ${colP.unit}${u.factor !== 1 ? ` (= ${u.psi.toFixed(0)} psi)` : ''}: ${c.pass ? 'within' : 'EXCEEDED'}`); }
    } else unverified.push(colP.reason);
    if (insP) {
      const u = toPsi(insP.value, insP.unit);
      if (!u.ok) unverified.push(`The instrument pressure limit is recorded as ${insP.value} ${insP.unit || '(no unit)'} and cannot be used: ${u.reason}.`);
      else { const c = compare(pressurePsi, insP.op, u.psi); (c.pass ? notes : breaches).push(`instrument limit ${insP.op} ${insP.value} ${insP.unit}${u.factor !== 1 ? ` (= ${u.psi.toFixed(0)} psi)` : ''} (${insP.basis || 'basis not stated'}): ${c.pass ? 'within' : 'EXCEEDED'}`); }
    } else unverified.push('No documented instrument pressure limit is recorded.');
    notes.push(`The configured specification ${opl(settings.specs.pressure.op)} ${settings.specs.pressure.value} psi is the measured method acceptance requirement, not a hardware rating. A method-editor software safety cut-off is a separate setting; it does not change this acceptance operator.`);
  }
  if (temperatureC !== null) {
    if (colT.known) { const c = compare(temperatureC, colT.op, colT.value); (c.pass ? notes : breaches).push(`column maximum temperature ${colT.value} °C: ${c.pass ? 'within' : 'EXCEEDED'}`); }
    else unverified.push(colT.reason);
  }
  return { notes, unverified, breaches, ok: breaches.length === 0, verified: unverified.length === 0 };
}

// What is DOCUMENTED about the limits of the configured equipment, with no
// value to test yet. Used where the back-pressure of a proposed condition
// cannot be predicted (a new mobile-phase composition changes viscosity), so
// the honest answer is "the limit is documented / the limit is unknown",
// never "no operating-limit question arises".
export function documentedLimitStatus(session, settings, run) {
  settings = labPressureSettings(session, settings, run);
  const col = runColumn(session, run), association = runInstrument(session, run);
  const model = col.confirmed ? col.model : null;
  const ins = association.confirmed ? association.instrument : null;
  const colP = columnLimit(model, 'pressure');
  const insP = ins?.limits?.find(l => l.quantity === 'pressure') || null;
  const checks = [], unverified = [];
  checks.push(colP.known ? `Column pressure limit ${colP.value} ${colP.unit} recorded; verify the exact model-specific source before treating it as a documented rating.` : `Column pressure limit unknown: ${colP.reason}`);
  if (!colP.known) unverified.push(colP.reason);
  checks.push(insP ? `Instrument limit record: ${insP.op} ${insP.value} ${insP.unit} (${insP.basis || 'basis not stated'}).` : 'No documented instrument pressure limit is recorded.');
  if (!insP) unverified.push('No documented instrument pressure limit is recorded.');
  const specP = settings.specs?.pressure;
  checks.push(specP ? `The configured back-pressure requirement (${opl(specP.op)} ${specP.value} psi) is a measured method acceptance test; it is not the method-editor safety cut-off or a column/instrument hardware rating.` : 'No back-pressure requirement is configured.');
  return { checks, unverified, limitsUnverified: unverified.length > 0 };
}

// A run that repeats conditions already used. The measured back-pressure of
// that earlier run is real evidence about what the pump produced, but it is
// not a rating: the question "is this condition inside a DOCUMENTED limit?"
// is answered only by the column and instrument records.
export function repeatLimitCheck(session, settings, run, { measuredPressurePsi = null, temperatureC = null } = {}) {
  const lc = limitCheck(session, settings, run, { pressurePsi: measuredPressurePsi, temperatureC });
  const checks = [];
  if (measuredPressurePsi !== null) checks.push(`The run being repeated measured ${measuredPressurePsi.toFixed(0)} psi, so the pump produced that pressure under these conditions; this is a measurement, not a documented rating.`);
  else checks.push('No measured back-pressure is recorded for the run being repeated, so even its observed pressure is unknown.');
  checks.push(...lc.notes);
  for (const u of lc.unverified) checks.push(`Operating limit NOT verified: ${u} Repeating a condition already used does not verify it — the earlier run was made under the same undocumented limit.`);
  for (const b of lc.breaches) checks.push(`LIMIT EXCEEDED — ${b}`);
  return { checks, limitsUnverified: !lc.verified, breaches: lc.breaches, ok: lc.ok };
}
