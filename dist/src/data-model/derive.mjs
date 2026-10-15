// derive.mjs — read-only views of a run used by the rules: its column and
// instrument records, its effective temperature and its t0. Nothing here
// writes to the session.
import { usable, knownValue, normaliseSolvent } from './conditions.mjs';
import { columnVolumeT0, num } from '../rules.mjs';
import { peakExcluded } from './peak-filter.mjs';

export function runColumn(session, run) {
  const a = run.assoc?.columnId;
  const column = a?.value ? session.columns.find(c => c.id === a.value) || null : null;
  const model = column?.modelId ? session.columnModels.find(m => m.id === column.modelId) || null : null;
  return { column, model, confirmed: !!(column && a.confirmed), source: a?.source || null };
}
export function runInstrument(session, run) {
  const a = run.assoc?.instrumentId;
  const instrument = a?.value ? session.instruments.find(i => i.id === a.value) || null : null;
  return { instrument, confirmed: !!(instrument && a.confirmed), source: a?.source || null };
}

export const organicOf = run => usable(run.conditions.organic) ? normaliseSolvent(run.conditions.organic.value) : null;
export const percentBOf = run => usable(run.conditions.percentB) ? num(run.conditions.percentB.value) : null;
export const flowOf = run => usable(run.conditions.flow) ? num(run.conditions.flow.value) : null;
// Conservative: a run recorded as a blank by ANY source (even unconfirmed) is
// not treated as a sample run.
export const isBlank = run => knownValue(run.conditions.sampleType) && /^(BLK|BLANK)$/i.test(String(run.conditions.sampleType.value));
export const modeOf = run => usable(run.conditions.mode) ? String(run.conditions.mode.value).toUpperCase() : null;

// Effective column temperature.
//  * A recorded oven trace (file) that is stable within tolerance gives a
//    measured temperature (its mean).
//  * An unstable trace gives NO temperature, whatever the setpoint says.
//  * Without a trace, only a CONFIRMED numeric setpoint gives a temperature.
//  * "ambient" means no setpoint; it never becomes 20 or 25 °C.
//  * Otherwise the temperature is unknown.
// The stability policy, stated wherever a stability judgement is shown. The
// rubric and the unit material do not define an interval or a tolerance for
// oven stability, so both are TOOL POLICY: the tolerance is the configured
// setting and the interval is the exported chromatogram window.
export const TEMPERATURE_STABILITY_POLICY = {
  id: 'tool.temperatureStability',
  short: 'Stability policy (tool default, not a course rule): the span of the oven trace within the analysed interval is compared with the configured stability tolerance; points outside that interval are excluded and counted; and the readings must actually cover the interval — a small span observed from too few readings, or with a long gap between them, is not evidence of stability.',
  detail: 'A status trace can begin before the separation (oven warm-up, equilibration) and continue after it. Warm-up before the analytical period is not instability during it, so the judgement uses only the points inside the detector chromatogram window where the export states that timing. Where it does not, the whole trace is used and that is stated.',
};

export const OVEN_COVERAGE_DEFAULTS = { minReadings: 3, maxGapFraction: 0.25 };

// Oven statistics over the interval actually judged, with the interval stated.
export function ovenAnalysedWindow(run, settings = null) {
  const oven = run.measured.oven;
  if (!oven) return { stats: null, restricted: false, interval: 'No oven trace.', excluded: 0 };
  const w = oven.window;
  if (w && Number.isFinite(w.mean)) {
    const excluded = (w.excludedBefore || 0) + (w.excludedAfter || 0);
    const minReadings = settings?.ovenMinReadings ?? OVEN_COVERAGE_DEFAULTS.minReadings;
    const maxGapFraction = settings?.ovenMaxGapFraction ?? OVEN_COVERAGE_DEFAULTS.maxGapFraction;
    const coverage = [];
    if ((w.n ?? 0) < minReadings) coverage.push(`only ${w.n} reading(s) lie inside the analysed interval, and the policy requires at least ${minReadings}: a small observed range from so few readings is not evidence that the temperature was steady`);
    if (Number.isFinite(w.maxGapFraction) && w.maxGapFraction > maxGapFraction)
      coverage.push(`the longest stretch of the analysed interval with no reading is ${w.maxGap.toFixed(2)} min (${(w.maxGapFraction * 100).toFixed(0)} % of it${w.maxGapAt ? `, between ${w.maxGapAt[0].toFixed(2)} and ${w.maxGapAt[1].toFixed(2)} min` : ''}), above the ${(maxGapFraction * 100).toFixed(0)} % the policy admits: what happened in that stretch was not observed`);
    return { stats: w, restricted: true, excluded, from: w.from, to: w.to, coverageProblems: coverage, adequate: coverage.length === 0,
      interval: `Analysed interval ${w.from.toFixed(2)}–${w.to.toFixed(2)} min (${oven.windowSource || 'the exported chromatogram window'}), ${w.n} oven reading(s); ${excluded ? `${w.excludedBefore || 0} reading(s) before the interval (warm-up or equilibration) and ${w.excludedAfter || 0} after it were excluded from the stability judgement and are shown separately` : 'no reading lies outside it'}.` };
  }
  return { stats: oven, restricted: false, excluded: 0,
    interval: `The export does not state a chromatogram window for this run, so the WHOLE oven trace${oven.span ? ` (${oven.span.from.toFixed(2)}–${oven.span.to.toFixed(2)} min)` : ''} was used; warm-up before the separation cannot be separated from instability during it.` };
}

