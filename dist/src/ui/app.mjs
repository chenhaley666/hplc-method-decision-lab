// app.mjs — application shell: header, session actions, stage tabs, shared
// library, stage views, result panel and print report.
import { h, clear, table, chip, sourceList } from './dom.mjs';
import { store, STAGES, commit, setUi, subscribe, recompute, render, replaceSession, lookForSaved, forget, persist, switchStage, exportCurrentProject } from './state.mjs';
import { newSession } from '../data-model/session.mjs';
import { importWorkspaceText as importSessionText,shortLabelSession } from '../data-model/workspaces.mjs';
import { stageContext,peakFilterPanel } from './stage-context.mjs';
import { importPanel, runTable, autoReportPanel, downloadText } from './library.mjs';
import { equipmentView } from './equipment-view.mjs';
import { retentionView } from './retention-view.mjs';
import { selectivityView,selectivityTools } from './selectivity-view.mjs';
import { comparePanel } from './compare-view.mjs';
import { resultPanel, setsPanel } from './result-panel.mjs';
import { printReport } from './print.mjs';
import { derivedSnapshot, compareSnapshots } from './integrity.mjs';
import { REGISTER } from '../presets/bps2032.mjs';
import { stateBar, restoreBanner, updateSaveStatus } from './state-bar.mjs';
import { glossaryPanel } from './glossary.mjs';
import { retentionConclusion,selectivityPreflight } from './composition-planning.mjs';
import {courseDashboard,coursePrint,courseSession} from './course-dashboard.mjs';
import {courseEvaluation} from '../decision/course-fc1.mjs';
import {chainPanel,efficiencyPanel,gradientPanel} from './fc2-view.mjs';

const root = document.getElementById('app');

function header(st) {
  let confirmNew = st.ui.confirmNew;
  const savedInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'data-testid': 'import-session', 'aria-label': 'Open a saved FC1 JSON session', onchange: async e => {
    const fl = e.target.files[0]; e.target.value = ''; if (!fl) return;
    if (!/\.json$/i.test(fl.name)) { setUi(u => { u.message = 'This control opens .json sessions created by Export session (.json), not CSV files. Use Import experiments to choose or drop CSV files.'; }); return; }
    const current = store.session;
    try {
      const res = importSessionText(await fl.text());
      if (store.session !== current) { setUi(u => { u.message = 'The session changed while the saved file was being read. Nothing was replaced; open the file again if intended.'; }); return; }
      if (!res.ok) { setUi(u => { u.message = `Session NOT imported: ${res.errors.join(' ')}`; }); return; }
      replaceSession(res.session,res.workspaces,res.active);
      const cmp = compareSnapshots(res.snapshot, derivedSnapshot(store.evaluation));
      setUi(u => { u.importReport = null; u.autoReport = null; u.pendingGeneric = null; u.message = `Session imported (${store.session.runs.length} runs). ${cmp.note}${cmp.differences.length ? ' ' + cmp.differences.slice(0, 8).join('; ') + (cmp.differences.length > 8 ? ` … (${cmp.differences.length} differences)` : '') : ''}${res.warnings.length ? ' ' + res.warnings.join(' ') : ''}`; u.integrity = cmp; });
    } catch (err) { setUi(u => { u.message = `Session NOT imported: the file could not be read (${err.message || err}). The current session was kept.`; }); }
  } });
  return h('header', { class: 'top' },
    h('div', h('h1', 'HPLC method-development decision lab'), h('p', { class: 'sub' }, 'Chenchen Lin — 34154760 · BPS2032 · Cycle 1–4; Stock-column Efficiency search / Gradient initial module. A decision-support tool: it does not validate methods.')),
    h('div', { class: 'actions' },
      confirmNew ? h('span', h('strong', 'Discard this experiment session? '), h('button', { type: 'button', 'data-testid': 'confirm-new', onclick: () => { forget(); setUi(u => { u.confirmNew = false; u.importReport = null; u.autoReport = null; u.pendingGeneric = null; u.message = 'New blank experiment session.'; }); replaceSession(newSession({ localLab: true })); } }, 'Yes, start blank'), h('button', { type: 'button', onclick: () => setUi(u => { u.confirmNew = false; }) }, 'Cancel'))
        : h('button', { type: 'button', 'data-testid': 'new-session', onclick: () => setUi(u => { u.confirmNew = true; }) }, 'New blank session'),
      h('button', { type: 'button', 'data-testid': 'export-session', onclick: () => downloadText(`fc1-session-${new Date().toISOString().slice(0, 10)}.json`, exportCurrentProject(derivedSnapshot(store.evaluation)), 'application/json') }, 'Export session (.json)'),
      h('button', { type: 'button', 'data-testid': 'open-session-button', 'aria-describedby': 'saved-session-help', onclick: () => savedInput.click() }, 'Open saved session (.json)'), savedInput,
      h('button', { type: 'button', 'data-testid': 'print', onclick: () => { setUi(u => { u.printing = true; }); setTimeout(() => { window.print(); }, 50); } }, 'Print report'),
      h('button', { type: 'button', 'data-testid': 'glossary-toggle', onclick: () => setUi(u => { u.glossaryOpen = !u.glossaryOpen; }) }, st.ui.glossaryOpen ? 'Hide terms' : 'Terms used'),
      h('button', { type: 'button', 'data-testid': 'sources-toggle', onclick: () => setUi(u => { u.sourcesOpen = !u.sourcesOpen; }) }, st.ui.sourcesOpen ? 'Hide rules & sources' : 'Rules & sources')),
    h('p', { class: 'tiny session-help', id: 'saved-session-help', 'data-testid': 'saved-session-help' }, 'CSV files → Import experiments below. Export session (.json) saves your imported runs, equipment, settings and peak assignments together. Open saved session (.json) restores that file and replaces the current session; derived results are recalculated. It does not open CSV, PDF, ZIP or arbitrary JSON files.'));
}

