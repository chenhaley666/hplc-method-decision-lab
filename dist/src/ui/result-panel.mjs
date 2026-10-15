import {displayRunOrder} from '../data-model/workspaces.mjs';
// result-panel.mjs — the one prominent next-experiment panel and the active
// analysis/history sets shown beside it. Renders evaluation.next; contains no
// decision logic.
import { h, chip, details, table, f } from './dom.mjs';
import { STATUS } from '../decision/evaluate.mjs';
import { missingLine } from './state-bar.mjs';
import { store,switchStage } from './state.mjs';
import { REGISTER_BY_ID } from '../presets/bps2032.mjs';
import { heightFilterSummary } from '../data-model/peak-filter.mjs';
import {projectR2} from '../retention/fit.mjs';

const kindOf = st => st === STATUS.MET ? 'ok' : st === STATUS.PROPOSED ? 'go' : st === STATUS.EXHAUSTED ? 'fc2' : st === STATUS.LIMITS ? 'warn' : 'need';

function currentSummary(st){
  const ev=st.evaluation,g=ev.current&&ev.runEvaluations[ev.current.id];if(!g)return null;
  const labels={pressure:'Back-pressure',peakCount:'Retained peaks',lastPeak:'Latest peak',minRs:'Lowest Rs'};
  return h('section',{'data-testid':'decision-current-summary'},h('h4',`Measured Selectivity result: ${ev.current.label}`),
    h('p',{class:'small'},'These are this run’s measured numerical checks, not the Retention fit or the readiness of the next method.'),
    table(['Quantity','This run','Requirement','Verdict'],g.gates.map(x=>{const spec=ev.settings.specs[x.id];return h('tr',{'data-testid':`decision-current-${x.id}`},h('td',labels[x.id]),h('td',f(x.value,x.id==='peakCount'?0:x.id==='pressure'?0:3)),h('td',spec?`${spec.op} ${spec.value} ${spec.unit||''}`:x.spec),h('td',x.pass===true?'Met':x.pass===false?'Not met':'Not established'));})),
    h('p',{class:'small'},`Measured criteria: ${g.verdict==='met'?'met':g.verdict==='not-met'?'not met':'incomplete'}. Missing model evidence does not erase these measurements.`));
}
function referenceSummary(st){
  const p=st.evaluation.planning,u=st.evaluation.next.unasked;if(!p)return null;
  const r2=p.worksheet?.fit?.r2;
  const origin=p.mode==='own'?'Selectivity-stage model':p.mode==='auto-lastpeak'||p.mode==='retention'?'Retention workspace':'External / planning reference';
  return h('section',{'data-testid':'decision-reference'},h('h4',`Model reference: ${origin}`),h('div',{'data-testid':'result-unasked'},
    h('p',{class:'small','data-testid':'decision-reference-source'},p.source||p.reason),
    Number.isFinite(p.B)?h('p',{'data-testid':'decision-reference-minimum'},`${p.ready?'Planning minimum':'Candidate minimum'}: ${p.B} %B${u.minimum?.predictedLast!==null&&u.minimum?.predictedLast!==undefined?`; conditional latest peak ${f(u.minimum.predictedLast,3)} min`:''}.`):h('p',{class:'small'},'Minimum not established.'),
    Number.isFinite(r2)?h('p',{class:'small'},`Reference R²: ${f(r2,6)} → ${f(projectR2(r2),3)} for the user-project check ≥ 0.995. This is not an R² calculated from the current Selectivity run.`):null,
    p.worksheet?.points?.length?details('Retention runs used by this reference',false,h('p',{class:'small','data-testid':'reference-run-labels'},displayRunOrder(p.worksheet.points,st.session).map(x=>x.label).join(', '))):null,
    !p.ready?h('p',{class:'small warn','data-testid':'decision-reference-blockers'},`Reference not qualified: ${p.reason}`):h('p',{class:'small'},'Reference available for planning; actual baseline, sample/column applicability and operating limits are checked separately.'),
    u.intermediate?h('p',{class:'small'},`Intermediate %B: ${u.intermediate.B}; modelled smallest α ${f(u.intermediate.minAlpha,3)}. Verify separation by injection.`):h('p',{class:'small'},'Intermediate %B choices / exploratory previews are in the composition planner above. No whole-sample α optimum is inferred from a last-peak line.'),
    ['retention','auto-lastpeak'].includes(p.mode)?h('button',{type:'button','data-testid':'open-reference-evidence',onclick:()=>switchStage('retention')},'Open Retention reference / evidence'):null));
}

