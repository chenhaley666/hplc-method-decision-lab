// progression.mjs — history-aware selectivity progression.
//
// A step counts as DONE only when an actual run in the decision-history set
// shows it: same confirmed physical column (or, for the ligand step, a
// different column whose ligand differs), the step's organic solvent
// (confirmed), and a KNOWN temperature that matches the step. A run with an
// unknown or unstable temperature, an unconfirmed column, or a different column
// never completes a temperature or solvent step. A recommendation is never
// evidence that a step was done.
import { chronological } from '../data-model/session.mjs';
import { runColumn, organicOf, isBlank, effectiveTemperature, percentBOf } from '../data-model/derive.mjs';
import { columnLimit } from '../data-model/equipment.mjs';
import { knownValue } from '../data-model/conditions.mjs';
import { nomogramConvert, NOMOGRAM_TOLERANCE } from './nomogram.mjs';
import { classifyRun, compositionTargets, VERDICT, COMPLETION_CONTRACT } from './completion.mjs';
import { sampleCompare } from '../data-model/comparability.mjs';

export function historyRuns(session) {
  return chronological(session, session.runs.filter(r => r.flags.history && !isBlank(r) && r.measured.peaks.length));
}

function atBaseTemperature(run, settings) {
  const sp = run.conditions.ovenSetpoint;
  if (knownValue(sp) && sp.value === 'ambient' && sp.confirmed) {
    const T = effectiveTemperature(run, settings);
    if (T.stable === false) return { ok: false, why: T.reason };
    return { ok: true, why: `confirmed "no setpoint (ambient)"${T.known ? `; oven sensor ${T.value.toFixed(1)} °C` : ''}` };
  }
  const T = effectiveTemperature(run, settings);
  const lowest = Math.min(...settings.temperatureSteps);
  if (T.known && T.value < lowest - settings.tempMatchTolerance) return { ok: true, why: `known temperature ${T.value.toFixed(1)} °C, below the first temperature step` };
  return { ok: false, why: T.known ? `temperature ${T.value.toFixed(1)} °C is not the base condition` : T.reason };
}

