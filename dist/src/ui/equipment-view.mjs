import {displayRunOrder} from '../data-model/workspaces.mjs';
// equipment-view.mjs — instruments, column models, physical columns, run
// associations, reference examples and illustrated module explanations.
import { h, chip, details, table, field, sourceList, f } from './dom.mjs';
import { commit, setUi } from './state.mjs';
import { newInstrument, newColumnModel, newPhysicalColumn, fromReferenceInstrument, fromReferenceColumnModel, PUMP_TYPES, INJECTOR_KINDS, PARTICLE_TYPES, columnDescription } from '../data-model/equipment.mjs';
import { REFERENCE_INSTRUMENTS, REFERENCE_COLUMN_MODELS, FLEET_NOTE, LOCAL_INSTRUMENT_FLEET, FLEET_CONFIRMATION } from '../presets/reference-equipment.mjs';
import { CONDITION_FIELDS, CATEGORY_SOURCE } from '../data-model/conditions.mjs';
import { ILLUSTRATIONS, illustrationCard } from './illustrations.mjs';
import { runColumn, runInstrument, effectiveTemperature } from '../data-model/derive.mjs';
import { num } from '../rules.mjs';
import { inspectorPanel, legendPanel } from './inspector-view.mjs';
import { newLabDefaults, SOLVENT_B_OPTIONS } from '../presets/local-lab.mjs';
import { equipmentReference } from './equipment-reference.mjs';
import {firstApparatusPanel} from './first-experiment.mjs';

function laboratoryDefaults(st) {
  const lab=st.session.settings.localLab||newLabDefaults();
  const update=(key,value)=>commit(ss=>{ss.settings.localLab={...newLabDefaults(),...ss.settings.localLab,[key]:value};if(!['enabled','pressureMode'].includes(key))ss.settings.localLab.source='User-edited local defaults in this saved session; initial laboratory values confirmed 12 October 2026.';});
  const numeric=(key,label,unit)=>field(`${label} (${unit})`,h('input',{type:'number',step:'any',value:lab[key],'data-testid':`lab-${key}`,onchange:e=>{
    const n=Number(e.target.value);if(!e.target.value.trim()||!Number.isFinite(n)||(key==='pH'?(n<0||n>14):n<=0)){setUi(u=>{u.message=`${label}: invalid value; unchanged.`;});return;}update(key,n);
  }}));
  return h('section',{class:'card','data-testid':'laboratory-defaults'},h('h3','Local planning references — not actual-run confirmations'),
    h('label',{class:'check'},h('input',{type:'checkbox',checked:lab.enabled,'data-testid':'lab-enabled',onchange:e=>update('enabled',e.target.checked)}),' Show local next-run planning defaults (not measured conditions or acceptance criteria)'),
    h('p',{class:'small'},`Planning flow ${lab.flow} mL/min; pH ${lab.pH}; A reference ${lab.phaseA}. Historical teaching pressure references: ordinary HPLC ${lab.ordinaryMaxPsi} psi; HPLC 3 ${lab.hplc3MaxPsi} psi. These do not set or override the method criterion. `,lab.source),
    h('div',{class:'row wrap'},numeric('flow','Planning default flow rate','mL/min'),numeric('pH','Planning default pH','pH'),
      field('Solvent A',h('input',{value:lab.phaseA,'data-testid':'lab-phaseA',onchange:e=>update('phaseA',e.target.value.trim())})),
      field('Solvent B (select)',h('select',{'data-testid':'lab-solventB',onchange:e=>update('solventB',e.target.value)},SOLVENT_B_OPTIONS.map(([v,l])=>h('option',{value:v,selected:lab.solventB===v?'selected':null},l))))),
    h('p',{class:'small'},'Solvent B is ACN, MeOH or Mix (ACN + MeOH). No mixture ratio is requested or invented. Mix is not treated as either pure solvent in the nomogram.'),
    h('p',{class:'tiny'},'These values supply labelled NEXT-RUN planning defaults only. They never confirm bottle contents for an imported CSV. The method pressure value and operator are always those in Specifications; instrument/column ratings and software cut-offs are separate checks. This also applies to restored sessions with older fleet settings.'),
    h('button',{type:'button','data-testid':'lab-review-pressure',onclick:()=>{setUi(u=>{u.courseDashboard=true;});document.querySelector('[data-testid="course-specifications"]')?.scrollIntoView({behavior:'smooth',block:'start'});}},'Edit method pressure on Dashboard'));
}