function sourcesPanel() {
  return h('section', { class: 'card', 'data-testid': 'sources-panel' }, h('h3', 'Rules, teaching defaults and their sources'),
    h('details',{'data-testid':'forum-rules'},h('summary','FC1 forum reconciliation · read 14 October 2026'),
      h('p','All 34 currently listed discussions were read from the forum export. Unanswered student questions are not rules. Later teacher clarifications and the 13 October email take priority over older, contradictory pinned wording; FC2 uses the supplied nine-row map / Awesome floor.'),
      h('p',h('a',{href:'https://learning.monash.edu/mod/forum/discuss.php?d=804493',target:'_blank',rel:'noopener'},'20 September: intermediate and the half-time rule'),': a 10-point %B decrease uses the half-time-specification criterion. There is no universal 40% floor. AUC alone is not reliable peak identity; each phase/solvent/temperature needs its own compound lines.'),
      h('p',h('a',{href:'https://learning.monash.edu/mod/forum/view.php?id=6509265',target:'_blank',rel:'noopener'},'22 September: user decisions'),': optional intermediate Yes/No and measured starting-run selection belong to the user. Show peak count, last tR, worst-pair Rs, pass/fail and time headroom alongside choices. More than target peaks returns INVESTIGATE before time/Rs routing.'),
      h('p',h('a',{href:'https://learning.monash.edu/mod/forum/discuss.php?d=806992',target:'_blank',rel:'noopener'},'23 September: FC1 versus FC2'),': target peaks plus acceptable time/Rs is MET. Other target-count cases can proceed to N; an actual FC2 floor may require returning to Selectivity. Do not exhaust every temperature, solvent and ligand simply to enter N.'),
      h('p',h('a',{href:'https://learning.monash.edu/mod/forum/discuss.php?d=808786',target:'_blank',rel:'noopener'},'28 September: final OBSERVE'),': after the second-solvent temperature series, an extra temperature between 20 and 60 °C can be a user OBSERVE choice. Mixed solvent is optional. Ligand comes last and a fresh retention series belongs to the new chemistry.'),
      h('p',h('a',{href:'https://learning.monash.edu/mod/forum/discuss.php?d=809934',target:'_blank',rel:'noopener'},'28 September: future-year proposal'),': restarting at 100% after changing solvent was described as a change for next year. Current-year nomogram planning is retained; this is not a new mandatory 2026 rule.'),
      h('p','Minimum fit comparisons remain explicit user choices: the older forum permits high-%B range comparisons, while the 13 October email requires at least four points and R² ≥0.99. No three-point last-peak minimum is issued; three points in the older optional all-compound feature is a different scope.')),
    h('p', { class: 'small' }, 'Scopes: course-teaching (BPS2032 teaching material), assessment (FC1 rubric), course-example (an example, not a rule), project (a team/user choice), tool-default (chosen for this application), general (chromatographic relationship). Team notebooks and the team SOP are example evidence; they never become universal rules.'),
    table(['Rule / default', 'Value', 'Scope', 'Detail', 'Sources', 'Conflicts'], REGISTER.map(r => h('tr', h('td', r.label), h('td', r.value === undefined ? '' : `${r.op ? r.op + ' ' : ''}${Array.isArray(r.value) ? r.value.join(', ') : r.value}${r.unit ? ' ' + r.unit : ''}`), h('td', chip(r.scope, `scope-${r.scope}`)), h('td', { class: 'small' }, r.detail || ''), h('td', sourceList(r.sources)), h('td', { class: 'small warn' }, (r.conflicts || []).map(c => h('div', `${c.text} → ${c.resolution}`)))))));
}

