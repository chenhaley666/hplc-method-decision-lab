// profiles.mjs — OPTIONAL, EXPLICITLY SELECTED import profiles.
//
// A profile interprets a naming convention. It is never applied automatically.
// Its outputs carry source "profile:<id>" and confirmed:false until the user
// confirms them. A string that does not match the convention exactly produces
// no values at all (no partial guessing).
//
// Profile 'monashplc-runname': the BPS2032 RUN NAME convention taught in the
// Equipment LAB deck slides 44–47:
//   GR##-Injection#-HPLC#-Solvent-pH-ISO|GRA-%B-Flow-InjVol(u)-SampleType-Conc-
//   ColumnCode-LxIDxdp-Temperature-Wavelength
// e.g. "GR00-01-6-ACN-3-ISO-50-1.50-20u-CP-0.1-C18nP-150x4.6x5-amb-254".
// The column code, geometry and HPLC number are REPORTED, never turned into a
// column or instrument association. A user may define an explicit code map.
import { num } from '../rules.mjs';
import { cond, normaliseSolvent } from '../data-model/conditions.mjs';
import { cite } from '../presets/sources.mjs';
import { baseName } from './labsolutions.mjs';

export const PROFILES = {
  'monashplc-runname': {
    id: 'monashplc-runname', label: 'BPS2032 run-name convention (Equipment LAB slides 44–47)',
    source: cite('EQ-LAB', 'slides 44–47 and notes (experiment file naming)'),
    description: 'Reads conditions from a run name written in the BPS2032 convention. Values are marked as coming from this profile and stay unconfirmed until you confirm them. "amb" is recorded as "no oven setpoint", not as a temperature.',
  },
};

const RX = {
  group: /^GR\d{1,3}$/i, inj: /^\d{1,3}$/, hplc: /^\d{1,2}$/, solvent: /^[A-Za-z]{2,10}$/, pH: /^\d{1,2}(\.\d+)?$/,
  mode: /^(ISO|GRA)$/i, b: /^\d{1,3}(\.\d+)?$/, flow: /^\d+(\.\d+)?$/, vol: /^\d+(\.\d+)?u$/i, type: /^[A-Za-z]{2,4}$/,
  conc: /^\d+(\.\d+)?$/, code: /^[A-Za-z0-9]{2,12}$/, dims: /^\d+(\.\d+)?x\d+(\.\d+)?x\d+(\.\d+)?$/i, temp: /^(amb|T?\d{1,3})$/i, wl: /^(\d{3}|PDA)$/i,
};
const ORDER = ['group', 'inj', 'hplc', 'solvent', 'pH', 'mode', 'b', 'flow', 'vol', 'type', 'conc', 'code', 'dims', 'temp', 'wl'];

export function parseRunName(str) {
  const base = baseName(str).replace(/\s*\(\d+\)$/, '').trim();
  let tokens = base.split('-'),gradient=null;
  // Course gradient names replace the single ISO %B token with initial-final-tG.
  if(tokens.length===17&&/^GRA$/i.test(tokens[5])){
    const [initialB,finalB,tG]=[tokens[6],tokens[7],tokens[8].replace(/min$/i,'')].map(num);
    if(!RX.b.test(tokens[6])||!RX.b.test(tokens[7])||!/^\d+(\.\d+)?(min)?$/i.test(tokens[8])||!(initialB>=0&&finalB>initialB&&finalB<=100&&tG>0))return {ok:false,reason:'Invalid gradient initial / final %B or ramp time.'};
    gradient={initialB,finalB,tG,source:'Course run-name initial-final-ramp convention; holds and dwell volume not recorded'};
    tokens=[...tokens.slice(0,7),...tokens.slice(9)];
  }
  if (tokens.length !== ORDER.length) return { ok: false, reason: `"${base}" has ${tokens.length} dash-separated tokens; the convention has ${ORDER.length}.` };
  const t = {};
  for (let i = 0; i < ORDER.length; i++) {
    if (!RX[ORDER[i]].test(tokens[i])) return { ok: false, reason: `Token ${i + 1} "${tokens[i]}" does not match the ${ORDER[i]} field of the convention.` };
    t[ORDER[i]] = tokens[i];
  }
  const b = num(t.b);
  if (b > 100) return { ok: false, reason: `%B token ${t.b} exceeds 100.` };
  const [L, ID, dp] = t.dims.toLowerCase().split('x').map(num);
  const ambient = /^amb$/i.test(t.temp);
  return { ok: true, base, tokens: t, values: {
    group: t.group.toUpperCase(), injectionNo: Number(t.inj), hplcNo: Number(t.hplc), organic: normaliseSolvent(t.solvent),
    pH: num(t.pH), mode: t.mode.toUpperCase(), percentB: b, gradient, flow: num(t.flow), injVolume: num(t.vol.replace(/u$/i, '')),
    sampleType: t.type.toUpperCase(), sampleConc: num(t.conc), columnCode: t.code, geometry: { lengthMm: L, idMm: ID, particleUm: dp },
    ovenSetpoint: ambient ? 'ambient' : num(t.temp.replace(/^T/i, '')), wavelength: /^PDA$/i.test(t.wl) ? 'PDA' : num(t.wl) } };
}

