import {displayRunOrder} from '../data-model/workspaces.mjs';
// retention-view.mjs — the step-by-step Retention analysis. Renders
// evaluation.retention; the calculations live in src/retention.
import { h, chip, details, table, field, f, sourceList } from './dom.mjs';
import { commit, setUi } from './state.mjs';
import { term } from './glossary.mjs';
import { lineChart, legend, styleFor } from './charts.mjs';
import { addCompound, loadTeachingCompounds, proposeFromFileLabels, proposeByOrder, proposeByPrediction, clearProposals, peakStatus, acceptProposal } from '../alignment/correspondence.mjs';
import { R2_POLICIES, REGISTER_BY_ID, TEACHING_COMPOUNDS_SOURCE } from '../presets/bps2032.mjs';
import { predictTR } from '../retention/candidates.mjs';
import { LOG_CONVENTION } from '../rules.mjs';
import { t0Of } from '../data-model/derive.mjs';
import { specsBox } from './selectivity-view.mjs';
import {compoundGuide} from './compound-workflow.mjs';

const STATUS_TEXT = { 'not-started': 'Not started', 'need-information': 'Need information', 'mapping-unresolved': 'Mapping unresolved', 'fit-deficient': 'Fit does not satisfy the selected policy', 'subset-model': 'Partial compound coverage', 'model-ready': 'All compounds modelled' };

function settingsBox(st) {
  const set = st.session.settings;
  const pol = set.r2Policy;
  return h('section', { class: 'card', 'data-testid': 'retention-settings' }, h('h3', 'Retention settings'),
    h('p',{class:'small','data-testid':'retention-prerequisites'},'These controls judge a retention model; they do not create compounds or measured data. First import a comparable %B series, select Fit, record sample identity and physical column, establish t0, and assign the same compounds across runs. The default fit needs at least three distinct %B values. R² 0.995 is an optional project criterion, not a universal course rule.'),
    h('div', { class: 'row wrap' },
      field('Fit-quality criterion (R²)', h('select', { 'data-testid': 'r2-policy', onchange: e => commit(ss => { ss.settings.r2Policy = { mode: e.target.value, target: e.target.value === 'custom' ? (ss.settings.r2Policy.target ?? null) : null, op: '>=' }; }) },
        Object.entries(R2_POLICIES).map(([k, v]) => h('option', { value: k, selected: pol.mode === k ? 'selected' : null }, v.label)))),
      pol.mode === 'custom' ? field('Custom target', h('input', { value: pol.target ?? '', 'data-testid': 'r2-custom', onchange: e => commit(ss => { const n = Number(e.target.value); ss.settings.r2Policy.target = Number.isFinite(n) && n > 0 && n <= 1 ? n : null; }) })) : null,
      field('Minimum points per line', h('input', { type: 'number', min: 2, value: set.minFitPoints, 'data-testid': 'min-points', onchange: e => commit(ss => { const n = Math.round(Number(e.target.value)); if (n >= 2) ss.settings.minFitPoints = n; }) })),
      field('Temperature comparability (°C)', h('input', { type: 'number', step: 'any', min: 0, value: set.tempMatchTolerance, onchange: e => commit(ss => { const n = Number(e.target.value); if (n >= 0) ss.settings.tempMatchTolerance = n; }) })),
      field('Fit reference run', h('select', { onchange: e => commit(ss => { ss.settings.fitReferenceRunId = e.target.value || null; }) }, h('option', { value: '' }, 'latest run in the fit set'), displayRunOrder(st.session.runs.filter(r => r.flags.fit),st.session).map(r => h('option', { value: r.id, selected: set.fitReferenceRunId === r.id ? 'selected' : null }, r.label))))),
    h('label', { class: 'check warn' }, h('input', { type: 'checkbox', checked: set.allowFirstPeakProxy, 'data-testid': 'proxy-toggle', onchange: e => commit(ss => { ss.settings.allowFirstPeakProxy = e.target.checked; }) }),
      ' Allow the FIRST-PEAK PROXY for t0 where no marker or documented t0 exists (off by default; every result that uses it is marked unconfirmed and exploratory).'),
    details('Sources and scope of these settings', false,
      ['project.r2', 'example.r2', 'tool.minFitPoints', 'example.fitRange', 'tool.tempMatch', 'rule.marker', 'example.markerMerge'].map(id => { const r = REGISTER_BY_ID[id]; return h('div', { class: 'small' }, h('strong', r.label), ' ', chip(r.scope, `scope-${r.scope}`), r.detail ? ` — ${r.detail}` : '', sourceList(r.sources)); })));
}