export function effectiveTemperature(run, settings) {
  const tol = settings.tempStabilityTolerance;
  const sp = run.conditions.ovenSetpoint;
  const spNum = knownValue(sp) && sp.value !== 'ambient' ? num(sp.value) : null;
  const ambient = knownValue(sp) && sp.value === 'ambient';
  const ovenRaw = run.measured.oven;
  if (ovenRaw && Number.isFinite(ovenRaw.mean)) {
    const w = ovenAnalysedWindow(run, settings);
    const oven = w.stats;                         // the interval actually judged
    const range = oven.max - oven.min;
    const basisText = `${w.interval} ${TEMPERATURE_STABILITY_POLICY.short}`;
    // Insufficient observation is not stability. A trace whose readings do not
    // cover the analysed interval leaves the temperature UNKNOWN, whatever the
    // span of the few readings there are.
    if (w.restricted && w.adequate === false) return { known: false, value: null, stable: null, setpoint: spNum, ambient, window: w,
      reason: `The oven trace does not observe the analysed interval well enough to judge stability: ${w.coverageProblems.join('; ')}. The readings present span ${oven.min.toFixed(2)}–${oven.max.toFixed(2)} °C, but that is not evidence either way. ${basisText}` };
    if (range > tol) return { known: false, value: null, stable: false, setpoint: spNum, ambient, window: w,
      reason: `Over the analysed interval the recorded oven trace ranges ${oven.min.toFixed(1)}–${oven.max.toFixed(1)} °C (span ${range.toFixed(1)} °C > stability tolerance ${tol} °C): the column was not at a stable temperature during the separation itself. ${basisText}` };
    if (spNum !== null && Math.abs(oven.mean - spNum) > tol) return { known: false, value: null, stable: true, setpoint: spNum, ambient, window: w,
      reason: `Oven trace mean ${oven.mean.toFixed(2)} °C over the analysed interval disagrees with the ${sp.confirmed ? 'confirmed' : 'unconfirmed'} setpoint ${spNum} °C by more than ${tol} °C. ${basisText}` };
    return { known: true, value: oven.mean, stable: true, setpoint: spNum, ambient, basis: 'trace', window: w,
      reason: `Recorded oven trace (file): mean ${oven.mean.toFixed(2)} °C, range ${oven.min.toFixed(2)}–${oven.max.toFixed(2)} °C${spNum !== null ? `, consistent with setpoint ${spNum} °C` : ambient ? ', no setpoint (ambient) — this is the oven-compartment sensor reading' : ''}. ${basisText}` };
  }
  if (spNum !== null && sp.confirmed) return { known: true, value: spNum, stable: null, setpoint: spNum, ambient: false, basis: 'setpoint',
    reason: `Confirmed setpoint ${spNum} °C (${sp.source}); no oven trace available to verify stability.` };
  if (spNum !== null) return { known: false, value: null, stable: null, setpoint: spNum, ambient: false,
    reason: `Setpoint ${spNum} °C comes from ${sp.source} and is not confirmed; no oven trace to verify it.` };
  if (ambient) return { known: false, value: null, stable: null, setpoint: null, ambient: true,
    reason: 'Recorded as ambient (no setpoint) and no oven trace: the column temperature is unknown. It is not assumed to be 20 or 25 °C.' };
  return { known: false, value: null, stable: null, setpoint: null, ambient: false, reason: 'Column temperature not recorded.' };
}