const txt = (obj, path, label, tid) => {
  const get = () => path.reduce((o, k) => o?.[k], obj);
  return field(label, h('input', { value: get() ?? '', placeholder: 'unknown', 'data-testid': tid || null, onchange: e => commit(() => { let o = obj; for (const k of path.slice(0, -1)) o = o[k]; o[path.at(-1)] = e.target.value.trim() === '' ? null : e.target.value.trim(); }) }));
};
const numIn = (obj, path, label, unit, tid) => {
  const get = () => path.reduce((o, k) => o?.[k], obj);
  return field(`${label}${unit ? ` (${unit})` : ''}`, h('input', { value: get() ?? '', placeholder: 'unknown', inputmode: 'decimal', 'data-testid': tid || null, onchange: e => {
    const v = e.target.value.trim(); const n = v === '' ? null : num(v);
    if (v !== '' && (n === null || n <= 0)) { setUi(u => { u.message = `${label}: "${v}" is not a positive number; nothing was changed.`; }); return; }
    commit(() => { let o = obj; for (const k of path.slice(0, -1)) o = o[k]; o[path.at(-1)] = n; }); } }));
};
const selIn = (obj, path, label, options) => field(label, h('select', { 'aria-label':label, onchange: e => commit(() => { let o = obj; for (const k of path.slice(0, -1)) o = o[k]; o[path.at(-1)] = e.target.value === '' ? null : e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value; }) },
  h('option', { value: '' }, 'unknown'), Object.entries(options).map(([v, l]) => h('option', { value: v, selected: String(path.reduce((o, k) => o?.[k], obj)) === v ? 'selected' : null }, l))));

