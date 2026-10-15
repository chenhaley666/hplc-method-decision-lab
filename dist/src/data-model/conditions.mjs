// conditions.mjs — recorded run conditions and their provenance.
//
// Every condition value is stored as
//   { value, unit, source, confirmed, note }
// source is one of:
//   'file'           — read from the imported file itself
//   'user'           — entered or confirmed by the user
//   'profile:<id>'   — produced by an explicitly selected import profile
//   'mapping'        — a column of a generic CSV, mapped by the user
//   'assumption'     — an explicit assumption (always visibly labelled)
// Unknown values are { value: null, source: null }.
//
// Values used in calculations must be confirmed. File-read and user-entered
// values are confirmed; profile output is not, until the user confirms it.
import { cite } from '../presets/sources.mjs';

// category per RETENTION Discovery Book §4.3 / SELECTIVITY Discovery Book §2.6;
// controlled-at per Equipment LAB slide 41 notes and EQUIPMENT Discovery Book.
export const CONDITION_FIELDS = [
  { key: 'mixAcnPct', label: 'ACN in B-bottle ACN/MeOH mixture', unit: '% v/v of B bottle', type: 'number', category: 'chemical', controlledAt: 'bench (bottle preparation)', module: 'mobile phase', effects: {} },
  { key: 'organic', label: 'Solvent B identity (organic solvent)', unit: '', type: 'text', category: 'chemical', controlledAt: 'bench (bottle preparation)', module: 'mobile phase',
    effects: { retention: 'yes', selectivity: 'yes — different solvents move compounds by different amounts', efficiency: 'indirect (viscosity)' } },
  { key: 'phaseA', label: 'Solvent A composition', unit: '', type: 'text', category: 'chemical', controlledAt: 'bench', module: 'mobile phase',
    effects: { retention: 'yes', selectivity: 'possible', efficiency: 'indirect' } },
  { key: 'phaseB', label: 'Solvent B composition', unit: '', type: 'text', category: 'chemical', controlledAt: 'bench', module: 'mobile phase',
    effects: { retention: 'yes', selectivity: 'possible', efficiency: 'indirect' } },
  { key: 'additiveName', label: 'Additive', unit: '', type: 'text', category: 'chemical', controlledAt: 'bench', module: 'mobile phase',
    effects: { retention: 'yes for ionisable compounds', selectivity: 'possible', efficiency: 'possible (peak shape)' } },
  { key: 'additiveConc', label: 'Additive concentration', unit: '', type: 'number', category: 'chemical', controlledAt: 'bench', module: 'mobile phase', unitField: 'additiveUnit',
    effects: { retention: 'possible', selectivity: 'possible', efficiency: 'possible' } },
  { key: 'additiveUnit', label: 'Additive concentration unit', unit: '', type: 'text', category: 'chemical', controlledAt: 'bench', module: 'mobile phase', effects: {} },
  { key: 'pH', label: 'pH (aqueous phase)', unit: '', type: 'number', category: 'chemical', controlledAt: 'bench', module: 'mobile phase',
    effects: { retention: 'yes for ionisable compounds', selectivity: 'yes', efficiency: 'possible' } },
  { key: 'mode', label: 'Elution mode (ISO / GRA)', unit: '', type: 'text', category: 'chemical', controlledAt: 'software (pump)', module: 'pump',
    effects: { retention: 'yes', selectivity: 'yes', efficiency: 'possible' } },
  { key: 'percentB', label: '%B (organic percentage)', unit: '%', type: 'number', category: 'chemical', controlledAt: 'software (pump)', module: 'pump',
    effects: { retention: 'yes — main retention lever', selectivity: 'can change spacing (lines not parallel)', efficiency: 'indirect' } },
  { key: 'flow', label: 'Flow rate', unit: 'mL/min', type: 'number', category: 'mechanical', controlledAt: 'software (pump)', module: 'pump',
    effects: { retention: 'times scale, K unchanged', selectivity: 'none at constant chemistry', efficiency: 'yes' } },
  { key: 'injVolume', label: 'Injection volume', unit: 'µL', type: 'number', category: 'mechanical', controlledAt: 'manual: loop hardware; autosampler: software', module: 'injector',
    effects: { retention: 'none', selectivity: 'none', efficiency: 'possible (overload)' } },
  { key: 'ovenSetpoint', label: 'Oven setpoint', unit: '°C', type: 'temperature', category: 'both', controlledAt: 'software (oven)', module: 'column oven',
    effects: { retention: 'yes (≈1–2 % per °C)', selectivity: 'yes, unpredictable', efficiency: 'yes (viscosity, kinetics)' } },
  { key: 'wavelength', label: 'Detection wavelength', unit: 'nm', type: 'number', category: 'mechanical', controlledAt: 'software (detector)', module: 'detector',
    effects: { retention: 'none', selectivity: 'none — changes which compounds are seen, not separation', efficiency: 'none' } },
  { key: 'sampleId', label: 'Explicit sample/study ID (not sample type or run name)', unit: '', type: 'text', category: 'sample', controlledAt: 'sample record / user declaration', module: 'sample', effects: {} },
  { key: 'sampleType', label: 'Sample type', unit: '', type: 'text', category: 'sample', controlledAt: 'bench', module: 'sample', effects: {} },
  { key: 'sampleConc', label: 'Sample concentration', unit: 'mg/mL', type: 'number', category: 'sample', controlledAt: 'bench', module: 'sample', effects: {} },
  { key: 'acquisitionTime', label: 'Acquisition time', unit: 'min', type: 'number', category: 'mechanical', controlledAt: 'software (data system)', module: 'data system',
    effects: { retention: 'none — it does not change retention, but a compound eluting after it is absent from the peak table', selectivity: 'none', efficiency: 'none' } },
];
export const FIELD_BY_KEY = Object.fromEntries(CONDITION_FIELDS.map(f => [f.key, f]));
export const CATEGORY_SOURCE = [cite('RET-DB', '§4.3 (chemical vs mechanical parameters)'), cite('SEL-DB', '§2.6 (temperature is chemical and mechanical)'), cite('EQ-LAB', 'slide 41 notes (where each parameter is controlled)')];