// Both names remain file metadata. Selecting one is an explicit interpretation
// of that convention, not a correction to the CSV or a sample identity claim.
export function runNameSourceOptions(run) {
  const fileMeta = run.measured?.fileMeta || {};
  const sources = [{ from: 'fileName', label: 'Uploaded filename', rawName: run.raw?.fileName || null },
    { from: 'sampleName', label: 'Internal Sample Name', rawName: fileMeta.sampleName || null }]
    .map(s => ({ ...s, base: baseName(s.rawName).replace(/\s*\(\d+\)$/, ''), parsed: parseRunName(s.rawName) }));
  const [file, sample] = sources;
  const conflicts = file.parsed.ok && sample.parsed.ok
    ? Object.keys(file.parsed.values).filter(k => JSON.stringify(file.parsed.values[k]) !== JSON.stringify(sample.parsed.values[k]))
      .map(field => ({ field, fileName: file.parsed.values[field], sampleName: sample.parsed.values[field] })) : [];
  const nameConflict = !!(sample.rawName && file.base !== sample.base)
    || !!fileMeta.nameConflicts?.length;
  return { sources, conflicts, nameConflict,
    note: 'Source choice does not identify compounds, establish same-sample identity, rename a run or rewrite original CSV text.' };
}

function originalNames(run) {
  return { fileName: run.raw?.fileName || null, sampleName: run.measured?.fileMeta?.sampleName || null,
    dataFileName: run.measured?.fileMeta?.dataFileName || null };
}

export function profileConfirmationStatus(run) {
  const options = runNameSourceOptions(run);
  if (!options.nameConflict) return { ok: true, reason: 'No conflicting recorded run-name sources.' };
  const record = run.profileResolution;
  const matching = record && record.profile === 'monashplc-runname' && record.by === 'user'
    && ['fileName', 'sampleName'].includes(record.from) && typeof record.basis === 'string' && !!record.basis.trim()
    && typeof record.declaredAt === 'string' && Number.isFinite(Date.parse(record.declaredAt))
    && JSON.stringify(record.originalNames) === JSON.stringify(originalNames(run))
    && record.from === run.profileReport?.from;
  return { ok: !!matching, reason: matching
    ? `User selected ${record.from === 'sampleName' ? 'the internal Sample Name' : 'the uploaded filename'}: ${record.basis}. Original names are unchanged; this does not identify compounds or the sample.`
    : 'Recorded names disagree. Select filename or internal Sample Name and record the basis before confirming profile-derived conditions.' };
}