function compoundsBox(st) {
  const s = st.session;
  let name = '', role = 'analyte';
  return h('section', { class: 'card', 'data-testid': 'compounds' }, h('h3', `Compounds (${s.compounds.length})`),
    h('p', { class: 'small' }, 'Name the compounds you expect. Peaks are linked to compounds only by your assignments (or proposals you accept). The target peak count does not define this list.'),
    !s.compounds.length?h('p',{class:'empty','data-testid':'compound-empty-help'},'No compound identities supplied yet. Most LabSolutions peak tables contain numbered peaks only, so CSV import does not populate this list. For the course mixture, click Load the BPS2032 teaching list, then assign peaks using standards or other recorded evidence. This list is needed for the advanced per-compound / whole-sample model. The workbook-style last-peak calculation below does not require every compound identity, but it still needs t0 and evidence that the same last-eluting compound is followed.'):null,
    s.compounds.length ? table(['Name', 'Role', ''], s.compounds.map(c => h('tr', h('td', h('input', { value: c.name, onchange: e => commit(() => { c.name = e.target.value.trim() || c.name; }) })),
      h('td', h('select', { onchange: e => commit(() => { c.role = e.target.value; }) }, ['analyte', 'marker'].map(r => h('option', { value: r, selected: c.role === r ? 'selected' : null }, r === 'marker' ? 'hold-up marker' : r)))),
      h('td', h('button', { type: 'button', onclick: () => commit(ss => { ss.compounds = ss.compounds.filter(x => x.id !== c.id); ss.assignments = ss.assignments.filter(a => a.compoundId !== c.id); }) }, 'remove'))))) : null,
    h('div', { class: 'row wrap' }, h('input', { placeholder: 'compound name', 'data-testid': 'compound-name', oninput: e => { name = e.target.value; } }),
      h('select', { 'data-testid': 'compound-role', onchange: e => { role = e.target.value; } }, h('option', { value: 'analyte' }, 'analyte'), h('option', { value: 'marker' }, 'hold-up marker')),
      h('button', { type: 'button', 'data-testid': 'add-compound', onclick: () => { if (!name.trim()) { setUi(u => { u.message = 'Enter a compound name first; nothing was added.'; }); return; }
        let added = null; commit(ss => { added = addCompound(ss, name, role); });
        if (added?.duplicateRequested) setUi(u => { u.message = `"${added.name}" is already defined (as ${added.role === 'marker' ? 'the hold-up marker' : 'an analyte'}); the existing record was kept. One record per compound: two would split its line and leave peaks unattributed.`; }); } }, 'Add compound'),
      h('button', { type: 'button', 'data-testid': 'load-teaching-compounds', onclick: () => commit(ss => loadTeachingCompounds(ss)) }, 'Load the BPS2032 teaching list')),
    h('p', { class: 'tiny' }, `Teaching list source: ${TEACHING_COMPOUNDS_SOURCE.title}, ${TEACHING_COMPOUNDS_SOURCE.loc}. It names the compounds of the course sample; it says nothing about which peak is which.`));
}

