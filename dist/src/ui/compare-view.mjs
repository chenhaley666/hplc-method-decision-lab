import {displayRunOrder} from '../data-model/workspaces.mjs';
// compare-view.mjs — comparison of the runs ticked "Compare": overlaid and
// stacked chromatograms (trace data only), peak tables, summaries and method
// conditions with differences highlighted.
import { h, s as svgNode,chip, table, f, field,details } from './dom.mjs';
import { lineChart, legend, styleFor } from './charts.mjs';
import { groupSignalSeries, signalUnitInfo } from './signal-units.mjs';
import { setUi, commit } from './state.mjs';
import { alignmentFor, ALIGN_MODES } from '../alignment/visual.mjs';
import { CONDITION_FIELDS, knownValue } from '../data-model/conditions.mjs';
import { effectiveTemperature, runColumn, runInstrument,relevantPeaks } from '../data-model/derive.mjs';
import { peakStatus } from '../alignment/correspondence.mjs';
import { RS_BASES } from '../rules.mjs';
import {pressureGroups,pressureTraceFor,extremaSample} from '../data-model/pressure-display.mjs';

export function comparePanel(st, stage) {
  const s = st.session, ui = st.ui, c = ui.chart;
  const inSet = displayRunOrder(s.runs.filter(r => r.flags.compare),s);
  const runs = inSet.filter(r => r.flags.show[stage] !== false);
  const hiddenHere = inSet.filter(r => r.flags.show[stage] === false);
  const tab = c.tab || 'overlay';
  const tabs = [['overlay', 'Overlaid chromatograms'], ['stacked', 'Stacked'], ['peaks', 'Peak tables'], ['summary', 'tR / count / min Rs'], ['conditions', 'Method conditions']];
  let body;
  if (!runs.length) body = h('p', { class: 'empty', 'data-testid': 'compare-empty' }, !s.runs.length?'Import your first CSV above. Comparisons become useful after you collect another relevant run; no previous experiments are required.':'Choose the measured runs you want to compare using the Compare controls in the experiment library.');
  else if (tab === 'overlay' || tab === 'stacked') body = traces(st, runs, tab === 'stacked');
  else if (tab === 'peaks') body = peakCompare(st, runs);
  else if (tab === 'summary') body = summary(st, runs);
  else body = conditionCompare(st, runs);
  return h('section', { class: 'card', 'data-testid': 'compare-panel' }, h('h3', `Compare runs (${runs.length})`),
    hiddenHere.length ? h('p', { class: 'small' }, `${hiddenHere.length} run(s) in the comparison set are hidden in this stage and not drawn: ${hiddenHere.map(r => r.label).join(', ')}.`) : null,
    runs.length ? unlikeWarning(st, runs) : null,
    h('div', { class: 'tabs small-tabs' }, tabs.map(([id, l]) => h('button', { type: 'button', class: tab === id ? 'active' : '', 'data-testid': `ctab-${id}`, onclick: () => setUi(u => { u.chart.tab = id; }) }, l))),
    body);
}

function condKey(st, r) {
  const s = st.session;
  const T = effectiveTemperature(r, s.settings);
  const col = runColumn(s, r).column;
  return { solvent: knownValue(r.conditions.organic) ? String(r.conditions.organic.value) : '?', temperature: T.known ? T.value.toFixed(1) : '?', column: col ? col.label : '?', flow: knownValue(r.conditions.flow) ? String(r.conditions.flow.value) : '?', percentB: knownValue(r.conditions.percentB) ? String(r.conditions.percentB.value) : '?' };
}
function unlikeWarning(st, runs) {
  const keys = runs.map(r => condKey(st, r));
  const diff = ['solvent', 'temperature', 'column', 'flow'].filter(k => new Set(keys.map(x => x[k])).size > 1 || keys.some(x => x[k] === '?'));
  if (!diff.length) return h('p', { class: 'small ok' }, 'Compared runs share solvent, temperature, column and flow (as recorded).');
  return h('p', { class: 'banner warn', 'data-testid': 'unlike-warning' }, `UNLIKE METHODS: the compared runs differ in, or do not record, ${diff.join(', ')}. Differences in the chromatograms may come from these conditions, not only from %B.`);
}

