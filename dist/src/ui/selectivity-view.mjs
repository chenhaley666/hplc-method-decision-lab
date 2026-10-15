// selectivity-view.mjs — specifications (editable, with operators and
// sources), the current run's gates in decision order, all adjacent-pair Rs
// with the limiting pair, history-aware progression, nomogram and temperature
// tools. Renders evaluation results only.
import { h, chip, details, table, field, f, sourceList, comparisonVerdictLabel } from './dom.mjs';
import { commit, setUi } from './state.mjs';
import { term } from './glossary.mjs';
import { lineChart } from './charts.mjs';
import { OPERATORS, RS_BASES, temperatureBracket } from '../rules.mjs';
import { REGISTER_BY_ID } from '../presets/bps2032.mjs';
import { nomogramConvert, nomogramReadableRange, NOMOGRAM_LIMIT, NOMOGRAM_ATTRIBUTION, NOMOGRAM_TOLERANCE_BASIS } from '../selectivity/nomogram.mjs';
import { relevantPeaks,effectiveTemperature,runColumn,isBlank } from '../data-model/derive.mjs';
import {knownValue} from '../data-model/conditions.mjs';
import {compareRunNumbers} from '../data-model/workspaces.mjs';
import { alphaPairs } from '../selectivity/alpha.mjs';

import {solventSuggestions} from '../selectivity/solvent-plan.mjs';
import {solventPlanPanel} from './solvent-plan-view.mjs';

const opSel = (cur, on, tid) => h('select', { 'data-testid': tid, onchange: e => on(e.target.value) }, Object.entries(OPERATORS).map(([k, v]) => h('option', { value: k, selected: cur === k ? 'selected' : null }, v.label)));

export function specsBox(st) {
  const sp = st.evaluation.settings.specs;
  if(!st.ui.specsExpert)return h('section',{class:'card','data-testid':'specs'},h('h3','Specifications in force'),
    table(['Criterion','Requirement'],[['pressure','Back-pressure'],['peakCount','Retained peak count'],['lastPeak','Latest retained peak'],['minRs','Lowest adjacent Rs']].map(([k,label])=>h('tr',h('td',label),h('td',`${sp[k].op} ${sp[k].value} ${sp[k].unit||''}`)))),
    h('p',{class:'small'},`Applied automatically. Peak-count target ${sp.peakCount.includesMarker?'includes':'excludes'} the hold-up marker. Rs basis: ${RS_BASES[st.session.settings.rsBasis].label}. Method pressure uses the displayed value and operator, never a hidden local reference or a column manufacturer rating.`),
    h('button',{type:'button','data-testid':'specs-expert',onclick:()=>setUi(u=>{u.specsExpert=true;})},'Expert: correct specifications / Rs basis'));
  const customPressure=ss=>{if(ss.settings.localLab?.enabled)ss.settings.localLab.pressureMode='custom';};
  const row = (key, label, regId, unit) => {
    const reg = REGISTER_BY_ID[regId];
    return h('tr', { 'data-testid': `spec-${key}` }, h('td', label),
      h('td', opSel(sp[key].op, v => commit(ss => { ss.settings.specs[key].op = v; if(key==='pressure'){ss.settings.specs.pressure.value=sp.pressure.value;customPressure(ss);} }), `spec-op-${key}`)),
      h('td', h('input', { value: sp[key].value, 'data-testid': `spec-val-${key}`, inputmode: 'decimal', onchange: e => { const n = Number(e.target.value); if (!Number.isFinite(n) || n < 0) { setUi(u => { u.message = `${label}: "${e.target.value}" is not a valid number; unchanged.`; }); return; } commit(ss => { ss.settings.specs[key].value = key === 'peakCount' ? Math.round(n) : n; if(key==='pressure'){ss.settings.specs.pressure.op=sp.pressure.op;customPressure(ss);} }); } }), ` ${unit}`),
      h('td', chip(key==='pressure'&&st.session.settings.localLab?.enabled?'user-confirmed local method':reg.scope, `scope-${reg.scope}`)));
  };
  return h('section', { class: 'card', 'data-testid': 'specs' }, h('h3', { 'data-testid': 'spec-editor', tabindex: '-1' }, 'Specifications (inputs, not constants)'),
    h('button',{type:'button','data-testid':'specs-expert-close',onclick:()=>setUi(u=>{u.specsExpert=false;})},'Return to automatic specifications'),
    table(['Criterion', 'Operator', 'Value', 'Scope'], [
      row('pressure', 'Back-pressure', 'spec.pressure', 'psi'), row('peakCount', 'Target peak count', 'spec.peakCount', 'peaks'),
      row('lastPeak', 'Last relevant peak', 'spec.lastPeak', 'min'), row('minRs', 'Lowest adjacent Rs', 'spec.minRs', '')]),
    h('p', { class: 'small' }, 'Terms: ', term('Rs'), ' · ', term('criticalPair'), ' · ', term('backPressure'), ' · ', term('percentB'), '.'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: sp.peakCount.includesMarker, 'data-testid': 'includes-marker', onchange: e => commit(ss => { ss.settings.specs.peakCount.includesMarker = e.target.checked; }) }), ' The target peak count INCLUDES the hold-up marker'),
    field('Resolution basis (one basis for every pair; never mixed)', h('select', { 'data-testid': 'rs-basis', onchange: e => commit(ss => { ss.settings.rsBasis = e.target.value; }) }, Object.entries(RS_BASES).map(([k, v]) => h('option', { value: k, selected: st.session.settings.rsBasis === k ? 'selected' : null }, v.label)))),
    h('p', { class: 'small' }, REGISTER_BY_ID['rule.rsWidth'].detail),
    h('p', { class: 'small' }, 'Reaching the target peak count alone is not completion: every criterion must be met in the same run (Retention ED slide 10).'));
}

