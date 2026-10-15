// correspondence.mjs — which peak is which compound.
//
// Kept strictly separate from visual alignment. A CONFIRMED assignment is a
// user statement. A PROPOSED assignment is produced by a stated method with a
// stated basis and uncertainty, and is never used in a calculation until the
// user accepts it. Peak position, equal peak counts and monotonic retention
// behaviour are never treated as proof of identity.
import { newId } from '../data-model/ids.mjs';
import { TEACHING_COMPOUNDS } from '../presets/bps2032.mjs';
import { peakExcluded } from '../data-model/peak-filter.mjs';

export const PREDICTION_WINDOW = { minMinutes: 0.05, fraction: 0.03,
  note: 'Tool default: a peak is a candidate for a predicted compound when it lies within max(0.05 min, 3 % of the predicted tR). Editable in code; not a course rule.' };

// One compound per name. Two records with the same name would split that
// compound's points between two lines and leave peaks unattributed, so an
// existing record is returned instead of a duplicate being created. The role
// is upgraded to "marker" if the new statement says so; it is never downgraded
// silently.
export function addCompound(session, name, role = 'analyte', idGen) {
  const clean = String(name).trim();
  const key = clean.toLowerCase();
  const existing = session.compounds.find(c => c.name.toLowerCase() === key);
  if (existing) {
    if (role === 'marker' && existing.role !== 'marker') existing.role = 'marker';
    existing.duplicateRequested = true;
    return existing;
  }
  const c = { id: newId('cmp', idGen), name: clean, role };
  session.compounds.push(c); return c;
}
export function loadTeachingCompounds(session, idGen) {
  const out = [];
  for (const t of TEACHING_COMPOUNDS) if (!session.compounds.some(c => c.name === t.name)) out.push(addCompound(session, t.name, t.role, idGen));
  return out;
}

export function assign(session, runId, peakNo, compoundId, { basis = 'user assignment', idGen } = {}) {
  // a compound occupies at most one peak per run; replace any earlier confirmation
  session.assignments = session.assignments.filter(a => !(a.runId === runId && a.compoundId === compoundId));
  const a = { id: newId('asg', idGen), runId, peakNo, compoundId, state: 'confirmed', ambiguous: false, basis, by: 'user' };
  session.assignments.push(a); return a;
}
export function unassign(session, runId, peakNo, compoundId) {
  const before = session.assignments.length;
  session.assignments = session.assignments.filter(a => !(a.runId === runId && a.peakNo === peakNo && (compoundId == null || a.compoundId === compoundId)));
  return before - session.assignments.length;
}
export function acceptProposal(session, assignmentId) {
  const p = session.assignments.find(a => a.id === assignmentId);
  if (!p || p.state !== 'proposed') return null;
  return assign(session, p.runId, p.peakNo, p.compoundId, { basis: `${p.basis} — accepted by user` });
}
export function clearProposals(session, runId = null) {
  session.assignments = session.assignments.filter(a => a.state !== 'proposed' || (runId && a.runId !== runId));
}

export function peakStatus(session, run) {
  const asg = session.assignments.filter(a => a.runId === run.id);
  return run.measured.peaks.map(p => {
    const confirmed = asg.filter(a => a.peakNo === p.no && a.state === 'confirmed').map(a => a.compoundId);
    const proposed = asg.filter(a => a.peakNo === p.no && a.state === 'proposed');
    const note = run.peakNotes?.[p.no] || {};
    let state = 'unmatched';
    if (peakExcluded(run,p)) state = 'excluded';
    else if (confirmed.length >= 2 || note.coeluted) state = 'coeluted';
    else if (confirmed.length === 1) state = 'matched';
    else if (proposed.length > 1 || proposed.some(x => x.ambiguous)) state = 'ambiguous';
    else if (proposed.length === 1) state = 'proposed';
    return { no: p.no, tR: p.tR, state, confirmed, proposed, note };
  });
}

export function missingCompounds(session, run) {
  const have = new Set(session.assignments.filter(a => a.runId === run.id && a.state === 'confirmed').map(a => a.compoundId));
  return session.compounds.filter(c => !have.has(c.id));
}

export function confirmedPeakOf(session, run, compoundId) {
  const a = session.assignments.filter(x => x.runId === run.id && x.compoundId === compoundId && x.state === 'confirmed');
  if (a.length !== 1) return null;
  return run.measured.peaks.find(p => p.no === a[0].peakNo) || null;
}

