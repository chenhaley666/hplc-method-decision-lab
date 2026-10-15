// inspector.mjs — what the tool returns when a module or a parameter is
// selected (FC1 criterion 1, 10-point band).
//
// Pure: it takes the session and a selection and returns a structured record.
// The admissible range comes from the CONFIGURED equipment of this session, and
// where a limit is not documented the record says "limit unknown" and names the
// datasheet field that would supply it. No range is ever invented, and a limit
// recorded for one column model is never used for another.
import { CONDITION_FIELDS } from '../data-model/conditions.mjs';
import { columnLimit } from '../data-model/equipment.mjs';
import { runColumn, runInstrument } from '../data-model/derive.mjs';
import { MODULES, MODULE_BY_ID, HARDWARE_PARAMETERS, RELATED } from './modules.mjs';
import { citeText } from '../presets/sources.mjs';
import {toPsi} from '../rules.mjs';

export const PARAMETERS = [
  ...CONDITION_FIELDS.filter(f => f.effects && Object.keys(f.effects).length).map(f => ({ ...f, kind: 'condition' })),
  ...HARDWARE_PARAMETERS.map(f => ({ ...f, kind: 'hardware' })),
];
export const PARAMETER_BY_KEY = Object.fromEntries(PARAMETERS.map(p => [p.key, p]));

// The visual convention. One legend, defined once and rendered from here, so
// the table, the panel and the method can never disagree about what a colour
// or a style means.
export const VISUAL_LEGEND = [
  { id: 'user', label: 'User input', mark: 'plain upright text in an editable box', meaning: 'A value you entered or confirmed. Editable.' },
  { id: 'file', label: 'Measured, from the file', mark: 'plain text, no box', meaning: 'Read from the imported export and never edited: retention times, areas, widths, the pressure and temperature traces.' },
  { id: 'calculated', label: 'Calculated response', mark: 'read-only result labelled by its basis', meaning: 'Computed from recorded inputs: K, log K, α, Rs and plate-derived widths. Measured, documented or estimated t0 is labelled separately. Recomputed, not editable as scientific truth.' },
  { id: 'prediction', label: 'Prediction', mark: 'read-only field marked "predicted", with its basis', meaning: 'A value the tool expects from a model, with the model and its reference run named. Not a measurement.' },
  { id: 'assumption', label: 'Assumption or unconfirmed value', mark: 'amber warning / labelled conditional preview', meaning: 'An estimate, assumed model coefficient or unconfirmed record. Some labelled planning previews use assumptions; no such value becomes measured evidence, confirmed identity or a hardware rating.' },
  { id: 'unknown', label: 'Unknown', mark: 'bold "?" or the word UNKNOWN', meaning: 'Not recorded. Never replaced by a default, an average or a value from another run.' },
];

const CATEGORY_MARK = {
  mechanical: { label: 'Mechanical', mark: 'square bullet ▪', meaning: 'Set by the hardware or by a mechanical setting; it moves the liquid or the sample without changing the chemistry.' },
  chemical: { label: 'Chemical', mark: 'round bullet ●', meaning: 'Changes the chemistry of the separation: what the compounds interact with and how strongly.' },
  both: { label: 'Mechanical and chemical', mark: 'half-filled bullet ◐', meaning: 'Acts through both: it changes the chemistry and also a physical property such as viscosity.' },
  sample: { label: 'Sample', mark: 'open bullet ○', meaning: 'A property of what was injected rather than of the separation.' },
};
export const CATEGORY_LEGEND = Object.entries(CATEGORY_MARK).map(([id, v]) => ({ id, ...v }));

export function instrumentInterval(ins,quantity,unit){
 const bounds=(ins?.limits||[]).filter(x=>x.quantity===quantity).map(x=>{if(quantity!=='pressure')return x;const p=toPsi(x.value,x.unit);return p.ok?{...x,value:p.psi,unit:'psi'}:x;}),valid=bounds.filter(x=>Number.isFinite(x.value)&&(quantity==='temperature'||x.value>0)&&x.unit===unit&&['<','<=','>','>='].includes(x.op)),lower=valid.filter(x=>['>','>='].includes(x.op)).sort((a,b)=>b.value-a.value)[0],upper=valid.filter(x=>['<','<='].includes(x.op)).sort((a,b)=>a.value-b.value)[0];
 return {low:lower?.value??null,high:upper?.value??null,lower,upper,invalid:valid.length!==bounds.length,contradictory:!!lower&&!!upper&&(lower.value>upper.value||lower.value===upper.value&&(lower.op==='>'||upper.op==='<')),sourced:valid.length>0&&valid.every(x=>!!x.source||typeof x.basis==='string'&&!!x.basis.trim()&&!/^user entry.*state the source/i.test(x.basis))};
}

