// session.mjs — the shared experiment library and its versioned schema.
//
// Layers kept separate inside a session:
//   measured     run.measured          (from the file; never edited)
//   recorded     run.conditions, run.assoc   (with per-value provenance)
//   annotations  run.flags, run.peakNotes, run.marker, assignments, compounds, run.label
//   derived      NOT STORED as truth. Recomputed from the above on every change;
//                an exported snapshot is only used to check integrity on re-import.
import { defaultSettings, PRESET_ID } from '../presets/bps2032.mjs';
import { emptyConditions, CONDITION_FIELDS } from './conditions.mjs';
import { newId, sha256 } from './ids.mjs';
import { validateInstrument, validateColumnModel } from './equipment.mjs';
import { parseLabSolutions } from '../importers/labsolutions.mjs';
import { profileConfirmationStatus } from '../importers/profiles.mjs';
import { parseGeneric, autoMap, readHeader } from '../importers/generic.mjs';
import { sampleIdentity, validSampleEquivalence } from './comparability.mjs';
import { newLabDefaults } from '../presets/local-lab.mjs';
import {validHeightThreshold,HEIGHT_UNITS} from './peak-filter.mjs';
import {TEMPLATE_ORIGIN} from '../presets/tagged-template.mjs';

export const SCHEMA = 'bps2032-fc1-session';
export const SCHEMA_VERSION = 3;
export const APP_VERSION = '15.25.0';

export function newSession({ localLab = false } = {}) {
  const session = { schema: SCHEMA, version: SCHEMA_VERSION, sessionId: newId('session'), createdAt: new Date().toISOString(),
    templateOrigin:TEMPLATE_ORIGIN,
    settings: defaultSettings(), instruments: [], columnModels: [], columns: [], compounds: [],
    runs: [], assignments: [], sampleEquivalences: [], importLog: [], seq: 0,
    chronology: { ids: [], confirmed: false, note: '' } };
  session.settings.localLab = { ...newLabDefaults(), enabled: localLab };
  if(localLab)session.settings.r2Policy={mode:'project',target:null,op:'>='};
  return session;
}

// show is per stage ("show this run in the current stage"); compare, fit and
// history are independent session-wide selections. None implies another.
export const SHOW_STAGES = ['equipment', 'retention', 'selectivity'];
export const DEFAULT_FLAGS = Object.freeze({ show: Object.freeze({ equipment: true, retention: true, selectivity: true }), compare: false, fit: false, history: true });
export const freshFlags = () => ({ show: { equipment: true, retention: true, selectivity: true }, compare: false, fit: false, history: true });

export function newRun({ fileName, format, profile = null, text = '', measured, conditions, fileMeta = {}, warnings = [], label, genericKey = null, importSpec = null }, idGen) {
  return {
    id: newId('run', idGen),
    label: label || fileName || 'run',
    seq: 0,
    raw: { fileName: fileName || null, format, profile, sha256: sha256(text), text, genericKey, importSpec, importedAt: new Date().toISOString() },
    measured: { peaks: [], trace: null, pressure: null, oven: null, room: null, acquisitionEnd: null, ...measured, fileMeta },
    conditions: { ...emptyConditions(), ...(conditions || {}) },
    assoc: { instrumentId: { value: null, source: null, confirmed: false }, columnId: { value: null, source: null, confirmed: false } },
    marker: { method: 'none', peakNo: null, t0: null, note: '', confirmed: false },
    flags: freshFlags(),
    peakNotes: {},
    notes: '',
    warnings: [...warnings],
  };
}

// Add runs to the library. Identical file content is detected by SHA-256 and
// handled by the explicit `duplicatePolicy`: 'skip' (default) or 'keep'.
export function addRuns(session, runs, { duplicatePolicy = 'skip' } = {}) {
  const added = [], skipped = [];
  for (const run of runs) {
    const dup = session.runs.find(r => r.raw.sha256 === run.raw.sha256 && r.raw.genericKey === run.raw.genericKey);
    if (dup && duplicatePolicy === 'skip') { skipped.push({ run, duplicateOf: dup.id, reason: `Identical content to already-imported run "${dup.label}" (${dup.id}); not added.` }); continue; }
    if (dup) run.warnings.push(`Identical content to run "${dup.label}" (${dup.id}); kept as a separate record at the user's request.`);
    session.seq = (session.seq || 0) + 1; run.seq = session.seq;
    session.runs.push(run); added.push(run);
  }
  return { added, skipped };
}