// t0 for a run, with how it was established.
export function t0Of(session, run, settings) {
  const markerIds = new Set(session.compounds.filter(c => c.role === 'marker').map(c => c.id));
  const mAssign = session.assignments.filter(a => a.runId === run.id && a.state === 'confirmed' && markerIds.has(a.compoundId));
  if (mAssign.length === 1) {
    const pk = run.measured.peaks.find(p => p.no === mAssign[0].peakNo);
    const note = run.peakNotes?.[mAssign[0].peakNo];
    if (pk && peakExcluded(run,pk)) return {ok:false,method:'marker-excluded',text:'The assigned hold-up marker is excluded by the active peak filter. Restore it or supply a documented t0.'};
    if (pk && !note?.coeluted) return { ok: true, t0: pk.tR, method: 'marker-confirmed', proxy: false,
      text: `Recorded hold-up marker (peak ${pk.no}, ${pk.tR.toFixed(3)} min), ${mAssign[0].by === 'file' ? 'as labelled in the imported file; not chemical identification by this tool' : 'assigned by the user'}.` };
    if (pk && note?.coeluted) return { ok: false, method: 'marker-coeluted', text: `The marker peak ${pk.no} is marked as co-eluted, so its time is not a clean t0.` };
  }
  if (mAssign.length > 1) return { ok: false, method: 'marker-conflict', text: 'More than one peak is assigned as the marker in this run.' };
  const m = run.marker || {};
  if (m.method === 'documented' && num(m.t0) > 0 && m.confirmed) return { ok: true, t0: num(m.t0), method: 'documented', proxy: false, text: `Documented t0 ${num(m.t0).toFixed(3)} min — ${m.note || 'method not stated'}.` };
  if (m.method === 'estimate') {
    const { model } = runColumn(session, run);
    const e = columnVolumeT0(model?.lengthMm, model?.idMm, flowOf(run));
    if (e.ok) return { ok: true, t0: e.t0, method: 'estimate', proxy: false, estimate: true, text: `Column-volume ESTIMATE (Equipment LAB slide 48): ${e.formula}. Not a measured marker.` };
    return { ok: false, method: 'estimate', text: e.reason };
  }
  if (m.method === 'peak' && m.peakNo !== null) {
    const pk = run.measured.peaks.find(p => p.no === m.peakNo);
    if (pk && peakExcluded(run,pk)) return {ok:false,method:'marker-excluded',text:'The selected marker peak is excluded. Restore it or supply a documented t0.'};
    if (pk && m.confirmed) return { ok: true, t0: pk.tR, method: 'marker-confirmed', proxy: false, text: `Recorded/confirmed marker peak ${pk.no} (${pk.tR.toFixed(3)} min). Basis: ${m.note || 'user declaration'}. This is not chemical identification by the tool.` };
    if (pk) return { ok: false, method: 'marker-unconfirmed', text: `Peak ${pk.no} is designated as the marker but its identity is not confirmed.` };
  }
  if (settings.allowFirstPeakProxy && run.measured.peaks.length) {
    const pk = run.measured.peaks[0];
    if (peakExcluded(run,pk)) return {ok:false,method:'proxy-excluded',text:'The original first peak is excluded. Filtering must not silently choose a different t0 proxy.'};
    return { ok: true, t0: pk.tR, method: 'first-peak-proxy', proxy: true,
      text: `FIRST-PEAK PROXY (opt-in, UNCONFIRMED): t0 taken as the first reported peak, ${pk.tR.toFixed(3)} min. The first peak is not known to be the marker.` };
  }
  return { ok: false, method: 'none', text: 'No t0: assign the hold-up marker to a peak (and confirm it), enter a documented t0, choose the column-volume estimate, or opt in to the unconfirmed first-peak proxy.' };
}

// "Relevant" peaks for counting and timing: excludes peaks the user marked as
// artefacts (with a reason). Measured data are never deleted.
export function relevantPeaks(run) {
  return run.measured.peaks.map((p,originalIndex)=>({...p,originalIndex})).filter(p => !peakExcluded(run,p));
}