function traces(st, runs, stacked) {
  const s = st.session, ui = st.ui, c = ui.chart;
  const items = [], series = [], notDrawn = [];
  runs.forEach(r => {
    // Colors belong to the shared-library run, not a visible unit group.
    const sty = styleFor(s.runs.findIndex(x => x.id === r.id)); const k = condKey(st, r);
    const note = `${k.solvent} ${k.percentB}%B, ${k.temperature} °C, ${k.column}, ${k.flow} mL/min`;
    if (!r.measured.trace) { notDrawn.push(`${r.label}: peak table only — no chromatogram trace in the file`); items.push({ id: r.id, label: r.label, ...sty, note: pressureTraceFor(r).available?'no detector trace; pressure trace available':'no trace', hidden: c.hidden.has(r.id) }); return; }
    const al = alignmentFor(s, r, c.align, { compoundId: c.alignCompound, settings: s.settings });
    if (!al.ok) { notDrawn.push(`${r.label}: ${al.note}`); return; }
    const hidden = c.hidden.has(r.id);
    const unit = signalUnitInfo({ id: r.id, label: r.label, run: r });
    items.push({ id: r.id, label: r.label, ...sty, note: `${unit.known ? `signal: ${unit.unit}` : 'signal unit unknown'} · ${note}` + (al.note ? ` · ${al.note}` : ''), hidden });
    const pts = r.measured.trace.t.map((t, j) => [al.map(t), r.measured.trace.y[j]]);
    series.push({ id: r.id, label: r.label, ...sty, points: pts, kind: 'line', run: r, hidden });
  });
  const groups = groupSignalSeries(series);
  const hiddenUnits = c.hiddenUnits || new Set();
  const visibleGroups = groups.filter(g => !hiddenUnits.has(g.key)).map(g => ({ ...g, series: g.series.filter(se => !se.hidden) })).filter(g => g.series.length);
  const visibleSeries = visibleGroups.flatMap(g => g.series);
  const xRange = (c.xMin !== null && c.xMax !== null) ? [c.xMin, c.xMax] : null;
  // All unit panels use the same horizontal window. Independent acquisition
  // lengths must not make apparent peak alignment a different time scale.
  let xMin = Infinity, xMax = -Infinity;
  for (const se of visibleSeries) for (const [x] of se.points) { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); }
  const sharedRange = xRange || (Number.isFinite(xMin) && Number.isFinite(xMax) ? [xMin, xMax] : null);
  const axis = ALIGN_MODES[c.align].axis;
  const controls = h('div', { class: 'row wrap' },
    field('Axis', h('select', { 'data-testid': 'align-mode', onchange: e => setUi(u => { u.chart.align = e.target.value; u.chart.xMin = u.chart.xMax = null; }) }, Object.entries(ALIGN_MODES).map(([k, v]) => h('option', { value: k, selected: c.align === k ? 'selected' : null }, v.label)))),
    c.align === 'compound' ? field('Reference compound', h('select', { onchange: e => setUi(u => { u.chart.alignCompound = e.target.value || null; }) }, h('option', { value: '' }, '(choose)'), s.compounds.map(cp => h('option', { value: cp.id, selected: c.alignCompound === cp.id ? 'selected' : null }, cp.name)))) : null,
    field('x from', h('input', { type: 'number', step: 'any', value: c.xMin ?? '', 'data-testid': 'zoom-min', onchange: e => setUi(u => { u.chart.xMin = e.target.value === '' ? null : Number(e.target.value); }) })),
    field('x to', h('input', { type: 'number', step: 'any', value: c.xMax ?? '', 'data-testid': 'zoom-max', onchange: e => setUi(u => { u.chart.xMax = e.target.value === '' ? null : Number(e.target.value); }) })),
    h('button', { type: 'button', 'data-testid': 'zoom-reset', onclick: () => setUi(u => { u.chart.xMin = u.chart.xMax = null; }) }, 'Reset zoom'),
    h('span', { class: 'small' }, 'Drag across a chart to zoom.'));
  const onBrush = ([a, b]) => setUi(u => { u.chart.xMin = +a.toFixed(4); u.chart.xMax = +b.toFixed(4); });
  const markersFor = r => r.measured.peaks.map(p => ({ x: alignmentFor(s, r, c.align, { compoundId: c.alignCompound, settings: s.settings }).map(p.tR), label: '', color: '#bbb' }));
  const unitControls = groups.length ? h('fieldset', { class: 'signal-unit-controls', 'data-testid': 'signal-unit-controls' },
    h('legend', 'Signal units to display'),
    h('div', { class: 'row wrap' }, groups.map(g => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: !hiddenUnits.has(g.key), 'aria-label': `Display signal group: ${g.label}`, 'data-unit-key': g.key,
        onchange: e => setUi(u => { u.chart.hiddenUnits ||= new Set(); e.target.checked ? u.chart.hiddenUnits.delete(g.key) : u.chart.hiddenUnits.add(g.key); }) }),
      ` ${g.label} (${g.series.length} run${g.series.length === 1 ? '' : 's'})`))),
    h('p', { class: 'small' }, 'Units are read from each file. These checkboxes change the display only; no signal is converted, relabelled or removed from the library.')) : null;
  const unitNotice = groups.length > 1 || groups.some(g => !g.known) ? h('p', { class: 'banner warn', 'data-testid': 'signal-unit-notice' },
    'Separate signal axes: each panel keeps its exported unit and its own vertical scale. Time alignment and zoom are shared. Heights on different unit scales are not directly comparable; no mV-to-mAU conversion is assumed. Runs without a recorded signal unit are plotted separately.') : null;
  const emptyWindow = se => sharedRange && !se.some(x => x.points.some(p => p[0] >= sharedRange[0] && p[0] <= sharedRange[1]));
  const unitPanel = (g, index, single) => h('section', { class: 'signal-unit-panel', 'data-testid': 'signal-unit-panel', 'data-unit-key': g.key, 'data-signal-unit': g.unit || '', 'data-unit-known': String(g.known) },
    h('h4', g.label),
    emptyWindow(g.series) ? h('p', { class: 'small', 'data-testid': 'signal-empty-window' }, 'No recorded signal samples in this time window for this unit group. The source traces remain unchanged.') : null,
    lineChart({ series: g.series, xLabel: axis, yLabel: `detector signal (${g.known ? g.unit : 'unit unknown'})`, xRange: sharedRange, onBrush,
      testid: single ? 'overlay-chart' : `overlay-unit-chart-${index}`, title: c.align === 'original' ? 'Overlaid chromatograms — measured time axis' : 'ALIGNED DISPLAY — not measured retention times' }));
  let charts;
  if (!visibleSeries.length) charts = h('p', { class: 'empty', 'data-testid': 'signal-display-empty' }, 'Nothing to draw. Select a signal-unit group and a visible run in the legend.');
  else if (!stacked) charts = visibleGroups.length === 1 ? unitPanel(visibleGroups[0], 0, true)
    : h('div', { 'data-testid': 'overlay-chart', class: 'signal-chart-panels' }, visibleGroups.map((g, i) => unitPanel(g, i, false)));
  else charts = h('div', visibleSeries.map(se => {
    const unit = signalUnitInfo(se);
    return h('section', { class: 'signal-unit-panel', 'data-signal-unit': unit.unit || '', 'data-unit-known': String(unit.known) },
      h('h4', se.label), emptyWindow([se]) ? h('p', { class: 'small' }, 'No recorded signal samples in this time window.') : null,
      lineChart({ series: [se], xLabel: axis, yLabel: `detector signal (${unit.known ? unit.unit : 'unit unknown'})`, xRange: sharedRange, height: 240, onBrush, markers: markersFor(se.run), title: 'Measured signal', testid: `stacked-${se.id}` }));
  }));
  return h('div', controls, unitControls, unitNotice, legend(items, (id, hide) => setUi(u => { hide ? u.chart.hidden.add(id) : u.chart.hidden.delete(id); })), charts,
    !stacked?pressurePanel(st,runs,sharedRange,onBrush):null,
    notDrawn.length ? h('ul', { class: 'small', 'data-testid': 'not-drawn' }, notDrawn.map(x => h('li', x))) : null,
    c.align !== 'original' ? h('p', { class: 'small warn' }, 'Aligned display only. Stored retention times and every calculation use the measured times.') : null);
}

