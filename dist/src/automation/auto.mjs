// auto.mjs — what the tool does for the user without being asked.
//
// The rule that governs everything here: the tool may act on what a FILE
// STATES, and it may act on structure (which runs are comparable with which).
// It may not act on inference about identity. A compound label written in the
// imported file is the file author's statement and is recorded as such, with
// "as stated in the file" as its provenance; a peak order, a monotonic
// retention sequence or a file name is NOT a statement of identity and never
// becomes one here.
//
// Every action is returned in a report, so nothing happens silently.
import { addCompound } from '../alignment/correspondence.mjs';
import { newInstrument, newColumnModel, newPhysicalColumn } from '../data-model/equipment.mjs';
import { organicOf, percentBOf, modeOf, effectiveTemperature, isBlank, runColumn } from '../data-model/derive.mjs';
import { usable, knownValue } from '../data-model/conditions.mjs';
import { newId } from '../data-model/ids.mjs';
import { sampleIdentity, sampleGroupKey } from '../data-model/comparability.mjs';
import { fileInstrumentName, resolveFileInstrument, INSTRUMENT_SUGGESTION } from '../data-model/instrument-association.mjs';

const label = run => run.label || run.id;

// ---------------------------------------------------------------- equipment
// A generic CSV may state the column and the instrument in its own columns, and
// a LabSolutions export states the instrument name. Those are file statements,
// so a record may be created and associated from them. Nothing is read from a
// file NAME, and the created column record carries no geometry and no limits:
// those are datasheet facts the file does not state, so they stay unknown and
// every proposal that needs them reports them as unverified.
export function autoEquipment(session, idGen) {
  const acts = [];
  const assoc = { instrument: new Map(), column: new Map() };
  for (const run of session.runs) {
    const insName = fileInstrumentName(run);
    const prior = run.assoc.instrumentId;
    // Reconcile only our old importer suggestion, never a user override.
    const oldSuggestion = prior.source === INSTRUMENT_SUGGESTION && prior.confirmed === false;
    if (insName && (!prior.value || oldSuggestion)) {
      const resolved = resolveFileInstrument(session, run);
      if (resolved.matches.length > 1) {
        acts.push(`Instrument name "${insName}" matches ${resolved.matches.length} equipment records. No record was selected or confirmed; choose the actual instrument in Equipment.`);
      } else {
        let ins = resolved.record;
        if (!ins && !prior.value) { ins = newInstrument({ label: insName, identifier: insName, provenance: { source: 'file' } }, idGen); session.instruments.push(ins); acts.push(`Created instrument record "${insName}" because the file states that instrument name. No operating limit is recorded for it: a file does not state hardware ratings.`); }
        const association = resolveFileInstrument(session, run).association;
        // Do not redirect an existing suggestion if its target has since changed.
        if (ins && (!prior.value || prior.value === ins.id)) {
          run.assoc.instrumentId = association;
          if (association.confirmed) {
            if (!prior.confirmed) assoc.instrument.set(ins.label, (assoc.instrument.get(ins.label) || 0) + 1);
          } else acts.push(`Instrument name "${insName}" matches an existing equipment record by name only. The association remains unconfirmed; confirm the actual instrument before using its hardware ratings.`);
        }
      }
    }
    const colName = run.measured.fileMeta?.columnLabel || null;
    if (colName && !run.assoc.columnId.value) {
      let col = session.columns.find(c => c.label === colName);
      if (!col) {
        const model = newColumnModel({ product: colName, provenance: { source: 'file' }, notes: 'Created from the column label stated in the imported file. Geometry and datasheet limits are NOT stated by a data file and remain unknown.' }, idGen);
        session.columnModels.push(model);
        col = newPhysicalColumn({ label: colName, modelId: model.id }, idGen); session.columns.push(col);
        acts.push(`Created a column record "${colName}" from the column label stated in the file. Its ligand, geometry and limits are unknown: a data file does not state them, so any proposal that depends on them will say so.`);
      }
      run.assoc.columnId = { value: col.id, source: 'file: column label stated in the file', confirmed: true };
      assoc.column.set(col.label, (assoc.column.get(col.label) || 0) + 1);
    }
  }
  for (const [lab, n] of assoc.instrument) acts.push(`Associated ${n} run(s) with instrument "${lab}", as stated in each run's own file.`);
  for (const [lab, n] of assoc.column) acts.push(`Associated ${n} run(s) with column "${lab}", as stated in each run's own file.`);
  return acts;
}