export function resultPanel(store) {
  const ev = store.evaluation, n = ev.next;
  const m = n.method;
  const compactSources = store.ui.stage === 'selectivity';
  const localPressure=store.session.settings.localLab?.enabled&&store.session.settings.localLab.pressureMode!=='custom';
  const pressureRule = REGISTER_BY_ID['spec.pressure'];
  const routingRule = REGISTER_BY_ID['rule.selectivityOrder'];
  const routingRelevant = compactSources&&!n.referenceBlocker && (n.remainingPath?.length || /temperature|solvent|ligand/i.test(n.preferred?.action || ''));
  const hasPressureConflict=!localPressure&&pressureRule.conflicts?.length;
  const sourceConflicts = compactSources&&(hasPressureConflict||routingRelevant&&routingRule.conflicts?.length) ? h('div', { class: 'banner warn', 'data-testid': 'decision-conflicts' },
    h('strong', 'Important source / policy conflicts'),
    !localPressure&&pressureRule.conflicts?.length ? h('p', { class: 'small', 'data-testid': 'pressure-conflict-alert' },
      `Written course sources disagree about the acceptance pressure (3500 vs 4000 psi). This session uses ${store.session.settings.specs.pressure.op} ${store.session.settings.specs.pressure.value} psi. Confirm the governing course limit, then update Back-pressure in Specifications. This is separate from the instrument and column hardware ratings. Full citations: Basis & sources below.`) : null,
    routingRelevant && routingRule.conflicts?.length ? h('p', { class: 'small', 'data-testid': 'routing-conflict-alert' },
      'The course deck, rubric and team flow chart describe differing selectivity orders. This recommendation uses the configured selectivity plan, initially based on the rubric, not the team flow chart. Confirm the applicable workflow; review or edit the plan in Selectivity progression. Full citations: Basis & sources below.') : null) : null;
  return h('section', { class: `card result ${n.readiness?.planningDraft ? 'warn' : kindOf(n.status)}`, 'data-testid': 'result-panel', 'aria-live': 'polite' },
    h('div', { class: 'result-head' }, h('span', { class: 'label' }, 'Next experiment'), chip(n.readiness?.planningDraft ? `PLANNING DRAFT — ${n.status}` : n.status, `status ${n.readiness?.planningDraft ? 'warn' : kindOf(n.status)}`)),
    ev.current ? h('p', { class: 'small','data-testid':'decision-current-label' }, compactSources?'Current Selectivity run: ':'Decided for: ', h('strong', ev.current.label)) : null,
    h('p',{class:'tiny'},`Current run and decision history: ${store.ui.stage} only. ${ev.planning?'The model reference is separate and labelled below; importing Selectivity files does not replace the Retention data.':'No other stage history is included.'}`),
    compactSources?currentSummary(store):null,
    compactSources?referenceSummary(store):null,
    store.session.runs.some(r=>r.heightFilter?.enabled)?h('p',{class:'banner warn','data-testid':'filtered-result-warning'},`Peak-height filtering is active (${store.session.runs.reduce((n,r)=>n+heightFilterSummary(r).excluded,0)} peaks excluded). All counts, timing, resolution and fits are conditional on these exclusions, not proof that the excluded peaks are noise.`):null,
    compactSources?h('h4','Next-step decision'):null,
    h('p', { class: 'reason', 'data-testid': 'result-reason' }, n.referenceBlocker?`Next-step planning is blocked by the ${n.referenceBlocker.source.toLowerCase()} checks shown above. This reference blocker is separate from the measured verdict for ${ev.current?.label||'the current run'}.`:n.reason),
    sourceConflicts,
    !n.actionable && (n.status === STATUS.PROPOSED || n.status === STATUS.LIMITS || n.status === STATUS.NEED_EXP) ? h('p', { class: 'banner draft' }, 'PLANNING DRAFT — not an actionable method until the items below are resolved.') : null,
    n.actionable ? h('p', { class: 'banner act' }, 'Actionable proposal under the recorded conditions and documented limits. Predictions are not clearance to inject; verify measured pressure and the method before running.') : null,
    n.readiness ? details('Method readiness checks', false,
      h('p', { class: 'small' }, n.readiness.note), h('ul', { class: 'small' }, n.readiness.checks.map(x => h('li', x)))) : null,
    n.deficiency ? h('div', { class: 'deficiency', 'data-testid': 'result-deficiency' },
      h('h4', 'The quantity that places this run here'),
      h('p', null, n.deficiency.text),
      h('p', { class: 'small' }, n.deficiency.noRsPrediction)) : null,
    n.runtimeBand ? h('p', { class: 'small', 'data-testid': 'result-runtime-band' }, `Run-time proximity: ${n.runtimeBand.text}`) : null,
    n.remainingPath?.length ? h('div', { 'data-testid': 'result-remaining-path' }, h('h4', 'Admissible options, in order'),
      h('ol', n.remainingPath.map((o, i) => h('li', { class: o.available ? '' : 'unavail' },
        h('strong', `${i === 0 ? 'Next: ' : ''}${o.label}`), ` — ${o.quantity}`,
        o.available ? '' : h('span', { class: 'warn-text' }, ` NOT AVAILABLE: ${o.unavailableReason}`),
        o.positionReason ? h('div', { class: 'small' }, o.positionReason) : null)))) : null,
    n.checksFirst ? h('div', h('h4', 'Check first'), h('ul', { class: 'small' }, n.checksFirst.map(x => h('li', x)))) : null,
    n.draftReasons.length ? h('ul', { class: 'draft-list' }, n.draftReasons.map(x => h('li', x))) : null,
    n.preferred ? h('div', { class: 'preferred' }, h('h4', 'Preferred next action'), h('p', { 'data-testid': 'result-action' }, n.preferred.action), n.preferred.why ? h('p', { class: 'small' }, n.preferred.why) : null,
      n.preferred.checks ? h('ul', { class: 'small' }, n.preferred.checks.map(c => h('li', c))) : null) : null,
    n.alternatives.length ? h('div', h('h4', 'Other admissible actions'), h('ul', n.alternatives.map(a => h('li', a.action, a.why ? h('span', { class: 'small' }, ` — ${a.why}`) : '')))) : null,
    (n.missing.length || n.confirmations?.length) ? (compactSources?details('Checks before executing a next method — reference / equipment confirmation needed',false,
      h('p',{class:'small'},'These checks concern a future executable method. They do not remove the imported CSVs or their measured results. Open a linked correction only if your lab record or datasheet supplies the information.'),
      h('ul',[...new Set([...n.missing,...(n.confirmations||[])])].map(x=>missingLine(x,store.evaluation?.current?.id||null)))):h('div', { class: 'missing' }, h('h4', 'Missing information or confirmations'),
      h('ul', [...n.missing, ...(n.confirmations || [])].map(x => missingLine(x, store.evaluation?.current?.id || null))))) : null,
    m ? h('div', h('h4', 'Proposed next-run method'), table(['Condition', 'Value', 'Status', 'Set at / admissible range', ...(compactSources ? [] : ['Source'])], m.rows.map(r => h('tr', { class: `m-${r.state}` },
      h('td', r.label), h('td', r.value === null || r.value === undefined ? 'UNKNOWN' : `${r.value}${r.unit ? ' ' + r.unit : ''}`), h('td', chip(r.state === 'carried' ? 'carried' : r.state === 'changed' ? 'changed' : r.state === 'derived' ? 'estimate' : r.state === 'unknown' ? 'unknown' : 'unconfirmed', r.state)),
      h('td', { class: 'small' }, r.state === 'changed' ? h('div', null, h('strong', r.module || 'module not stated'), r.controlledAt ? h('div', { class: 'tiny' }, r.controlledAt) : null,
        h('div', { class: r.rangeKnown ? '' : 'warn-text' }, r.range || ''), r.requiredField ? h('div', { class: 'tiny' }, `Required information: ${r.requiredField}`) : null) : ''),
      compactSources ? null : h('td', { class: 'small' }, r.source || ''))), { 'data-testid': 'method-table' }),
      compactSources ? details('Next-run method: basis & sources', false, table(['Condition', 'Source'], m.rows.map(r => h('tr', h('td', r.label), h('td', r.source || 'not stated'))))) : null,
      m.unknown.length ? h('p', { class: 'small' }, `Unknown, to be confirmed before running: ${m.unknown.join(', ')}.`) : null) : null,
    n.unasked&&!compactSources ? h('div', { class: 'unasked', 'data-testid': 'result-unasked' },
      h('h4', 'Also derived, without being asked'),
      !n.unasked.available ? h('p', { class: 'small' }, n.unasked.reason)
        : h('div', null,
          h('p', { class: n.unasked.whole ? 'small' : 'small warn-text' }, n.unasked.label),
          n.unasked.minimum ? h('p', null, h('strong', `Minimum %B: ${n.unasked.minimum.B} %`), ` — predicted latest peak ${n.unasked.minimum.predictedLast.toFixed(2)} min. `, h('span', { class: 'small' }, n.unasked.minimum.why)) : null,
          n.unasked.intermediate ? h('p', null, h('strong', `Intermediate %B: ${n.unasked.intermediate.B} %`), ` — smallest adjacent α ${n.unasked.intermediate.minAlpha.toFixed(3)} (${n.unasked.intermediate.pair.join(' / ')}), predicted latest peak ${n.unasked.intermediate.predictedLast.toFixed(2)} min. `, h('span', { class: 'small' }, n.unasked.intermediate.why)) : h('p', { class: 'small' }, n.unasked.intermediateWhy),
          n.unasked.lines.length ? h('p', { class: 'tiny' }, `From the fitted lines of: ${n.unasked.lines.join(', ')}.`) : null)) : null,
    n.inspectAfter.length ? h('div', h('h4', 'Inspect after the run'), h('ul', n.inspectAfter.map(x => h('li', x)))) : null,
    compactSources&&localPressure?details('Method-pressure criterion in force',false,h('p',{class:'small','data-testid':'local-pressure-basis'},`Configured acceptance: ${ev.settings.specs.pressure.op} ${ev.settings.specs.pressure.value} psi. Local planning references never override this value or operator. Hardware/column ratings and software cut-offs remain separate.`)):null,
    details('Evidence used', false, h('ul', { class: 'small' }, n.evidence.map(x => h('li', x)))),
    details('Workflow and scope', false, h('p', { class: 'small' }, n.workflow), h('p', { class: 'small' }, n.scope)));
}

export function setsPanel(store) {
  const s = store.session, ev = store.evaluation;
  const lbl = id => s.runs.find(r => r.id === id)?.label || id;
  const list = (ids, testid) => ids.length ? h('ol', { class: 'small', 'data-testid': testid }, ids.map(id => h('li', lbl(id)))) : h('p', { class: 'small', 'data-testid': testid }, 'none');
  return h('section', { class: 'card sets', 'data-testid': 'sets-panel' }, h('h3', 'Active sets'),
    details(`Retention-fit set (${ev.sets.fit.length})`, true, list(ev.sets.fit, 'set-fit'),
      ev.retention.eligibility.reference ? h('p', { class: 'small' }, `Fit reference: ${ev.retention.eligibility.reference.label}. Eligible: ${ev.retention.eligibility.runs.filter(e => e.eligible).length}.`) : null),
    details(`Decision-history set (${ev.sets.history.length})`, false, list(ev.sets.history, 'set-history')),
    details(`Comparison-plot set (${ev.sets.compare.length})`, false, list(ev.sets.compare, 'set-compare')),
    h('p', { class: 'small' }, `${s.runs.length} run(s) in the library. Hiding a run in a stage does not remove it from any set.`));
}
export { f };