function instrumentCard(st, ins) {
  return h('div', { class: 'card inner', 'data-testid': `instrument-${ins.id}` },
    h('div', { class: 'row' }, txt(ins, ['label'], 'Label'), h('span', { class: 'tiny' }, ins.id), ins.provenance?.source?.startsWith('reference:') ? chip('copied from reference — confirm on the instrument', 'warn') : null),
    h('div', { class: 'grid3' },
      txt(ins, ['manufacturer'], 'Manufacturer'), txt(ins, ['systemModel'], 'System model'), txt(ins, ['identifier'], 'Instrument identifier (as written in data files)', `ins-ident-${ins.id}`),
      selIn(ins, ['instrumentClass'], 'Instrument class', { HPLC: 'HPLC', UHPLC: 'UHPLC' }),
      txt(ins, ['pump', 'model'], 'Pump model'), selIn(ins, ['pump', 'type'], 'Pump type', PUMP_TYPES), txt(ins, ['mixing'], 'Mixing arrangement'),
      selIn(ins, ['degasser', 'fitted'], 'Degasser fitted', { true: 'yes', false: 'no' }), txt(ins, ['degasser', 'model'], 'Degasser model'),
      selIn(ins, ['injector', 'kind'], 'Injector', INJECTOR_KINDS), txt(ins, ['injector', 'model'], 'Injector model'), numIn(ins, ['injector', 'loopUl'], 'Fitted loop / metering capacity (not the programmed range)', 'µL',`ins-capacity-${ins.id}`),
      selIn(ins, ['oven', 'fitted'], 'Column oven fitted', { true: 'yes', false: 'no' }), txt(ins, ['oven', 'model'], 'Oven model'),
      txt(ins, ['detector', 'type'], 'Detector type'), txt(ins, ['detector', 'model'], 'Detector model')),
    h('h5', { 'data-testid': 'instrument-limits', tabindex: '-1' }, 'Documented operating limits'),
    h('p', { class: 'small' }, 'Hardware maxima below are separate from the measured method acceptance requirement and the pump method-editor shutdown setting. A hardware rating never supplies the column rating.'),
    ins.limits.length ? table(['Quantity', 'Limit', 'Basis', 'Source'], ins.limits.map(l => h('tr', h('td', l.quantity), h('td', `${l.op} ${l.value ?? '?'} ${l.unit}`), h('td', { class: 'small' }, l.basis), h('td', { class: 'small' }, l.source ? `${l.source.title}${l.source.loc ? ', ' + l.source.loc : ''}` : 'user entry')))) : h('p', { class: 'small' }, 'No limit recorded. Unknown limits stay unknown.'),
    h('button', { type: 'button', onclick: () => commit(() => { ins.limits.push({ quantity: 'pressure', value: null, op: '<=', unit: 'psi', basis: 'user entry — state the source', source: null }); }) }, 'Add pressure limit'),
    [['flow','mL/min','flow bound'],['temperature','°C','temperature bound'],['wavelength','nm','wavelength bound'],['injVolume','µL','programmed injection-volume bound']].map(([quantity,unit,label])=>h('button',{type:'button','data-testid':`add-limit-${quantity}-${ins.id}`,onclick:()=>commit(()=>{ins.limits.push({quantity,value:null,op:'<=',unit,basis:'',source:null});})},'Add '+label)),
    ins.limits.map((l, i) => h('div', { class: 'row wrap' }, numIn(l, ['value'], `Limit ${i + 1} value`, l.unit, `ins-limit-${ins.id}-${i}`),
      l.quantity === 'pressure' ? field(`Limit ${i + 1} pressure unit (changing unit clears value)`, h('select', { 'data-testid': `ins-punit-${ins.id}-${i}`, onchange: e => commit(() => { l.unit = e.target.value; l.value = null; }) },
        ['psi', 'bar', 'MPa'].map(unit => h('option', { value: unit, selected: l.unit === unit ? 'selected' : null }, unit)))) : null,
      l.quantity!=='pressure'?field(`Limit ${i+1} comparison`,h('select',{'data-testid':`ins-lop-${ins.id}-${i}`,onchange:e=>commit(()=>{l.op=e.target.value;})},['>=','<=','>','<'].map(op=>h('option',{value:op,selected:l.op===op?'selected':null},op)))):null,
      txt(l, ['basis'], 'Basis / source',`ins-lbasis-${ins.id}-${i}`))),
    h('p',{class:'tiny','data-testid':`ins-range-help-${ins.id}`},'Record lower and upper flow, wavelength and autosampler programmed-volume bounds from the exact fitted model / injection-mode source. Capacity is separate: it is not automatically the software maximum and need not be a sample loop in every architecture. Leave unverified fields blank. These records never edit a run’s injection volume or CSV. Wavelength capability does not verify the mobile-phase UV cut-off.'),
    ins.methodPressureSetting ? h('p', { class: 'small', 'data-testid': `ins-method-pressure-${ins.id}` },
      `Reference method-editor maximum setting: ${ins.methodPressureSetting.value} ${ins.methodPressureSetting.unit}. ${ins.methodPressureSetting.note || 'A software shutdown setting, not the hardware maximum. Verify the actual method on the instrument.'}`) : null,
    ins.provenance?.conflicts?.length ? details('Source conflicts for this reference', false, h('ul', { class: 'small' }, ins.provenance.conflicts.map(c => h('li', c)))) : null,
    h('p', { class: 'tiny' }, 'Editing this record never changes any run\'s recorded conditions.'));
}

