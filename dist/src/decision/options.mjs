// options.mjs — build the ADMISSIBLE OPTIONS for a decision, each with the
// quantity that places it where it is and, where a model applies, the
// retention time it is expected to produce.
//
// Nothing here chooses silently: every option carries its ground, its
// admissibility and what remains unverified. Predictions are produced only
// from a model that applies to the target run (see applicability.mjs).
import { predictTR } from '../retention/candidates.mjs';
import { percentBOf, organicOf, runColumn, effectiveTemperature, relevantPeaks } from '../data-model/derive.mjs';
import { columnLimit } from '../data-model/equipment.mjs';
import { historyRuns } from '../selectivity/progression.mjs';
import { temperatureBracket, compare } from '../rules.mjs';
import { sampleCompare } from '../data-model/comparability.mjs';

const fmt = v => (v === null || v === undefined) ? null : Number(v);

// Predicted latest elution at composition B, from the applicable model.
export function predictLatest(app, B) {
  if (!app.ok || !app.t0) return { ok: false, reason: app.reasons[0] || 'no applicable model' };
  const preds = app.lines.map(l => ({ name: l.name, tR: predictTR(l.fit, app.t0.t0, B) }));
  const top = preds.reduce((m, p) => p.tR > m.tR ? p : m);
  const extrapolated = app.lines.filter(l => B < l.fit.xMin || B > l.fit.xMax).map(l => l.name);
  return { ok: true, tR: top.tR, controlling: top.name, preds, extrapolated };
}

// Compositions already measured on this run's condition (same confirmed
// column, same organic solvent, same temperature within tolerance).
export function measuredCompositions(session, settings, run) {
  const col = runColumn(session, run).column?.id, sol = organicOf(run), T = effectiveTemperature(run, settings);
  const out = [];
  for (const r of historyRuns(session)) {
    const c = runColumn(session, r), Tr = effectiveTemperature(r, settings);
    const sameCond = sampleCompare(session, r, run).comparable && c.confirmed && c.column?.id === col && organicOf(r) === sol && T.known && Tr.known && Math.abs(Tr.value - T.value) <= settings.tempMatchTolerance;
    const B = percentBOf(r);
    if (B !== null) out.push({ run: r, B, sameCondition: sameCond, lastTR: relevantPeaks(r).length ? relevantPeaks(r).at(-1).tR : null, peaks: relevantPeaks(r).length, temperature: Tr.known ? Tr.value : null });
  }
  return out;
}