export function selectivityProgression(session, settings, current) {
  const res = { ok: false, steps: [], next: null, exhausted: false, missing: [], notes: [], base: null };
  if (!current) { res.missing.push('No run in the decision history.'); return res; }
  const cur = runColumn(session, current);
  if (!cur.column || !cur.confirmed) { res.missing.push(`The current run "${current.label}" has no confirmed physical column, so selectivity history on that column cannot be read.`); return res; }
  const hist = historyRuns(session);
  const sameCol = hist.filter(r => { const c = runColumn(session, r); return c.confirmed && c.column?.id === cur.column.id; });
  // base solvent: the solvent of the earliest confirmed run on this column
  const firstKnown = sameCol.find(r => organicOf(r) && sampleCompare(session, r, current).comparable);
  const baseSolvent = settings.baseSolvent || (firstKnown ? organicOf(firstKnown) : organicOf(current));
  if (!baseSolvent) { res.missing.push('The organic solvent of the retention runs on this column is not confirmed.'); return res; }
  const alt = settings.availableSolvents.find(s => s !== baseSolvent) || null;
  res.base = { column: cur.column.label, solvent: baseSolvent, solventBasis: settings.baseSolvent ? 'settings' : firstKnown ? `earliest confirmed run on this column with a comparable declared sample ("${firstKnown.label}")` : `current run's recorded solvent; no same-sample historical base is established`, alt };
  const [T1, T2] = settings.temperatureSteps;
  const tFor = key => key === 'T1' ? T1 : key === 'T2' ? T2 : null;
  const tol = settings.tempStabilityTolerance;
  const colT = columnLimit(cur.model, 'temperature');
  const unavailable = new Set(settings.unavailableSteps || []);

  for (const step of settings.selectivityPlan) {
    const st = { ...step, done: false, evidence: [], rejected: [], classified: [], priorUnsafe: [], performed: 0, available: true, limitsUnverified: false, needs: [] };
    if (unavailable.has(step.id)) { st.available = false; st.unavailableReason = 'Marked by the user as not available.'; res.steps.push(st); continue; }
    if (step.kind === 'ligand') {
      const curLig = cur.model?.ligand || null;
      if (!curLig) st.needs.push('the ligand of the current column model is not recorded');
      const others = session.columns.filter(c => c.id !== cur.column.id).map(c => ({ c, m: session.columnModels.find(m => m.id === c.modelId) }))
        .filter(x => x.m?.ligand && curLig && x.m.ligand !== curLig);
      st.alternatives = others.map(x => `${x.c.label} (${x.m.ligand})`);
      for (const r of hist) {
        const c = runColumn(session, r);
        if (!c.confirmed || !c.column || c.column.id === cur.column.id) continue;
        const sample = sampleCompare(session, r, current);
        if (!sample.comparable) {
          const why = sample.reasons.join('; ');
          st.rejected.push(`${r.label}: ${why}`);
          st.classified.push({ runId: r.id, label: r.label, verdict: sample.identities.every(x => x.known) ? VERDICT.INVALID : VERDICT.INCONCLUSIVE, reasons: sample.reasons, notes: sample.notes });
          continue;
        }
        if (c.model?.ligand && curLig && c.model.ligand !== curLig) { st.evidence.push(r.label); st.classified.push({ runId: r.id, label: r.label, verdict: VERDICT.COMPLETED, reasons: [`run on "${c.column.label}", whose ligand (${c.model.ligand}) differs from the current column's (${curLig})`], notes: [] }); }
        else { const why = `different column but ligand ${c.model?.ligand ? 'the same' : 'not recorded'}`; st.rejected.push(`${r.label}: ${why}`); st.classified.push({ runId: r.id, label: r.label, verdict: VERDICT.INVALID, reasons: [why], notes: [] }); }
      }
      st.done = st.evidence.length > 0;
      st.performed = st.classified.length;
      if (!st.done && !others.length) { st.available = false; st.unavailableReason = 'No alternative column with a different, recorded ligand is in the equipment library. Record one, or mark this step as not available.'; }
      res.steps.push(st); continue;
    }
    const solvent = step.solvent === 'base' ? baseSolvent : alt;
    if (!solvent) { st.available = false; st.unavailableReason = 'No second organic solvent is listed as available.'; res.steps.push(st); continue; }
    st.solventName = solvent;
    const target = tFor(step.temp);
    if (target !== null) {
      st.temperature = target;
      if (!colT.known) { st.limitsUnverified = true; st.needs.push(colT.reason); }
      else if (target > colT.value) { st.available = false; st.unavailableReason = `${target} °C exceeds the documented maximum ${colT.value} °C of ${cur.model.product}.`; }
    }
    // Every historical run is classified against the step-completion contract
    // (src/selectivity/completion.mjs). Matching the column, the solvent and
    // the temperature is NOT sufficient: the sample, the composition under
    // development, the rest of the mobile phase, the pressure specification
    // and whether the run can be read at all all decide the verdict, and the
    // verdict for every run is kept with its reasons.
    const ctx = {
      columnId: cur.column.id,
      history: hist,
      conversion: (solvent && solvent !== organicOf(current)) ? nomogramConvert(organicOf(current), solvent, percentBOf(current)) : null,
      nomogramTolerance: NOMOGRAM_TOLERANCE,
      baseTemperature: r => { const b = atBaseTemperature(r, settings); return { ...b, known: effectiveTemperature(r, settings).known }; },
    };
    ctx.baseSolvent = baseSolvent;
    ctx.convert = (from, to, b) => nomogramConvert(from, to, b);
    ctx.conversionReason = ctx.conversion?.reason || null;
    ctx.targets = compositionTargets(session, settings, current, st, ctx);
    st.compositionTargets = ctx.targets;
    for (const r of hist) {
      const c = classifyRun(session, settings, current, st, r, ctx);
      if (c.verdict === VERDICT.OTHER_STEP) continue;   // belongs to another step; not reported here
      st.classified.push({ runId: r.id, label: r.label, verdict: c.verdict, reasons: c.reasons, notes: c.notes });
      if (c.verdict === VERDICT.COMPLETED) st.evidence.push(r.label);
      else st.rejected.push(`${r.label} [${c.verdict}]: ${c.reasons.join('; ')}`);
      if (c.unsafePressure) st.priorUnsafe.push(c.unsafePressure);
    }
    st.performed = st.classified.length;
    st.done = st.evidence.length > 0;
    res.steps.push(st);
  }
  res.next = res.steps.find(s => !s.done && s.available) || null;
  res.exhausted = !res.next && res.steps.every(s => s.done || (!s.available && s.unavailableReason));
  res.ok = true;
  res.contract = COMPLETION_CONTRACT;
  // composition proposed for a solvent change: nomogram from the current run's %B
  if (res.next && res.next.solventName && res.next.solventName !== organicOf(current)) {
    res.next.conversion = nomogramConvert(organicOf(current), res.next.solventName, percentBOf(current));
  }
  return res;
}
