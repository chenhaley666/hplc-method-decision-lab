// generic.mjs — documented generic peak-table CSV.
//
// One header row, then one row per peak. Several runs may share a file; rows
// are grouped by the column mapped to `run_key` (or the whole file is one run).
// Headers that differ from the canonical names are mapped by the user in the
// column-mapping interface; `autoMap` only proposes exact/synonym matches.
//
// A peak-table CSV contains no chromatogram trace. None is fabricated.
import { csvRows } from './csv.mjs';
import { num } from '../rules.mjs';
import { cond, normaliseSolvent } from '../data-model/conditions.mjs';

export const FORMAT_ID = 'generic-peak-table';

// level: 'peak' = varies per row; 'run' = must be constant within a run.
export const GENERIC_FIELDS = [
  { key: 'rt', label: 'Retention time', level: 'peak', required: true, unit: 'min', kind: 'time', synonyms: ['rt_min', 'rt', 'tr', 'retention_time', 'r.time', 'retention time (min)'] },
  { key: 'run_key', label: 'Run identifier (groups rows into runs)', level: 'key', required: false, synonyms: ['run_key', 'run', 'run_id', 'injection'] },
  { key: 'peak_no', label: 'Peak number', level: 'peak', synonyms: ['peak_no', 'peak', 'peak#', 'peak_number'] },
  { key: 'area', label: 'Peak area', level: 'peak', unit: 'detector units', synonyms: ['area'] },
  { key: 'height', label: 'Peak height', level: 'peak', unit: 'detector units', synonyms: ['height'] },
  { key: 'width_base', label: 'Base width (tangent, Wb)', level: 'peak', unit: 'min', kind: 'time', synonyms: ['width_base_min', 'wb', 'width_base', 'base_width'] },
  { key: 'width_half', label: 'Width at half height (Wh)', level: 'peak', unit: 'min', kind: 'time', synonyms: ['width_half_min', 'wh', 'width_half', 'w0.5', 'fwhm'] },
  { key: 'plates', label: 'Plate number N', level: 'peak', synonyms: ['plates', 'n', 'plate_number', 'plate #'] },
  { key: 'exported_rs', label: 'Instrument-exported resolution (vs previous peak)', level: 'peak', synonyms: ['exported_rs', 'resolution', 'rs'] },
  { key: 'compound_label', label: 'Compound label (a proposal, not a confirmed identity)', level: 'peak', synonyms: ['compound_label', 'compound', 'name', 'identity'] },
  { key: 'is_marker', label: 'Hold-up marker flag (yes/no)', level: 'peak', synonyms: ['is_marker', 'marker'] },
  { key: 'sample_name', label: 'Sample name', level: 'run', synonyms: ['sample_name', 'sample'] },
  { key: 'organic', label: 'Organic solvent', level: 'run', synonyms: ['organic_solvent', 'organic', 'solvent_b'] },
  { key: 'percent_b', label: '%B', level: 'run', unit: '%', synonyms: ['percent_b', '%b', 'pct_b', 'b_percent'] },
  { key: 'mode', label: 'Elution mode ISO/GRA', level: 'run', synonyms: ['mode', 'elution_mode'] },
  { key: 'flow', label: 'Flow rate', level: 'run', unit: 'mL/min', synonyms: ['flow_ml_min', 'flow', 'flow_rate'] },
  { key: 'oven_temp', label: 'Oven temperature (setpoint or recorded)', level: 'run', unit: '°C', synonyms: ['oven_temp_c', 'temperature_c', 'temp_c', 'oven_temp'] },
  { key: 'inj_volume', label: 'Injection volume', level: 'run', unit: 'µL', synonyms: ['inj_volume_ul', 'injection_volume', 'inj_volume'] },
  { key: 'wavelength', label: 'Detection wavelength', level: 'run', unit: 'nm', synonyms: ['wavelength_nm', 'wavelength', 'lambda'] },
  { key: 'pressure_max', label: 'Maximum back-pressure during the run', level: 'run', unit: 'psi', kind: 'pressure', synonyms: ['pressure_max_psi', 'pressure_max', 'max_pressure', 'pressure'] },
  { key: 'acquisition_time', label: 'Acquisition time', level: 'run', unit: 'min', kind: 'time', synonyms: ['acquisition_min', 'acquisition_time', 'run_time'] },
  { key: 't0', label: 'Documented t0', level: 'run', unit: 'min', kind: 'time', synonyms: ['t0_min', 't0', 'hold_up_time'] },
  { key: 't0_method', label: 'How t0 was established (text)', level: 'run', synonyms: ['t0_method'] },
  { key: 'phase_a', label: 'Phase A composition', level: 'run', synonyms: ['phase_a', 'mobile_phase_a'] },
  { key: 'phase_b', label: 'Phase B composition', level: 'run', synonyms: ['phase_b', 'mobile_phase_b'] },
  { key: 'mix_acn_pct', label: 'ACN % v/v within mixed B bottle (MeOH = 100 minus this)', level: 'run', synonyms: ['mix_acn_pct', 'mixacnpct', 'b_bottle_acn_percent'] },
  { key: 'additive', label: 'Additive', level: 'run', synonyms: ['additive'] },
  { key: 'additive_conc', label: 'Additive concentration', level: 'run', synonyms: ['additive_conc'] },
  { key: 'additive_unit', label: 'Additive concentration unit', level: 'run', synonyms: ['additive_unit'] },
  { key: 'ph', label: 'pH', level: 'run', synonyms: ['ph'] },
  { key: 'sample_id', label: 'Explicit sample/study identity (not sample name/type)', level: 'run', synonyms: ['sample_id', 'study_sample_id'] },
  { key: 'sample_type', label: 'Sample type', level: 'run', synonyms: ['sample_type'] },
  { key: 'sample_conc', label: 'Sample concentration', level: 'run', unit: 'mg/mL', synonyms: ['sample_conc_mg_ml', 'sample_conc'] },
  { key: 'column_label', label: 'Physical column label (matched only to an existing record, as a suggestion)', level: 'run', synonyms: ['column_label', 'column'] },
  { key: 'instrument_label', label: 'Instrument label (matched only to an existing record, as a suggestion)', level: 'run', synonyms: ['instrument_label', 'instrument'] },
];
export const GENERIC_BY_KEY = Object.fromEntries(GENERIC_FIELDS.map(f => [f.key, f]));
export const TIME_UNITS = { min: 1, s: 1 / 60 };
export const PRESSURE_UNITS = { psi: 1, bar: 14.5038, MPa: 145.038 };

