// equipment.mjs — instrument records, column PRODUCT MODELS and individual
// PHYSICAL COLUMNS.
//
// A column product model (manufacturer + product + geometry + datasheet limits)
// is not a physical column. Two physical columns of the same model are two
// different columns: each has its own record with its own id and serial number.
// Runs are associated with a physical column. Editing an equipment record never
// rewrites a run's recorded conditions.
import { newId } from './ids.mjs';
import { num, toPsi } from '../rules.mjs';

export const PUMP_TYPES = {
  'quaternary-lpg': 'Quaternary, low-pressure gradient (proportioning valve before one pump)',
  'binary-hpg': 'Binary, high-pressure gradient (two pumps, mixing after the pumps)',
  'isocratic': 'Isocratic (single solvent line)',
};
export const INJECTOR_KINDS = { manual: 'Manual injector (volume fixed by the loop fitted)', autosampler: 'Autosampler (volume set in software)' };
export const PARTICLE_TYPES = { 'fully porous': 'Fully porous', 'superficially porous': 'Superficially porous (core-shell, SPP)' };

export function newInstrument(fields = {}, idGen) {
  return {
    id: fields.id || newId('ins', idGen),
    label: fields.label || 'Unnamed instrument',
    manufacturer: fields.manufacturer ?? null, systemModel: fields.systemModel ?? null,
    identifier: fields.identifier ?? null,
    instrumentClass: fields.instrumentClass ?? null, fleetNumber: num(fields.fleetNumber),
    // A pump's hardware rating is not its method-editor shutdown setting.
    methodPressureSetting: fields.methodPressureSetting ? structuredClone(fields.methodPressureSetting) : null,
    pump: { model: fields.pump?.model ?? null, type: fields.pump?.type ?? null },
    mixing: fields.mixing ?? null,
    degasser: { fitted: fields.degasser?.fitted ?? null, model: fields.degasser?.model ?? null },
    injector: { kind: fields.injector?.kind ?? null, model: fields.injector?.model ?? null, loopUl: num(fields.injector?.loopUl) },
    oven: { fitted: fields.oven?.fitted ?? null, model: fields.oven?.model ?? null },
    detector: { type: fields.detector?.type ?? null, model: fields.detector?.model ?? null },
    limits: (fields.limits || []).map(l => ({ quantity: l.quantity, value: num(l.value), op: l.op || '<=', unit: l.unit || '', basis: l.basis || '', source: l.source || null })),
    provenance: fields.provenance || { source: 'user' },
    notes: fields.notes || '',
  };
}

export function newColumnModel(fields = {}, idGen) {
  return {
    id: fields.id || newId('cm', idGen),
    manufacturer: fields.manufacturer ?? null, product: fields.product ?? null, uspL: fields.uspL ?? null,
    ligand: fields.ligand ?? null,
    beadFamily: fields.beadFamily ?? null,
    lengthMm: num(fields.lengthMm), idMm: num(fields.idMm), particleUm: num(fields.particleUm),
    particleType: fields.particleType ?? null, poreA: num(fields.poreA), carbonPct: num(fields.carbonPct),
    surfaceM2g: num(fields.surfaceM2g), endcapped: fields.endcapped ?? null,
    limits: {
      tMaxC: num(fields.limits?.tMaxC), pMax: num(fields.limits?.pMax), pMaxUnit: fields.limits?.pMaxUnit || 'psi',
      pH: Array.isArray(fields.limits?.pH) ? fields.limits.pH.map(num) : null,
    },
    datasheetRef: fields.datasheetRef ?? null,
    provenance: fields.provenance || { source: 'user' },
    notes: fields.notes || '',
  };
}

export function newPhysicalColumn(fields = {}, idGen) {
  return { id: fields.id || newId('col', idGen), modelId: fields.modelId ?? null, serial: fields.serial ?? null,
    label: fields.label || 'Unnamed column', notes: fields.notes || '' };
}

export function fromReferenceInstrument(ref, idGen) {
  return newInstrument({ ...ref, id: undefined, label: ref.label + ' (copied from reference)', identifier: null,
    limits: ref.limits.map(l => ({ ...l, source: l.source })),
    provenance: { source: `reference:${ref.refId}`, sources: ref.sources, conflicts: ref.conflicts,
      confirmation: ref.confirmation || null } }, idGen);
}
export function fromReferenceColumnModel(ref, idGen) {
  return newColumnModel({ ...ref, id: undefined, provenance: { source: `reference:${ref.refId}`, sources: ref.sources } }, idGen);
}

export function columnDescription(model, column) {
  if (!model) return column ? `${column.label} (model not recorded)` : 'column not recorded';
  const g = [model.lengthMm, model.idMm, model.particleUm].map(v => v ?? '?').join(' × ');
  return `${model.manufacturer || '?'} ${model.product || '?'} — ${model.ligand || 'ligand ?'}, ${g} (mm × mm × µm)${column ? ` — physical column "${column.label}"${column.serial ? ` S/N ${column.serial}` : ''}` : ''}`;
}

// Documented limit for a quantity on a column model or instrument; never borrowed.
export function columnLimit(model, quantity) {
  if (!model) return { known: false, reason: 'No column model is associated, so no column limit is known.' };
  if (quantity === 'temperature') return !Number.isFinite(model.limits?.tMaxC) ? { known: false, reason: `The maximum temperature of ${model.product || 'this column model'} is not recorded. Enter it from the manufacturer's datasheet; a limit from another column is not used.` } : { known: true, value: model.limits.tMaxC, unit: '°C', op: '<=' };
  if (quantity === 'pressure') return !Number.isFinite(model.limits?.pMax) ? { known: false, reason: `The maximum pressure of ${model.product || 'this column model'} is not recorded.` } : { known: true, value: model.limits.pMax, unit: model.limits.pMaxUnit, op: '<=' };
  if (quantity === 'pH') return !model.limits?.pH || model.limits.pH.some(v => v === null) ? { known: false, reason: `The pH range of ${model.product || 'this column model'} is not recorded.` } : { known: true, low: model.limits.pH[0], high: model.limits.pH[1] };
  return { known: false, reason: 'Unknown quantity.' };
}

