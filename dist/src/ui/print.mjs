import {displayRunOrder} from '../data-model/workspaces.mjs';
// print.mjs — a self-contained printable report generated from the current
// evaluation (never from stale results). Fixed print precision: times 3 dp,
// Rs 3 dp, R² 6 dp, pressure 0 dp, temperature 2 dp.
import { h, table, f, chip, comparisonVerdictLabel, sourceList } from './dom.mjs';
import { REGISTER } from '../presets/bps2032.mjs';
import { effectiveTemperature, runColumn, runInstrument } from '../data-model/derive.mjs';
import { columnDescription } from '../data-model/equipment.mjs';
import { RS_BASES } from '../rules.mjs';
import { knownValue, sourceLabel } from '../data-model/conditions.mjs';
import { activeR2Policy } from '../retention/fit.mjs';
import { shortRunLabel } from '../data-model/workspaces.mjs';
import { heightFilterSummary } from '../data-model/peak-filter.mjs';

export function printReport(st, engineHash = '') {
  const s = st.session, ev = st.evaluation, n = ev.next;
  const R = ev.retention;
  const r2Policy = activeR2Policy(s.settings);
  return h('div', { class: 'report', 'data-testid': 'print-report' },
    h('h1', 'FC1 HPLC experiment report'), h('p', 'Chenchen Lin — 34154760 · BPS2032'),
    h('p',`Data scope: ${st.ui.stage} workspace only. Other cycle libraries are excluded from this report and decision.`),
    s.runs.some(r=>r.heightFilter?.enabled)?h('div',h('h2','Peak-height exclusions (user-selected, not validated noise removal)'),table(['Run','Threshold / declared original-height unit','Original','Excluded','Height missing (kept)'],displayRunOrder(s.runs.filter(r=>r.heightFilter?.enabled),s).map(r=>{const f=heightFilterSummary(r);return h('tr',h('td',shortRunLabel(r)),h('td',`${r.heightFilter.threshold} ${r.heightFilter.unit||'raw export units'}`),h('td',String(f.raw)),h('td',String(f.excluded)),h('td',String(f.missing)));}))):null,
    h('p', { class: 'small' }, `Generated ${new Date().toISOString()} · ${s.runs.length} run(s). Every value below was recomputed from the session at print time. This expert report covers Retention / Selectivity. Use the Cycle 1–4 Dashboard report for the N and Gradient modules.`),
    h('h2', 'Next experiment'), h('p', h('strong', n.readiness?.planningDraft ? `PLANNING DRAFT — ${n.status}` : n.status), ' — ', n.reason),
    n.readiness ? h('div', h('p', { class: 'small' }, n.readiness.note), h('ul', { class: 'small' }, [...n.readiness.reasons, ...n.readiness.checks].map(x => h('li', x)))) : null,
    n.preferred ? h('p', h('strong', 'Preferred: '), n.preferred.action) : null,
    n.alternatives.length ? h('ul', n.alternatives.map(a => h('li', a.action))) : null,
    (n.missing.length || n.confirmations?.length) ? h('div', h('strong', 'Missing information / confirmations'), h('ul', [...n.missing, ...(n.confirmations || [])].map(x => h('li', x)))) : null,
    n.method ? table(['Condition', 'Value', 'Status', 'Set at / admissible range', 'Source'], n.method.rows.map(r => h('tr', h('td', r.label), h('td', r.value === null || r.value === undefined ? 'UNKNOWN' : `${r.value} ${r.unit || ''}`), h('td', r.state),
      h('td', { class: 'small' }, r.state === 'changed' ? `${r.module || 'module not stated'}${r.controlledAt ? ` — ${r.controlledAt}` : ''}. ${r.range || 'Range unknown'}${r.requiredField ? ` Required information: ${r.requiredField}` : ''}` : '—'), h('td', r.source || '')))) : null,
    n.unasked?.available ? h('div', h('h3', 'Analytical results returned without being asked'), h('p', { class: 'small' }, n.unasked.label),
      n.unasked.minimum ? h('p', `Minimum %B: ${n.unasked.minimum.B} %; predicted latest peak ${f(n.unasked.minimum.predictedLast, 2)} min. ${n.unasked.minimum.why}`) : null,
      n.unasked.intermediate ? h('p', `Intermediate %B: ${n.unasked.intermediate.B} %; smallest adjacent α ${f(n.unasked.intermediate.minAlpha, 3)} (${n.unasked.intermediate.pair.join(' / ')}); predicted latest peak ${f(n.unasked.intermediate.predictedLast, 2)} min. ${n.unasked.intermediate.why}`) : h('p', n.unasked.intermediateWhy || 'No intermediate composition issued.'),
      h('p', { class: 'small' }, `Fitted compounds: ${n.unasked.lines.join(', ')}. These are analytical model outputs, not clearance to inject.`)) : null,
    n.inspectAfter.length ? h('div', h('strong', 'Inspect after the run'), h('ul', n.inspectAfter.map(x => h('li', x)))) : null,
    h('p', { class: 'small' }, n.scope), h('h3', 'Evidence'), h('ul', { class: 'small' }, n.evidence.map(x => h('li', x))),
    h('h2', 'Active sets'), h('p', `Retention-fit set: ${ev.sets.fit.map(id => s.runs.find(r => r.id === id)?.label).join(', ') || 'none'}.`), h('p', `Decision-history set: ${ev.sets.history.map(id => s.runs.find(r => r.id === id)?.label).join(', ') || 'none'}.`),
    h('h2', 'Runs'), h('p', { class: 'small' }, `Rs basis: ${RS_BASES[s.settings.rsBasis].label}.`),
    table(['Run', 'ID', 'Solvent', '%B', 'Temp (°C)', 'Peaks', 'Last tR (min)', 'Min Rs', 'P max (psi)', 'Verdict'], displayRunOrder(s.runs,s).map(r => {
      const g = Object.fromEntries(ev.runEvaluations[r.id].gates.map(x => [x.id, x])); const T = effectiveTemperature(r, s.settings);
      return h('tr', h('td', r.label), h('td', r.id), h('td', r.conditions.organic.value ?? '?'), h('td', r.conditions.percentB.value ?? '?'), h('td', T.known ? f(T.value, 2) : 'unknown'), h('td', String(g.peakCount.value)), h('td', f(g.lastPeak.value, 3)), h('td', f(g.minRs.value, 3)), h('td', f(g.pressure.value, 0)), h('td', ev.runEvaluations[r.id].verdict));
    })),
    h('h3', 'Recorded origin and acquisition time'),
    h('p', { class: 'small' }, 'Source cycle is a path annotation in the preserved export, not proof of completed work and not the next experimental route. Acquisition times retain the file precision; no timezone or unrecorded seconds are inferred.'),
    table(['Run', 'Source cycle', 'Acquired as recorded', 'Precision and source'], displayRunOrder(s.runs,s).map(r => {
      const meta = r.measured.fileMeta || {}, origin = meta.sourceCycle;
      return h('tr', h('td', r.label), h('td', origin?.label || 'Not recorded'), h('td', meta.acquired || 'Not recorded'),
        h('td', { class: 'small' }, `${meta.acquiredPrecision || 'unknown precision'}; ${origin?.evidence?.map(x => `${x.field}: ${x.segment}`).join('; ') || 'No explicit cycle folder stated'}`));
    })),
    s.runs.some(r => r.measured.fileMeta?.nameConflicts?.length) ? h('div', h('h3', 'File naming conflicts'),
      h('p', { class: 'small' }, 'The original filenames and sample labels below were not rewritten. Profile source selection is a user interpretation and does not establish sample or peak identity.'),
      h('ul', { class: 'small' }, displayRunOrder(s.runs.filter(r => r.measured.fileMeta?.nameConflicts?.length),s).map(r => h('li', `${r.label}: external filename ${r.raw.fileName}; internal Sample Name ${r.measured.fileMeta.sampleName}. Selected profile source ${r.profileExtras?.parsedFrom || 'none'}; ${r.profileResolution?.basis ? `user basis: ${r.profileResolution.basis}` : 'no recorded resolution basis'}.`)))) : null,
    h('h2', 'Sample / study identity and declared comparisons'),
    h('p', { class: 'small' }, 'Sample type and display labels do not establish identity. The declarations below are file-stated or user-stated evidence, not chemical identification by the tool.'),
    table(['Run', 'Identity', 'Source / basis'], displayRunOrder(s.runs,s).map(r => h('tr', h('td', r.label), h('td', knownValue(r.conditions.sampleId) ? String(r.conditions.sampleId.value) : 'UNKNOWN'), h('td', { class: 'small' }, sourceLabel(r.conditions.sampleId), r.conditions.sampleId?.note ? ` — ${r.conditions.sampleId.note}` : '')))),
    (s.sampleEquivalences || []).length ? h('ul', { class: 'small' }, s.sampleEquivalences.map(eq => h('li', `${eq.left} ↔ ${eq.right}: ${eq.basis} (${eq.by || 'user'}, ${eq.declaredAt || 'time not recorded'}).`))) : h('p', 'No comparison equivalence declared.'),
    h('h2', 'Equipment'),
    s.instruments.length ? h('ul', s.instruments.map(i => h('li', `${i.label}: ${i.manufacturer || '?'} ${i.systemModel || ''}; class ${i.instrumentClass || 'unknown'}; identifier ${i.identifier || 'unknown'}; pump ${i.pump.model || '?'} (${i.pump.type || 'type unknown'}); injector ${i.injector.kind || '?'} ${i.injector.model || ''}; detector ${i.detector.type || '?'} ${i.detector.model || ''}.`,
      h('ul', { class: 'small' }, i.limits.map(l => h('li', `Hardware ${l.quantity}: ${l.op} ${l.value ?? 'unknown'} ${l.unit}; basis ${l.basis || 'not recorded'}; source ${l.source?.title || 'user entry'}.`))),
      i.methodPressureSetting ? h('p', { class: 'small' }, `Reference software shutdown setting ${i.methodPressureSetting.value} ${i.methodPressureSetting.unit}: separate from hardware maximum and the measured method acceptance requirement. ${i.methodPressureSetting.note || ''}`) : null,
      sourceList(i.provenance?.sources)))) : h('p', 'No instrument recorded.'),
    s.columnModels.length ? h('div', h('h3', 'Recorded column product models'),
      h('p', { class: 'small' }, 'A catalogue/model reference is not evidence of the fitted physical column or a confirmed run association. Its pressure limit is not borrowed from the instrument.'),
      h('ul', s.columnModels.map(m => h('li', columnDescription(m),
        h('p', { class: 'small' }, `Model limits: T ${m.limits.tMaxC ?? 'unknown'} °C; P ${m.limits.pMax ?? 'unknown'} ${m.limits.pMaxUnit || 'unit unknown'}; pH ${m.limits.pH?.join('–') || 'unknown'}. Datasheet/source: ${m.datasheetRef || 'not recorded'}. ${m.notes || ''}`),
        sourceList(m.provenance?.sources))))) : null,
    s.columns.length ? h('ul', s.columns.map(c => { const m = s.columnModels.find(x => x.id === c.modelId); return h('li', `${columnDescription(m, c)}; limits: T ${m?.limits.tMaxC ?? 'unknown'} °C, P ${m?.limits.pMax ?? 'unknown'} ${m?.limits.pMaxUnit || 'unit unknown'}, pH ${m?.limits.pH ? m.limits.pH.join('–') : 'unknown'}.`); })) : h('p', 'No column recorded.'),
    h('h2', 'Retention'), h('p', `Status: ${R.status}. ${R.reasons.join(' ')}`),
    R.steps.fits?.length ? table(['Compound', 'a', 'b', 'R²', 'n', 'Range', 'Adequate'], R.steps.fits.map(x => h('tr', h('td', x.compound), h('td', f(x.intercept, 5)), h('td', f(x.slope, 6)), h('td', x.r2 === null || x.r2 === undefined ? '—' : x.r2.toFixed(6)), h('td', String(x.n ?? '')), h('td', x.range ? x.range.join('–') : '—'), h('td', x.adequate ? 'yes' : 'no')))) : null,
    (R.issued || R.subset)?.candidates?.explanation ? h('p', `${R.issued ? 'Minimum (issued)' : 'Subset minimum (not issued)'}: ${(R.issued || R.subset).candidates.explanation}`) : null,
    R.exploratory ? h('p', { class: 'small' }, 'Exploratory output exists (see the application); it is not issued.') : null,
    h('h2', 'Selectivity progression'),
    h('p', { class: 'small' }, 'The following verdicts concern one comparison step, not validity of the recorded chromatogram. A different composition can be useful data without completing an isoeluotropic comparison. The nomogram reading allowance is a tool policy; numerical FC1 gates are evaluated independently.'),
    ev.progression?.steps ? h('ul', ev.progression.steps.map(x => h('li', `${x.label}: ${x.done ? `done (${x.evidence.join(', ')})` : x.available ? 'open' : `unavailable — ${x.unavailableReason}`}`,
      x.compositionTargets?.kind === 'list' ? h('div', { class: 'small' }, `Composition this step belongs to: ${x.compositionTargets.list.map(c => `${c.B}${c.tolerance ? `±${c.tolerance}` : ''} %B`).join(', ')}.`) : null,
      x.classified?.length ? h('ul', { class: 'small' }, x.classified.map(c => h('li', `${comparisonVerdictLabel(c)} — ${c.label}: ${c.reasons.join('; ')}`))) : null))) : h('p', ev.progression?.missing?.join(' ') || '—'),
    ev.progression?.contract ? h('p', { class: 'small' }, `Step-completion contract — must match: ${ev.progression.contract.mustMatch.join('; ')}. May differ: ${ev.progression.contract.mayDiffer.join('; ')}. Not counted for this comparison: ${ev.progression.contract.invalidating.join('; ')}. ${ev.progression.contract.evaluable} ${ev.progression.contract.note}`) : null,
    h('h2', 'Settings and their sources'),
    table(['Setting', 'Value', 'Operator', 'Scope'], [
      ['Back-pressure', s.settings.specs.pressure.value, s.settings.specs.pressure.op, 'course-teaching (conflict shown in app)'],
      ['Target peak count', `${s.settings.specs.peakCount.value} (${s.settings.specs.peakCount.includesMarker ? 'includes' : 'excludes'} marker)`, s.settings.specs.peakCount.op, 'course-teaching'],
      ['Last relevant peak (min)', s.settings.specs.lastPeak.value, s.settings.specs.lastPeak.op, 'course-teaching'],
      ['Lowest adjacent Rs', s.settings.specs.minRs.value, s.settings.specs.minRs.op, 'course-teaching'],
      ['R² policy', r2Policy.judged ? `${r2Policy.target}${r2Policy.mode === 'project' ? ' (project/user criterion)' : ''}` : r2Policy.label, r2Policy.op, r2Policy.mode],
      ['First-peak proxy', s.settings.allowFirstPeakProxy ? 'ALLOWED (unconfirmed, exploratory)' : 'off', '', 'tool option'],
    ].map(r => h('tr', r.map(x => h('td', String(x)))))),
    h('h3', 'Source register'), h('ul', { class: 'small' }, REGISTER.map(r => h('li', `${r.label} [${r.scope}] — ${r.sources.map(c => `${c.title}${c.loc ? ', ' + c.loc : ''}`).join('; ')}`))));
}
