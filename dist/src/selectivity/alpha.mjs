// alpha.mjs — selectivity α = K(later) / K(earlier) for adjacent retained
// peaks of one run (SELECTIVITY Discovery Book §2.2). Not calculated without
// an established t0. Pairs are by elution position in that run; no compound
// identity is implied.
import { retentionFactor, selectivityFactor } from '../rules.mjs';
import { t0Of, relevantPeaks } from '../data-model/derive.mjs';

export function alphaPairs(session, run, settings) {
  const t0 = t0Of(session, run, settings);
  if (!t0.ok) return { ok: false, reason: `α not calculated: ${t0.text}` };
  const retained = relevantPeaks(run).filter(p => p.tR > t0.t0 + 1e-9).map(p => ({ ...p, K: retentionFactor(p.tR, t0.t0) })).filter(p => p.K.ok);
  const pairs = [];
  for (let i = 1; i < retained.length; i++) {
    const a = retained[i - 1], b = retained[i]; const al = selectivityFactor(a.K.k, b.K.k);
    pairs.push({ from: a.no, to: b.no, k1: a.K.k, k2: b.K.k, alpha: al.ok ? al.alpha : null });
  }
  return { ok: true, t0, pairs, note: 'Adjacent retained peaks in elution order of this run. α measures spacing of apices only; it ignores width (unlike Rs). Positions are not identities.' };
}