// ---------------------------------------------------------------- retention options
// Returns every admissible %B option for the next run, in order, each with its
// quantity (the composition), its ground and its predicted latest retention
// time where the model applies.
export function retentionOptions(session, settings, run, retention, app, band) {
  const S = settings.specs;
  const B = percentBOf(run);
  const step = settings.retentionStep;
  const measured = measuredCompositions(session, settings, run);
  const onCond = measured.filter(m => m.sameCondition);
  const tested = new Set(onCond.map(m => m.B));
  const options = [];
  const add = o => { if (o) options.push(o); };

  const check = (newB) => {
    const notes = [], blocks = [];
    if (newB < 0 || newB > 100) blocks.push(`${newB} %B is outside 0–100 %.`);
    if (tested.has(newB)) notes.push(`${newB} %B has already been run on this condition; a repeat tests reproducibility rather than adding a new composition.`);
    const p = predictLatest(app, newB);
    if (p.ok) {
      const c = compare(p.tR, S.lastPeak.op, S.lastPeak.value);
      notes.push(`predicted latest elution ${p.tR.toFixed(2)} min (${p.controlling} controls) — ${c.pass ? 'within' : 'BEYOND'} the ${S.lastPeak.value} min specification`);
      if (p.extrapolated.length) notes.push(`EXTRAPOLATION for ${p.extrapolated.join(', ')} (outside their fitted range)`);
    } else notes.push(`no retention time is predicted: ${p.reason}`);
    notes.push('back-pressure at a different composition is not predicted (mobile-phase viscosity changes with composition); measure it');
    return { notes, blocks, predicted: p.ok ? p.tR : null, controlling: p.ok ? p.controlling : null, feasible: p.ok ? (S.lastPeak.op === '<' ? p.tR < S.lastPeak.value : p.tR <= S.lastPeak.value) : null };
  };

  // 1. the ladder decrement — only from a composition ON the ladder grid of
  //    this condition, and only while no LOWER composition measured on the
  //    SAME condition has already exceeded the run-time specification. A run
  //    at another temperature, another solvent or another column says nothing
  //    about this series.
  if (B !== null && B - step >= 0) {
    const nb = B - step, c = check(nb);
    const grid = onCond.map(m => m.B).concat(B);
    const top = Math.max(...grid);
    const k = (top - B) / step;
    const onGrid = Math.abs(k - Math.round(k)) < 1e-9;
    const tooLongBelow = onCond.filter(m => m.B < B && m.lastTR !== null && !(S.lastPeak.op === '<' ? m.lastTR < S.lastPeak.value : m.lastTR <= S.lastPeak.value));
    if (!onGrid) c.blocks.push(`${B} %B is not on the ${step}-point ladder grid of this condition (highest measured ${top} %B), so it was chosen as a minimum or intermediate composition rather than as a ladder point; a further fixed decrement from it is not the taught series.`);
    if (tooLongBelow.length) c.blocks.push(`a lower composition on this same condition has already exceeded the run-time specification (${tooLongBelow.map(m => `${m.B} %B, latest peak ${m.lastTR.toFixed(2)} min on "${m.run.label}"`).join('; ')}).`);
    add({ id: 'ladder', kind: 'percentB', percentB: nb, quantity: `${nb} %B (one ${step}-point decrement)`,
      ground: `The taught retention series steps %B down in ${step}-point steps while the run time allows it (Selectivity ED slide 16; FC1 rubric "10 % decrement").`,
      ...c, admissible: !c.blocks.length, blocked: c.blocks.join(' ') || null });
  }
  // 2. the modelled minimum whole-number %B
  const minB = retention?.issued?.candidates?.minimum?.B ?? null;
  const subsetMin = retention?.subset?.candidates?.minimum?.B ?? null;
  if (minB !== null && app.ok) {
    const c = check(minB);
    add({ id: 'minimum', kind: 'percentB', percentB: minB, quantity: `${minB} %B (modelled minimum)`,
      ground: `The smallest whole-number %B at which every modelled compound is predicted within the run-time specification. ${retention.issued.candidates.explanation}`,
      ...c, admissible: !c.blocks.length });
  } else if (subsetMin !== null) {
    const c = check(subsetMin);
    add({ id: 'minimum-subset', kind: 'percentB', percentB: subsetMin, quantity: `${subsetMin} %B (minimum over the modelled subset only)`,
      ground: `NOT a whole-sample minimum: ${retention.reasons.join(' ')}`,
      ...c, admissible: false, blocked: 'compound coverage is incomplete' });
  }
  // 3. the intermediate %B
  const inter = retention?.intermediate?.ok ? retention.intermediate.best : null;
  if (inter && app.ok) {
    const c = check(inter.B);
    add({ id: 'intermediate', kind: 'percentB', percentB: inter.B, quantity: `${inter.B} %B (intermediate)`,
      ground: `Derived from log K against %B across all modelled compounds: at ${inter.B} %B the smallest predicted adjacent α is ${inter.minAlpha.toFixed(3)} (${inter.pair.join(' / ')}), the largest over the admissible range. ${retention.intermediate.note}`,
      ...c, admissible: !c.blocks.length });
  }
  // 4. return to the previous composition (used when the run time is beyond the specification)
  const prev = onCond.filter(m => B === null || m.B > B).sort((a, b) => a.B - b.B)[0] || null;
  if (prev) add({ id: 'return-previous', kind: 'percentB', percentB: prev.B, quantity: `${prev.B} %B (the previous composition on this condition)`,
    ground: `Measured on "${prev.run.label}" with a latest peak at ${prev.lastTR === null ? 'no peaks' : prev.lastTR.toFixed(3) + ' min'}. Returning %B to its previous value restores a run time inside the specification before selectivity is changed (FC1 rubric).`,
    notes: [`measured, not predicted: ${prev.lastTR === null ? 'this run reported no peaks' : `latest peak ${prev.lastTR.toFixed(3)} min, ${prev.peaks} peak(s)`}`], blocks: [], predicted: prev.lastTR, controlling: 'measured', feasible: prev.lastTR === null ? null : (S.lastPeak.op === '<' ? prev.lastTR < S.lastPeak.value : prev.lastTR <= S.lastPeak.value), admissible: true, measured: true });

  return { options, band, measuredCompositions: measured, testedOnCondition: [...tested].sort((a, b) => a - b) };
}