function correspondenceBox(st) {
  const s = st.session, ev = st.evaluation.retention;
  const runs = displayRunOrder(s.runs.filter(r => r.flags.fit && r.flags.show.retention !== false),s);
  const name = id => s.compounds.find(c => c.id === id)?.name || '?';
  const refRun = ev.eligibility.reference;
  const fits = ev.fits?.results?.filter(r => r.adequate) || [];
  return h('section', { class: 'card', 'data-testid': 'correspondence' }, h('h3', '5. Peak-to-compound correspondence'),
    h('p', { class: 'small' }, 'Kept separate from visual alignment. States: matched (confirmed), proposed, ambiguous, co-eluted, unmatched; compounds without a confirmed peak are listed as missing. Peak position, equal peak counts and monotonic behaviour are not proof of identity. Assign identities in each run\'s "Peaks & identities" tab, or accept proposals below.'),
    h('div', { class: 'row wrap' },
      h('button', { type: 'button', 'data-testid': 'propose-labels', onclick: () => commit(ss => { for (const r of ss.runs.filter(x => x.flags.fit)) proposeFromFileLabels(ss, r); }) }, 'Propose from labels in the files'),
      refRun ? h('button', { type: 'button', 'data-testid': 'propose-order', onclick: () => commit(ss => { const ref = ss.runs.find(x => x.id === refRun.id); for (const r of ss.runs.filter(x => x.flags.fit && x.id !== ref.id)) proposeByOrder(ss, r, ref); }) }, `Propose by elution position from "${refRun.label}" (low confidence)`) : null,
      fits.length ? h('button', { type: 'button', 'data-testid': 'propose-predict', onclick: () => commit(ss => { for (const r of ss.runs.filter(x => x.flags.fit)) { const t0 = t0Of(ss, r, ss.settings); const B = r.conditions.percentB.value; if (!t0.ok || B === null) continue; proposeByPrediction(ss, r, fits.map(fr => ({ compoundId: fr.compound.id, tR: predictTR(fr.fit, t0.t0, Number(B)), basis: 'adequate line of this compound' }))); } }) }, 'Propose from fitted lines') : null,
      h('button', { type: 'button', 'data-testid': 'accept-label-proposals', onclick: () => commit(ss => { for (const a of ss.assignments.filter(x => x.state === 'proposed' && /written in the imported file/.test(x.basis) && !x.ambiguous)) acceptProposal(ss, a.id); }) }, 'Accept all unambiguous file-label proposals'),
      h('button', { type: 'button', 'data-testid': 'clear-proposals', onclick: () => commit(ss => clearProposals(ss)) }, 'Clear proposals')),
    runs.length ? table(['Run', 'Peaks (state)', 'Missing compounds'], runs.map(r => {
      const ps = peakStatus(s, r);
      const missing = s.compounds.filter(c => !ps.some(p => p.confirmed.includes(c.id)));
      return h('tr', h('td', r.label), h('td', ps.map(p => h('span', { class: `pk ps-${p.state}`, title: p.proposed.map(a => `${name(a.compoundId)}: ${a.basis}; ${a.uncertainty || ''}`).join('\n') }, `${p.no}@${f(p.tR, 2)} `, chip(p.confirmed.length ? p.confirmed.map(name).join('+') : p.state, p.state), ' '))),
        h('td', { class: 'small' }, missing.length ? missing.map(c => c.name).join(', ') : 'none'));
    }), { 'data-testid': 'correspondence-table' }) : h('p', { class: 'small' }, 'No run in the fit set (or all hidden in this stage).'),
    ev.steps.orderChanges?.length ? h('p', { class: 'warn small' }, 'Elution-order changes among confirmed compounds: ', ev.steps.orderChanges.map(o => `${o.a} / ${o.b} (${o.runs.join(', ')})`).join('; ')) : null);
}