function fc2(stage) {
  const s=courseSession(),e=courseEvaluation(s);
  return h('div', { class: 'stage', 'data-testid': `stage-${stage.id}` }, h('p',{'data-testid':'fc2-status'},'Initial module · shared Dashboard specifications and current reference'),chainPanel(s,e),stage.id==='efficiency'?efficiencyPanel(s,e):gradientPanel(s,e));
}

function main(st) {
  const nav=h('nav',{class:'tabs stages',role:'tablist'},h('button',{type:'button',role:'tab','aria-selected':st.ui.courseDashboard?'true':'false',class:st.ui.courseDashboard?'active':'','data-testid':'stage-tab-dashboard',onclick:()=>{switchStage('equipment');setUi(u=>{u.courseDashboard=true;});}},'Dashboard · Cycle 1–4'),STAGES.map(x=>h('button',{type:'button',role:'tab','aria-selected':!st.ui.courseDashboard&&st.ui.stage===x.id?'true':'false',class:!st.ui.courseDashboard&&st.ui.stage===x.id?'active':'','data-testid':`stage-tab-${x.id}`,onclick:()=>switchStage(x.id)},x.id==='retention'||x.id==='selectivity'?`Expert ${x.label}`:x.label)));
  if(st.ui.courseDashboard)return h('main',{class:'maincol catalogue-layout'},nav,st.ui.sourcesOpen?sourcesPanel():null,st.ui.glossaryOpen?glossaryPanel():null,h('p',{class:st.ui.save.reason?'banner warn':'tiny','data-testid':'course-save-status'},st.ui.save.reason||`Browser save: ${st.ui.save.state||'no experiments yet'}. Export session to keep a portable copy.`),courseDashboard(st));
  const stage = STAGES.find(x => x.id === st.ui.stage) || STAGES[0];
  const display={...st,session:shortLabelSession(st.session)};
  const view = stage.fc2 ? fc2(stage) : stage.id === 'equipment' ? equipmentView(st) : stage.id === 'retention' ? retentionView(display) : selectivityView(display);
  return h('div', { class: stage.id==='equipment'||stage.id==='retention'||stage.fc2?'layout catalogue-layout':'layout' },
    h('main', { class: 'maincol' },
      nav,
      st.ui.sourcesOpen ? sourcesPanel() : null,
      stage.id==='equipment' ? null : stageContext(st),
      stage.id==='equipment'||stage.fc2 ? null : stateBar(st),
      stage.id==='selectivity'?h('div',selectivityPreflight(display)):null,
      stage.id==='equipment' ? (st.session.runs.length ? runTable(st) : null) : h('div',importPanel(st),autoReportPanel(st),runTable(st),stage.id==='selectivity'?selectivityTools(display):null,peakFilterPanel(st), stage.fc2?null:comparePanel(display,stage.id)),
      stage.id==='retention'?retentionConclusion(display):null,
      view,
      stage.id==='retention'?h('div',resultPanel(st),st.ui.libraryAdvanced?detailsForSets(st):null):null,
      st.ui.glossaryOpen ? glossaryPanel() : null),
    stage.id==='equipment'||stage.id==='retention'||stage.fc2?null:h('aside', { class: 'sidecol' }, resultPanel(st), setsPanel(st)));
}
function detailsForSets(st) {return h('details',{class:'fold'},h('summary','Active analysis sets'),setsPanel(st));}