function gatesBox(st) {
  const ev = st.evaluation;
  if (!ev.current) return h('section', { class: 'card' }, h('h3', 'Current run'), h('p', { class: 'empty' }, 'No sample run in the decision-history set.'));
  const run = st.session.runs.find(r => r.id === ev.current.id);
  const g = ev.runEvaluations[run.id];
  const rsGate = g.gates.find(x => x.id === 'minRs');
  const rs = rsGate.rs;
  const peaks = relevantPeaks(run);
  let chart = null;
  if (run.measured.trace) {
    const bands = rs?.limiting ? [{ x1: rs.limiting.tR1, x2: rs.limiting.tR2, color: '#e45756' }] : [];
    const markers = peaks.map((p, i) => ({ x: p.tR, label: String(p.no), color: rs?.limiting && (p.no === rs.limiting.from || p.no === rs.limiting.to) ? '#c0392b' : '#777', row: i % 2 }));
    chart = lineChart({ series: [{ id: run.id, label: run.label, color: '#1f77b4', points: run.measured.trace.t.map((t, i) => [t, run.measured.trace.y[i]]) }], xLabel: 'tR (min) — as measured', yLabel: `signal (${run.measured.trace.unit})`, markers, bands, title: `${run.label}${rs?.limiting ? ` — limiting pair ${rs.limiting.from}–${rs.limiting.to} shaded` : ''}`, testid: 'current-chart', height: 260 });
  } else chart = h('p', { class: 'small' }, 'Peak table only: no chromatogram trace to draw.');
  return h('section', { class: 'card', 'data-testid': 'gates' }, h('h3', `Current run: ${run.label}`),
    h('ol', { class: 'gates' }, g.gates.map(x => h('li', { class: `gate ${x.pass === true ? 'pass' : x.pass === false ? 'fail' : 'unknown'}`, 'data-testid': `gate-${x.id}` }, h('strong', x.label), ' ', chip(x.pass === true ? 'met' : x.pass === false ? 'not met' : 'unknown', x.pass === true ? 'ok' : x.pass === false ? 'bad' : 'warn'), ` (spec ${x.spec}) `, h('div', { class: 'small' }, x.text)))),
    chart,
    rs && rs.pairs.length ? table(['Pair', 'tR1', 'tR2', 'Δt (min)', `Rs (${st.session.settings.rsBasis})`, 'Exported Rs', 'Formula', ''], rs.pairs.map(p => {
      const ex = rsGate.exported?.pairs.find(x => x.from === p.from);
      const lim = rs.limiting && rs.limiting.from === p.from, clo = rs.closest && rs.closest.from === p.from;
      return h('tr', { class: lim ? 'sel-row' : '' }, h('td', `${p.from}–${p.to}`), h('td', f(p.tR1, 3)), h('td', f(p.tR2, 3)), h('td', f(p.gap, 3)), h('td', p.ok ? f(p.rs, 3) : h('span', { class: 'unk' }, 'n/a')), h('td', ex?.ok ? f(ex.rs, 3) : '—'), h('td', { class: 'tiny' }, p.ok ? p.formula : p.reason), h('td', lim ? chip('LIMITING', 'bad') : null, clo ? chip('closest in time', '') : null));
    }), { 'data-testid': 'pairs-table' }) : null,
    h('p', { class: 'small' }, 'The exported column is shown for comparison only; it is never mixed into the selected basis.'),
    alphaBox(st, run));
}

