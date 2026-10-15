// gates.mjs — evaluate ONE run against the configured specifications, in the
// sourced decision order: pressure/operating constraints → peak count →
// last relevant peak → lowest adjacent-pair resolution.
import { compare, adjacentResolutions, RS_BASES, OPERATORS, toPsi } from '../rules.mjs';
import { relevantPeaks, runColumn, runInstrument, effectiveTemperature, flowOf } from '../data-model/derive.mjs';
import { columnLimit } from '../data-model/equipment.mjs';
import { peakStatus } from '../alignment/correspondence.mjs';
import { usable } from '../data-model/conditions.mjs';
import { labPressureSettings } from '../presets/local-lab.mjs';

const opText = op => OPERATORS[op]?.label || op;

export function evaluateRun(session, run, settings) {
  const S = labPressureSettings(session, settings, run).specs;
  const peaks = relevantPeaks(run);
  const out = { runId: run.id, label: run.label, gates: [], firstFailure: null, allKnown: true, allPass: true };
  const push = g => { out.gates.push(g); if (g.pass === null) out.allKnown = false; if (g.pass !== true) out.allPass = false; if (g.pass !== true && !out.firstFailure) out.firstFailure = g; };

  // 1. pressure and operating constraints
  const p = run.measured.pressure;
  const measuredConversion=p?toPsi(p.max,p.unit):{ok:false,reason:'No measured pressure.'},measuredPsi=measuredConversion.ok?measuredConversion.psi:null;
  const pc = compare(measuredPsi, S.pressure.op, S.pressure.value);
  const column = runColumn(session, run), instrument = runInstrument(session, run);
  // A suggested association is not evidence that these are the fitted
  // components. Its ratings are reported as unverified, never borrowed.
  const model = column.confirmed ? column.model : null;
  const ins = instrument.confirmed ? instrument.instrument : null;
  const colP = columnLimit(model, 'pressure');
  const colT = columnLimit(model, 'temperature');
  const T = effectiveTemperature(run, settings);
  const extra = [], operatingUnknown = [], operatingFailures = [];
  let pass = pc.known ? pc.pass : null;
  let unusableRecordedPressureRating = false;
  const pressureBound = (name, bound, source) => {
    const unit = bound.unit || '(unit missing)', converted = toPsi(bound.value, bound.unit);
    if (!converted.ok || !(converted.psi > 0) || !['<', '<='].includes(bound.op)) {
      const why = `${name} pressure rating ${bound.value} ${unit} is NOT VERIFIED: ${converted.reason || 'a positive rating with < or ≤ is required'}.`;
      operatingUnknown.push(why); extra.push(why); unusableRecordedPressureRating = true; return;
    }
    const sourceText = source || 'source not recorded — this entered rating is unverified';
    if (!source) operatingUnknown.push(`${name} pressure-rating source is not recorded.`);
    if (!pc.known) { extra.push(`${name} pressure rating ${bound.op} ${bound.value} ${unit} (= ${converted.psi.toFixed(1)} psi; ${sourceText}); measured pressure unknown, so not compared.`); return; }
    const c = compare(measuredPsi, bound.op, converted.psi);
    const text = `${name} pressure limit ${opText(bound.op)} ${bound.value} ${unit} (= ${converted.psi.toFixed(1)} psi; ${sourceText}): ${c.pass ? 'within' : 'EXCEEDED'}`;
    extra.push(text);
    if (!c.pass) { pass = false; operatingFailures.push(text); }
  };
  if (!column.confirmed) operatingUnknown.push('Physical-column association is absent or unconfirmed; no suggested column rating was used.');
  if (colP.known) pressureBound('column', colP, model.datasheetRef || (String(model.provenance?.source || '').startsWith('reference:') ? model.provenance.source : null) || model.provenance?.sources?.join('; '));
  else operatingUnknown.push('Column pressure limit not recorded for a confirmed associated column.');
  if (!instrument.confirmed) operatingUnknown.push('Instrument association is absent or unconfirmed; no suggested instrument rating was used.');
  const insP = ins?.limits?.find(l => l.quantity === 'pressure');
  if (insP) pressureBound('instrument', insP, insP.basis || insP.source);
  else operatingUnknown.push('Instrument pressure limit not recorded for a confirmed associated instrument.');
  if (unusableRecordedPressureRating && pass !== false) pass = null;
  if (colT.known && T.known) {
    const c3 = compare(T.value, colT.op, colT.value);
    const text = `column temperature ${T.value.toFixed(1)} °C vs max ${colT.value} °C: ${c3.pass ? 'within' : 'EXCEEDED'}`;
    extra.push(text); if (!c3.pass) { pass = false; operatingFailures.push(text); }
  } else operatingUnknown.push(colT.known ? 'The measured/effective column temperature is unknown, so its recorded limit was not compared.' : 'Column temperature limit not recorded for a confirmed associated column.');
  for (const limit of (ins?.limits || []).filter(x => ['temperature', 'flow','wavelength'].includes(x.quantity)||x.quantity==='injVolume'&&ins.injector?.kind==='autosampler')) {
    const value = limit.quantity === 'temperature' ? (T.known ? T.value : null) : ['wavelength','injVolume'].includes(limit.quantity) ? usable(run.conditions[limit.quantity])?run.conditions[limit.quantity].value:null : flowOf(run);
    const unit = limit.quantity === 'temperature' ? '°C' : limit.quantity==='wavelength'?'nm':limit.quantity==='injVolume'?'µL':'mL/min';
    const source = limit.basis || limit.source;
    if (!source) operatingUnknown.push(`The instrument ${limit.quantity} limit has no stated basis or source.`);
    if (limit.unit !== unit || !Number.isFinite(limit.value) || !OPERATORS[limit.op]) {
      const why = `The instrument ${limit.quantity} limit ${limit.value} ${limit.unit || '(unit missing)'} is NOT VERIFIED: expected a finite value in ${unit} and a valid comparison operator.`;
      operatingUnknown.push(why); extra.push(why); unusableRecordedPressureRating = true;
      if (pass !== false) pass = null;
    } else if (value === null || !Number.isFinite(value)) {
      operatingUnknown.push(`Current ${limit.quantity} is unknown, so the recorded instrument limit ${opText(limit.op)} ${limit.value} ${unit} was not compared.`);
    } else {
      const c = compare(value, limit.op, limit.value);
      const text = `instrument ${limit.quantity} ${value} ${unit} vs ${opText(limit.op)} ${limit.value} ${unit} (${source || 'source not recorded'}): ${c.pass ? 'within' : 'EXCEEDED'}`;
      extra.push(text); if (!c.pass) { pass = false; operatingFailures.push(text); }
    }
  }
  const pH = usable(run.conditions.pH) && Number.isFinite(Number(run.conditions.pH.value)) ? Number(run.conditions.pH.value) : null;
  const pHBound = columnLimit(model, 'pH');
  if (pHBound.known && pH !== null) {
    if (!Number.isFinite(pHBound.low) || !Number.isFinite(pHBound.high) || !(pHBound.low < pHBound.high)) {
      const why = 'The recorded column pH range is NOT VERIFIED: it needs finite lower/upper limits in increasing order.';
      extra.push(why); operatingUnknown.push(why); unusableRecordedPressureRating = true; if (pass !== false) pass = null;
    } else {
      const inRange = pH >= pHBound.low && pH <= pHBound.high;
      const text = `column pH ${pH} vs range ${pHBound.low}–${pHBound.high}: ${inRange ? 'within' : 'EXCEEDED'}`;
      extra.push(text); if (!inRange) { pass = false; operatingFailures.push(text); }
    }
  } else if (pHBound.known) operatingUnknown.push('The column pH range is recorded, but current pH is unknown, so its compatibility is not verified.');
  else if (pH !== null) operatingUnknown.push('Current pH is recorded, but no column pH range is documented, so its compatibility is not verified.');
  push({ id: 'pressure', order: 1, label: 'Back-pressure and operating constraints',
    value: measuredPsi, unit: 'psi', spec: `${opText(S.pressure.op)} ${S.pressure.value} psi`, pass,
    specificationPass: pc.known ? pc.pass : null,
    operatingVerified: operatingUnknown.length === 0 && operatingFailures.length === 0,
    operatingRatingUnusable: unusableRecordedPressureRating,
    operatingUnknown: [...new Set(operatingUnknown)], operatingFailures,
    text: pc.known ? `Peak measured back-pressure ${measuredPsi.toFixed(0)} psi${p.unit!=='psi'?` (converted from ${p.max} ${p.unit})`:''} (${p.source || 'source not recorded'}) ${pc.pass ? 'meets' : 'does NOT meet'} ${opText(S.pressure.op)} ${S.pressure.value} psi.${extra.length ? ' ' + extra.join('; ') + '.' : ''}${operatingUnknown.length ? ' Hardware scope NOT VERIFIED: ' + [...new Set(operatingUnknown)].join(' ') : ''}`
      : `Measured back-pressure cannot be compared in psi: ${measuredConversion.reason || 'a valid pressure value and unit are required'}. Import a pressure trace with its recorded unit or enter a documented value and unit.` });

  // 2. peak count
  const pk = S.peakCount;
  const n = peaks.length;
  const status = peakStatus(session, run).filter(s => s.state !== 'excluded');
  const identified = status.filter(s => s.state === 'matched').length;
  const coeluted = status.filter(s => s.state === 'coeluted').length;
  const marks = run.measured.peaks.filter(x => x.mark).map(x => `${x.no}:${x.mark}`);
  const cc = compare(n, pk.op || '=', pk.value);
  push({ id: 'peakCount', order: 2, label: 'Peak count', value: n, spec: `${opText(pk.op || '=')} ${pk.value} ${pk.includesMarker ? '(includes the hold-up marker)' : '(excludes the hold-up marker)'}`,
    pass: cc.pass, direction: n < pk.value ? 'below' : n > pk.value ? 'above' : 'equal',
    text: `${n} relevant peak(s) from the export${run.measured.peaks.length !== n ? ` (${run.measured.peaks.length - n} excluded by your annotations or height filter)` : ''}; ${identified} with a confirmed identity; ${coeluted} marked co-eluted.${marks.length ? ` Export integration marks: ${marks.join(', ')} (raw codes as exported).` : ''} Visible peaks are not identified compounds.${n > pk.value ? ' MORE peaks than the target: check the blank, integration and interfering peaks; not accepted automatically.' : ''}` });

  // 3. last relevant peak
  const last = peaks.length ? peaks[peaks.length - 1] : null;
  const lc = last ? compare(last.tR, S.lastPeak.op, S.lastPeak.value) : { known: false };
  const acq = usable(run.conditions.acquisitionTime) ? Number(run.conditions.acquisitionTime.value) : null;
  push({ id: 'lastPeak', order: 3, label: 'Last relevant peak', value: last ? last.tR : null, unit: 'min', spec: `${opText(S.lastPeak.op)} ${S.lastPeak.value} min`,
    pass: lc.known ? lc.pass : null,
    text: last ? `Last relevant peak at ${last.tR.toFixed(3)} min ${lc.pass ? 'meets' : 'does NOT meet'} ${opText(S.lastPeak.op)} ${S.lastPeak.value} min.${acq !== null ? ` Acquisition ran to ${acq.toFixed(2)} min; a compound eluting later would not appear.` : ' Acquisition time not recorded: late peaks may lie outside it.'}` : 'No peaks.' });

  // 4. lowest adjacent-pair resolution
  const basis = settings.rsBasis;
  const rs = adjacentResolutions(peaks, basis);
  const exported = basis !== 'exported' ? adjacentResolutions(peaks, 'exported') : null;
  const rc = rs.complete ? compare(rs.minRs, S.minRs.op, S.minRs.value) : { known: false };
  push({ id: 'minRs', order: 4, label: 'Lowest adjacent-pair resolution', value: rs.minRs, spec: `${opText(S.minRs.op)} ${S.minRs.value}`,
    pass: peaks.length < 2 ? null : rc.known ? rc.pass : null, rs, exported, basis: RS_BASES[basis],
    text: peaks.length < 2 ? 'Fewer than two peaks: no adjacent pair.'
      : rs.complete ? `Lowest adjacent Rs = ${rs.minRs.toFixed(3)} between peaks ${rs.limiting.from} and ${rs.limiting.to} (${RS_BASES[basis].label}); ${rc.pass ? 'meets' : 'does NOT meet'} ${opText(S.minRs.op)} ${S.minRs.value}. ${rs.closestIsLimiting ? 'This is also the closest pair in time.' : `The closest pair in time (${rs.closest.from}–${rs.closest.to}) is NOT the limiting pair.`}`
      : `Rs could not be calculated for ${rs.missing.length} adjacent pair(s) (${rs.missing.map(m => `${m.from}–${m.to}: ${m.reason}`).join('; ')}), so the limiting pair cannot be established.${rs.lowestKnown ? ` Lowest of the calculable pairs: ${rs.lowestKnown.rs.toFixed(3)} (${rs.lowestKnown.from}–${rs.lowestKnown.to}) — not a chromatogram resolution.` : ''}` });

  out.verdict = out.allPass ? 'met' : out.allKnown ? 'not-met' : 'incomplete';
  return out;
}