function pressurePanel(st,runs,detectorRange,onBrush){
 const c=st.ui.chart,active=runs.filter(r=>!c.hidden.has(r.id)),{groups,unavailable}=pressureGroups(active);
 const range=c.align==='original'?detectorRange:null;
 const style=r=>styleFor(st.session.runs.findIndex(x=>x.id===r.id));
 const line=row=>({id:row.run.id,label:row.run.label,...style(row.run),kind:row.trace.points.length===1?'points':'line',points:extremaSample(row.trace.points),width:1.7});
 const keys=h('div',{class:'pressure-legend','data-testid':'pressure-legend'},runs.map(r=>{const t=pressureTraceFor(r),sty=style(r);return h('button',{type:'button',class:'pressure-run-key','aria-pressed':String(!c.hidden.has(r.id)),'data-pressure-run':r.id,onclick:()=>setUi(u=>{u.chart.hidden.has(r.id)?u.chart.hidden.delete(r.id):u.chart.hidden.add(r.id);})},svgNode('svg',{width:28,height:10,viewBox:'0 0 28 10','aria-hidden':'true'},svgNode('line',{x1:1,y1:5,x2:27,y2:5,stroke:sty.color,'stroke-width':3,'stroke-dasharray':sty.dash||null})),r.label,t.available?` · max ${f(t.max,1)} ${t.unit||'unit unknown'}`:' · no timed trace');}));
 const panels=groups.map((g,i)=>h('section',{class:'pressure-unit-panel','data-testid':'pressure-unit-panel','data-pressure-unit':g.unit||'unknown'},
  h('h4',g.known?g.unit:'Pressure unit unknown — separate run'),
  range&&!g.rows.some(row=>row.trace.points.some(p=>p[0]>=range[0]&&p[0]<=range[1]))?h('p',{class:'small','data-testid':'pressure-empty-window'},'No recorded pressure samples in this time window. The full source trace remains intact.'):null,
  lineChart({series:g.rows.map(line),xLabel:'Measured time (min)',yLabel:`back pressure (${g.unit||'unit unknown'})`,xRange:range,height:300,onBrush:c.align==='original'?onBrush:null,title:'Overlaid back-pressure traces',testid:`pressure-overlay-${i}`})));
 const individuals=details(`Individual run pressure plots (${active.length})`,false,h('div',{class:'pressure-run-grid'},active.map(r=>{const trace=pressureTraceFor(r);return h('section',{class:'pressure-run-card','data-testid':'pressure-run-card','data-pressure-run':r.id},h('h4',r.label),trace.available?h('div',h('p',{class:'small'},`Max ${f(trace.max,1)} ${trace.unit||'unit unknown'} · ${trace.sourceCount} source readings`),lineChart({series:[line({run:r,trace})],xLabel:'Measured time (min)',yLabel:`back pressure (${trace.unit||'unit unknown'})`,height:240,xRange:range,testid:`pressure-run-${r.id}`,title:r.label})):h('p',{class:'small'},trace.reason));})));
 individuals.dataset.testid='pressure-individuals';
 return h('section',{class:'pressure-panel','data-testid':'pressure-panel'},h('h3','Back pressure · time-resolved lines'),h('p',{class:'small'},'Colours and dashes match each run’s chromatogram. Run visibility affects both; detector signal-unit filters do not hide pressure. Pressure always uses measured time, never the chromatogram’s shifted/aligned axis. Different pressure units have separate axes; no unit conversion is assumed.'),keys,panels.length?panels:h('p',{class:'small','data-testid':'pressure-display-empty'},'No visible timed pressure trace. Maximum-only values are not turned into fabricated constant lines.'),unavailable.length?h('ul',{class:'small'},unavailable.map(x=>h('li',`${x.run.label}: ${x.reason}`))):null,individuals,h('p',{class:'tiny'},'Full pressure readings and statistics are retained. Dense lines use chronological min/max-envelope display sampling to preserve spikes and endpoints; no smoothing or interpolated readings are added.'));
}