export function getRun(session, id) { return session.runs.find(r => r.id === id) || null; }

// Chronological order: acquisition timestamp from the file where known,
// otherwise import order. The basis is reported, not hidden.
// Chronology. Only two things state the order of runs: an acquisition
// timestamp inside the file, and the user. The order in which files were
// selected, and a run's label, are NEITHER: selecting the same files in
// another order, or renaming a run, must not change which run is "the latest"
// or how the history is read. Rows of one generic CSV are an exception: their
// order is stated by that file.
//
// session.chronology = { ids: [runId…], confirmed: true, note } is the user's
// stated order and takes precedence over everything else.
// A timezone-free acquisition time is a recorded wall-clock label, not an
// instant in the browser's timezone. Compare calendar components on a neutral
// numeric scale and retain the recorded precision as an interval. A minute
// label cannot order another injection recorded inside that same minute.
export function acquisitionRange(run) {
  const meta = run.measured.fileMeta || {};
  const value = meta.acquiredIso || '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, se, fraction, zone] = m;
  const parts = [y, mo, d, h, mi, se ?? '0'].map(Number);
  if (parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[3] > 23 || parts[4] > 59 || parts[5] > 59) return null;
  const cal = new Date(0); cal.setUTCFullYear(parts[0], parts[1] - 1, parts[2]); cal.setUTCHours(parts[3], parts[4], parts[5], 0);
  if (cal.getUTCFullYear() !== parts[0] || cal.getUTCMonth() !== parts[1] - 1 || cal.getUTCDate() !== parts[2]) return null;
  const basis = zone ? 'offset-recorded' : 'wall-clock-no-timezone';
  const start = zone ? Date.parse(value) : cal.getTime() + Number(fraction || 0) * 1000;
  if (!Number.isFinite(start)) return null;
  const precision = meta.acquiredPrecision || (se === undefined ? 'minute' : fraction ? 'fractional-second' : 'second');
  const resolution = precision === 'minute' ? 60000 : fraction ? 1000 * 10 ** -(fraction.length - 1) : 1000;
  return { start, end: start + resolution, precision, basis };
}
const tsOf = run => acquisitionRange(run)?.start ?? NaN;
const fileKeyOf = run => `${run.raw.format}::${run.raw.fileName || run.id}`;

