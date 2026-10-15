// presets/bps2032.mjs — source-labelled BPS2032 teaching settings.
//
// Every value here is a CONFIGURABLE DEFAULT. Each carries its source, its
// scope and any conflict between sources. Nothing here is a universal rule and
// nothing here describes a particular team's experiment.
//
// scope values:
//   'course-teaching' — stated by BPS2032 teaching material for this teaching problem
//   'assessment'      — stated by the FC1 rubric
//   'course-example'  — an example the course uses; NOT a rule
//   'project'         — a project/user choice (e.g. from a team notebook)
//   'tool-default'    — chosen for this application; editable; not a course rule
//   'general'         — general chromatographic relationship
import { cite } from './sources.mjs';

export const PRESET_ID = 'bps2032-2026';
export const PRESET_LABEL = 'BPS2032 2026 teaching preset (FC1)';

export const REGISTER = [
  { id: 'spec.peakCount', label: 'Target peak count', value: 7, op: '=', scope: 'course-teaching',
    detail: 'The target COUNTS THE HOLD-UP MARKER (uracil) plus six retained compounds. It describes the BPS2032 composite sample, not samples in general. Seven visible peaks do not establish seven identified compounds.',
    includesMarker: true,
    sources: [cite('SEL-ED', 'slide 13 (DASHBOARD: "7 peaks")'), cite('EQ-LAB', 'slide 10 ("How many compounds are there in the CP? 7"; uracil is the t0 marker)'), cite('EQ-ED', 'slide 27 (seven molecules, uracil marked "unretained")')],
    conflicts: [{ text: 'Equipment ED slides 7–10 speak of 6 compounds (ketoprofen and five possible contaminants); those statements exclude the uracil marker. The 7-peak specification includes it.', resolution: 'Shown, not resolved; the "includes marker" flag is editable.' }],
    comparisonNote: 'Fewer than the target: continue development. More than the target: check blank, integration and interfering peaks; do not accept automatically (flow chart decision box).' },
  { id: 'spec.lastPeak', label: 'Last relevant peak retention time', value: 15, op: '<=', unit: 'min', scope: 'course-teaching',
    sources: [cite('SEL-ED', 'slide 13 ("tR last ≤ 15 min")'), cite('FLOW', 'ACTIVE SPECIFICATIONS "tR,last ≤ 15.0 min"')],
    conflicts: [{ text: 'Equipment ED slide 14 states "A run time of about 15 min" — "about" is not an operator.', resolution: 'The ≤ operator from the Selectivity ED dashboard is selected; editable.' }] },
  { id: 'spec.minRs', label: 'Lowest adjacent-pair resolution', value: 1.4, op: '>=', scope: 'course-teaching',
    sources: [cite('SEL-ED', 'slide 13 ("Rmin ≥ 1.4")'), cite('RET-DB', '§8.6 ("every adjacent pair to reach Rs ≥ 1.4")'), cite('RET-ED', 'slide 10 ("Resolution is taken on the worst adjacent pair, never an average")')],
    conflicts: [{ text: 'Equipment ED slide 31 notes add "Ideally, we want Rs ≥ 1.5" (baseline resolved). That is a description, not the specification.', resolution: '1.4 with ≥ selected; editable.' }] },
  { id: 'spec.pressure', label: 'Measured back-pressure acceptance', value: 4000, op: '<', unit: 'psi', scope: 'course-teaching',
    detail: 'Back-pressure is a measured RESPONSE, not a target. The new written problem, Retention and Selectivity memos require measured pressure below 4000 psi. This acceptance comparison is separate from the method editor\'s 4000 psi software cut-off and from each instrument\'s hardware maximum. A 6000 or 10000 psi instrument rating never relaxes the method acceptance specification.',
    sources: [cite('PROBLEM-MEMO', '§4 Method specifications and §5 Acceptance criteria ("Backpressure below 4000 psi", pressure trace)'), cite('RET-MEMO', '§1 specification table ("Backpressure below 4000 psi"); §3 separately records the software upper pressure limit as 4000 psi'), cite('SEL-MEMO', '§1 specification table ("Backpressure below 4000 psi"); §4 separately records the software upper pressure limit as 4000 psi'), cite('SEL-ED', 'slide 13 ("BP ≤ 4000 psi")'), cite('EQ-ED', 'slide 14 body ("< 4000 psi in HPLC and < 10000 psi in UHPLC")')],
    conflicts: [{ text: 'Equipment ED slide 14 body writes "< 4000 psi" (exclusive); its speaker notes write "Less than 3500 psi for regular HPLC"; Selectivity ED slide 13 writes "≤ 4000 psi" (inclusive). The three newly supplied written method memos all write "below 4000 psi".', resolution: 'The written method memos\' strict < 4000 psi is selected for NEW teaching sessions; the conflict is displayed, not erased. A measured value exactly at 4000 psi fails this preset even though the pictured software cut-off is 4000 psi and the hardware may permit a higher pressure. The operator and value remain editable; previously saved sessions retain their own recorded operator.' }] },
  { id: 'rule.rsWorstPair', label: 'Resolution of a chromatogram = lowest adjacent pair', scope: 'course-teaching',
    sources: [cite('RES-DB', '§5.5 ("The worst pair is usually, but not always, the pair whose apexes are closest together … the resolution of every adjacent pair is calculated, and the lowest value is then selected")'), cite('EQ-ED', 'slide 45')],
    conflicts: [{ text: 'Equipment ED slide 42 notes say to use "the closest peaks".', resolution: 'All adjacent pairs are calculated; the closest pair is shown separately so the difference is visible.' }] },
  { id: 'rule.rsWidth', label: 'Width convention for Rs', scope: 'course-teaching',
    detail: 'Base-width and half-height formulas describe the same separation only for ideal (symmetrical) peaks (Wb = 1.7 Wh). They are never mixed within one run. The instrument used in this unit calculates Rs from base width.',
    sources: [cite('RES-DB', '§2.4, §3.3, §3.4, §4.2, §4.4')] },
  { id: 'rule.kDefinition', label: 'Retention factor', scope: 'general',
    detail: 'K = (tR − t0) / t0, both in minutes; K is dimensionless and unchanged by flow rate or column length at constant chemistry. log K = log10 K.',
    sources: [cite('RET-DB', '§5.3, §6.2, §8.4 (K = 10^0.308 worked example establishes base 10)')] },
  { id: 'rule.logKLinear', label: 'log K falls linearly with %B over the working range; one line per compound', scope: 'course-teaching',
    sources: [cite('RET-DB', '§8.2 ("Each compound has its own line", log K = a − S × %B)'), cite('RUBRIC', 'THE TOOL IS AUTOMATIC: intermediate %B derived from log k against %B across all compounds')] },
  { id: 'example.fitRange', label: 'Fit range 40–80 %B', scope: 'course-example',
    detail: 'The course fitted its six example lines between 40 and 80 %B. That is the range of the example, not a validity boundary for other samples or columns. The edges need care: compounds merge with the marker at high %B and runs become long at low %B (§8.5).',
    sources: [cite('RET-DB', '§8.2, §8.5')] },
  { id: 'example.r2', label: 'R² of the course example fits (0.977–0.991; "above 0.97")', scope: 'course-example',
    detail: 'A description of the course example fits. No course document states an R² acceptance criterion.',
    sources: [cite('RET-DB', '§8.2')] },
  { id: 'project.r2', label: 'R² ≥ 0.995 (selectable)', value: 0.995, op: '>=', scope: 'project',
    detail: 'A PROJECT/USER criterion, not a universal course rule. The user confirmed on 2026-10-12 that R² is rounded to three decimals before comparison with 0.995. Raw R² is preserved. The notebook supports the target; the rounding convention comes from the user, not that document.',
    sources: [cite('NB', 'p. 21/70 (team statement of an R² ≥ 0.995 requirement)')] },
  { id: 'tool.minFitPoints', label: 'Minimum points per compound fit', value: 3, scope: 'tool-default',
    detail: 'Two points define a line (RETENTION Discovery Book §8.2), but with two points R² is always 1 and fit quality cannot be judged. Three is the smallest set where R² means anything.',
    sources: [cite('RET-DB', '§8.2'), cite('TOOL')] },
  { id: 'rule.marker', label: 'Hold-up marker', scope: 'course-teaching',
    detail: 'The course sample contains uracil as the unretained marker that fixes t0. In any particular chromatogram, which peak is the marker must be established, not assumed: the software assumes the first peak is uracil, and every K is wrong where that fails.',
    sources: [cite('RET-DB', '§5.1, §5.2, §6 ("The software assumes the first peak is uracil. Where that assumption fails … every K value is calculated from the wrong t0")'), cite('EQ-LAB', 'slide 10')] },
  { id: 'example.markerMerge', label: 'Marker merging at high %B (course observation)', scope: 'course-example',
    detail: 'In the course dataset the first peak above 80 %B was no longer uracil alone. This is an observation about that dataset and is shown as a caution, never applied as a threshold.',
    sources: [cite('RET-DB', '§5.2')] },
  { id: 'rule.t0Estimate', label: 't0 estimate from column volume', value: 0.68, scope: 'course-teaching',
    detail: 'Column volume = π r² L × 0.68 / 1000 (mL); t0 = volume / flow. An ESTIMATE, documented as such; it does not identify a marker peak.',
    sources: [cite('EQ-LAB', 'slide 48 and notes to slide 43'), cite('RET-DB', '§5.2')] },
  { id: 'rule.retentionLadder', label: 'Retention strategy: %B in 10-point steps, then minimum and intermediate %B', value: 10, unit: '%B', scope: 'course-teaching',
    sources: [cite('SEL-ED', 'slide 16 (80, 70, 60, 50, "40% if not too long", min %B, intermediate %B; notes: "marched in 10% B steps")'), cite('RET-ED', 'slide 10 (vary organic proportion systematically until a limit)'), cite('RUBRIC', 'Peak count below specification: 10 % decrement / min %B or intermediate %B / return and change selectivity')] },
  { id: 'rule.minB', label: 'Minimum %B = lowest composition meeting the runtime limit', scope: 'course-teaching',
    detail: 'Lowering %B lengthens the run (RETENTION Discovery Book §8.5). The whole-number minimum is the smallest integer %B at which every adequately modelled compound is predicted within the runtime limit, i.e. the continuous threshold rounded UP.',
    sources: [cite('RET-DB', '§8.4, §8.5'), cite('NB', 'p. 20/70 step 6 (round to the lowest whole number that still meets the specification) — project procedure, consistent with the course')] },
  { id: 'rule.temperature', label: 'Temperature rule of thumb', scope: 'course-teaching',
    detail: 'tR decreases by about 1–2 % per 1 °C rise; reported as a bracket. Temperature is a chemical as well as a mechanical parameter and can change selectivity unpredictably.',
    sources: [cite('SEL-ED', 'slides 27–29 and notes'), cite('SEL-DB', '§2.6')] },
  { id: 'rule.temperatureSteps', label: 'Temperature steps 40 °C and 60 °C', value: [40, 60], unit: '°C', scope: 'course-teaching',
    detail: 'Teaching steps. A step is ADMISSIBLE only when the fitted column\'s documented maximum temperature permits it; that limit belongs to the column model actually fitted and is never borrowed from another column.',
    sources: [cite('SEL-DB', '§2.6 (40 °C vs 60 °C example)'), cite('SEL-ED', 'slide 28 (60 °C example)'), cite('FLOW', '40deg, 60deg, other deg')] },
  { id: 'rule.selectivityOrder', label: 'Order of selectivity changes', scope: 'assessment',
    detail: 'On the retention solvent: temperature 1, then temperature 2. Then the second solvent at its nomogram-converted %B, with the same temperatures. The ligand is changed last. Efficiency is named only when the selectivity options are exhausted, without being implemented.',
    sources: [cite('RUBRIC', 'THE DECISION IS CORRECT — order of the selectivity parameters; resolution below specification directs the run to selectivity')],
    conflicts: [
      { text: 'Selectivity ED deck numbers the strategies 1 solvent type (slide 30), 2 temperature (slide 26), 3 ligand (slide 35), although it presents temperature first.', resolution: 'The rubric order is pre-selected; the plan is editable.' },
      { text: 'The student flow chart contains a "Mix" branch (solvent mixture) between solvent and ligand and an optional efficiency branch for low Rs.', resolution: 'Not in the rubric; not in the default plan. A user may add a mixed-solvent step only with a confirmed composition — no conversion for mixtures is available from the supplied nomogram.' }] },
  { id: 'rule.solvents', label: 'Organic solvents available', value: ['ACN', 'MeOH'], scope: 'course-teaching',
    sources: [cite('EQ-DB', '§2.2 ("Two organic solvents are available in this unit: acetonitrile … and methanol")')] },
  { id: 'rule.nomogram', label: 'Solvent conversion by nomogram', scope: 'course-teaching',
    detail: 'Isoeluotropic conversion read from the supplied ACN/MeOH/THF nomogram only, inside the range where both axes are drawn. It matches elution strength, not selectivity; elution order may change.',
    sources: [cite('SEL-DB', '§2.4 p. 12/28')] },
  { id: 'rule.compliance', label: 'Compliance = every specification met in the same run', scope: 'course-teaching',
    sources: [cite('RET-ED', 'slide 10'), cite('SEL-ED', 'slide 40')] },
  { id: 'rule.decisionOrder', label: 'Decision order', scope: 'assessment',
    detail: 'Pressure and operating constraints → peak count → last relevant peak → lowest adjacent Rs → further selectivity options → efficiency handoff only when the selectivity options are exhausted.',
    sources: [cite('RUBRIC', 'THE DECISION IS CORRECT criteria'), cite('FLOW', 'AUTOMATIC DECISION ENGINE — REQUIRED TEST ORDER')] },
  { id: 'fc2.efficiency', label: 'Efficiency specification N > 4,000 (preferably ~10,000)', scope: 'course-teaching',
    detail: 'FC2. Not evaluated by this application.',
    sources: [cite('EQ-ED', 'slide 14')] },
  { id: 'tool.tempMatch', label: 'Temperature comparability tolerance', value: 2, unit: '°C', scope: 'tool-default',
    detail: 'Two runs are treated as being at the same temperature only when BOTH temperatures are known and differ by no more than this. By the course rule of thumb, 2 °C corresponds to about 2–4 % in tR. Unknown temperatures never match.',
    sources: [cite('TOOL'), cite('SEL-ED', 'slide 27 (1–2 % per °C)')] },
  { id: 'tool.tempStability', label: 'Oven stability tolerance', value: 1, unit: '°C', scope: 'tool-default',
    detail: 'A recorded oven trace whose range (max − min), or whose mean deviation from a confirmed setpoint, exceeds this is treated as NOT at a stable temperature.',
    sources: [cite('TOOL')] },
  { id: 'teaching.method', label: 'Starting method given in the teaching problem', scope: 'course-example',
    detail: 'ACN with 0.1 % formic acid, 1.5 mL/min, 20 µL, 254 nm, ambient; Pinnacle DB C18 150 × 4.6 × 5. These describe the teaching problem\'s starting point and are never filled into a user\'s run.',
    sources: [cite('EQ-LAB', 'slide 10'), cite('EQ-ED', 'slides 16, 49'), cite('RET-ED', 'slide 16 (254 nm this cycle)')] },
];

