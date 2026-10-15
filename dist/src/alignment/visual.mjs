// visual.mjs — DISPLAY-ONLY alignment of chromatograms.
//
// These transforms change only the x coordinate used to draw a trace. They
// never change a stored retention time and are never used in a calculation.
// Every aligned view is labelled as aligned.
import { confirmedPeakOf } from './correspondence.mjs';
import { t0Of } from '../data-model/derive.mjs';

export const ALIGN_MODES = {
  original: { label: 'Original retention-time axis (min)', axis: 'tR (min) — as measured' },
  compound: { label: 'Aligned to a selected reference compound (time shift)', axis: 'ALIGNED: tR − tR(reference compound) (min) — not a measured retention time' },
  normalised: { label: 'Normalised retention coordinate K = (t − t0)/t0', axis: 'ALIGNED: (t − t0)/t0 — dimensionless, needs an established t0' },
};

// Returns {ok, map:(t)=>x, note}. When a run lacks what the mode needs it is
// NOT drawn in the aligned view and the reason is reported, so unlike axes are
// never mixed in one plot.
export function alignmentFor(session, run, mode, { compoundId = null, settings } = {}) {
  if (mode === 'original') return { ok: true, map: t => t, note: '' };
  if (mode === 'compound') {
    if (!compoundId) return { ok: false, note: 'Select the reference compound.' };
    const pk = confirmedPeakOf(session, run, compoundId);
    if (!pk) return { ok: false, note: 'The reference compound is not confirmed in this run; the run is not drawn in the aligned view.' };
    return { ok: true, map: t => t - pk.tR, note: `shifted by −${pk.tR.toFixed(3)} min (display only)` };
  }
  if (mode === 'normalised') {
    const t0 = t0Of(session, run, settings);
    if (!t0.ok) return { ok: false, note: `No t0 (${t0.text}); the run is not drawn in the normalised view.` };
    return { ok: true, map: t => (t - t0.t0) / t0.t0, note: `t0 = ${t0.t0.toFixed(3)} min (${t0.method}${t0.proxy ? ', UNCONFIRMED PROXY' : ''})` };
  }
  return { ok: false, note: `Unknown alignment mode ${mode}.` };
}