function alphaBox(st, run) {
  const a = alphaPairs(st.session, run, st.session.settings);
  if (!a.ok) return h('p', { class: 'small warn', 'data-testid': 'alpha' }, a.reason);
  return h('div', { 'data-testid': 'alpha' }, h('h4', 'Selectivity ', term('alpha'), ' (adjacent retained peaks)'), h('p', { class: 'small' }, `t0 = ${f(a.t0.t0, 3)} min — ${a.t0.text} ${a.note}`),
    table(['Pair', 'K earlier', 'K later', 'α'], a.pairs.map(p => h('tr', h('td', `${p.from}–${p.to}`), h('td', f(p.k1, 3)), h('td', f(p.k2, 3)), h('td', f(p.alpha, 3))))));
}

function progressionBox(st) {
  const p = st.evaluation.progression, set = st.session.settings;
  const plan = set.selectivityPlan;
  const move = (i, d) => commit(ss => { const a = ss.settings.selectivityPlan; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; });
  const toggleUnavail = id => commit(ss => { const u = new Set(ss.settings.unavailableSteps || []); u.has(id) ? u.delete(id) : u.add(id); ss.settings.unavailableSteps = [...u]; });
  return h('section', { class: 'card', 'data-testid': 'progression' }, h('h3', 'Selectivity progression (from actual history)'),
    h('p', { class: 'small' }, REGISTER_BY_ID['rule.selectivityOrder'].detail),
    h('p',{class:'small','data-testid':'progression-auto-summary'},`Automatic workflow: temperature ${set.temperatureSteps.join(' → ')} °C; solvents ${set.availableSolvents.join(' / ')}; ligand changes last. Oven stability tolerance ${set.tempStabilityTolerance} °C is a configurable software policy, not a course rule. Imported conditions are read automatically; changing a target does not prove a step was performed.`),
    h('button',{type:'button','data-testid':'progression-expert',onclick:()=>setUi(u=>{u.progressionExpert=!u.progressionExpert;})},st.ui.progressionExpert?'Close expert workflow correction':'Expert: correct workflow / software policies'),
    st.ui.progressionExpert?h('div',h('div', { class: 'row wrap' },
      field('Temperature steps (°C)', h('input', { value: set.temperatureSteps.join(', '), 'data-testid': 'temp-steps', onchange: e => { const v = e.target.value.split(',').map(x => Number(x.trim())).filter(Number.isFinite); if (v.length === 2) commit(ss => { ss.settings.temperatureSteps = v; }); else setUi(u => { u.message = 'Enter exactly two temperatures, e.g. "40, 60".'; }); } })),
      field('Available organic solvents', h('input', { value: set.availableSolvents.join(', '), 'data-testid': 'solvents', onchange: e => commit(ss => { ss.settings.availableSolvents = e.target.value.split(',').map(x => x.trim()).filter(Boolean); }) })),
      field('Oven stability tolerance (°C)', h('input', { type: 'number', step: 'any', value: set.tempStabilityTolerance, 'data-testid': 'policy-stability-tol', onchange: e => { const n = Number(e.target.value); if (n > 0) commit(ss => { ss.settings.tempStabilityTolerance = n; }); else setUi(u => { u.message = 'The oven stability tolerance admits a positive number of °C; nothing was changed.'; }); } }))),
    h('div', { class: 'card inner', 'data-testid': 'policies' }, h('h4', 'Software policies (this tool\'s own, not course rules)'),
      h('p', { class: 'small' }, 'An equipment limit comes from a datasheet. A specification is what this method must achieve, and you set it above. A policy is a threshold this tool had to choose because no supplied source states one — every result that uses one says so, and you can change it here.'),
      h('div', { class: 'row wrap' },
        field('Run time "approaching" the limit at (fraction)', h('input', { type: 'number', step: '0.05', min: '0.05', max: '0.95', value: set.runtimeApproachingFraction, 'data-testid': 'policy-approaching', onchange: e => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0 && n < 1) commit(ss => { ss.settings.runtimeApproachingFraction = n; }); else setUi(u => { u.message = 'The "approaching" fraction admits a value strictly between 0 and 1; nothing was changed.'; }); } })),
        field('Minimum oven readings in the analysed interval', h('input', { type: 'number', step: '1', min: '2', value: set.ovenMinReadings, 'data-testid': 'policy-oven-readings', onchange: e => { const n = Math.round(Number(e.target.value)); if (Number.isInteger(n) && n >= 2) commit(ss => { ss.settings.ovenMinReadings = n; }); else setUi(u => { u.message = 'The minimum number of oven readings admits a whole number of 2 or more; nothing was changed.'; }); } })),
        field('Largest admissible gap between readings (fraction)', h('input', { type: 'number', step: '0.05', min: '0.05', max: '0.95', value: set.ovenMaxGapFraction, 'data-testid': 'policy-oven-gap', onchange: e => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0 && n < 1) commit(ss => { ss.settings.ovenMaxGapFraction = n; }); else setUi(u => { u.message = 'The largest admissible gap admits a fraction strictly between 0 and 1; nothing was changed.'; }); } }))),
      h('p', { class: 'tiny' }, 'A small observed temperature range from too few readings, or with a long unobserved stretch, is not evidence of stability: the tool reports the temperature as unknown rather than stable.'))):null,
    p?.base ? h('p', { class: 'small' }, `Current column: ${p.base.column}. Retention solvent: ${p.base.solvent} (${p.base.solventBasis}); second solvent: ${p.base.alt || 'none available'}.`) : null,
    p && !p.ok ? h('div', { class: 'missing','data-testid':'progression-pending' },h('strong','Data imported — verified step classification pending'),h('p',{class:'small'},p.missing.join(' ')),h('p',{class:'small'},'The observations below remain visible. No imported run is marked completed just because its filename looks compatible. Confirm physical column / sample only from your laboratory record.')) : null,
    (!p?.ok&&st.session.runs.length)?observedProgression(st):null,
    p?.contract ? details('What makes a historical run evidence that a step was completed', false,
      h('p', { class: 'small' }, 'Must match: ', p.contract.mustMatch.join(' · '), '.'),
      h('p', { class: 'small' }, 'May differ without invalidating the comparison: ', p.contract.mayDiffer.join(' · '), '.'),
      h('p', { class: 'small warn' }, 'Not counted for this comparison when: ', p.contract.invalidating.join(' · '), '.'),
      h('p', { class: 'small' }, p.contract.evaluable),
      h('p', { class: 'tiny' }, p.contract.note)) : null,
    h('p', { class: 'small', 'data-testid': 'comparison-scope' }, 'These verdicts concern completion of a particular comparison step. A different composition can be useful experimental data without satisfying that comparison. The nomogram reading allowance is a tool policy, not a rejection threshold for measured chromatograms. Numerical FC1 criteria are evaluated separately above.'),
    p?.ok||st.ui.progressionExpert?table([...(st.ui.progressionExpert?['']:[]), 'Step', 'Status', 'Composition it belongs to', 'Runs classified (verdict and why)', 'Limits / needs',...(st.ui.progressionExpert?['']:[])], plan.map((stp, i) => {
      const ps = p?.steps?.find(x => x.id === stp.id);
      const status = !ps ? st.session.runs.length?'pending confirmation':'awaiting data' : ps.done ? 'done' : !ps.available ? 'unavailable' : p.next?.id === stp.id ? 'NEXT' : 'open';
      return h('tr', { class: status === 'NEXT' ? 'sel-row' : '', 'data-testid': `step-${stp.id}` }, st.ui.progressionExpert?h('td', h('button', { type: 'button', onclick: () => move(i, -1), 'aria-label': 'move up' }, '↑'), h('button', { type: 'button', onclick: () => move(i, 1), 'aria-label': 'move down' }, '↓')):null,
        h('td', stp.label, ps?.solventName ? h('div', { class: 'tiny' }, `${ps.solventName}${ps.temperature ? ` at ${ps.temperature} °C` : ''}`) : null),
        h('td', chip(status, status === 'done' ? 'ok' : status === 'NEXT' ? 'go' : status === 'unavailable' ? 'bad' : '')),
        h('td', { class: 'tiny' }, !ps?.compositionTargets ? '' : ps.compositionTargets.kind === 'list'
          ? `${ps.compositionTargets.list.map(x => `${x.B}${x.tolerance ? `±${x.tolerance}` : ''}`).join(', ')} %B — ${ps.compositionTargets.list[0].basis}`
          : ps.compositionTargets.kind === 'any' ? `any composition: ${ps.compositionTargets.reason}` : `not established: ${ps.compositionTargets.reason}`),
        h('td', { class: 'tiny' }, !ps?.classified?.length ? !p?.ok&&st.session.runs.length?'Not classified yet — review the confirmation above':'No matching completed-step evidence'
          : h('ul', { class: 'verdicts' }, ps.classified.map(c => h('li', { class: `v-${c.verdict}` },
              h('strong', comparisonVerdictLabel(c)), ` ${c.label} — `, c.reasons.join('; '),
              c.notes?.length ? h('div', { class: 'tiny' }, c.notes.join('; ')) : null)))),
        h('td', { class: 'small' }, ps?.unavailableReason || '', ps?.needs?.join('; ') || '', ps?.alternatives ? `alternatives: ${ps.alternatives.join(', ') || 'none recorded'}` : ''),
        st.ui.progressionExpert?h('td', h('button', { type: 'button', onclick: () => toggleUnavail(stp.id) }, (set.unavailableSteps || []).includes(stp.id) ? 'mark available' : 'mark not available')):null);
    })):h('div',{'data-testid':'progression-planned-path'},h('h4','Planned comparison sequence'),h('p',{class:'small'},'Step completion: pending confirmation. This is the intended path, not a claim that imported experiments were completed or missing.'),h('ol',plan.map(stp=>h('li',stp.label)))),
    p?.steps?.some(s => s.priorUnsafe?.length) ? h('p', { class: 'banner warn', 'data-testid': 'prior-unsafe' },
      'An earlier attempt at a step below breached the configured back-pressure specification. It stays in the history as a performed experiment, it is not evidence that the step was completed, and the tool does not prescribe repeating that method as it stood.') : null,
    p?.exhausted ? h('p', { class: 'banner fc2' }, 'All applicable selectivity options are done or unavailable: Efficiency (FC2) is the next parameter family. It is not implemented here.') : null);
}

