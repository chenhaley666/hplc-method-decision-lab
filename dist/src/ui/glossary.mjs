// glossary.mjs — the definition of every term the interface uses that a
// first-time reader would not already know. A definition appears BESIDE the
// term, in the view where the term is used: term() renders the word with a
// button that reveals the definition in place, so nothing has to be looked up
// elsewhere and no separate instruction sheet is needed.
import { h } from './dom.mjs';
import { setUi } from './state.mjs';

export const TERMS = {
  t0: { word: 't₀', full: 'hold-up time',
    def: 'The time an unretained compound takes to pass through the column. A documented value or identified marker supplies measured t₀; a labelled column-volume estimate is only a conditional planning input, not a measurement.' },
  K: { word: 'K', full: 'retention factor',
    def: 'K = (tR − t₀) / t₀. How much longer a compound stays on the column than the mobile phase does. Dimensionless, so it can be compared between runs.' },
  logK: { word: 'log K', full: 'base-10 logarithm of K',
    def: 'log here always means log₁₀. Against %B, log K is close to a straight line over a limited range, which is what makes the retention model possible.' },
  alpha: { word: 'α', full: 'selectivity',
    def: 'α = K₂ / K₁ for an adjacent pair: how far apart two compounds sit. α = 1 means they sit on top of each other. Spacing is not resolution — resolution also needs the peak widths.' },
  Rs: { word: 'Rs', full: 'resolution',
    def: 'How completely two adjacent peaks are separated, from their spacing AND their widths. The resolution of a chromatogram is the LOWEST adjacent pair, never the average.' },
  percentB: { word: '%B', full: 'organic percentage',
    def: 'The percentage of the organic line in the mobile phase. In reversed phase, raising it shortens retention; lowering it lengthens retention.' },
  isocratic: { word: 'isocratic', full: 'constant composition',
    def: 'The mobile phase composition stays the same throughout the run (ISO). The opposite is a gradient (GRA), where it changes during the run. The log K against %B model applies to isocratic runs only.' },
  minimumB: { word: 'minimum %B', full: 'lowest admissible composition',
    def: 'The lowest composition predicted to put the modelled last peak within the time specification. The Dashboard issues it only after at least four distinct comparable %B values and unrounded R² ≥ 0.99. It is specific to the selected data, solvent, temperature and column; it does not prove all compounds are resolved.' },
  intermediateB: { word: 'intermediate %B', full: 'optional trial composition',
    def: 'An optional composition to test, selected from measured peak movement or a qualified model. Candidate buttons show the supporting runs and whether that composition was already measured. A last-peak fit does not calculate an optimum; maximising the smallest adjacent α would require separately identified, comparable compound-specific fits.' },
  nomogram: { word: 'nomogram', full: 'solvent-strength conversion',
    def: 'A chart that converts a composition in one organic solvent to the composition in another that gives roughly the same retention, so a solvent can be changed without starting the %B series again.' },
  backPressure: { word: 'back-pressure', full: 'the pressure the pump must produce',
    def: 'A RESPONSE, not a setting: the pressure needed to push the mobile phase through the packed bed. It rises with flow, with column length and with smaller particles, and it changes with the solvent and the temperature.' },
  marker: { word: 'hold-up marker', full: 'unretained marker',
    def: 'A compound that is not retained by the stationary phase, so its retention time is t₀. In this unit uracil is used. It does not move when %B changes.' },
  provenance: { word: 'provenance', full: 'where a value came from',
    def: 'The recorded origin of a value: file, user, reference, import profile or assumption. Missing identity and hardware ratings stay unknown. Labelled planning estimates may enter conditional previews; they never become measured evidence or operating clearance.' },
  plateCount: { word: 'N', full: 'plate number',
    def: 'A measure of peak narrowness. Exported or width-derived N describes measured peaks; the FC2 Awesome model predicts changes in N and Rs under unchanged chemistry. Target peak count is required before N optimisation; predicted improvement still needs experimental validation.' },
  rsFloor: { word: 'Rs floor', full: 'N-only feasibility bound',
    def: 'A calculated lower bound on current Rs that an ideal N strategy could bring to the Rs specification within time and pressure limits. It changes with the specifications. It does not establish that a real stock column can achieve the bound.' },
  R2: { word: 'R²', full: 'coefficient of determination',
    def: 'How closely the selected log K versus %B points follow the fitted line. A high R² is not proof of compound identity. Changing the selected four/five-point set recalculates both R² and minimum %B; data must not be removed just to improve the score.' },
  criticalPair: { word: 'limiting pair', full: 'the adjacent pair with the lowest resolution',
    def: 'The pair that decides whether a chromatogram meets the resolution specification. It is not necessarily the pair that is closest in time, because widths differ.' },
};

export function definition(key) { return TERMS[key] || null; }

// term('Rs') renders the term with its definition one click away, in place.
export function term(key, text = null) {
  const t = TERMS[key];
  if (!t) return text || key;
  const open = (globalThis.__fc1_defineTerm === key);
  return h('span', { class: 'term' },
    h('button', { type: 'button', class: 'termword', 'data-testid': `term-${key}`, 'aria-expanded': open ? 'true' : 'false',
      title: `${t.full} — click for the definition`, onclick: () => setUi(u => { u.defineTerm = u.defineTerm === key ? null : key; globalThis.__fc1_defineTerm = u.defineTerm; }) }, text || t.word),
    open ? h('span', { class: 'termdef', role: 'note', 'data-testid': `termdef-${key}` }, h('strong', `${t.word} — ${t.full}: `), t.def) : null);
}

// The whole glossary, for the print report and for a reader who wants it in
// one place as well as beside each use.
export function glossaryPanel() {
  return h('section', { class: 'card', 'data-testid': 'glossary' }, h('h3', 'Terms used in this tool'),
    h('dl', { class: 'glossary' }, Object.entries(TERMS).flatMap(([k, t]) => [
      h('dt', { 'data-term': k }, `${t.word} — ${t.full}`), h('dd', { class: 'small' }, t.def)])),
    h('p', { class: 'small' }, 'Each of these is also defined where it is used, so no separate instruction sheet is needed.'));
}
