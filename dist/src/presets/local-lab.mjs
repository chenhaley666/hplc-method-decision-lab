// User-confirmed LOCAL laboratory method defaults, 12 October 2026.
// Not universal specifications, hardware ratings, or measurements of a run.
export const LAB_SOURCE = 'User confirmation in this development conversation, 12 October 2026';
export const SOLVENT_B_OPTIONS = [['ACN','ACN (acetonitrile)'],['MeOH','MeOH (methanol)'],['Mix','Mix (ACN + MeOH)']];
export const newLabDefaults = () => ({ enabled: false, pressureMode: 'fleet', ordinaryMaxPsi: 4000, hplc3MaxPsi: 10000, flow: 1.5, pH: 3, phaseA: 'water', solventB: 'ACN', source: LAB_SOURCE });
export function applyWaterConvention(session){
 // Course conventions are planning references, never declarations about an
 // imported injection. Preserve existing records; confirmation is per CSV.
 return session;
}

export function localInstrumentNumber(session, run) {
  if (!run?.assoc?.instrumentId?.confirmed) return null;
  const instrument = session.instruments.find(i=>i.id===run.assoc.instrumentId.value);
  if (!instrument) return null;
  if (Number.isInteger(instrument.fleetNumber) && instrument.fleetNumber>=1 && instrument.fleetNumber<=6) return instrument.fleetNumber;
  const name = String(instrument.identifier || instrument.label || '').trim();
  const hit = /^HPLC\s*([1-6])$/i.exec(name);
  return hit ? Number(hit[1]) : null;
}

export function labPressureSettings(session, settings, run) {
  // One method acceptance criterion, including its exact operator. Local
  // examples, software cut-offs and instrument ratings cannot override it.
  // Keep legacy localLab fields intact for lossless session restoration.
  return settings;
}

// Planning rows only. Do not fill run.conditions or make unknown runs fit.
export function labPlanningValue(session, run, key) {
  const lab=session.settings.localLab;
  if (!lab?.enabled) return null;
  if (key==='flow' && Number.isFinite(lab.flow) && lab.flow>0) return lab.flow;
  if (key==='pH' && Number.isFinite(lab.pH) && lab.pH>=0 && lab.pH<=14) return lab.pH;
  if (key==='phaseA') return lab.phaseA || null;
  const organic=run.conditions.organic;
  const selected=organic?.confirmed && organic.value ? organic.value : lab.solventB;
  if (key==='organic') return selected || null;
  if (key==='phaseB') return selected==='Mix'?'ACN + MeOH (Mix)':selected || null;
  return null;
}