export function validateInstrument(ins) {
  const errs = [];
  if (!ins.id) errs.push('missing id');
  if (ins.pump?.type && !PUMP_TYPES[ins.pump.type]) errs.push(`unknown pump type ${ins.pump.type}`);
  if (ins.injector?.kind && !INJECTOR_KINDS[ins.injector.kind]) errs.push(`unknown injector kind ${ins.injector.kind}`);
  if (ins.injector?.loopUl !== null && ins.injector?.loopUl !== undefined && !(ins.injector.loopUl > 0)) errs.push('loop volume must be positive');
  for (const l of ins.limits || []) if (l.value !== null && !Number.isFinite(l.value)) errs.push(`limit ${l.quantity} not numeric`);
  return errs;
}
export function validateColumnModel(m) {
  const errs = [];
  for (const k of ['lengthMm', 'idMm', 'particleUm', 'poreA', 'carbonPct', 'surfaceM2g'])
    if (m[k] !== null && m[k] !== undefined && !(Number.isFinite(m[k]) && m[k] > 0)) errs.push(`${k} must be a positive number or unknown`);
  if (m.particleType && !PARTICLE_TYPES[m.particleType]) errs.push(`unknown particle type ${m.particleType}`);
  if (m.limits?.pH && m.limits.pH.every(v => v !== null) && !(m.limits.pH[0] < m.limits.pH[1])) errs.push('pH range low must be below high');
  if (m.limits?.pH && m.limits.pH.every(v => Number.isFinite(v)) && (m.limits.pH[0] < 0 || m.limits.pH[1] > 14)) errs.push(`pH range ${m.limits.pH.join('–')} is outside 0–14`);
  if (Number.isFinite(m.limits?.tMaxC) && (m.limits.tMaxC <= 0 || m.limits.tMaxC > 250)) errs.push(`maximum temperature ${m.limits.tMaxC} °C is outside what a liquid-chromatography column can be documented as (0–250 °C); record the datasheet value`);
  if (Number.isFinite(m.limits?.pMax)) {
    const u = toPsi(m.limits.pMax, m.limits.pMaxUnit);
    if (!u.ok) errs.push(`the maximum pressure ${m.limits.pMax} ${m.limits.pMaxUnit || '(no unit)'} cannot be used: ${u.reason}`);
    else if (!(m.limits.pMax > 0)) errs.push('maximum pressure must be positive');
  }
  return errs;
}

// Records that are each individually valid can still be inconsistent with one
// another, or carry a limit nobody can trace. Those are reported as warnings
// against the session, not as errors against one record: the user decides.
export function equipmentConsistency(session) {
  const problems = [];
  for (const m of session.columnModels || []) {
    const name = `${m.manufacturer || ''} ${m.product || m.id}`.trim();
    if (Number.isFinite(m.limits?.pMax) && !(m.limits?.pMaxUnit)) problems.push({ kind: 'unit', text: `Column model "${name}" records a maximum pressure with no unit. A number without a unit cannot be compared with a measured back-pressure.` });
    if ((Number.isFinite(m.limits?.pMax) || Number.isFinite(m.limits?.tMaxC) || m.limits?.pH) && !m.datasheetRef && !(m.provenance?.sources?.length))
      problems.push({ kind: 'provenance', text: `Column model "${name}" carries documented limits with no datasheet reference or source. A limit whose provenance is not recorded cannot be verified: enter the datasheet reference, or clear the limit.` });
  }
  for (const i of session.instruments || []) {
    for (const l of i.limits || []) {
      const u = toPsi(l.value, l.unit);
      if (l.quantity === 'pressure' && !u.ok) problems.push({ kind: 'unit', text: `Instrument "${i.label}" records a pressure limit of ${l.value} ${l.unit || '(no unit)'}, which cannot be used: ${u.reason}.` });
      if (!l.basis && !l.source) problems.push({ kind: 'provenance', text: `Instrument "${i.label}" records a ${l.quantity} limit with no stated basis or source. Record where the figure comes from, or clear it.` });
    }
  }
  // a physical column whose instrument is rated below the column, or vice
  // versa: not an error, but the binding limit is the lower of the two
  for (const col of session.columns || []) {
    const m = (session.columnModels || []).find(x => x.id === col.modelId);
    if (!Number.isFinite(m?.limits?.pMax)) continue;
    const cu = toPsi(m.limits.pMax, m.limits.pMaxUnit);
    if (!cu.ok) continue;
    for (const i of session.instruments || []) {
      const l = (i.limits || []).find(x => x.quantity === 'pressure');
      if (!l) continue;
      const iu = toPsi(l.value, l.unit);
      if (!iu.ok) continue;
      if (Math.abs(iu.psi - cu.psi) > 1e-9) problems.push({ kind: 'binding', text: `Column "${col.label}" is documented to ${cu.psi.toFixed(0)} psi and instrument "${i.label}" to ${iu.psi.toFixed(0)} psi. The binding limit for a run on that pairing is the lower of the two, ${Math.min(iu.psi, cu.psi).toFixed(0)} psi; the tool checks both and never uses the higher.` });
    }
  }
  return problems;
}
