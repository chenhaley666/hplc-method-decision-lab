// integrity.mjs — a compact snapshot of derived results written into exported
// sessions, and the comparison made on re-import. Saved results are never
// trusted: they are recomputed, and any difference is reported.
export function derivedSnapshot(ev) {
  const runs = {};
  for (const [id, g] of Object.entries(ev.runEvaluations)) {
    const by = Object.fromEntries(g.gates.map(x => [x.id, x.value]));
    runs[id] = { verdict: g.verdict, peaks: by.peakCount, lastTR: by.lastPeak, minRs: by.minRs, pMax: by.pressure };
  }
  return { next: { status: ev.next.status, reason: ev.next.reason, action: ev.next.preferred?.action || null,
    actionable: !!ev.next.actionable, planningDraft: !!ev.next.readiness?.planningDraft },
    retention: { status: ev.retention.status, issuedMinB: ev.retention.issued?.candidates?.minimum?.B ?? null, subsetMinB: ev.retention.subset?.candidates?.minimum?.B ?? null },
    runs };
}

const same = (a, b) => (a === null || a === undefined) && (b === null || b === undefined) ? true
  : typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)) : a === b;

export function compareSnapshots(saved, fresh) {
  if (!saved) return { compared: false, differences: [], note: 'The imported session carried no derived snapshot; results were computed fresh.' };
  const diffs = [];
  for (const k of ['status', 'reason', 'action', 'actionable', 'planningDraft']) if (!same(saved.next?.[k], fresh.next[k])) diffs.push(`next.${k}: saved "${saved.next?.[k]}" → recomputed "${fresh.next[k]}"`);
  for (const k of ['status', 'issuedMinB', 'subsetMinB']) if (!same(saved.retention?.[k], fresh.retention[k])) diffs.push(`retention.${k}: saved ${saved.retention?.[k]} → recomputed ${fresh.retention[k]}`);
  for (const [id, r] of Object.entries(fresh.runs)) {
    const o = saved.runs?.[id];
    if (!o) { diffs.push(`run ${id}: not in the saved snapshot`); continue; }
    for (const k of Object.keys(r)) if (!same(o[k], r[k])) diffs.push(`run ${id}.${k}: saved ${o[k]} → recomputed ${r[k]}`);
  }
  return { compared: true, differences: diffs, note: diffs.length ? 'Saved derived results differ from the recomputed ones; the recomputed results are shown.' : 'Saved derived results match the recomputed results.' };
}