function observedProgression(st){
  const set=st.session.settings;
  return h('section',{'data-testid':'progression-observations'},h('h4','Automatically recognised observations — not proof of step completion'),
    table(['Run','Solvent B / %B','Recorded temperature','Observed condition','Verification'],[...st.session.runs].sort(compareRunNumbers).map(r=>{
      const T=effectiveTemperature(r,set),org=knownValue(r.conditions.organic)?r.conditions.organic.value:null,B=knownValue(r.conditions.percentB)?r.conditions.percentB.value:null,col=runColumn(st.session,r);
      const temp=knownValue(r.conditions.ovenSetpoint)?r.conditions.ovenSetpoint.value:null;
      const target=typeof temp==='number'?set.temperatureSteps.find(x=>Math.abs(x-temp)<=set.tempMatchTolerance):undefined;
      const observed=isBlank(r)?'Blank / control — not a sample completion':`${org||'Solvent not recorded'} ${target!==undefined?`at temperature step ${target} °C`:temp==='ambient'?'at recorded ambient condition':'condition recorded; compare with intended workflow'}`;
      return h('tr',{'data-testid':`observed-run-${r.id}`},h('td',r.label),h('td',`${org||'not recorded'} / ${B??'not recorded'} %B`),h('td',T.known?`${f(T.value,1)} °C`:temp==='ambient'?'ambient; measured stability not established':`${temp??'not recorded'}${temp!==null?' °C; measured stability not established':''}`),h('td',observed),h('td',col.confirmed?'Column confirmed; other step checks still apply':'Physical column unconfirmed; observations only'));
    })));
}