// ---------------------------------------------------------------- compounds
// A file-stated compound label and a file-stated marker flag are data. They are
// recorded with "as stated in the file" as the basis and are visibly distinct
// from a user confirmation; an identity is never derived from peak order.
export function autoCompoundsFromFile(session, settings, idGen) {
  const acts = [];
  if (settings.useFileLabels === false) return ['File-stated compound labels are switched off in Settings; no identity was recorded.'];
  const recorded = new Map(), markers = [], conflicts = [];
  for (const run of session.runs) {
    // A file can state its own labels inconsistently. Two peaks flagged as the
    // hold-up marker, or one label on two peaks, is a CONFLICT in the file:
    // the tool reports it and records nothing from it, because picking one of
    // the two would be the tool deciding an identity.
    const flagged = run.measured.peaks.filter(p => p.markerFlag === true);
    if (flagged.length > 1) {
      conflicts.push(`${label(run)}: ${flagged.length} peaks (${flagged.map(p => p.no).join(', ')}) are flagged as the hold-up marker in the file. A run has one hold-up time, so no marker was taken from it and t0 is not established for that run — correct the file or choose the marker peak yourself.`);
    }
    const byName = new Map();
    for (const p of run.measured.peaks) { const n = (p.fileName || '').trim().toLowerCase(); if (n) byName.set(n, [...(byName.get(n) || []), p.no]); }
    const dupNames = [...byName.entries()].filter(([, nos]) => nos.length > 1);
    for (const [n, nos] of dupNames) conflicts.push(`${label(run)}: the label "${n}" is on ${nos.length} peaks (${nos.join(', ')}). One compound cannot be two peaks of one run, so nothing was recorded for that label here — it is either a co-elution, a mislabelled peak or two compounds sharing a name.`);
    const blocked = new Set(dupNames.map(([n]) => n));
    const markerBlocked = flagged.length > 1;
    for (const p of run.measured.peaks) {
      const name = (p.fileName || '').trim();
      const isMarker = p.markerFlag === true && !markerBlocked;
      if (!name || blocked.has(name.toLowerCase())) continue;
      let c = session.compounds.find(x => x.name.toLowerCase() === name.toLowerCase() || (/\(([^)]+)\)/.exec(x.name.toLowerCase()) || [])[1] === name.toLowerCase());
      if (!c) { c = addCompound(session, name, isMarker ? 'marker' : 'analyte', idGen); acts.push(`Defined ${isMarker ? 'the hold-up marker' : 'the compound'} "${name}" because the imported file names it.`); }
      if (!session.assignments.some(a => a.runId === run.id && a.peakNo === p.no && a.compoundId === c.id)) {
        session.assignments.push({ id: newId('asg', idGen), runId: run.id, peakNo: p.no, compoundId: c.id, state: 'confirmed', ambiguous: false,
          basis: `compound label "${name}" stated in the imported file`, uncertainty: 'This is the file author\'s statement, recorded as file data. It is not a confirmation by this tool and not a chemical identification.', by: 'file' });
        recorded.set(name, (recorded.get(name) || 0) + 1);
      }
      if (isMarker && run.marker.method === 'none') {
        run.marker = { method: 'peak', peakNo: p.no, t0: null, note: `Marked as the hold-up marker by the "is_marker" column of the imported file.`, confirmed: true };
        markers.push(label(run));
      }
    }
  }
  for (const [name, n] of recorded) acts.push(`Recorded "${name}" in ${n} run(s), each as stated in that run's own file. This is file data, not a confirmation by the tool and not a chemical identification.`);
  if (markers.length) acts.push(`Took the file-flagged hold-up marker in ${markers.length} run(s), giving t0 for each of them from its own marker peak.`);
  for (const c of conflicts) acts.push(`CONFLICT IN THE FILE — ${c}`);
  return acts;
}

// ---------------------------------------------------------------- fit groups
// Compatible groups are structural, not a guess: same confirmed physical
// column, same organic solvent, isocratic, known temperatures within the
// configured tolerance, same pH / additive / phase A where recorded. The
// largest group with at least the configured minimum number of DISTINCT
// compositions is proposed for the retention fit.
export function fitGroups(session, settings) {
  const groups = new Map();
  for (const run of session.runs) {
    if (isBlank(run) || !run.measured.peaks.length) continue;
    const col = runColumn(session, run);
    const T = effectiveTemperature(run, settings);
    const B = percentBOf(run), org = organicOf(run), mode = modeOf(run);
    const why = [];
    if (!col.confirmed || !col.column) why.push('no confirmed physical column');
    if (!org) why.push('no recorded organic solvent');
    if (B === null) why.push('no confirmed %B');
    if (mode && mode !== 'ISO') why.push(`mode is ${mode}, and the log K vs %B model is isocratic`);
    if (!T.known) why.push(`column temperature unknown (${T.reason})`);
    if (why.length) { groups.set(`excluded:${run.id}`, { key: null, excluded: true, runs: [run], reasons: why }); continue; }
    const identity = sampleIdentity(run);
    const sample = sampleGroupKey(session, run);
    if (sample === null) why.push(identity.reason);
    if (why.length) { groups.set(`excluded:${run.id}`, { key: null, excluded: true, runs: [run], reasons: why }); continue; }
    // The explicit ID/equivalence is part of the key; sample TYPE never is.
    // A matching column, solvent and temperature says nothing about identity.
    const bucket = [col.column.id, sample, org, mode || 'ISO', Math.round(T.value / Math.max(settings.tempMatchTolerance || 1, 0.001)),
      knownValue(run.conditions.pH) ? run.conditions.pH.value : '', knownValue(run.conditions.additiveName) ? run.conditions.additiveName.value : '',
      knownValue(run.conditions.additiveConc) ? run.conditions.additiveConc.value : '', knownValue(run.conditions.phaseA) ? run.conditions.phaseA.value : '', knownValue(run.conditions.phaseB)?run.conditions.phaseB.value:'', knownValue(run.conditions.mixAcnPct)?run.conditions.mixAcnPct.value:''].join('|');
    const g = groups.get(bucket) || { key: bucket, excluded: false, runs: [], column: col.column.label, sample, organic: org, temperature: T.value, compositions: new Set() };
    g.runs.push(run); g.compositions.add(B); groups.set(bucket, g);
  }
  const usable_ = [...groups.values()].filter(g => !g.excluded).map(g => ({ ...g, compositions: [...g.compositions].sort((a, b) => a - b) }));
  usable_.sort((a, b) => b.compositions.length - a.compositions.length || b.runs.length - a.runs.length);
  return { groups: usable_, excluded: [...groups.values()].filter(g => g.excluded).map(g => ({ run: g.runs[0], reasons: g.reasons })) };
}