function stepsBox(st) {
  const r = st.evaluation.retention;
  const S = st.session.settings.specs.lastPeak;
  // Some headings contain an interactive glossary term. Keep the Node as a
  // child rather than coercing it to "[object HTMLSpanElement]".
  const n = (i, title, ...body) => h('div', { class: 'step' }, h('h4', null, `${i}. `, title), ...body);
  const fitsTable = r.steps.fits?.length ? table(['Compound', 'log K = a + b·%B: a', 'b (slope)', 'Course S (= −b)', 'R² (unrounded)', 'n', 'Fitted %B range', 'Adequate', 'Why not'],
    r.steps.fits.map(x => h('tr', { class: x.adequate ? '' : 'bad-row' }, h('td', x.compound), h('td', f(x.intercept, 5)), h('td', f(x.slope, 6)), h('td', f(x.S, 6)), h('td', x.r2 === null || x.r2 === undefined ? '—' : String(x.r2)), h('td', String(x.n ?? '—')), h('td', x.range ? `${x.range[0]}–${x.range[1]}` : '—'), h('td', chip(x.adequate ? 'yes' : 'no', x.adequate ? 'ok' : 'bad')), h('td', { class: 'small' }, x.reasons.join('; ') || x.quality))), { 'data-testid': 'fits-table' }) : h('p', { class: 'small' }, 'No line fitted.');
  const cand = r.issued || r.subset;
  return h('section', { class: 'card', 'data-testid': 'retention-steps' }, h('h3', 'Retention analysis, step by step'),
    h('p', h('span', { class: 'label' }, 'Status: '), chip(STATUS_TEXT[r.status] || r.status, r.status === 'model-ready' ? 'ok' : 'warn'), h('span', { 'data-testid': 'retention-status', class: 'tiny' }, ` ${r.status}`)),
    h('p',{class:'small'},'Detailed calculations and every exclusion are below. The main result and next experiment remain in the result panel.'),
    details(`Full analysis and blockers (${r.missing.length})`,false,
    r.reasons.length ? h('ul', r.reasons.map(x => h('li', x))) : null, r.missing.length ? h('div', { class: 'missing' }, h('strong', 'To supply: '), h('ul', r.missing.map(x => h('li', x)))) : null,
    h('p', { class: 'small' }, LOG_CONVENTION, ' K = (tR − t0)/t0, times in minutes.'),
    n(1, 'Runs selected for fitting', r.steps.selected.length ? h('ul', { class: 'small' }, displayRunOrder(r.steps.selected,st.session).map(x => h('li', `${x.label} — %B ${x.percentB ?? 'not usable'}${x.isReference ? ' (fit reference)' : ''}`))) : h('p', { class: 'small' }, 'None. Tick "Fit" in the run table.')),
    n(2, 'Eligibility of each run', table(['Run', 'Eligible', 'Reasons', 'Notes'], r.steps.eligibility.map(e => h('tr', h('td', e.label), h('td', chip(e.eligible ? 'eligible' : 'not eligible', e.eligible ? 'ok' : 'bad')), h('td', { class: 'small' }, e.reasons.join('; ')), h('td', { class: 'small' }, e.notes.join('; ')))), { 'data-testid': 'eligibility-table' })),
    n(3, 'Are the conditions comparable?', h('p', { class: 'small' }, r.steps.comparability ? `Reference: ${r.steps.comparability.reference}. Rule: ${r.steps.comparability.rule}` : '—')),
    n(4, h('span', null, 'How ', term('t0'), ' was established'), h('p', { class: 'tiny' }, 'Caution from the course example (not a threshold): in the course dataset the first peak above 80 %B was no longer uracil alone (RETENTION Discovery Book §5.2). Confirm the marker in every run.'), table(['Run', 't0 (min)', 'Method'], r.steps.t0.map(t => h('tr', h('td', t.label), h('td', t.ok ? f(t.t0, 3) : '—'), h('td', { class: t.proxy ? 'warn small' : 'small' }, t.text))))),
    n(5, 'How peaks were mapped to compounds', h('p', { class: 'small' }, 'See the correspondence table above. Only confirmed assignments enter a fit.')),
    n(6, 'Retention factor and log-retention data', r.steps.kData?.length ? r.steps.kData.map(k => details(`${k.compound}: ${k.points.length} point(s)${k.excluded.length ? `, ${k.excluded.length} excluded` : ''}`, false,
      h('p', { class: 'small' }, 'Calculated columns below are read-only: ', term('K'), ' and ', term('logK'), ' are recomputed from the measured times and are never typed in.'),
      table(['Run', '%B', 'tR', 't0', 'K', 'log K'], k.points.map(p => h('tr', h('td', p.runLabel), h('td', String(p.x)), h('td', f(p.tR, 3)), h('td', f(p.t0, 3) + (p.proxy ? ' (proxy)' : '')), h('td', f(p.k, 4)), h('td', f(p.y, 5))))),
      k.excluded.length ? h('ul', { class: 'small' }, k.excluded.map(x => h('li', `${x.runLabel} (${x.percentB} %B): ${x.reason}`))) : null)) : h('p', { class: 'small' }, '—')),
    n(7, 'Fitted equations', fitsTable, r.steps.fits?.length ? fitChart(st) : null),
    n(8, 'Residuals and fit-quality warnings', r.steps.residuals?.length ? table(['Compound', 'Residuals (log K) by %B', 'max |residual|'], r.steps.residuals.map(x => h('tr', h('td', x.compound), h('td', { class: 'small' }, x.residuals.map(y => `${y.percentB}: ${y.residual >= 0 ? '+' : ''}${y.residual.toFixed(4)}`).join('  ')), h('td', f(x.maxAbs, 4))))) : h('p', { class: 'small' }, '—'),
      h('p', { class: 'small' }, 'No point is removed or down-weighted to improve a fit.')),
    n(9, 'Compounds missing from the model', r.steps.missing?.length ? h('ul', { class: 'small' }, r.steps.missing.map(m => h('li', `${m.compound}: ${m.why.join('; ')}${m.missingIn.length ? ` (no confirmed peak in: ${m.missingIn.join(', ')})` : ''}`))) : h('p', { class: 'small' }, r.fits ? 'None.' : '—')),
    n(10, 'Candidate %B evaluation', cand ? candidateTable(cand.candidates, S, cand === r.subset) : h('p', { class: 'small' }, 'Not evaluated (see status).'),
      r.steps.t0Proposed ? h('p', { class: 'small' }, `t0 for predictions: ${f(r.steps.t0Proposed.t0, 3)} min from "${r.steps.t0Proposed.from}" (${r.steps.t0Proposed.text}).`) : null),
    n(11, 'Compound controlling the latest elution', cand?.candidates?.controlling ? h('p', { 'data-testid': 'controlling' }, `${cand.candidates.controlling.name} at ${f(cand.candidates.minimum.max, 3)} min (${cand.candidates.minimum.B} %B).`) : h('p', { class: 'small' }, '—')),
    n(12, 'Interpolation or extrapolation', cand?.candidates?.position?.length ? h('ul', { class: 'small' }, cand.candidates.position.map(p => h('li', `${p.name}: fitted ${p.low}–${p.high} %B → ${p.kind}`))) : h('p', { class: 'small' }, '—')),
    r.intermediate?.ok ? details(`Intermediate %B suggestion: ${r.intermediate.best.B} %B`, false, h('p', { class: 'small' }, `Smallest predicted adjacent α = ${r.intermediate.best.minAlpha.toFixed(3)} (${r.intermediate.best.pair.join(' / ')}); predicted last peak ${f(r.intermediate.best.lastTR, 2)} min. ${r.intermediate.note}`)) : null,
    r.exploratory ? exploratoryBox(r) : null,
    r.plan ? planBox(r.plan) : null));
}