export function selectivityTools(st) {
  const ui = st.ui; const t = ui.tools || (ui.tools = { from: 'ACN', to: 'MeOH', pct: 50, tR: 10, T1: 25, T2: 40 });
  const acn=solventSuggestions(st.session);
  if(!t.manualComposition&&acn.source){t.from='ACN';t.to='MeOH';t.pct=acn.source.B;}
  else if(!t.manualComposition&&Number.isFinite(st.evaluation.planning?.B))t.pct=st.evaluation.planning.B;
  const cv = nomogramConvert(t.from, t.to, t.pct);
  const rr = nomogramReadableRange(t.from, t.to);
  const br = temperatureBracket(t.tR, t.T1, t.T2);
  const inp = (k, tid) => ['from','to'].includes(k)?h('select',{'data-testid':tid,onchange:e=>setUi(()=>{t[k]=e.target.value;})},['ACN','MeOH'].map(v=>h('option',{value:v,selected:t[k]===v?'selected':null},v))):h('input', { type:'number',step:'any',value: t[k] ?? '', 'data-testid': tid, onchange: e => setUi(() => {if(k==='pct')t.manualComposition=true; t[k] = e.target.value === '' ? null : Number(e.target.value); }) });
  return h('section', { class: 'card', 'data-testid': 'tools' }, h('h3', 'ACN ↔ MeOH: plan solvent strength'),
    h('p',{class:'small'},'Conversion is a course nomogram estimate for similar retention, not the same selectivity and not proof of resolution. It does not mark a solvent-change experiment as performed.'),
    h('div', { class: 'row wrap' }, field('From', inp('from', 'nomo-from')), field('%B', inp('pct', 'nomo-pct')), field('To', inp('to', 'nomo-to'))),
    Number.isFinite(st.evaluation.planning?.B)?h('button',{type:'button','data-testid':'nomo-use-minimum',onclick:()=>setUi(()=>{t.manualComposition=true;t.pct=st.evaluation.planning.B;})},`Use current ${st.evaluation.planning.ready?'minimum':'candidate minimum'} ${st.evaluation.planning.B} %B`):null,
    h('p', { 'data-testid': 'nomo-result', class: cv.available ? '' : 'warn' }, cv.available ? `${cv.value.toFixed(1)} % ${t.to} (plan ${cv.rounded} %). ` : '', cv.reason),
    rr && !rr.empty ? h('p', { class: 'small' }, `Readable range on the supplied figure: ${rr.low?.toFixed(1)}–${rr.high?.toFixed(1)} % ${t.from}.`) : null,
    solventPlanPanel(st),
    details('Nomogram scope and basis',false,h('p', { class: 'tiny' }, NOMOGRAM_LIMIT)),
    details('Temperature rule of thumb (optional planning tool)',false,h('div', { class: 'row wrap' }, field('Last tR (min)', inp('tR', 'tb-tr')), field('From (°C, known)', inp('T1', 'tb-t1')), field('To (°C)', inp('T2', 'tb-t2'))),
    h('p', { 'data-testid': 'tb-result' }, br.ok ? `Predicted last peak ${br.min.toFixed(2)}–${br.max.toFixed(2)} min (1–2 % per °C over ΔT ${br.dT} °C).` : br.reason)));
}