export function autoFitSelection(session, settings) {
  const acts = [];
  const { groups, excluded } = fitGroups(session, settings);
  const eligible = groups.filter(g => g.compositions.length >= (settings.minFitPoints || 3));
  const pool = eligible.length ? eligible : groups;
  const best = pool[0] || null;
  for (const run of session.runs) { run.flags.history = !isBlank(run) && run.measured.peaks.length > 0; }
  if (!best) {
    acts.push('No group of comparable runs could be formed, so no retention fit was proposed.');
    for (const e of excluded) acts.push(`${label(e.run)} cannot join a fit group: ${e.reasons.join('; ')}.`);
    return { acts, group: null, groups, excluded, ambiguous: false };
  }
  // Several groups can be equally good. Choosing one of them by the order the
  // files happened to be imported would be an arbitrary scientific decision
  // dressed as a result, so the tie is reported and NOTHING is ticked.
  const tied = pool.filter(g => g.compositions.length === best.compositions.length && g.runs.length === best.runs.length);
  if (tied.length > 1) {
    for (const run of session.runs) run.flags.fit = false;
    acts.push(`${tied.length} groups of comparable runs are equally plausible for the retention fit — each has ${best.runs.length} run(s) at ${best.compositions.length} distinct composition(s): ${tied.map(g => `sample ${g.sample} on "${g.column}" in ${g.organic} at ${g.temperature.toFixed(1)} °C (${g.compositions.join(', ')} %B)`).join('; ')}. None was selected: choosing between them is a scientific decision, and the order the files were imported in is not a reason. Tick the group you intend to fit in the run table.`);
    for (const e of excluded) acts.push(`${label(e.run)} is not in any fit group: ${e.reasons.join('; ')}.`);
    return { acts, group: null, groups, excluded, ambiguous: true, tied };
  }
  for (const run of session.runs) run.flags.fit = best.runs.includes(run);
  acts.push(`Proposed a retention fit over ${best.runs.length} comparable run(s) at ${best.compositions.length} distinct composition(s) (${best.compositions.join(', ')} %B) for sample ${best.sample} on column "${best.column}" in ${best.organic} at ${best.temperature.toFixed(1)} °C. The group is structural: same sample, column, solvent, mode and temperature within ${settings.tempMatchTolerance} °C.`);
  if (groups.length > 1) acts.push(`${groups.length - 1} other comparable group(s) exist (${groups.filter(g => g !== best).map(g => `${g.runs.length} run(s), sample ${g.sample}, on "${g.column}" in ${g.organic} at ${g.temperature.toFixed(1)} °C`).join('; ')}). The group above was chosen because it has the most distinct compositions; tick a different group in the run table to fit that one instead.`);
  for (const e of excluded) acts.push(`${label(e.run)} is not in any fit group: ${e.reasons.join('; ')}.`);
  return { acts, group: best, groups, excluded };
}

// ---------------------------------------------------------------- one call
// Run after an import. Returns a report of every action, with its basis.
export function autoPrepare(session, settings = session.settings, { idGen } = {}) {
  const report = { equipment: [], compounds: [], fit: [], at: new Date().toISOString(), off: settings.automatic === false };
  if (report.off) { report.note = 'Automatic preparation is switched off in Settings. Nothing was changed.'; return report; }
  report.equipment = autoEquipment(session, idGen);
  report.compounds = autoCompoundsFromFile(session, settings, idGen);
  const f = autoFitSelection(session, settings);
  report.fit = f.acts; report.group = f.group ? { runs: f.group.runs.map(r => r.id), compositions: f.group.compositions, sample: f.group.sample } : null;
  report.ambiguousGroups = f.ambiguous ? f.tied.map(g => ({ sample: g.sample, column: g.column, organic: g.organic, temperature: g.temperature, compositions: g.compositions, runs: g.runs.map(r => r.id) })) : null;
  report.note = 'Everything above follows from what the files state and from which runs are comparable with which. No identity was inferred from peak order, from a retention sequence or from a file name.';
  return report;
}
