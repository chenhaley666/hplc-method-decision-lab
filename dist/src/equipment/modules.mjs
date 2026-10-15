// modules.mjs — the modules of an HPLC system, what each one does, the
// parameters it controls and the responses it produces.
//
// Dataset-independent: no instrument model, column product or dataset appears
// here. The parameter keys are those of CONDITION_FIELDS, so a module and a
// parameter are never described twice in two places.
import { cite } from '../presets/sources.mjs';

export const MODULES = [
  { id: 'solvent-reservoirs', label: 'Solvent reservoirs',
    fn: 'Hold the prepared mobile-phase lines. What is in each bottle is decided at the bench, not in software: the tool can state which line is which, never change it.',
    cycle: 'both', controls: ['phaseA', 'phaseB', 'organic', 'additiveName', 'additiveConc', 'pH'], measures: [],
    sources: [cite('EQ-DB', '§1.5'), cite('EQ-LAB', 'slides 13–15')] },
  { id: 'degasser', label: 'Degasser',
    fn: 'Removes dissolved gas before the pump. Bubbles in a pump head give irreproducible flow and a noisy baseline; degassing has to happen upstream of the pump, which is why its position in the flow path is fixed.',
    cycle: 'neither — it protects the measurement rather than changing the separation', controls: [], measures: [],
    sources: [cite('EQ-DB', '§1.5'), cite('EQ-LAB', 'slides 16–17')] },
  { id: 'pump', label: 'Pump',
    fn: 'Delivers a set volumetric flow against the resistance of the packed bed and sets the mobile-phase composition. Back-pressure is the consequence of that delivery, never a setting.',
    cycle: 'both — composition drives the retention cycle, flow belongs to the efficiency and pressure side',
    controls: ['flow', 'percentB', 'mode'], measures: ['pressure'],
    sources: [cite('EQ-DB', '§1.6'), cite('EQ-LAB', 'slides 18, 35–36')] },
  { id: 'injector', label: 'Injector',
    fn: 'Introduces a measured volume of sample into the flowing mobile phase without stopping the flow. On a manual injector the volume is the loop that is fitted; on an autosampler it is set in software.',
    cycle: 'neither — it sets how much sample enters, not how it separates',
    controls: ['injVolume', 'sampleConc', 'sampleType'], measures: [],
    sources: [cite('EQ-DB', '§1.7'), cite('EQ-LAB', 'slides 19–22')] },
  { id: 'column-oven', label: 'Column oven',
    fn: 'Holds the column at a set temperature. Temperature changes both how strongly compounds are held and the spacing between them, and it changes mobile-phase viscosity, so it belongs to the retention and the selectivity cycle at once.',
    cycle: 'both', controls: ['ovenSetpoint'], measures: ['oven temperature trace'],
    sources: [cite('EQ-DB', '§1.9'), cite('SEL-ED', 'slides 27–28')] },
  { id: 'column', label: 'Column',
    fn: 'Where the separation happens. The stationary phase (ligand) decides the chemistry of the interaction; the geometry (length, internal diameter, particle size) decides the pressure the pump must produce and the peak widths.',
    cycle: 'both — the ligand is the last selectivity parameter; geometry is the efficiency family (FC2)',
    controls: ['column ligand', 'column geometry'], measures: [],
    sources: [cite('EQ-DB', '§1.8'), cite('EQ-ED', 'slide 14')] },
  { id: 'detector', label: 'Detector',
    fn: 'Converts what leaves the column into a signal against time. It decides which compounds are SEEN — a compound that does not absorb at the chosen wavelength gives no peak — but it never changes the separation.',
    cycle: 'neither', controls: ['wavelength'], measures: ['peak retention times', 'peak areas and heights', 'peak widths'],
    sources: [cite('EQ-DB', '§1.10'), cite('EQ-LAB', 'slides 23–26')] },
  { id: 'data-system', label: 'Data system',
    fn: 'Acquires the trace for a set time and integrates it into a peak table. The acquisition time decides the window: a compound eluting after it is simply absent from the table.',
    cycle: 'neither', controls: ['acquisitionTime'], measures: ['peak table', 'status traces'],
    sources: [cite('EQ-LAB', 'slides 27–34')] },
];
export const MODULE_BY_ID = Object.fromEntries(MODULES.map(m => [m.id, m]));

// Parameters that are not run conditions but equipment properties: they are
// changed by fitting different hardware, not in software.
export const HARDWARE_PARAMETERS = [
  { key: 'column ligand', label: 'Stationary-phase ligand', unit: '', category: 'chemical', module: 'column',
    controlledAt: 'bench — fit a different physical column',
    effects: { retention: 'yes', selectivity: 'yes — the last selectivity parameter in the FC1 order', efficiency: 'possible' },
    rangeQuantity: null, related: ['organic', 'percentB', 'ovenSetpoint'],
    sources: [cite('SEL-ED', 'slide 16'), cite('EQ-DB', '§1.8')] },
  { key: 'column geometry', label: 'Column length, internal diameter and particle size', unit: 'mm, mm, µm', category: 'mechanical', module: 'column',
    controlledAt: 'bench — fit a different physical column',
    effects: { retention: 'times scale with column volume at unchanged flow and K', selectivity: 'none on its own when chemistry is unchanged', efficiency: 'yes — length, particle size and bead structure are modelled in the FC2 Awesome / stock-search module; pressure and time must also pass' },
    rangeQuantity: null, related: ['flow'],
    sources: [cite('EQ-ED', 'slide 14'), cite('EQ-DB', '§1.8')] },
];

// Which related setting the user can change when a parameter is the subject.
export const RELATED = {
  flow: ['percentB', 'column geometry'],
  percentB: ['organic', 'ovenSetpoint', 'flow'],
  organic: ['percentB', 'ovenSetpoint'],
  ovenSetpoint: ['percentB', 'organic'],
  injVolume: ['sampleConc'],
  wavelength: ['injVolume'],
  acquisitionTime: ['percentB', 'flow'],
  pH: ['additiveName', 'additiveConc'],
  additiveName: ['pH', 'additiveConc'],
  additiveConc: ['pH', 'additiveName'],
  mode: ['percentB'],
  phaseA: ['percentB', 'pH'],
  phaseB: ['organic', 'percentB'],
};