export const REGISTER_BY_ID = Object.fromEntries(REGISTER.map(r => [r.id, r]));

// The compound list of the BPS2032 composite sample (Equipment ED slide 27).
// Offered as an OPTIONAL starting list of labels. It says nothing about which
// peak is which compound in any chromatogram.
export const TEACHING_COMPOUNDS = [
  { name: 'Uracil (URA)', role: 'marker' }, { name: 'Sulindac (SUL)', role: 'analyte' },
  { name: 'Piroxicam (PIR)', role: 'analyte' }, { name: 'Ketoprofen (KET)', role: 'analyte' },
  { name: 'Naproxen (NAP)', role: 'analyte' }, { name: 'Diclofenac (DIC)', role: 'analyte' },
  { name: 'Phenylbutazone (PHE)', role: 'analyte' },
];
export const TEACHING_COMPOUNDS_SOURCE = cite('EQ-MEMO', '§2 supplied standards and §3 composite standard: seven components including unretained uracil, each 0.1 mg/mL; names do not identify numbered peaks');

// Default selectivity plan (rubric order). 'base' = the solvent and
// temperature condition of the retention runs; 'alt' = the other available
// solvent at its nomogram-converted %B; T1/T2 = settings.temperatureSteps.
export const DEFAULT_SELECTIVITY_PLAN = [
  { id: 'base-T1', kind: 'temperature', solvent: 'base', temp: 'T1', label: 'Retention solvent at temperature 1' },
  { id: 'base-T2', kind: 'temperature', solvent: 'base', temp: 'T2', label: 'Retention solvent at temperature 2' },
  { id: 'alt-base', kind: 'solvent', solvent: 'alt', temp: 'base', label: 'Second solvent at nomogram-converted %B, base temperature' },
  { id: 'alt-T1', kind: 'temperature', solvent: 'alt', temp: 'T1', label: 'Second solvent at temperature 1' },
  { id: 'alt-T2', kind: 'temperature', solvent: 'alt', temp: 'T2', label: 'Second solvent at temperature 2' },
  { id: 'ligand', kind: 'ligand', label: 'Different stationary-phase ligand (another physical column)' },
];

