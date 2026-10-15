// exploratory.mjs — POSITION HYPOTHESES (front- and back-aligned elution
// positions) for runs whose peaks have no confirmed identities.
//
// These are exploratory calculations only. A position is not a compound; equal
// peak counts do not establish identity; monotonic behaviour is a consistency
// check, not proof. Two hypotheses are shown because they are easy to state —
// they are NOT an exhaustive set of chemically possible mappings. Results are
// never issued as a next-run method.
import { retentionFactor, linearFit } from '../rules.mjs';
import { evaluateCandidates } from './candidates.mjs';
import { relevantPeaks } from '../data-model/derive.mjs';

export const EXPLORATORY_LABEL = 'EXPLORATORY — position hypothesis, not compound identities. Not exhaustive. Not issued as a method.';

export function positionHypotheses(session, settings, eligibilityRuns, t0Proposed, spec) {
  // runs that pass everything except identities
  const usableRuns = eligibilityRuns.filter(e => e.t0.ok && e.percentB !== null && e.lineageOk && !e.blank && e.hasPeaks);
  if (usableRuns.length < 2) return { ok: false, reason: 'Fewer than two comparable runs with an established t0.' };
  const series = { front: new Map(), back: new Map() };
  for (const e of usableRuns) {
    const t0 = e.t0.t0;
    const retained = relevantPeaks(e.run).filter(p => p.tR > t0 + 1e-9);
    retained.forEach((p, i) => {
      const k = retentionFactor(p.tR, t0); if (!k.ok) return;
      const pt = { runLabel: e.label, x: e.percentB, y: k.logK, tR: p.tR, k: k.k };
      const f = i + 1, b = -(retained.length - i);
      if (!series.front.has(f)) series.front.set(f, []); series.front.get(f).push(pt);
      if (!series.back.has(b)) series.back.set(b, []); series.back.get(b).push(pt);
    });
  }
  const out = {};
  for (const [name, map] of Object.entries(series)) {
    const lines = [], skipped = [];
    let violations = 0;
    for (const [pos, pts] of map) {
      const sorted = [...pts].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) if (sorted[i].x > sorted[i - 1].x && sorted[i].y >= sorted[i - 1].y) violations++;
      const fit = linearFit(pts);
      if (!fit.ok || fit.n < settings.minFitPoints) { skipped.push({ pos, n: pts.length }); continue; }
      lines.push({ compoundId: `${name}:${pos}`, name: `${name === 'front' ? 'front' : 'back'} position ${pos}`, fit, pts });
    }
    const cand = lines.length && t0Proposed > 0 ? evaluateCandidates(lines, t0Proposed, spec) : null;
    out[name] = { lines, skipped, violations, candidates: cand };
  }
  return { ok: true, label: EXPLORATORY_LABEL, usedRuns: usableRuns.map(e => e.label), ...out,
    note: 'Monotonicity violations count how often a position\'s log K does not fall as %B rises — a consistency check only (RETENTION Discovery Book §8.2), not an identification.' };
}