// The admissible range of a parameter for THIS session's configured equipment.
function admissibleRange(session, settings, param, ctx) {
  const col = ctx.columnModel, ins = ctx.instrument;
  const columnScope = ctx.runSpecific ? 'confirmed associated column model' : 'configured reference column model (overview, not a run association)';
  const unknown = (what, field) => ({ known: false, text: `Limit unknown — ${what}`, requiredField: field });
  switch (param.key) {
    case 'percentB':
      return { known: true, low: 0, high: 100, unit: '%', text: '0–100 % by definition (the two lines are proportions of one stream).',
        basis: 'definition of the composition, not an equipment rating',
        extra: 'Whether a given composition is admissible in practice also depends on the pressure it produces, which is a measured response.' };
    case 'flow': {
      const range=instrumentInterval(ins,'flow','mL/min'),insF=range.upper;
      if(range.invalid||range.contradictory)return unknown('recorded instrument flow bounds are invalid or contradictory. Resolve the units, comparison operators and lower/upper values; no admissible range is established.', 'Instrument record → Documented operating limits → correct the flow bounds and sources');
      if(insF&&!range.invalid&&!range.contradictory)return {known:true,low:range.low,high:insF.value,unit:'mL/min',text:`${range.lower?`${range.lower.op} ${range.low} mL/min and `:'Lower hardware bound not recorded; '}${insF.op} ${insF.value} mL/min for "${ins.label}". ${[range.lower,insF].filter(Boolean).map(l=>`${l.op} ${l.value}: ${l.basis||l.source?.title||'source not documented'}`).join('; ')}.`,basis:range.sourced?'documented instrument bounds':'entered instrument bound; source not yet documented',extra:'Separation requires positive flow; this is not a supplied hardware minimum. Flow is also bounded by pressure on the fitted column. A software search grid is not a pump rating.'};
      return unknown(`no maximum flow is recorded for ${ins ? `"${ins.label}"` : 'any associated instrument'}. The flow that may be used is in any case bounded by the back-pressure it produces on the fitted column, which is a measured response.`,
        ins ? `Instrument record "${ins.label}" → Documented operating limits → add a flow limit, with its basis (pump datasheet)` : 'Associate the run with an instrument record, then add its flow limit');
    }
    case 'ovenSetpoint': {
      const t = columnLimit(col, 'temperature');
      const range=instrumentInterval(ins,'temperature','°C'),insT=range.upper;
      if (t.known) return { known: true, low: range.low, high: insT?Math.min(t.value,insT.value):t.value, unit: '°C', text: `≤ ${t.value} °C for the ${columnScope}${col?.product ? ` (${col.product})` : ''}${insT ? `, and ${insT.op} ${insT.value} °C for the oven of "${ins.label}"` : ''}. ${range.lower?`Oven lower bound ${range.lower.op} ${range.lower.value} °C.`:'No lower oven/cooling bound is documented; ambient capability must be verified.'}`, basis: 'column datasheet limit recorded in this session',extra:range.invalid||range.contradictory?'Instrument temperature bounds contain invalid/inconsistent records; resolve them before execution.':null };
      return unknown(t.reason || 'no column model is associated.', col ? `Column model → Max temperature (°C), from the manufacturer's datasheet` : 'Associate the run with a physical column whose model carries a maximum temperature');
    }
    case 'pH': {
      const p = columnLimit(col, 'pH');
      if (p.known) return { known: true, low: p.low, high: p.high, unit: '', text: `pH ${p.low}–${p.high} for the ${columnScope}${col?.product ? ` (${col.product})` : ''}.`, basis: 'column datasheet limit recorded in this session' };
      return unknown(p.reason || 'no column model is associated.', `Column model → pH range, from the manufacturer's datasheet`);
    }
    case 'injVolume': {
      const loop = ins?.injector?.loopUl ?? null;
      if (loop !== null && ins?.injector?.kind === 'manual') return { known: true, low: null, high: null, unit: 'µL', text: `A manual injector delivers the volume of the loop that is fitted: ${loop} µL for "${ins.label}". It is not a software setting; to change it, fit a different loop.`, basis: 'recorded loop capacity' };
      if(ins?.injector?.kind==='autosampler'){
       const range=instrumentInterval(ins,'injVolume','µL'),capacity=loop!==null?`Recorded fitted loop / metering capacity: ${loop} µL. `:'Fitted loop / metering capacity not recorded. ';
       if(range.lower&&range.upper&&!range.invalid&&!range.contradictory)return {known:true,low:range.low,high:range.high,unit:'µL',text:`Programmed injection volume ${range.lower.op} ${range.low} µL and ${range.upper.op} ${range.high} µL for "${ins.label}". ${capacity}Bound sources: ${[range.lower,range.upper].map(l=>`${l.op} ${l.value}: ${l.basis||l.source?.title||'not documented'}`).join('; ')}.`,basis:range.sourced?'recorded model-specific programmed-volume bounds':'entered programmed-volume bounds; source not documented',extra:'The programmed range and hardware capacity are distinct. Do not infer a programmed maximum from loop capacity; verify the fitted model, injection mode and method. Unknown capacity remains unknown.'};
       return unknown(`${capacity}Programmed injection-volume range is not established${range.invalid||range.contradictory?' because its recorded bounds are invalid or contradictory':''}. An automatic needle aspirates from the vial; capacity alone does not define the software range.`, `Instrument record "${ins.label}" → add lower and upper programmed injection-volume bounds (µL) with the fitted model / injection-mode source`);
      }
      if(loop!==null)return unknown(`a ${loop} µL loop is recorded, but manual versus autosampler operation is not established.`, 'Instrument record → Injector kind and fitted loop / autosampler specification');
      return unknown(`no loop capacity is recorded for ${ins ? `"${ins.label}"` : 'any associated instrument'}.`, ins ? `Instrument record "${ins.label}" → Loop capacity (µL)` : 'Associate the run with an instrument record, then record its loop capacity');
    }
    case 'wavelength': {
      const d = ins?.detector?.type || null;
      const range=instrumentInterval(ins,'wavelength','nm');
      if(range.lower&&range.upper&&!range.invalid&&!range.contradictory)return {known:true,low:range.low,high:range.high,unit:'nm',text:`${range.lower.op} ${range.low} nm and ${range.upper.op} ${range.high} nm for the recorded detector of "${ins.label}".`,basis:range.sourced?'Documented detector wavelength bounds':'Entered detector bounds; source not yet documented',extra:'Verify detector identity and the actual mobile-phase UV cut-off; this is hardware capability, not proof every analyte is detectable.'};
      return unknown(`the wavelength range of ${d ? `the ${d} detector` : 'the detector'}${ins ? ` of "${ins.label}"` : ''} is not recorded. The admissible range is a property of the detector and of the mobile phase's own absorbance (its UV cut-off), and neither is documented in this session.`,
        ins ? `Instrument record "${ins.label}" → Detector type and model, then the wavelength range from its datasheet; and the UV cut-off of the mobile phase` : 'Associate the run with an instrument record and record the detector');
    }
    case 'acquisitionTime':
      return { known: true, low: 0, high: null, unit: 'min', text: 'Any positive time. It is not an equipment limit but a window: a compound eluting after the acquisition time is absent from the peak table, so it must exceed the latest expected retention time.', basis: 'definition' };
    case 'column geometry':
      return col&&[col.lengthMm,col.idMm,col.particleUm].every(x=>Number.isFinite(x)&&x>0) ? { known: true, low: null, high: null, unit: '', text: `The ${columnScope} is recorded as ${col.lengthMm} × ${col.idMm} mm, ${col.particleUm} µm. To change it, fit a different available physical column; it is not a software setting. Recorded reference models alone do not prove stock availability.`, basis: 'configured column model' }
        : unknown('no column model is associated, so the fitted geometry is not known.', 'Column model → Length, Internal diameter, Particle size');
    case 'column ligand':
      return col?.ligand ? { known: true, low: null, high: null, unit: '', text: `The ${columnScope} is recorded as ${col.ligand}. Changing ligand requires a physically available column with its own limits and a fresh Retention series; a catalogue entry is not proof of availability.`, basis: 'configured column models' }
        : unknown('no column model is associated.', 'Column model → Stationary phase / ligand');
    default:
      return { known: false, text: 'No equipment limit applies to this parameter in this tool; it is a bench decision recorded with the run.', requiredField: null, benchDecision: true };
  }
}