export function defaultSettings() {
  return {
    presetId: PRESET_ID,
    specs: {
      peakCount: { value: 7, op: '=', includesMarker: true },
      lastPeak: { value: 15, op: '<=', unit: 'min' },
      minRs: { value: 1.4, op: '>=' },
      pressure: { value: 4000, op: '<', unit: 'psi' },
    },
    rsBasis: 'plate-gaussian',
    r2Policy: { mode: 'none', target: null, op: '>=' },
    minFitPoints: 3,
    allowFirstPeakProxy: false,
    tempMatchTolerance: 2,
    tempStabilityTolerance: 1,
    retentionStep: 10,
    // tool policies, not course rules (see REGISTER entries tool.runtimeApproaching
    // and tool.temperatureStability); every result that uses one says so
    runtimeApproachingFraction: 0.75,
    ovenMinReadings: 3,
    ovenMaxGapFraction: 0.25,
    temperatureSteps: [40, 60],
    selectivityPlan: DEFAULT_SELECTIVITY_PLAN.map(s => ({ ...s })),
    availableSolvents: ['ACN', 'MeOH'],
  };
}

export const R2_POLICIES = {
  none: { label: 'No fit-quality criterion selected (fits reported, not judged)', target: null, scope: 'tool-default' },
  project: { label: 'R² rounded to 3 decimals ≥ 0.995 — user-confirmed project criterion', target: 0.995, scope: 'project', ref: 'project.r2' },
  custom: { label: 'Custom R² target (user criterion)', target: null, scope: 'user' },
};