function candidateTable(ev, S, subset) {
  if (!ev.ok) return h('p', { class: 'small' }, ev.reason);
  const m = ev.minimum;
  const rows = ev.rows.filter(x => m ? Math.abs(x.B - m.B) <= 4 : x.B % 10 === 0);
  return h('div', h('p', { 'data-testid': 'minimum-b', class: subset ? 'warn' : '' }, subset ? 'SUBSET / NOT ISSUED — ' : 'Minimum whole-number %B: ', m ? `${m.B} %B` : 'none', ' — ', ev.explanation),
    table(['%B', ...ev.rows[0].preds.map(p => `${p.name} tR (min)`), `Latest (${S.op} ${S.value})`, 'Feasible'], rows.map(x => h('tr', { class: m && x.B === m.B ? 'sel-row' : '' }, h('td', String(x.B)), x.preds.map(p => h('td', f(p.tR, 3))), h('td', f(x.max, 3)), h('td', x.feasible ? 'yes' : 'no')))),
    h('p', { class: 'small' }, 'Rule: the smallest whole-number %B at which every modelled compound is predicted to meet the last-peak specification (comparison on unrounded times); the continuous threshold is rounded UP because lower %B lengthens the run.'));
}

function exploratoryBox(r) {
  const e = r.exploratory;
  if (e.ok === false) return h('div', { class: 'card inner explore' }, h('h4', 'Exploratory'), h('p', { class: 'small' }, e.reason));
  if (e.front || e.back) return h('div', { class: 'card inner explore', 'data-testid': 'exploratory' }, h('h4', 'Exploratory position hypotheses'), h('p', { class: 'warn' }, e.label),
    ['front', 'back'].map(k => h('div', h('h5', `${k}-aligned positions`), h('p', { class: 'small' }, `${e[k].lines.length} position line(s); monotonicity violations: ${e[k].violations}. ${e[k].candidates?.ok ? `Position-based minimum: ${e[k].candidates.minimum ? e[k].candidates.minimum.B + ' %B' : 'none'} — ${e[k].candidates.explanation}` : ''}`),
      e[k].lines.length ? table(['Position', 'a', 'b', 'R² (unrounded)', 'n', '%B range'], e[k].lines.map(l => h('tr', h('td', l.name), h('td', f(l.fit.intercept, 5)), h('td', f(l.fit.slope, 6)), h('td', String(l.fit.r2)), h('td', String(l.fit.n)), h('td', `${l.fit.xMin}–${l.fit.xMax}`)))) : null,
      e[k].skipped.length ? h('p', { class: 'tiny' }, `Positions with too few points (not fitted): ${e[k].skipped.map(x => `${x.pos} (n=${x.n})`).join(', ')}.`) : null)),
    h('p', { class: 'small' }, e.note), h('p', { class: 'small' }, `Runs used: ${e.usedRuns.join(', ')}.`));
  return h('div', { class: 'card inner explore', 'data-testid': 'exploratory' }, h('h4', 'Exploratory output'), h('p', { class: 'warn' }, e.label),
    e.candidates?.ok ? h('p', { class: 'small' }, `Using ${e.lines.join(', ')}: ${e.candidates.explanation}`) : null);
}