// Apply the profile to an imported run. `from` = 'fileName' | 'sampleName'.
// codeMaps = { column: {code: physicalColumnId}, instrument: {hplcNo: instrumentId} } — user-defined.
export function applyRunNameProfile(run, { from = 'fileName', codeMaps = {} } = {}) {
  const src = 'profile:monashplc-runname';
  const fileStr = run.raw.fileName, sampleStr = run.measured.fileMeta?.sampleName;
  const choices = runNameSourceOptions(run);
  const primary = parseRunName(from === 'sampleName' ? sampleStr : fileStr);
  const other = parseRunName(from === 'sampleName' ? fileStr : sampleStr);
  const report = { profile: 'monashplc-runname', from, applied: false, messages: [],
    selectedName: from === 'sampleName' ? sampleStr || null : fileStr || null,
    sourceOptions: choices.sources.map(({ from, label, rawName, parsed }) => ({ from, label, rawName, readable: parsed.ok, reason: parsed.reason || null })),
    nameConflict: choices.nameConflict, conflicts: choices.conflicts };
  if (!['fileName', 'sampleName'].includes(from)) { report.messages.push('Profile not applied: choose fileName or sampleName explicitly.'); run.profileReport = report; return report; }
  if (!primary.ok) { report.messages.push(`Profile not applied: ${primary.reason}`); run.profileReport = report; return report; }
  const v = primary.values;
  const set = (k, value, unit = '', note = '') => {
    // never overwrite a value that came from the file itself or from the user
    const cur = run.conditions[k];
    if (cur && cur.value !== null && (cur.source === 'file' || cur.source === 'user' || cur.source === 'mapping')) {
      if (String(cur.value) !== String(value)) report.messages.push(`CONFLICT on ${k}: file/user value ${cur.value} kept; profile reads ${value}.`);
      return;
    }
    run.conditions[k] = cond(value, src, { unit, confirmed: false, note: note || `Read from ${from === 'sampleName' ? 'sample name' : 'filename'} by the run-name profile.` });
  };
  set('organic', v.organic); set('pH', v.pH); set('mode', v.mode); set('percentB', v.percentB, '%');
  set('flow', v.flow, 'mL/min'); set('injVolume', v.injVolume, 'µL'); set('sampleType', v.sampleType);
  set('sampleConc', v.sampleConc, 'mg/mL'); set('wavelength', v.wavelength, 'nm');
  set('ovenSetpoint', v.ovenSetpoint, '°C', v.ovenSetpoint === 'ambient' ? '"amb" in the run name: no oven setpoint. This is NOT a temperature value.' : '');
  run.profileExtras = { group: v.group, injectionNo: v.injectionNo, hplcNo: v.hplcNo, columnCode: v.columnCode, geometry: v.geometry, gradient:v.gradient, source: src, parsedFrom: from };
  const link = (key, target) => {
    const cur = run.assoc[key];
    if (cur?.value && !String(cur.source || '').startsWith('profile:')) {
      if (target && cur.value !== target) report.messages.push(`CONFLICT on ${key}: the existing non-profile equipment association was kept; the selected profile/code map points to ${target}.`);
      return;
    }
    // Switching sources must not leave a code-map association from the old
    // interpretation behind. No code map means no equipment association.
    run.assoc[key] = target ? { value: target, source: `${src} + user code map`, confirmed: false }
      : { value: null, source: null, confirmed: false };
  };
  link('columnId', codeMaps.column?.[v.columnCode]);
  link('instrumentId', codeMaps.instrument?.[v.hplcNo]);
  if (other.ok) {
    const diffs = Object.keys(v).filter(k => JSON.stringify(v[k]) !== JSON.stringify(other.values[k]));
    if (diffs.length) report.messages.push(`Filename and sample name differ in: ${diffs.join(', ')}. Values were read from the ${from === 'sampleName' ? 'sample name' : 'filename'} as selected; confirm which describes the injection.`);
  }
  report.applied = true;
  run.profileReport = report;
  report.confirmation = profileConfirmationStatus(run);
  if (!report.confirmation.ok) report.messages.push(`PROFILE VALUES UNCONFIRMED: ${report.confirmation.reason}`);
  return report;
}

// Explicit resolution is a user annotation. It records who chose which
// unchanged source and why; values remain unconfirmed until the separate
// confirmation action. File/user/mapped conditions still take precedence.
export function resolveRunNameProfile(run, { from, basis, codeMaps = {} } = {}) {
  const note = typeof basis === 'string' ? basis.trim() : '';
  if (!['fileName', 'sampleName'].includes(from)) throw new Error('Select uploaded filename or internal Sample Name.');
  if (!note) throw new Error('Record the basis for choosing this run-name source.');
  const choice = runNameSourceOptions(run).sources.find(s => s.from === from);
  if (!choice?.parsed.ok) throw new Error(`The selected source cannot be read by the run-name profile: ${choice?.parsed.reason || 'not recorded'}`);
  const record = { profile: 'monashplc-runname', from, basis: note, originalNames: originalNames(run),
    by: 'user', declaredAt: new Date().toISOString() };
  run.profileResolution = record;
  const report = applyRunNameProfile(run, { from, codeMaps });
  report.resolution = { ...record };
  for (const c of Object.values(run.conditions)) if (c?.value !== null && String(c?.source || '').startsWith('profile:'))
    c.note = `${c.note || ''} Source choice declared by user: ${note}. This does not establish compound or sample identity.`.trim();
  return report;
}

// Confirm profile-derived values on a run (the user's explicit action).
export function confirmProfileValues(run) {
  const status = profileConfirmationStatus(run);
  if (!status.ok) {
    const warning = `PROFILE CONFIRMATION REFUSED: ${status.reason}`;
    if (!run.warnings.includes(warning)) run.warnings.push(warning);
    return 0;
  }
  let n = 0;
  for (const c of Object.values(run.conditions)) if (c && c.value !== null && String(c.source || '').startsWith('profile:') && !c.confirmed) { c.confirmed = true; c.note = (c.note ? c.note + ' ' : '') + 'Confirmed by user.'; n++; }
  for (const a of Object.values(run.assoc)) if (a && a.value && String(a.source || '').startsWith('profile:') && !a.confirmed) { a.confirmed = true; n++; }
  return n;
}