function peakCompare(st, runs) {
  const s = st.session;
  const showExcluded=st.ui.chart.showExcluded===true;
  const shown=r=>showExcluded?r.measured.peaks:relevantPeaks(r);
  const max = Math.max(...runs.map(r => shown(r).length));
  const name = id => s.compounds.find(c => c.id === id)?.name || '';
  return h('div', h('p', { class: 'small' }, 'Only retained peaks are shown by default. Rows are retained elution positions, not compound identities. Original peak numbers are preserved; unidentified means no chemical identity has been assigned.'),
    h('label',{class:'check'},h('input',{type:'checkbox',checked:showExcluded,'data-testid':'show-excluded-peaks',onchange:e=>setUi(u=>{u.chart.showExcluded=e.target.checked;})}),' Show excluded peaks (audit view)'),
    table(['Retained position', ...runs.map(r => r.label)], Array.from({ length: max }, (_, i) => h('tr', h('td', String(i + 1)), runs.map(r => {
      const p = shown(r)[i]; if (!p) return h('td', '—');
      const st2 = peakStatus(s, r).find(x => x.no === p.no);
      return h('td',{'data-peak-no':p.no}, `${p.tR.toFixed(3)} min`,h('div',{class:'tiny'},`Original peak ${p.no}`), st2.confirmed.length ? h('div', { class: 'tiny' }, st2.confirmed.map(name).join(' + ')) : h('div', { class: 'tiny' }, st2.state==='unmatched'?'identity not assigned':st2.state));
    }))),{'data-testid':'compared-peak-table'}));
}