// The one call the interface makes when something is selected.
// selection: {kind:'module'|'parameter', id}
export function inspect(session, settings, selection, { run = null } = {}) {
  const ctx = equipmentContext(session, run);
  if (!selection) return null;
  if (selection.kind === 'module') {
    const m = MODULE_BY_ID[selection.id];
    if (!m) return { error: `No module "${selection.id}" is defined.` };
    const params = m.controls.map(k => parameterRecord(session, settings, k, ctx)).filter(Boolean);
    return {
      kind: 'module', id: m.id, label: m.label, function: m.fn, cycle: m.cycle,
      equipment: ctx.text,
      controls: params,
      measures: m.measures,
      changeable: params.filter(p => p.changeable).map(p => ({ key: p.key, label: p.label, where: p.controlledAt })),
      sources: m.sources.map(citeText),
    };
  }
  const rec = parameterRecord(session, settings, selection.id, ctx);
  return rec || { error: `No parameter "${selection.id}" is defined.` };
}

export function equipmentContext(session, run) {
  // A configured record is not evidence that it was fitted to a particular
  // run. In a run-specific recommendation, use only confirmed associations;
  // never borrow the first model or elevate a profile suggestion to a fact.
  const rc = run ? runColumn(session, run) : null;
  const ri = run ? runInstrument(session, run) : null;
  const col = run ? (rc.confirmed ? rc.column : null) : (session.columns[0] || null);
  const model = run ? (rc.confirmed ? rc.model : null)
    : (col ? session.columnModels.find(m => m.id === col.modelId) || null : (session.columnModels[0] || null));
  const instrument = run ? (ri.confirmed ? ri.instrument : null) : (session.instruments[0] || null);
  const parts = [];
  parts.push(instrument ? `instrument "${instrument.label}"` : run ? 'no confirmed instrument association' : 'no instrument record');
  parts.push(model ? `column model ${[model.manufacturer, model.product].filter(Boolean).join(' ') || model.id}${model.ligand ? ` (${model.ligand})` : ''}` : run ? 'no model established by a confirmed physical-column association' : 'no column model');
  const suggestions = run && ((rc.column && !rc.confirmed) || (ri.instrument && !ri.confirmed))
    ? ' Unconfirmed association suggestions are not used as applicable operating ranges.' : '';
  return { column: col, columnModel: model, instrument, runSpecific: !!run, configured: !!(instrument || model),
    text: run ? `Ranges below are for ${parts.join(' and ')}, as confirmed for "${run.label}".${suggestions}`
      : `Configuration overview: ${parts.join(' and ')}. These are configured reference records; this overview does not establish what equipment was fitted to any run.` };
}