function draw(st, options = {}) {
  if(options.saveOnly&&st.ui.courseDashboard){const el=root.querySelector('[data-testid="course-save-status"]');if(el){el.replaceChildren(document.createTextNode(st.ui.save.reason||`Browser save: ${st.ui.save.state||'no experiments yet'}. Export session to keep a portable copy.`));el.className=st.ui.save.reason?'banner warn':'tiny';return;}}
  if (options.saveOnly && updateSaveStatus(st, root)) return;
  const active = document.activeElement; const tid = active?.dataset?.testid; const pos = active && 'selectionStart' in active ? active.selectionStart : null;
  // Keep open calculation/help folds while a field change redraws the page.
  // Otherwise the calculator disappears after entering its first coefficient.
  const foldKey=d=>{const row=d.closest('[data-run],[data-detail-run]');return (row?(row.dataset.run||row.dataset.detailRun)+':':'')+(d.dataset.testid||d.querySelector(':scope > summary')?.textContent);};
  const openFolds=new Set([...root.querySelectorAll('details[open]')].map(foldKey));
  const y = window.scrollY;
  clear(root);
  root.appendChild(header(st));
  if (st.ui.message) root.appendChild(h('div', { class: 'message', role: 'status', 'data-testid': 'message' }, st.ui.message, ' ', h('button', { type: 'button', onclick: () => setUi(u => { u.message = null; }) }, 'dismiss')));
  if (st.ui.storageWarning) root.appendChild(h('p', { class: 'banner warn', 'data-testid': 'storage-warning' }, 'This session could not be kept in this browser\'s storage (too large or storage blocked). The open session is intact: use "Export session" to keep it in a file.'));
  const rb = restoreBanner(st,
    selected => { const candidate = selected || st.ui.savedFound; const txt = candidate?.text;
      if (!txt) { setUi(u => { u.message = 'No validated stored copy has been selected. Nothing was restored.'; }); return; }
      const res = importSessionText(txt);
      if (!res.ok) { setUi(u => { u.message = `The stored session was NOT restored: ${res.errors.join(' ')}`; u.savedFound = null; }); return; }
      setUi(u => { u.savedFound = null; u.rev = candidate.revision ?? 0; });
      replaceSession(res.session,res.workspaces,res.active);
      const cmp = compareSnapshots(res.snapshot, derivedSnapshot(store.evaluation));
      setUi(u => { u.message = `Restored the selected ${candidate.where} session (${store.session.runs.length} runs). ${cmp.note}${res.warnings.length ? ' ' + res.warnings.join(' ') : ''}`; u.integrity = cmp; }); },
    () => { setUi(u => { u.savedFound = null; }); });
  if (rb) root.appendChild(rb);
  if(!Object.values(st.workspaces).some(s=>s.runs.length))root.appendChild(h('section',{class:'card','data-testid':'first-experiment-guide'},h('h2','Start your first experiment'),h('p','Use the three numbered steps on the Dashboard: specifications → your instrument and column → your first CSV. No previous group experiments are required. Equipment contains detailed operating references; choosing equipment never marks an experiment performed.')));
  root.appendChild(main(st));
  for(const d of root.querySelectorAll('details'))if(openFolds.has(foldKey(d)))d.open=true;
  const rep = document.getElementById('print-root'); clear(rep); rep.appendChild(st.ui.courseDashboard?coursePrint(st):printReport({...st,session:shortLabelSession(st.session)}));
  if (tid) { const el = root.querySelector(`[data-testid="${CSS.escape(tid)}"]`); if (el && el !== document.body) { el.focus(); if (pos !== null && 'setSelectionRange' in el) { try { el.setSelectionRange(pos, pos); } catch { /* not a text input */ } } } }
  window.scrollTo(0, y);
}

subscribe(draw);
// A misplaced file drop must not navigate away and discard the open session.
for (const name of ['dragover', 'drop']) window.addEventListener(name, e => {
  if ([...(e.dataTransfer?.types || [])].includes('Files')) {
    e.preventDefault();
    if (name === 'drop') setUi(u => { u.message = 'To import these files, drop them inside the CSV box under Import experiments. No files were imported from this location.'; });
  }
});
window.addEventListener('afterprint', () => setUi(u => { u.printing = false; }));
recompute(); render();
// A stored session is offered, never applied: see restoreBanner.
lookForSaved();
window.__fc1 = { store, commit, setUi, persist, lookForSaved, switchStage,exportCurrentProject };