function summary(st, runs) {
  const ev = st.evaluation;
  return h('div', h('p', { class: 'small' }, `Rs basis: ${RS_BASES[st.session.settings.rsBasis].label}.`),
    table(['Run', 'Peaks', 'Last tR (min)', 'Min Rs', 'Limiting pair', 'Closest pair', 'P max (psi)', 'Verdict'], runs.map(r => {
      const g = Object.fromEntries(ev.runEvaluations[r.id].gates.map(x => [x.id, x]));
      const rs = g.minRs.rs;
      return h('tr', h('td', r.label), h('td', String(g.peakCount.value)), h('td', f(g.lastPeak.value, 3)), h('td', f(g.minRs.value, 3)), h('td', rs?.limiting ? `${rs.limiting.from}–${rs.limiting.to}` : '—'), h('td', rs?.closest ? `${rs.closest.from}–${rs.closest.to}` : '—'), h('td', f(g.pressure.value, 0)), h('td', chip(ev.runEvaluations[r.id].verdict)));
    })));
}

function conditionCompare(st, runs) {
  const s = st.session;
  const rows = [
    ['Instrument', r => runInstrument(s, r).instrument?.label || null],
    ['Physical column', r => runColumn(s, r).column?.label || null],
    ['Column ligand', r => runColumn(s, r).model?.ligand || null],
    ['Effective temperature (°C)', r => { const T = effectiveTemperature(r, s.settings); return T.known ? T.value.toFixed(1) : null; }],
    ...CONDITION_FIELDS.map(fd => [fd.label + (fd.unit ? ` (${fd.unit})` : ''), r => knownValue(r.conditions[fd.key]) ? String(r.conditions[fd.key].value) + (fd.key==='phaseA'&&r.conditions.phaseA.note?.includes('local Solvent A convention')?' (legacy local convention; verify actual preparation)':r.conditions[fd.key].confirmed ? '' : ' (unconfirmed)') : fd.key==='phaseB'&&knownValue(r.conditions.organic)?String(r.conditions.organic.value)+(r.conditions.organic.confirmed?' (B bottle identity, not preparation)':' (unconfirmed)'):null,fd.key]),
  ];
  const renderRows=items=>items.map(([lab, get]) => {
    const vals = runs.map(get); const differ = new Set(vals.map(v => v ?? '?')).size > 1;
    return h('tr', { class: differ ? 'differs' : '' }, h('td', lab, differ ? chip('differs', 'warn') : null), vals.map(v => h('td', v ?? h('span', { class: 'small' }, 'not recorded'))));
  });
  const optional=rows.filter(x=>['additiveName','additiveConc','additiveUnit','sampleId'].includes(x[2]));
  return h('div',h('p',{class:'small'},'Not recorded means the CSV does not state it; it does not mean zero or no additive. Unconfirmed means a name-derived value still needs source review. A course bottle reference is not confirmation of this injection’s actual contents.'),table(['Condition', ...runs.map(r => r.label)],renderRows(rows.filter(x=>!optional.includes(x))),{ 'data-testid': 'condition-compare' }),details('Additional chemistry / sample information',false,table(['Condition',...runs.map(r=>r.label)],renderRows(optional))));
}