function planBox(p) {
  return h('div', { class: 'card inner', 'data-testid': 'retention-plan' }, h('h4', 'Next retention experiment: options'),
    h('p', { class: 'small' }, `Existing %B values: ${p.existingPercentB.join(', ')}${p.duplicates.length ? `; replicated: ${p.duplicates.map(d => `${d.percentB} ×${d.n}`).join(', ')}` : ''}.`),
    h('p', { class: 'small' }, p.statement), h('p', { class: 'small' }, p.rule),
    p.options.map(o => h('div', { class: `option ${p.preferred === o ? 'preferred' : ''}` }, h('strong', (p.preferred === o ? 'PREFERRED: ' : '') + o.action), h('p', { class: 'small' }, o.why), h('ul', { class: 'small' }, o.checks.map(c => h('li', c))),
      o.limitsUnverified ? chip('operating limits unverified', 'warn') : null, o.needsInfo ? chip('needs information', 'warn') : null)),
    p.checks.length ? h('ul', { class: 'small' }, p.checks.map(c => h('li', c))) : null);
}

function fitChart(st) {
  const r = st.evaluation.retention;
  const series = [];
  (r.fits?.results || []).forEach((x, i) => {
    const sty = styleFor(i);
    if (!x.points.length) return;
    series.push({ id: `p${i}`, label: x.compound.name, ...sty, kind: 'points', points: x.points.map(p => [p.x, p.y]) });
    if (x.fit.ok) { const xs = [x.fit.xMin, x.fit.xMax]; series.push({ id: `l${i}`, label: `${x.compound.name} fit`, ...sty, kind: 'line', dash: x.adequate ? '' : '4 3', points: xs.map(v => [v, x.fit.intercept + x.fit.slope * v]) }); }
  });
  if (!series.length) return null;
  return h('div', lineChart({ series, xLabel: '%B', yLabel: 'log K (log10)', title: 'log K vs %B — points and fitted lines over the fitted range (dashed: does not satisfy the policy)', height: 280, testid: 'fit-chart' }),
    legend(series.filter(x => x.kind === 'points').map(x => ({ id: x.id, label: x.label, color: x.color }))));
}

export function retentionView(st) {
  const r=st.evaluation.retention;
  const w=st.evaluation.worksheet;
  const missing=[];
  if(!st.session.runs.length)missing.push('Import the Retention CSVs on this page.');
  if(!st.session.runs.some(x=>x.flags.fit))missing.push('Select Fit for the comparable %B series.');
  if(!st.session.compounds.length)missing.push('Define the sample compounds; assign identities from experimental evidence.');
  if(r.status!=='model-ready'&&st.session.runs.some(x=>x.flags.fit))missing.push('Review t0, sample identity, column/conditions and peak assignments under Model setup.');
  return h('div', { class: 'stage', 'data-testid': 'stage-retention' },
    compoundGuide(st),
    h('button',{type:'button','data-testid':'advanced-compound-mode',onclick:()=>setUi(u=>{u.advancedCompoundOpen=!u.advancedCompoundOpen;})},st.ui.advancedCompoundOpen?'Close advanced compound model':'Optional advanced model: individual compounds / all-compound coverage'),
    st.ui.advancedCompoundOpen?h('div',h('p',{class:'small'},'This is an optional, separate model for identified compounds. The automatic last-peak calculation does not require completing these forms. Use this model only when you have compound identities / standards and want predictions across the whole sample.'),settingsBox(st),compoundsBox(st),correspondenceBox(st),stepsBox(st)):null,
    details('Method specifications for this stage',false,specsBox(st)));
}