const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, '_');

export function readHeader(text) {
  const rows = csvRows(text);
  if (!rows.length) throw new Error('File is empty.');
  return { header: rows[0].map(h => h.trim()), rows: rows.slice(1) };
}

// Proposes header -> field mappings by exact canonical name or listed synonym.
export function autoMap(header) {
  const mapping = {};
  header.forEach((h, i) => {
    const n = norm(h);
    const f = GENERIC_FIELDS.find(g => norm(g.key) === n || g.synonyms.some(s => norm(s) === n));
    if (f && !(f.key in mapping)) mapping[f.key] = i;
  });
  return mapping;
}

export function looksLikeGeneric(text) {
  try { const { header } = readHeader(text); return 'rt' in autoMap(header); } catch { return false; }
}

// mapping: { fieldKey: columnIndex }, units: { time:'min'|'s', pressure:'psi'|'bar'|'MPa' }
export function parseGeneric(text, fileName, mapping, units = { time: 'min', pressure: 'psi' }) {
  let header, rows;
  try { ({ header, rows } = readHeader(text)); } catch (e) { return { ok: false, error: e.message }; }
  if (!('rt' in mapping)) return { ok: false, error: 'Required field "Retention time" is not mapped to a column.' };
  for (const [k, idx] of Object.entries(mapping)) if (!(idx >= 0 && idx < header.length)) return { ok: false, error: `Mapping for ${k} points to a column that does not exist.` };
  const tf = TIME_UNITS[units.time] ?? null, pf = PRESSURE_UNITS[units.pressure] ?? null;
  if (tf === null) return { ok: false, error: `Unsupported time unit "${units.time}".` };
  if (pf === null) return { ok: false, error: `Unsupported pressure unit "${units.pressure}".` };
  const get = (r, k) => (k in mapping) ? (r[mapping[k]] ?? '').trim() : '';
  const groups = new Map();
  rows.forEach((r, i) => {
    const key = ('run_key' in mapping) ? get(r, 'run_key') || '(blank run key)' : '(single run)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ r, line: i + 2 });
  });
  const runs = [], errors = [];
  for (const [key, list] of groups) {
    const errs = [], warnings = [];
    const peaks = [];
    for (const { r, line } of list) {
      const rawRt = get(r, 'rt'); const rt = num(rawRt);
      if (rt === null) { errs.push(`line ${line}: retention time "${rawRt}" is not a number`); continue; }
      const val = (k, f = 1) => { const v = num(get(r, k)); return v === null ? null : v * f; };
      const mk = get(r, 'is_marker');
      peaks.push({ no: val('peak_no') ?? null, tR: rt * tf, area: val('area'), height: val('height'),
        widthBase: val('width_base', tf), widthHalf: val('width_half', tf), plates: val('plates'),
        exportedRs: val('exported_rs'), exportedK: null, mark: '', fileName: get(r, 'compound_label'),
        markerFlag: /^(y|yes|true|1)$/i.test(mk) });
    }
    peaks.sort((a, b) => a.tR - b.tR);
    for (let i = 1; i < peaks.length; i++) if (!(peaks[i].tR > peaks[i - 1].tR)) errs.push(`two peaks share retention time ${peaks[i].tR}`);
    peaks.forEach((p, i) => { if (p.no === null) p.no = i + 1; });
    for (const p of peaks) for (const k of ['widthBase', 'widthHalf', 'plates']) if (p[k] !== null && !(p[k] > 0)) errs.push(`peak at ${p.tR} min: ${k} must be positive`);
    // run-level fields must agree across the rows of a run
    const runVal = {};
    for (const f of GENERIC_FIELDS.filter(f => f.level === 'run' && f.key in mapping)) {
      const vals = [...new Set(list.map(({ r }) => get(r, f.key)).filter(v => v !== ''))];
      if (vals.length > 1) errs.push(`conflicting values for ${f.label}: ${vals.join(' / ')}`);
      runVal[f.key] = vals[0] ?? null;
    }
    if (errs.length) { errors.push({ runKey: key, errors: errs }); continue; }
    const n = k => num(runVal[k]);
    const conditions = {
      organic: cond(runVal.organic ? normaliseSolvent(runVal.organic) : null, 'mapping'),
      percentB: cond(n('percent_b'), 'mapping', { unit: '%' }),
      mode: cond(runVal.mode ? runVal.mode.toUpperCase() : null, 'mapping'),
      flow: cond(n('flow'), 'mapping', { unit: 'mL/min' }),
      ovenSetpoint: cond(n('oven_temp'), 'mapping', { unit: '°C', note: 'From the mapped CSV column; recorded as the column temperature.' }),
      injVolume: cond(n('inj_volume'), 'mapping', { unit: 'µL' }),
      wavelength: cond(n('wavelength'), 'mapping', { unit: 'nm' }),
      acquisitionTime: cond(n('acquisition_time') === null ? null : n('acquisition_time') * tf, 'mapping', { unit: 'min' }),
      phaseA: cond(runVal.phase_a, 'mapping'), phaseB: cond(runVal.phase_b, 'mapping'),
      mixAcnPct: cond(n('mix_acn_pct'), 'mapping', {unit:'% v/v of B bottle'}),
      additiveName: cond(runVal.additive, 'mapping'), additiveConc: cond(n('additive_conc'), 'mapping'), additiveUnit: cond(runVal.additive_unit, 'mapping'),
      pH: cond(n('ph'), 'mapping'),
      sampleId: cond(runVal.sample_id, 'mapping', { note: 'Explicit sample/study ID stated in the mapped CSV column. This is a file-author declaration, not chemical identification by the tool.' }),
      sampleType: cond(runVal.sample_type, 'mapping'), sampleConc: cond(n('sample_conc'), 'mapping', { unit: 'mg/mL' }),
    };
    for (const [k, f] of [['percent_b', [0, 100]], ['ph', [0, 14]]]) { const v = n(k); if (v !== null && (v < f[0] || v > f[1])) warnings.push(`${GENERIC_BY_KEY[k].label} ${v} is outside ${f[0]}–${f[1]}.`); }
    const pmax = n('pressure_max');
    const t0v = n('t0');
    runs.push({ runKey: key, measured: { peaks, trace: null,
      pressure: pmax === null ? null : { max: pmax * pf, mean: null, unit: 'psi', source: `mapped CSV column (converted from ${units.pressure})` },
      oven: null, room: null, acquisitionEnd: null },
      conditions, fileMeta: { sampleName: runVal.sample_name, columnLabel: runVal.column_label, instrumentLabel: runVal.instrument_label },
      documentedT0: t0v === null ? null : { t0: t0v * tf, note: runVal.t0_method || 'documented in the imported CSV (method not stated)' },
      warnings: [...warnings, 'Peak-table CSV: no chromatogram trace is available for this run, so it appears in tables but not in trace overlays.'] });
  }
  if (!runs.length) return { ok: false, error: errors.map(e => `${e.runKey}: ${e.errors.join('; ')}`).join(' | ') || 'No rows.' };
  return { ok: true, runs, partialErrors: errors, header };
}

export const TEMPLATE_HEADER = ['run_key', 'sample_name', 'peak_no', 'rt_min', 'area', 'height', 'width_base_min', 'width_half_min', 'plates', 'exported_rs', 'compound_label', 'is_marker', 'organic_solvent', 'percent_b', 'mode', 'flow_ml_min', 'oven_temp_c', 'inj_volume_ul', 'wavelength_nm', 'pressure_max_psi', 'acquisition_min', 't0_min', 't0_method', 'phase_a', 'phase_b', 'additive', 'additive_conc', 'additive_unit', 'ph', 'sample_type', 'sample_conc_mg_ml', 'column_label', 'instrument_label', 'sample_id','mix_acn_pct'];