function sourcesBox(st) {
  const records = ['spec.pressure','spec.peakCount','spec.lastPeak','spec.minRs','rule.rsWidth','rule.selectivityOrder','rule.temperature'].map(id => REGISTER_BY_ID[id]);
  const fold = details('Basis & sources', false,
    h('p', { class: 'small' }, 'Full citations and background conflicts. Issues affecting the current recommendation or operating limits remain visible beside the next-action panel; collapsing these sources does not resolve them.'),
    records.map(reg => h('div', { class: 'source-record' }, h('h4', reg.label), sourceList(reg.sources),
      reg.conflicts?.length ? h('ul', { class: 'small' }, reg.conflicts.map(c => h('li', `CONFLICT: ${c.text} → ${c.resolution}`))) : null)),
    h('p', { class: 'small' }, `Resolution basis source: ${RS_BASES[st.session.settings.rsBasis].source}.`),
    h('h4', 'Nomogram reading and tolerance'), h('p', { class: 'small' }, NOMOGRAM_ATTRIBUTION, ' ', NOMOGRAM_TOLERANCE_BASIS));
  fold.dataset.testid = 'selectivity-sources';
  return h('section', { class: 'card' }, fold);
}

export function selectivityView(st) {
  return h('div', { class: 'stage', 'data-testid': 'stage-selectivity' }, gatesBox(st), specsBox(st), progressionBox(st), sourcesBox(st));
}