// Elution-order changes among confirmed compounds across a set of runs.
export function orderChanges(session, runs) {
  const changes = [];
  const ids = session.compounds.map(c => c.id);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const orders = [];
    for (const r of runs) {
      const a = confirmedPeakOf(session, r, ids[i]), b = confirmedPeakOf(session, r, ids[j]);
      if (a && b && a.no !== b.no) orders.push({ runId: r.id, label: r.label, first: a.tR < b.tR ? ids[i] : ids[j] });
    }
    if (new Set(orders.map(o => o.first)).size > 1) changes.push({ a: ids[i], b: ids[j], runs: orders });
  }
  return changes;
}

// Proposals from labels written in the imported file (generic compound_label,
// or a LabSolutions compound-table name). Matching is by exact name or by the
// abbreviation in parentheses, case-insensitive.
export function proposeFromFileLabels(session, run, idGen) {
  const out = [];
  for (const p of run.measured.peaks) {
    const lab = (p.fileName || '').trim().toLowerCase();
    if (!lab) continue;
    const hits = session.compounds.filter(c => { const n = c.name.toLowerCase(); const ab = (/\(([^)]+)\)/.exec(n) || [])[1]; return n === lab || ab === lab; });
    if (hits.length === 1 && !session.assignments.some(a => a.runId === run.id && a.compoundId === hits[0].id)) {
      const a = { id: newId('asg', idGen), runId: run.id, peakNo: p.no, compoundId: hits[0].id, state: 'proposed', ambiguous: false,
        basis: `label "${p.fileName}" written in the imported file`, uncertainty: 'The label is the file author\'s statement; confirm it.', by: 'auto' };
      session.assignments.push(a); out.push(a);
    }
  }
  return out;
}

// Order-based proposal from a reference run with CONFIRMED assignments.
// Offered only when the two runs report the same number of peaks, and even
// then marked low-confidence: equal counts do not establish identities, and a
// missing peak, a co-elution or an order change breaks positional matching.
export function proposeByOrder(session, run, refRun, idGen) {
  const ref = peakStatus(session, refRun).filter(s => s.state === 'matched');
  if (!ref.length) return { ok: false, reason: `Reference run "${refRun.label}" has no confirmed assignments.` };
  if (run.measured.peaks.length !== refRun.measured.peaks.length)
    return { ok: false, reason: `Peak counts differ (${run.measured.peaks.length} vs ${refRun.measured.peaks.length}); positional matching would be ambiguous, so no order-based proposal is made.` };
  const made = [];
  for (const s of ref) {
    const idx = refRun.measured.peaks.findIndex(p => p.no === s.no);
    const target = run.measured.peaks[idx];
    const compoundId = s.confirmed[0];
    if (session.assignments.some(a => a.runId === run.id && a.compoundId === compoundId)) continue;
    const a = { id: newId('asg', idGen), runId: run.id, peakNo: target.no, compoundId, state: 'proposed', ambiguous: false,
      basis: `same elution position as in "${refRun.label}"`, uncertainty: 'LOW: position only. Equal peak counts do not establish identity; elution order can change with solvent, temperature or ligand.', by: 'auto' };
    session.assignments.push(a); made.push(a);
  }
  return { ok: true, made };
}

// Prediction-based proposal: predictions = [{compoundId, tR, basis}].
export function proposeByPrediction(session, run, predictions, idGen) {
  const made = [], notes = [];
  const taken = new Map();
  for (const pr of predictions) {
    if (session.assignments.some(a => a.runId === run.id && a.compoundId === pr.compoundId && a.state === 'confirmed')) continue;
    const w = Math.max(PREDICTION_WINDOW.minMinutes, PREDICTION_WINDOW.fraction * pr.tR);
    const cands = run.measured.peaks.filter(p => Math.abs(p.tR - pr.tR) <= w);
    if (!cands.length) { notes.push({ compoundId: pr.compoundId, text: `no peak within ±${w.toFixed(3)} min of the predicted ${pr.tR.toFixed(3)} min (missing, co-eluted or moved)` }); continue; }
    const best = cands.reduce((m, p) => Math.abs(p.tR - pr.tR) < Math.abs(m.tR - pr.tR) ? p : m);
    const a = { id: newId('asg', idGen), runId: run.id, peakNo: best.no, compoundId: pr.compoundId, state: 'proposed', ambiguous: cands.length > 1,
      basis: `nearest peak to the model-predicted tR ${pr.tR.toFixed(3)} min (${pr.basis})`,
      uncertainty: cands.length > 1 ? `AMBIGUOUS: ${cands.length} peaks lie within ±${w.toFixed(3)} min.` : `One peak within ±${w.toFixed(3)} min; a prediction is not an identification.`, by: 'auto' };
    if (taken.has(best.no)) { a.ambiguous = true; a.uncertainty = 'AMBIGUOUS: the same peak is the nearest match for more than one compound (possible co-elution).'; taken.get(best.no).ambiguous = true; }
    taken.set(best.no, a);
    session.assignments.push(a); made.push(a);
  }
  return { made, notes };
}