export function parameterRecord(session, settings, key, ctx = null) {
  const p = PARAMETER_BY_KEY[key];
  if (!p) return null;
  const c = ctx || equipmentContext(session, null);
  const mod = MODULE_BY_ID[p.module] || MODULES.find(m => m.controls.includes(key)) || null;
  const range = admissibleRange(session, settings, p, c);
  const related = (RELATED[key] || []).map(k => PARAMETER_BY_KEY[k]).filter(Boolean).map(x => ({ key: x.key, label: x.label, module: x.module }));
  return {
    kind: 'parameter', key, label: p.label, unit: p.unit || (range.unit || ''),
    category: p.category, categoryMark: CATEGORY_MARK[p.category] || null,
    module: p.module, moduleLabel: mod?.label || p.module, moduleFunction: mod?.fn || null,
    controlledAt: key==='injVolume'&&c.instrument?.injector?.kind==='manual'?'bench — fit a different sample loop':key==='injVolume'&&c.instrument?.injector?.kind==='autosampler'?'software (autosampler; verify the fitted injection mode)':p.controlledAt,
    changeable: key==='injVolume'&&c.instrument?.injector?.kind==='manual'?false:!/bench — fit a different/.test(p.controlledAt || ''),
    range,
    effects: { retention: p.effects?.retention || 'not stated', selectivity: p.effects?.selectivity || 'not stated', efficiency: p.effects?.efficiency || 'not stated' },
    related,
    sources: (p.sources || mod?.sources || []).map(citeText),
    equipment: c.text,
  };
}

// For a proposed change: the module that controls it and the range it may be
// set within, so the proposal can be executed at the instrument without a
// second document.
export function changeContext(session, settings, key, { run = null } = {}) {
  const rec = parameterRecord(session, settings, key, equipmentContext(session, run));
  if (!rec) return null;
  return { key, label: rec.label, unit: rec.unit, module: rec.moduleLabel, controlledAt: rec.controlledAt,
    range: rec.range.known ? rec.range.text : rec.range.text, rangeKnown: !!rec.range.known,
    requiredField: rec.range.requiredField || null, effects: rec.effects };
}