export function chronological(session, runs = session.runs) {
  const declaration = session.chronology?.confirmed ? session.chronology.ids || [] : [];
  // A partial declaration cannot override pairs from an otherwise complete
  // timestamp order while chronologyStatus reports that timestamp basis.
  const stated = runs.every(r => declaration.includes(r.id)) ? declaration : [];
  const idx = new Map(stated.map((id, i) => [id, i]));
  return [...runs].sort((a, b) => {
    if (idx.has(a.id) && idx.has(b.id)) return idx.get(a.id) - idx.get(b.id);
    const ta = tsOf(a), tb = tsOf(b);
    if (acquisitionRange(a)?.basis === acquisitionRange(b)?.basis && Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return a.seq - b.seq;   // last resort; chronologyStatus reports it as unestablished
  });
}

// Is the order of this set established, and by what?
export function chronologyStatus(session, runs = session.runs) {
  const list = [...runs];
  if (list.length < 2) return { ok: true, basis: list.length ? 'single run' : 'empty set', ambiguous: [], reason: list.length ? 'One run: no ordering question arises.' : 'No run in this set.' };
  const stated = session.chronology?.confirmed ? new Set(session.chronology.ids || []) : new Set();
  if (list.every(r => stated.has(r.id)))
    return { ok: true, basis: 'user-stated order', ambiguous: [], reason: `The order of these ${list.length} run(s) was stated by the user${session.chronology?.note ? ` (${session.chronology.note})` : ''}.` };
  // A partial declaration cannot place timestamp-less runs relative to the
  // rest of the batch. Only a complete stated order takes precedence above.
  const noStamp = list.filter(r => !acquisitionRange(r));
  if (!noStamp.length) {
    const ranges = list.map(r => ({ run: r, ...acquisitionRange(r) }));
    if (new Set(ranges.map(x => x.basis)).size > 1) return { ok: false, basis: 'incompatible timestamp bases', ambiguous: list.map(r => ({ id: r.id, label: r.label })),
      reason: 'Some acquisition timestamps state a timezone/offset and others do not. Their absolute order is not established; state the full order without assuming a timezone for the other files.' };
    const ordered = ranges.sort((a, b) => a.start - b.start), overlap = new Map();
    for (let i = 1; i < ordered.length; i++) {
      for (let j = i - 1; j >= 0; j--) if (ordered[i].start < ordered[j].end) {
        for (const x of [ordered[j], ordered[i]]) overlap.set(x.run.id, { id: x.run.id, label: x.run.label });
      }
    }
    if (!overlap.size) return { ok: true, basis: 'acquisition timestamps in the files', ambiguous: [], reason: 'Every run carries a valid acquisition timestamp from its own file and the recorded precision intervals do not overlap. Timezone-free labels are compared as recorded local wall-clock times; no timezone or exact seconds were inferred.' };
    return { ok: false, basis: 'acquisition timestamps in the files', ambiguous: [...overlap.values()],
      reason: `${overlap.size} run(s) have overlapping acquisition timestamps at their recorded precision (including an identical timestamp). The files do not state which came first. State the order; it is not taken from the order the files were selected in.` };
  }
  // runs without a timestamp: order is stated only WITHIN one source file
  const byFile = new Map();
  for (const r of noStamp) { const k = fileKeyOf(r); byFile.set(k, [...(byFile.get(k) || []), r]); }
  const others = list.length - noStamp.length;
  if (byFile.size === 1 && others === 0)
    return { ok: true, basis: 'row order of a single source file', ambiguous: [], reason: `All ${noStamp.length} run(s) come from one file (${noStamp[0].raw.fileName || 'unnamed'}), whose row order states their sequence.` };
  return { ok: false, basis: 'not established', ambiguous: noStamp.map(r => ({ id: r.id, label: r.label, file: r.raw.fileName })),
    reason: `${noStamp.length} of ${list.length} run(s) carry no acquisition timestamp and come from ${byFile.size} different source file(s)${others ? ', alongside runs that do carry timestamps' : ''}. Their order is NOT inferred from the order the files were selected in, from their file names or from their labels. State the order of these runs, or import exports that carry an acquisition time.` };
}

export function setFlag(session, runId, flag, value, stage = null) {
  const r = getRun(session, runId);
  if (!r) return null;
  if (flag === 'show') { if (!SHOW_STAGES.includes(stage)) throw new Error('show needs a stage'); r.flags.show[stage] = !!value; }
  else if (['compare', 'fit', 'history'].includes(flag)) r.flags[flag] = !!value;
  else throw new Error(`unknown flag ${flag}`);
  return r;
}

// ---------------------------------------------------------------- export / import
// LabSolutions traces are re-derived from the preserved original text on
// import (and the peak table re-checked against it), so they are not stored
// twice. Generic peak-table runs have no trace.
export function exportSession(session, derivedSnapshot = null) {
  const runs = session.runs.map(r => r.raw.format === 'labsolutions' && r.raw.text
    ? { ...r, measured: { ...r.measured, trace: null, pressure: r.measured.pressure ? { ...r.measured.pressure, series: null } : null, traceStoredAs: 'rebuilt from raw.text on import' } } : r);
  return JSON.stringify({ ...session, runs, templateOrigin:TEMPLATE_ORIGIN,exportedAt: new Date().toISOString(), app: APP_VERSION,
    derivedSnapshot: derivedSnapshot ? { note: 'Derived results at export time. NOT trusted on import: recomputed and compared.', ...derivedSnapshot } : null }, null, 1);
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

// Validate a parsed session object. Returns {ok, errors[], warnings[], session}.
export function validateSession(obj) {
  const errors = [], warnings = [];
  if (!isObj(obj)) return { ok: false, errors: ['Not a JSON object.'], warnings };
  if(obj.templateOrigin!==undefined&&(!isObj(obj.templateOrigin)||['name','workbookSha256','tagFingerprint','tagLocation'].some(k=>obj.templateOrigin[k]!==TEMPLATE_ORIGIN[k])))errors.push('Tagged-template provenance disagrees with the STU_084 application build. Current session kept.');
  if (obj.schema !== SCHEMA) errors.push(`Unknown schema "${obj.schema}". Expected "${SCHEMA}".`);
  if (obj.version === 2 && obj.schema === SCHEMA) {
    // A legacy session states no new identity simply because its sample type
    // or display name happens to be present. Preserve those facts; no inferred
    // ID/equivalence is created. Hash the full legacy content for a stable
    // recovery ID, not createdAt alone (distinct sessions may share a clock).
    obj.sessionId = `legacy-session-${sha256(JSON.stringify(obj))}`;
    obj.version = SCHEMA_VERSION;
    obj.sampleEquivalences = [];
    for (const run of Array.isArray(obj.runs) ? obj.runs : []) if (isObj(run.conditions))
      run.conditions.sampleId = { value: null, unit: '', source: null, confirmed: false, note: '' };
    warnings.push('Schema 2 migrated to schema 3. Sample/study identities remain UNKNOWN: sample names/types are not identities. Fit eligibility and selectivity completion are recalculated under the stricter identity contract; saved derived results may legitimately differ.');
  }
  if (obj.version !== SCHEMA_VERSION) errors.push(`Unsupported schema version ${obj.version}; this application reads version ${SCHEMA_VERSION}.`);
  if (typeof obj.sessionId !== 'string' || !obj.sessionId.trim()) errors.push('"sessionId" must be a nonempty stable session identifier.');
  for (const k of ['instruments', 'columnModels', 'columns', 'compounds', 'runs', 'assignments'])
    if (!Array.isArray(obj[k])) errors.push(`"${k}" must be an array.`);
  if (!isObj(obj.settings)) errors.push('"settings" missing.');
  if (!Array.isArray(obj.sampleEquivalences)) errors.push('"sampleEquivalences" must be an array of explicit declarations.');
  if (errors.length) return { ok: false, errors, warnings };
  if(obj.settings.course!==undefined){
    const c=obj.settings.course;
    if(!isObj(c))errors.push('Course Dashboard settings must be an object.');
    else{
      if(c.assessmentScope!==undefined&&!['fc1','fc2'].includes(c.assessmentScope))errors.push('Unsupported assessment scope.');
      if(c.firstSetup!==undefined){const p=c.firstSetup;if(!isObj(p)||p.applyToNewImports!==undefined&&typeof p.applyToNewImports!=='boolean'||p.method!==undefined&&!isObj(p.method))errors.push('Invalid optional prospective setup declaration.');}
      for(const k of ['shortFraction','rsFloorFraction'])if(c[k]!==undefined&&(!Number.isFinite(c[k])||c[k]<=0||c[k]>=1))errors.push(`Course ${k} must be a numeric fraction between 0 and 1.`);
      if(c.rsFloor!==undefined&&c.rsFloor!==null&&(!Number.isFinite(c.rsFloor)||c.rsFloor<0))errors.push('Course Rs floor must be a non-negative number.');
      if(c.intermediateB!==undefined&&c.intermediateB!==null&&(!Number.isFinite(c.intermediateB)||c.intermediateB<0||c.intermediateB>100))errors.push('Observed intermediate composition must be 0–100 %B.');
      if(c.intermediateWanted!==undefined&&c.intermediateWanted!==null&&typeof c.intermediateWanted!=='boolean')errors.push('Intermediate Yes/No choice must be boolean.');
      if(c.intermediateSkipSignature!==undefined&&c.intermediateSkipSignature!==null&&typeof c.intermediateSkipSignature!=='string')errors.push('Intermediate skip must be tied to the measured-run decision signature.');
      if(c.observations!==undefined){if(!isObj(c.observations))errors.push('Course observations must be keyed records.');else for(const x of Object.values(c.observations)){if(!isObj(x)||typeof x.signature!=='string'||['short','farRs','temperatureGood'].some(k=>x[k]!==undefined&&typeof x[k]!=='boolean'))errors.push('Course OBSERVE confirmations must be boolean values tied to a data signature.');if(x?.extraTemperature!==undefined&&x.extraTemperature!==null&&(!Number.isFinite(x.extraTemperature)||x.extraTemperature<20||x.extraTemperature>60))errors.push('Optional OBSERVE temperature must be numeric 20–60 °C.');}}
      if(c.stageOverrides!==undefined&&(!isObj(c.stageOverrides)||Object.values(c.stageOverrides).some(x=>x!==null&&!['retention','selectivity','efficiency','gradient'].includes(x))))errors.push('Invalid corrected course workflow role.');
      if(c.fitRunIds!==undefined&&c.fitRunIds!==null&&(!Array.isArray(c.fitRunIds)||c.fitRunIds.some(x=>typeof x!=='string')||new Set(c.fitRunIds).size!==c.fitRunIds.length))errors.push('Fit selection must contain distinct recorded run IDs.');
      for(const k of ['fitChoice','fitSelectionNote','planChoice','planChoiceSignature','inventoryChoice','inventoryChoiceSignature'])if(c[k]!==undefined&&c[k]!==null&&typeof c[k]!=='string')errors.push(`Course ${k} must be text.`);
      if(c.inventory!==undefined){const v=c.inventory;if(!isObj(v))errors.push('Inventory search settings must be an object.');else{
        for(const k of ['flowMin','flowMax','flowStep'])if(v[k]!==undefined&&v[k]!==null&&!Number.isFinite(v[k]))errors.push(`Inventory ${k} must be numeric or blank.`);
        if(v.priority!==undefined&&!['time','rs','pressure','cost','length','particle'].includes(v.priority))errors.push('Unsupported inventory preference.');
        if(v.columns!==undefined){if(!isObj(v.columns))errors.push('Inventory columns must be keyed declarations.');else for(const x of Object.values(v.columns))if(!isObj(x)||x.available!==undefined&&typeof x.available!=='boolean'||x.definition!==undefined&&typeof x.definition!=='string'||x.compatibleReference!==undefined&&x.compatibleReference!==null&&typeof x.compatibleReference!=='string'||x.spp!==undefined&&x.spp!==null&&!(Number.isFinite(x.spp)&&x.spp>0)||x.price!==undefined&&x.price!==null&&!(Number.isFinite(x.price)&&x.price>=0))errors.push('Invalid inventory availability, definition, phase, particle factor or cost declaration.');}
      }}
      for(const section of ['efficiency','gradient','prelab'])if(c[section]!==undefined){if(!isObj(c[section]))errors.push(`Course ${section} must be an object.`);else for(const [k,v]of Object.entries(c[section])){if(section==='prelab'&&k==='family'){if(v!==null&&!['Pinnacle','Ultra','Force','Raptor'].includes(v))errors.push('Unsupported trial product family.');}else if(v!==null&&!Number.isFinite(v))errors.push(`Course ${section}.${k} must be numeric or blank. Invalid inputs do not generate a plan.`);}}
    }
  }
  if(obj.settings.solventPlan!==undefined){const p=obj.settings.solventPlan;if(!isObj(p)||p.sourceRunId!==undefined&&typeof p.sourceRunId!=='string'||p.signature!==undefined&&typeof p.signature!=='string'||p.B!==undefined&&(!Number.isFinite(p.B)||p.B<0||p.B>100)||p.to!==undefined&&p.to!=='MeOH')errors.push('Invalid source-linked solvent plan.');}
  const ids = new Set();
  const dupId = id => { if (ids.has(id)) errors.push(`Duplicate id ${id}.`); ids.add(id); };
  for (const i of obj.instruments) { dupId(i.id); for (const e of validateInstrument(i)) errors.push(`Instrument ${i.id}: ${e}`); }
  for (const m of obj.columnModels) { dupId(m.id); for (const e of validateColumnModel(m)) errors.push(`Column model ${m.id}: ${e}`); }
  for (const c of obj.columns) { dupId(c.id); if (c.modelId && !obj.columnModels.some(m => m.id === c.modelId)) errors.push(`Column ${c.id} refers to missing model ${c.modelId}.`); }
  for (const c of obj.compounds) dupId(c.id);
  for (const r of obj.runs) {
    dupId(r.id);
    if (!isObj(r.measured) || !Array.isArray(r.measured.peaks)) { errors.push(`Run ${r.id}: measured peaks missing.`); continue; }
    if (!isObj(r.conditions)) errors.push(`Run ${r.id}: conditions missing.`);
    if (!isObj(r.flags) || !isObj(r.flags.show)) errors.push(`Run ${r.id}: flags missing or malformed.`);
    if(r.heightFilter && (typeof r.heightFilter.enabled!=='boolean'||!validHeightThreshold(r.heightFilter.threshold)||r.heightFilter.unit&&!HEIGHT_UNITS.includes(r.heightFilter.unit))) errors.push(`Run ${r.id}: invalid peak-height filter (allowed threshold 10,000–100,000; supported original-height unit).`);
    for (const f of CONDITION_FIELDS) if (r.conditions && !(f.key in r.conditions)) r.conditions[f.key] = { value: null, unit: f.unit, source: null, confirmed: false, note: '' };
    const identity = r.conditions?.sampleId;
    const mix=r.conditions?.mixAcnPct;if(mix?.value!==null&&mix?.value!==undefined&&!(Number.isFinite(mix.value)&&mix.value>0&&mix.value<100)){const message=`Run ${r.id}: Mix ACN fraction inside bottle B must be strictly between 0 and 100 % v/v.`;if(['file','mapping'].includes(mix.source))warnings.push(message+' Original file value retained, not a complete recipe.');else errors.push(message);}
    if (!isObj(identity) || (identity.value !== null && typeof identity.value !== 'string')) errors.push(`Run ${r.id}: sample/study identity must be a provenance-bearing string or null.`);
    else if (identity.value !== null && identity.value !== '' && (identity.confirmed === true || !['file', 'mapping', 'user'].includes(identity.source)) && !sampleIdentity(r).known)
      errors.push(`Run ${r.id}: invalid sample/study identity declaration (${sampleIdentity(r).reason}).`);
    if (!['labsolutions', 'generic-peak-table'].includes(r.raw?.format)) errors.push(`Run ${r.id}: unsupported preserved-original format; imported runs require a supported raw CSV, not unverified saved measurements.`);
    else if (typeof r.raw.text !== 'string' || !r.raw.text.trim() || !/^[a-f0-9]{64}$/i.test(r.raw.sha256 || '')) errors.push(`Run ${r.id}: preserved original CSV text and a valid SHA-256 are required; saved measurements without their original cannot be verified.`);
    else if (sha256(r.raw.text) !== r.raw.sha256) errors.push(`Run ${r.id}: preserved original text does not match its recorded SHA-256 — the original data has been altered.`);
    for (const p of r.measured.peaks) if (!Number.isFinite(p.tR)) errors.push(`Run ${r.id}: a peak has a non-numeric retention time.`);
    const ia = r.assoc?.instrumentId?.value, ca = r.assoc?.columnId?.value;
    if (ia && !obj.instruments.some(i => i.id === ia)) errors.push(`Run ${r.id} refers to missing instrument ${ia}.`);
    if (ca && !obj.columns.some(c => c.id === ca)) errors.push(`Run ${r.id} refers to missing physical column ${ca}.`);
  }
  for (const a of obj.assignments) {
    if (!obj.runs.some(r => r.id === a.runId)) errors.push(`Assignment refers to missing run ${a.runId}.`);
    if (a.compoundId && !obj.compounds.some(c => c.id === a.compoundId)) errors.push(`Assignment refers to missing compound ${a.compoundId}.`);
  }
  for (const declaration of obj.sampleEquivalences) {
    if (!validSampleEquivalence(declaration)) errors.push('Malformed sample-equivalence declaration: different IDs, a user basis and a valid declaredAt date are required.');
    else dupId(declaration.id);
  }
  if (obj.settings.presetId !== PRESET_ID) warnings.push(`Settings were saved under preset "${obj.settings.presetId}".`);
  return { ok: errors.length === 0, errors, warnings, session: obj };
}

export function importSessionText(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return { ok: false, errors: [`Not valid JSON: ${e.message}`], warnings: [] }; }
  const v = validateSession(obj);
  if (!v.ok) return v;
  // rebuild LabSolutions traces from the preserved original, and check that
  // the stored peak table is exactly what the original contains
  for (const r of obj.runs) {
    if (!r.raw?.text || !['generic-peak-table', 'labsolutions'].includes(r.raw.format)) continue;
    // Every file-owned field is checked/rebuilt, not merely the peak time and
    // sample ID. Saved widths/labels/pressure must not become invented data.
    let original;
    if (r.raw.format === 'generic-peak-table') {
      const spec = r.raw.importSpec;
      let parsed;
      try { parsed = parseGeneric(r.raw.text, r.raw.fileName, spec?.mapping || autoMap(readHeader(r.raw.text).header), spec?.units || { time: 'min', pressure: 'psi' }); }
      catch (error) { return { ok: false, errors: [`Run ${r.id}: preserved original cannot be checked (${error.message}).`], warnings: v.warnings }; }
      original = parsed.ok ? parsed.runs.find(x => x.runKey === r.raw.genericKey) : null;
      if (!original) return { ok: false, errors: [`Run ${r.id}: preserved original no longer supplies this generic run key.`], warnings: v.warnings };
    } else {
      const parsed = parseLabSolutions(r.raw.text, r.raw.fileName);
      if (!parsed.ok) return { ok: false, errors: [`Run ${r.id}: preserved original no longer parses (${parsed.error}).`], warnings: v.warnings };
      original = parsed.run;
    }
    for (const [key, saved] of Object.entries(r.conditions)) {
      if (!['file', 'mapping'].includes(saved?.source) || saved.value === null) continue;
      const actual = original.conditions?.[key];
      if (actual?.value !== saved.value || actual?.unit !== saved.unit) return { ok: false,
        errors: [`Run ${r.id}: the saved file-origin ${key === 'sampleId' ? 'sample/study identity' : `condition ${key}`} differs from the preserved original CSV.`], warnings: v.warnings };
    }
    // Compare every parser-owned peak field. Ordering of JSON object keys is
    // immaterial; adding a fabricated width/label/marker flag is not.
    const peakRecord = x => Object.keys(x).sort().map(k => [k, x[k]]);
    const a = JSON.stringify(original.measured.peaks.map(peakRecord)), b = JSON.stringify(r.measured.peaks.map(peakRecord));
    if (a !== b) return { ok: false, errors: [`Run ${r.id}: the stored peak table differs from the preserved original file.`], warnings: v.warnings };
    // Source cycle, acquisition precision and name conflicts come from the
    // preserved export, not editable annotations in a saved JSON. Rebuilding
    // also upgrades old sessions that could not parse minute-only dates.
    const beforeMeta = JSON.stringify(r.measured.fileMeta || {});
    r.measured.fileMeta = original.fileMeta;
    if (beforeMeta !== JSON.stringify(original.fileMeta)) v.warnings.push(`Run ${r.id}: file metadata was recalculated from the preserved original export (including acquisition time, source cycle and name conflicts).`);
    const meta = original.fileMeta || {};
    const insLink = r.assoc?.instrumentId, colLink = r.assoc?.columnId;
    if (insLink?.value && /^file(?::| )/.test(insLink.source || '')) {
      const ins = obj.instruments.find(i => i.id === insLink.value), stated = meta.instrumentLabel || meta.instrumentName;
      if (!stated || ![ins?.label, ins?.identifier].some(x => typeof x === 'string' && x.trim() === stated.trim()))
        return { ok: false, errors: [`Run ${r.id}: file-origin instrument association differs from the preserved original instrument label.`], warnings: v.warnings };
    }
    if (colLink?.value && /^(file(?::| )|mapped column label)/.test(colLink.source || '')) {
      const col = obj.columns.find(c => c.id === colLink.value), stated = meta.columnLabel;
      if (!stated || ![col?.label, col?.serial].some(x => typeof x === 'string' && x.trim() === stated.trim()))
        return { ok: false, errors: [`Run ${r.id}: file-origin physical-column association differs from the preserved original column label.`], warnings: v.warnings };
    }
    for (const assignment of obj.assignments.filter(x => x.runId === r.id && x.by === 'file')) {
      const peak = original.measured.peaks.find(x => x.no === assignment.peakNo), compound = obj.compounds.find(x => x.id === assignment.compoundId);
      const label = String(peak?.fileName || '').trim().toLowerCase(), name = String(compound?.name || '').trim().toLowerCase();
      const abbreviation = /\(([^)]+)\)/.exec(name)?.[1];
      if (!label || !(label === name || label === abbreviation))
        return { ok: false, errors: [`Run ${r.id}: file-origin compound/marker assignment is not stated by the preserved original peak label. Record genuine user identification separately.`], warnings: v.warnings };
    }
    const profileStatus = profileConfirmationStatus(r);
    if (!profileStatus.ok) {
      let count = 0;
      for (const value of [...Object.values(r.conditions), ...Object.values(r.assoc || {})]) {
        if (String(value?.source || '').startsWith('profile:') && value.confirmed) { value.confirmed = false; count++; }
      }
      if (count) v.warnings.push(`Run ${r.id}: ${count} saved profile-origin confirmation(s) were withdrawn because the recorded name conflict has no valid source-choice basis. File/user declarations, original data and measured quantities were not changed. ${profileStatus.reason}`);
    }
    for (const key of ['trace', 'pressure', 'oven', 'room', 'acquisitionEnd']) {
      const actual = original.measured[key] ?? null;
      // An explicit user measurement is an annotation, not file evidence.
      // Preserve it only where the original truly carries no pressure.
      if (key === 'pressure' && actual === null && r.measured.pressure?.source === 'user'
          && Number.isFinite(r.measured.pressure.max) && r.measured.pressure.max >= 0 && r.measured.pressure.unit === 'psi') continue;
      const withoutSeries = x => x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'series')) : x;
      if (key !== 'trace' && JSON.stringify(withoutSeries(r.measured[key])) !== JSON.stringify(withoutSeries(actual)))
        v.warnings.push(`Run ${r.id}: ${key} was recalculated from the preserved original export; the saved summary was not trusted.`);
      r.measured[key] = actual;
    }
    delete r.measured.traceStoredAs;
  }
  const snapshot = obj.derivedSnapshot || null;
  delete obj.derivedSnapshot; delete obj.exportedAt; delete obj.app;
  obj.importLog = obj.importLog || [];
  obj.seq = obj.seq || Math.max(0, ...obj.runs.map(r => r.seq || 0));
  // a stated run order survives the round trip; ids of runs that are no longer
  // present are dropped rather than silently reordering anything
  const ch = isObj(obj.chronology) ? obj.chronology : { ids: [], confirmed: false, note: '' };
  const present = new Set(obj.runs.map(r => r.id));
  const kept = (Array.isArray(ch.ids) ? ch.ids : []).filter(id => present.has(id));
  if (kept.length !== (ch.ids || []).length) v.warnings.push(`The stated run order referred to ${(ch.ids || []).length - kept.length} run(s) that are not in this session; those entries were dropped and the order is reported as stated only for the runs that remain.`);
  obj.chronology = { ids: kept, confirmed: !!ch.confirmed && kept.length > 0, note: ch.note || '' };
  return { ...v, session: obj, snapshot };
}