// ---------------------------------------------------------------- selectivity options
// Every open selectivity step, in plan order, each with the quantity that
// places it there (the temperature, the converted composition or the ligand)
// and the reason it occupies that position.
export function selectivityOptions(session, settings, run, progression) {
  if (!progression?.ok) return { options: [], remaining: [] };
  const { model } = runColumn(session, run);
  const colT = columnLimit(model, 'temperature');
  const curT = effectiveTemperature(run, settings);
  const last = relevantPeaks(run).length ? relevantPeaks(run).at(-1) : null;
  const open = progression.steps.filter(s => !s.done);
  const options = open.map((s, i) => {
    const o = { id: s.id, label: s.label, available: s.available, unavailableReason: s.unavailableReason || null,
      positionReason: s.positionReason || POSITION_REASON[s.id] || 'Position set by the selected selectivity plan.',
      quantity: null, prediction: null, notes: [...(s.needs || [])], limitsUnverified: !!s.limitsUnverified };
    if (s.kind === 'ligand') {
      o.quantity = s.alternatives?.length ? `a column with a different ligand: ${s.alternatives.join(' or ')}` : 'a column with a different, recorded ligand';
      o.notes.push('Retention and elution order on a new ligand are unpredictable (SELECTIVITY Discovery Book §2.7): no time is predicted.');
      return o;
    }
    const parts = [];
    if (s.solventName && s.solventName !== organicOf(run)) {
      const cv = s.conversion || progression.conversionFor?.(s) || null;
      parts.push(cv?.available ? `${s.solventName} at ${cv.rounded} %B (nomogram-converted from ${percentBOf(run)} % ${organicOf(run)})` : `${s.solventName} at a composition that cannot be converted`);
      if (!cv?.available && cv?.reason) o.notes.push(cv.reason);
    } else if (s.solventName) parts.push(`${s.solventName} (unchanged)`);
    if (s.temperature) {
      parts.push(`${s.temperature} °C`);
      const solventChanges = s.solventName && s.solventName !== organicOf(run);
      if (solventChanges) o.notes.push('No retention time is predicted: the 1–2 %/°C rule of thumb describes a temperature change alone, and this step also changes the organic solvent, whose effect on each compound is not predictable (SELECTIVITY Discovery Book §2.4).');
      else {
        const br = last ? temperatureBracket(last.tR, curT.known ? curT.value : null, s.temperature) : { ok: false, reason: 'no latest peak' };
        o.prediction = br.ok ? { min: br.min, max: br.max, dT: br.dT, basis: `rule of thumb 1–2 % per °C over ΔT ${br.dT.toFixed(1)} °C${Math.abs(br.dT) > 30 ? '; beyond ~30 °C the f = 0.02 end is less dependable' : ''}` } : null;
        if (!br.ok) o.notes.push(br.reason);
      }
      if (!colT.known) o.notes.push(colT.reason);
      else o.notes.push(`documented column maximum ${colT.value} °C`);
    }
    o.quantity = parts.join(', ');
    return o;
  });
  return { options, remaining: options.map(o => o.label) };
}

export const POSITION_REASON = {
  'base-T1': 'First: temperature is changed on the solvent already used for retention, so the composition and the column stay as they are and only one parameter moves (FC1 rubric, order of the selectivity parameters).',
  'base-T2': 'Second: the other configured temperature on the same solvent, completing the temperature pair before the solvent is changed.',
  'alt-base': 'Third: the second solvent enters at its nomogram-converted %B, which matches elution strength so that any change in spacing is attributable to solvent chemistry rather than to strength (SELECTIVITY Discovery Book §2.4).',
  'alt-T1': 'Fourth: the same two temperatures are then repeated on the second solvent.',
  'alt-T2': 'Fifth: the second of those temperatures.',
  'ligand': 'Last: changing the ligand changes every interaction at once and its effect on retention and elution order is unpredictable, so it follows the parameters whose effect can be reasoned about (SELECTIVITY Discovery Book §2.7).',
};
export { fmt };