export const UNKNOWN = Object.freeze({ value: null, unit: '', source: null, confirmed: false, note: '' });

export function cond(value, source, { unit = '', confirmed, note = '' } = {}) {
  if (value === null || value === undefined || value === '') return { ...UNKNOWN };
  const autoConfirmed = source === 'file' || source === 'user' || source === 'mapping';
  return { value, unit, source, confirmed: confirmed ?? autoConfirmed, note };
}

export function emptyConditions() {
  const c = {};
  for (const f of CONDITION_FIELDS) c[f.key] = { ...UNKNOWN, unit: f.unit };
  return c;
}

export const knownValue = c => (c && c.value !== null && c.value !== undefined && c.value !== '');
// A value usable in a calculation: known AND confirmed.
export const usable = c => knownValue(c) && c.confirmed === true;

export function sourceLabel(c) {
  if (!knownValue(c)) return 'unknown';
  const s = c.source || '';
  const base = s === 'file' ? 'from file' : s === 'user' ? 'user entry' : s === 'mapping' ? 'mapped CSV column'
    : s.startsWith('profile:') ? `import profile "${s.slice(8)}"` : s.startsWith('reference:') ? `reference record ${s.slice(10)}`
    : s === 'assumption' ? 'ASSUMPTION' : s;
  return base + (c.confirmed ? '' : ' — unconfirmed');
}

// Normalise organic solvent names. Only spellings of the two names are
// recognised; anything else is kept verbatim and treated as a different solvent.
export function normaliseSolvent(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (/^(acn|acetonitrile|mecn)$/i.test(s)) return 'ACN';
  if (/^(meoh|methanol)$/i.test(s)) return 'MeOH';
  if (/^(thf|tetrahydrofuran)$/i.test(s)) return 'THF';
  return s;
}
