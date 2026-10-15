// method.mjs — build a proposed next-run method from the current run.
// Known, unchanged conditions are CARRIED with their source; changed values
// are marked; everything else is explicitly UNKNOWN. Nothing is invented to
// make the method look complete.
import { CONDITION_FIELDS, knownValue, sourceLabel } from '../data-model/conditions.mjs';
import { runColumn, runInstrument } from '../data-model/derive.mjs';
import { columnDescription } from '../data-model/equipment.mjs';
import { changeContext } from '../equipment/inspector.mjs';
import { labPlanningValue, labPressureSettings } from '../presets/local-lab.mjs';

export function proposedMethod(session, run, changes = {}, extras = {}) {
  // A proposed solvent change is one method, not a changed identity beside
  // the previous phase-B bottle. An explicitly supplied recipe still wins.
  if (changes.organic && !changes.phaseB) changes = { ...changes, phaseB: {
    value: changes.organic.value === 'Mix' ? 'ACN + MeOH (Mix)' : changes.organic.value,
    why: `${changes.organic.why || 'Organic solvent changed'}. Solvent B follows the proposed identity; confirm bottle preparation and additives. No mixture ratio is inferred.`,
  } };
  const rows = [];
  const ins = runInstrument(session, run), col = runColumn(session, run);
  const colChange = changes.column;
  rows.push({ key: 'instrument', label: 'Instrument', value: ins.instrument ? ins.instrument.label : null, state: ins.instrument ? (ins.confirmed ? 'carried' : 'carried-unconfirmed') : 'unknown', source: ins.source || '' });
  if (colChange) rows.push({ key: 'column', label: 'Column', value: colChange.text, state: 'changed', source: colChange.why || '' });
  else rows.push({ key: 'column', label: 'Column', value: col.column ? columnDescription(col.model, col.column) : null, state: col.column ? (col.confirmed ? 'carried' : 'carried-unconfirmed') : 'unknown', source: col.source || '' });
  for (const f of CONDITION_FIELDS) {
    if (['sampleType'].includes(f.key)) continue;
    const c = run.conditions[f.key];
    if (f.key in changes) {
      // A changed condition carries the module that controls it and the range
      // it may be set within, so the row can be executed at the instrument
      // without a second document. Where the range is not documented the row
      // says so and names the datasheet field.
      const cc = changeContext(session, session.settings, f.key, { run });
      rows.push({ key: f.key, label: f.label, value: changes[f.key].value, unit: f.unit, state: 'changed', source: changes[f.key].why || '',
        module: cc?.module || null, controlledAt: cc?.controlledAt || null, range: cc?.range || null, rangeKnown: !!cc?.rangeKnown, requiredField: cc?.requiredField || null });
      continue;
    }
    if (knownValue(c)) rows.push({ key: f.key, label: f.label, value: c.value === 'ambient' ? 'no setpoint (ambient)' : c.value, unit: c.value === 'ambient' ? '' : (c.unit || f.unit), state: c.confirmed ? 'carried' : 'carried-unconfirmed', source: `${sourceLabel(c)}, carried from "${run.label}"` });
    else {
      const planned=labPlanningValue(session,run,f.key);
      rows.push({key:f.key,label:f.label,value:planned,unit:f.unit,state:planned===null?'unknown':'carried-unconfirmed',
        source:planned===null?'not recorded — confirm before running':`LOCAL LAB PLANNING DEFAULT — ${session.settings.localLab.source}; not measured or recorded for this run. Confirm the actual method before running.`});
    }
  }
  rows.push({ key: 'sample', label: 'Sample', value: knownValue(run.conditions.sampleType) && !/^BLK$/i.test(run.conditions.sampleType.value) ? run.conditions.sampleType.value : 'the same sample as the current run', state: 'carried', source: '' });
  for (const [k, v] of Object.entries(extras)) rows.push({ key: k, label: v.label, value: v.value, unit: v.unit || '', state: 'derived', source: v.basis || '' });
  if(session.settings.localLab?.enabled){const p=labPressureSettings(session,session.settings,run).specs.pressure;rows.push({key:'methodPressureMaximum',label:'Method pressure acceptance maximum',value:p.value,unit:'psi',state:'carried',source:`${p.op} ${p.value} psi — ${p.source||'custom specification'}. Separate from hardware and column ratings.`});}
  const unknown = rows.filter(r => r.state === 'unknown').map(r => r.label);
  const unconfirmed = rows.filter(r => r.state === 'carried-unconfirmed').map(r => r.label);
  return { rows, unknown, unconfirmed };
}