function modelCard(st, m) {
  return h('div', { class: 'card inner', 'data-testid': `colmodel-${m.id}` },
    h('div', { class: 'row' }, h('strong', 'Column product model '), h('span', { class: 'tiny' }, m.id), m.provenance?.source?.startsWith('reference:') ? chip('copied from reference', 'warn') : null),
    h('div', { class: 'grid3' }, txt(m, ['manufacturer'], 'Manufacturer'), txt(m, ['product'], 'Product name / model'), txt(m, ['uspL'], 'USP L number'), txt(m, ['ligand'], 'Ligand type', `cm-ligand-${m.id}`),txt(m,['beadFamily'],'Bead / product family',`cm-bead-${m.id}`),
      numIn(m, ['lengthMm'], 'Length', 'mm', `cm-length-${m.id}`), numIn(m, ['idMm'], 'Internal diameter', 'mm'), numIn(m, ['particleUm'], 'Particle size', 'µm'), selIn(m, ['particleType'], 'Particle construction', PARTICLE_TYPES),
      numIn(m, ['poreA'], 'Pore size', 'Å'), numIn(m, ['carbonPct'], 'Carbon load', '%'), numIn(m, ['surfaceM2g'], 'Surface area', 'm²/g'), selIn(m, ['endcapped'], 'End-capped', { true: 'yes', false: 'no' }),
      numIn(m, ['limits', 'tMaxC'], 'Max temperature', '°C', `cm-tmax-${m.id}`), numIn(m, ['limits', 'pMax'], 'Max pressure', m.limits.pMaxUnit || 'unit unknown', `cm-pmax-${m.id}`),
      field('Max pressure unit (changing units clears the value; re-enter the datasheet value)', h('select', { 'data-testid': `cm-punit-${m.id}`, onchange: e => commit(() => { m.limits.pMaxUnit = e.target.value || null; m.limits.pMax = null; }) },
        h('option', { value: '', selected: !m.limits.pMaxUnit ? 'selected' : null }, 'unknown'), ['psi', 'bar', 'MPa'].map(unit => h('option', { value: unit, selected: m.limits.pMaxUnit === unit ? 'selected' : null }, unit)))),
      field('pH range', h('input', { value: m.limits.pH ? m.limits.pH.join('–') : '', placeholder: 'unknown, e.g. 2.5–8', onchange: e => { const p = e.target.value.split(/[–-]/).map(x => num(x)); commit(() => { m.limits.pH = p.length === 2 && p.every(x => x !== null) ? p : null; }); } })),
      txt(m, ['datasheetRef'], 'Datasheet / source reference')),
    h('p', { class: 'tiny', 'data-testid': st.session.columnModels[0]?.id === m.id ? 'colmodel-limits' : null, tabindex: '-1' },
      'Datasheet limits of this model: a missing limit stays missing, and no proposal uses a limit recorded for another model.'),
    m.provenance?.sources ? sourceList(m.provenance.sources) : null,
    h('p', { class: 'tiny' }, 'These limits apply to this column model only. They are never used for another stationary phase.'));
}

function detailedEquipmentView(st) {
  const s = st.session;
  const usedCodes = [...new Set(s.runs.map(r => r.profileExtras?.columnCode).filter(Boolean))];
  const usedHplc = [...new Set(s.runs.map(r => r.profileExtras?.hplcNo).filter(x => x !== undefined && x !== null))];
  const fileNames = [...new Set(s.runs.map(r => r.measured.fileMeta?.instrumentName).filter(Boolean))];
  const eq = st.evaluation.equipment;
  return h('div', { class: 'stage', 'data-testid': 'stage-equipment' },
    laboratoryDefaults(st),
    (eq?.recordErrors?.length || eq?.consistency?.length) ? h('section', { class: 'card', 'data-testid': 'equipment-problems' },
      h('h3', 'Problems in the equipment records'),
      eq.recordErrors.length ? h('div', null, h('h4', 'Values that cannot be used'), h('ul', { class: 'small warn' }, eq.recordErrors.map(x => h('li', x)))) : null,
      eq.consistency.length ? h('div', null, h('h4', 'Consistency and provenance'), h('ul', { class: 'small' }, eq.consistency.map(x => h('li', h('strong', `${x.kind}: `), x.text)))) : null,
      h('p', { class: 'tiny' }, 'A documented limit is a datasheet fact; a specification is a method setting; a policy is this tool\'s own threshold. None of them substitutes for another.')) : null,
    h('section', { class: 'card' }, h('h3', 'HPLC systems'),
      h('div', { 'data-testid': 'local-fleet-ratings' }, h('h4', 'Confirmed local instrument pressure maxima'),
        h('p', { class: 'small' }, FLEET_CONFIRMATION.scope),
        table(['Instrument', 'Class', 'Hardware maximum (psi)', 'Measured method requirement'], LOCAL_INSTRUMENT_FLEET.map(r => h('tr',
          h('td', `HPLC ${r.fleetNumber}`), h('td', r.instrumentClass), h('td', String(r.limits.find(l => l.quantity === 'pressure').value)),
          h('td',`Configured separately: ${s.settings.specs.pressure.op} ${s.settings.specs.pressure.value} psi; no fleet override`)))),
        h('p', { class: 'tiny' }, 'These are local fleet records, not ratings for every HPLC system. Choose a reference below and associate it with the run explicitly; no CSV filename establishes the fitted equipment. Column maximum pressure remains a separate required record.')),
      h('p', { class: 'small' }, 'Record each instrument you used. Unknown fields stay unknown. Instrument names found in imported files: ', fileNames.length ? fileNames.map(n => chip(n)) : 'none', '. With automatic preparation on, a unique file-created record with the same identifier is linked as file-stated evidence, not human confirmation; no hardware rating is inferred. A name match to another equipment record is only an unconfirmed suggestion. Ambiguous matches require you to choose the actual instrument.'),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', 'data-testid': 'add-instrument', onclick: () => commit(ss => { ss.instruments.push(newInstrument({ label: `Instrument ${ss.instruments.length + 1}` })); }) }, 'Add instrument'),
        h('select', { 'data-testid': 'ref-instrument', onchange: e => { const ref = REFERENCE_INSTRUMENTS.find(r => r.refId === e.target.value); if (ref) commit(ss => { ss.instruments.push(fromReferenceInstrument(ref)); }); e.target.value = ''; } },
          h('option', { value: '' }, 'Copy a source-labelled reference example…'), REFERENCE_INSTRUMENTS.map(r => h('option', { value: r.refId }, r.label)))),
      s.instruments.map(i => instrumentCard(st, i))),
    h('section', { class: 'card' }, h('h3', 'Columns'),
      h('p', { class: 'small' }, 'A product model holds known specifications; a physical-column record identifies the same selected column across runs using a local label. Serial number and photos are optional. Keep one column through Retention / Selectivity unless an explicit ligand strategy changes it; different physical columns use separate records.'),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', 'data-testid': 'add-colmodel', onclick: () => commit(ss => { ss.columnModels.push(newColumnModel({})); }) }, 'Add column model'),
        h('select', { 'data-testid': 'ref-colmodel', onchange: e => { const ref = REFERENCE_COLUMN_MODELS.find(r => r.refId === e.target.value); if (ref) commit(ss => { ss.columnModels.push(fromReferenceColumnModel(ref)); }); e.target.value = ''; } },
          h('option', { value: '' }, 'Copy a documented reference model…'), REFERENCE_COLUMN_MODELS.map(r => h('option', { value: r.refId }, `${r.manufacturer} ${r.product}`)))),
      s.columnModels.map(m => modelCard(st, m)),
      h('h4', 'Physical columns'),
      h('button', { type: 'button', 'data-testid': 'add-column', onclick: () => commit(ss => { ss.columns.push(newPhysicalColumn({ label: `Column ${ss.columns.length + 1}`, modelId: ss.columnModels[0]?.id ?? null })); }) }, 'Add physical column'),
      s.columns.length ? table(['Label', 'Product model', 'Serial number (optional)', 'Description'], s.columns.map(c => h('tr', { 'data-testid': `column-${c.id}` },
        h('td', h('input', { value: c.label, 'data-testid': `col-label-${c.id}`, onchange: e => commit(() => { c.label = e.target.value.trim() || c.label; }) })),
        h('td', h('select', { onchange: e => commit(() => { c.modelId = e.target.value || null; }) }, h('option', { value: '' }, '(model unknown)'), s.columnModels.map(m => h('option', { value: m.id, selected: c.modelId === m.id ? 'selected' : null }, `${m.manufacturer || '?'} ${m.product || '?'} ${m.ligand ? `(${m.ligand})` : ''}`)))),
        h('td', h('input', { value: c.serial ?? '', placeholder: 'Optional — leave blank', onchange: e => commit(() => { c.serial = e.target.value.trim() || null; }) })),
        h('td', { class: 'small' }, columnDescription(s.columnModels.find(m => m.id === c.modelId), null))))) : h('p', { class: 'small' }, 'No physical column recorded.')),
    h('section', { class: 'card', 'data-testid': 'associations' }, h('h3', 'Run associations and recorded conditions'),
      h('p', { class: 'small' }, 'Configuration (records above) is separate from what each run recorded. Associations made here are user statements (confirmed).'),
      s.runs.length ? table(['Run', 'Instrument', 'Physical column', 'File instrument name', 'Effective temperature'], displayRunOrder(s.runs,s).map(r => {
        const ci = runInstrument(s, r), cc = runColumn(s, r); const T = effectiveTemperature(r, s.settings);
        const pick = (key, list, lab) => h('select', { 'data-testid': `assoc2-${key}-${r.id}`, onchange: e => commit(() => { r.assoc[key] = e.target.value ? { value: e.target.value, source: 'user', confirmed: true } : { value: null, source: null, confirmed: false }; }) },
          h('option', { value: '' }, '(none)'), list.map(x => h('option', { value: x.id, selected: r.assoc[key].value === x.id ? 'selected' : null }, lab(x))));
        return h('tr', h('td', r.label), h('td', pick('instrumentId', s.instruments, x => x.label), ci.instrument && !ci.confirmed ? h('div', { class: 'unconf tiny' }, `suggested: ${ci.source} `, h('button', { type: 'button', onclick: () => commit(() => { r.assoc.instrumentId.confirmed = true; }) }, 'confirm')) : null),
          h('td', pick('columnId', s.columns, x => x.label), cc.column && !cc.confirmed ? h('div', { class: 'unconf tiny' }, `suggested: ${cc.source} `, h('button', { type: 'button', onclick: () => commit(() => { r.assoc.columnId.confirmed = true; }) }, 'confirm')) : null),
          h('td', { class: 'small' }, r.measured.fileMeta?.instrumentName || '—'), h('td', { class: 'small' }, T.known ? `${f(T.value, 2)} °C` : 'unknown', h('div', { class: 'tiny' }, T.reason)));
      })) : h('p', { class: 'small' }, 'No runs imported yet.'),
      (usedCodes.length || usedHplc.length) ? details('Map run-name codes (only for runs imported with the run-name profile)', false,
        h('p', { class: 'small' }, 'The profile reads a column code and an HPLC number from each run name but never turns them into associations. Map them explicitly here; the resulting associations are marked as coming from the profile and stay unconfirmed until you confirm them.'),
        usedCodes.map(code => h('div', { class: 'row' }, h('span', 'Column code ', h('code', code), ' → '), h('select', { 'data-testid': `codemap-${code}`, onchange: e => commit(ss => { for (const r of ss.runs) if (r.profileExtras?.columnCode === code && e.target.value) r.assoc.columnId = { value: e.target.value, source: 'profile:monashplc-runname + user code map', confirmed: false }; }) }, h('option', { value: '' }, '(choose physical column)'), s.columns.map(c => h('option', { value: c.id }, c.label))))),
        usedHplc.map(no => h('div', { class: 'row' }, h('span', `HPLC number ${no} → `), h('select', { onchange: e => commit(ss => { for (const r of ss.runs) if (r.profileExtras?.hplcNo === no && e.target.value) r.assoc.instrumentId = { value: e.target.value, source: 'profile:monashplc-runname + user code map', confirmed: false }; }) }, h('option', { value: '' }, '(choose instrument)'), s.instruments.map(i => h('option', { value: i.id }, i.label)))))) : null),
    h('section', { class: 'card' }, h('h3', 'Parameters: category, where controlled, effect'),
      table(['Parameter', 'Unit', 'Category', 'Controlled at', 'Retention', 'Selectivity', 'Efficiency'], CONDITION_FIELDS.filter(x => x.effects && Object.keys(x.effects).length).map(x => h('tr', h('td', x.label), h('td', x.unit), h('td', x.category), h('td', x.controlledAt), h('td', x.effects.retention || ''), h('td', x.effects.selectivity || ''), h('td', x.effects.efficiency || '')))),
      h('p', { class: 'small' }, 'Back-pressure is a measured RESPONSE, not a parameter; t0, K, α and Rs are calculated responses.'), sourceList(CATEGORY_SOURCE)),
    h('section', { class: 'card' }, h('h3', 'Documented reference examples'),
      h('p', { class: 'small' }, 'Source-labelled references from course materials, manufacturer pages and the user-confirmed local fleet. A local confirmation is not independent manufacturer verification. This is not a universal catalogue; add your own equipment above.'),
      REFERENCE_INSTRUMENTS.map(r => details(r.label, false, h('p', { class: 'small' }, `${r.manufacturer || '?'} ${r.systemModel || ''}; pump ${r.pump.model || '?'} (${PUMP_TYPES[r.pump.type] || 'type not documented'}); injector ${r.injector.kind || '?'} ${r.injector.model || ''}; detector ${r.detector.type || '?'} ${r.detector.model || ''}.`),
        r.limits.length ? h('p', { class: 'small' }, r.limits.map(l => `Hardware ${l.quantity}: ${l.op} ${l.value} ${l.unit} — ${l.basis}`).join('; ')) : null,
        r.note ? h('p', { class: 'small' }, r.note) : null, r.conflicts.length ? h('ul', { class: 'small warn' }, r.conflicts.map(c => h('li', c))) : null, sourceList(r.sources))),
      REFERENCE_COLUMN_MODELS.map(r => details(`${r.manufacturer} ${r.product}`, false, h('p', { class: 'small' }, `${r.ligand}; ${r.lengthMm} × ${r.idMm} mm, ${r.particleUm} µm; pore ${r.poreA ?? '?'} Å; carbon ${r.carbonPct ?? '?'} %; max ${r.limits.tMaxC ?? '?'} °C; pH ${r.limits.pH ? r.limits.pH.join('–') : '?'}.`), h('p', { class: 'small' }, r.note), sourceList(r.sources))),
      h('p', { class: 'small' }, FLEET_NOTE.text)));
}

export function equipmentView(st) {
  return h('div',{class:'stage','data-testid':'equipment-home'},firstApparatusPanel(st,{onEquipment:true}),equipmentReference(st),
    details('Equipment records and laboratory defaults (edit when needed)',st.ui.openEquipmentRecords===true,detailedEquipmentView(st)),
    details('Interactive module / parameter inspector',true,legendPanel(),inspectorPanel(st)));
}
