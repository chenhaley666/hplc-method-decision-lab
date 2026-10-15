// state.mjs — the single in-browser store. The session is the only scientific
// state; ui holds view preferences. Every change goes through commit(), which
// recomputes the evaluation from the session (derived results are never
// edited directly) and re-renders.
import { newSession, exportSession } from '../data-model/session.mjs';
import { evaluateSession } from '../decision/evaluate.mjs';
import { save as saveToBrowser, findSaved, clearSaved, SAVE } from './persistence.mjs';
import { createWorkspaces, exportWorkspaces, shareCatalogue, workspaceRunCount, shortLabelSession } from '../data-model/workspaces.mjs';
import {applyWaterConvention} from '../presets/local-lab.mjs';

export const STAGES = [
  { id: 'equipment', label: 'Equipment' },
  { id: 'retention', label: 'Retention' },
  { id: 'selectivity', label: 'Selectivity' },
  { id: 'efficiency', label: 'Efficiency — FC2', fc2: true },
  { id: 'gradient', label: 'Gradient — FC2', fc2: true },
];

const listeners = new Set();
const workspaces = createWorkspaces();
export const store = {
  workspaces,
  session: workspaces.equipment,
  evaluation: null,
  ui: { stage: 'equipment', courseDashboard:true, selected: new Set(), filter: { text: '', format: '', solvent: '', flag: '' }, detailRunId: null, detailTab: 'conditions',
    chart: { mode: 'overlay', align: 'original', alignCompound: null, xMin: null, xMax: null, hidden: new Set() }, importReport: null, autoReport: null,
    pendingGeneric: null, message: null, sourcesOpen: false, inspect: null,
    // save state is part of the interface: a failed write is never silent
    save: { state: null, savedAt: null, where: null, reason: null, runs: 0, bytes: 0, revision: null },
    // every committed change bumps the revision, so a save can be reported
    // against the revision it actually holds and can never be described as
    // current when a later change is unsaved
    rev: 0,
    savedFound: null, defineTerm: null },
};

export function recompute() {
  const reference=store.ui.stage==='selectivity'?evaluateSession(shortLabelSession(store.workspaces.retention)):null;
  store.evaluation = evaluateSession(shortLabelSession(store.session),{stage:store.ui.stage,retentionReference:reference?{sessionId:store.workspaces.retention.sessionId,analysis:reference.retention,worksheet:reference.worksheet}:null});
}
const stageViews = {};
const VIEW_KEYS = ['selected','filter','detailRunId','detailTab','chart','importReport','autoReport','pendingGeneric','importOpts','sampleIdDraft','sampleBasisDraft','metadataDrafts','profileSourceDrafts','profileReviewOpen','libraryAdvanced','advancedCompoundOpen','compoundGuideOpen','compoundGuideRunId','retentionCalculatorOpen','worksheetT0Open','worksheetRowEdit','worksheetReviewOpen','heightRowDrafts','progressionExpert','specsExpert','importExpert'];
export function switchStage(stage) {
  if (!store.workspaces[stage]) return;
  if (store.ui.importBusy || store.ui.pendingGeneric?.length) { store.ui.message='Finish or cancel the current import before switching stages.'; render(); return; }
  stageViews[store.ui.stage]=Object.fromEntries(VIEW_KEYS.map(k=>[k,store.ui[k]]));
  store.ui.stage=stage; store.ui.courseDashboard=false;store.session=store.workspaces[stage];
  Object.assign(store.ui,{selected:new Set(),filter:{text:'',format:'',solvent:'',flag:''},detailRunId:null,detailTab:'conditions',chart:{mode:'overlay',align:'original',alignCompound:null,xMin:null,xMax:null,hidden:new Set()},importReport:null,autoReport:null,pendingGeneric:null,importOpts:undefined,sampleIdDraft:'',sampleBasisDraft:'',metadataDrafts:{},profileSourceDrafts:{},profileReviewOpen:{},libraryAdvanced:false,advancedCompoundOpen:false,retentionCalculatorOpen:false,worksheetT0Open:false,worksheetRowEdit:false,worksheetReviewOpen:false,heightRowDrafts:{},progressionExpert:false,specsExpert:false,importExpert:false},stageViews[stage]||{});
  store.ui.rev++; recompute(); persist(); render();
}
export function exportCurrentProject(snapshot=null) { return exportWorkspaces(store.workspaces,store.ui.stage,snapshot); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let rendering = false, renderPending = null, followUpQueued = false;
export function render(options = {}) {
  // Removing/replacing a focused control can synchronously dispatch change or
  // blur. Its handler may commit the latest value and request another render.
  // Keep that state change, but never draw recursively into half-cleared DOM.
  const request = { saveOnly: options.saveOnly === true };
  if (rendering) {
    // A scientific/full update always wins over a status-only notification.
    renderPending = renderPending ? { saveOnly: renderPending.saveOnly && request.saveOnly } : request;
    return;
  }
  if (renderPending) request.saveOnly = renderPending.saveOnly && request.saveOnly;
  rendering = true; renderPending = null;
  try { for (const fn of listeners) fn(store, request); }
  finally {
    rendering = false;
    if (renderPending && !followUpQueued) {
      followUpQueued = true;
      queueMicrotask(() => {
        followUpQueued = false;
        // An intervening ordinary render may already have shown the update.
        if (renderPending) { const pending = renderPending; renderPending = null; render(pending); }
      });
    }
  }
}
export function commit(mutator, { save = true } = {}) {
  if (mutator) { mutator(store.session, store.ui); store.ui.rev = (store.ui.rev || 0) + 1; }
  for(const session of Object.values(store.workspaces))applyWaterConvention(session);
  shareCatalogue(store.workspaces,store.session);
  recompute();
  if (save) persist();
  render();
}
export function setUi(mutator) { mutator(store.ui); render(); }
export function replaceSession(session, workspaces=null, active='equipment') {
  store.workspaces=workspaces||createWorkspaces();
  if (!workspaces) { store.workspaces.equipment=session; shareCatalogue(store.workspaces,session); }
  for(const key of Object.keys(stageViews)) delete stageViews[key];
  store.ui.stage=active; store.ui.courseDashboard=active==='equipment';store.session=store.workspaces[active];
  store.ui.selected=new Set(); store.ui.filter={text:'',format:'',solvent:'',flag:''}; store.ui.detailRunId=null;
  store.ui.importReport=null;store.ui.autoReport=null;store.ui.pendingGeneric=null;store.ui.importOpts=undefined;
  store.ui.compoundBridgeIds=[];store.ui.compoundGuideOpen=false;
  store.ui.savedFound=null;store.ui.rev++;commit(null);
}

// Saving is asynchronous (IndexedDB). The status goes to "saving", then to
// "saved" or to an unmistakable "NOT SAVED" carrying the reason.
let saveSeq = 0;
export function persist() {
  if (store.ui.saveOff) { store.ui.save = { state: SAVE.off }; render({ saveOnly: true }); return Promise.resolve(store.ui.save); }
  const seq = ++saveSeq;
  const rev = store.ui.rev || 0;
  const runs = workspaceRunCount(store.workspaces);
  let text;
  try { text = exportCurrentProject(); }
  catch (e) { store.ui.save = { state: SAVE.failed, reason: `The session could not be serialised: ${e?.message || e}`, runs }; render({ saveOnly: true }); return Promise.resolve(store.ui.save); }
  store.ui.save = { ...store.ui.save, state: SAVE.saving, runs, revision: rev };
  const p = saveToBrowser(text, { runs, label: `${runs} run(s)`, revision: rev }).then(res => {
    if (seq !== saveSeq) return store.ui.save;   // a newer save has started; its result decides
    const current = store.ui.rev || 0;
    store.ui.save = res.ok
      ? (rev === current
        ? { state: SAVE.saved, savedAt: res.savedAt, where: res.where, runs, bytes: res.bytes, note: res.note || null, reason: null, revision: rev }
        : { state: SAVE.stale, savedAt: res.savedAt, where: res.where, runs, bytes: res.bytes, revision: rev, currentRevision: current,
            reason: 'A later change has not been written yet. Use "Export session" if you need it kept now.' })
      : { state: SAVE.failed, reason: res.reason, runs, bytes: res.bytes, revision: rev };
    // kept for the older banner in the shell
    store.ui.storageWarning = !res.ok;
    render({ saveOnly: true });
    return store.ui.save;
  });
  render({ saveOnly: true });
  return p;
}

// Look for a saved session. It is NEVER restored by this function: the caller
// shows what was found and the user chooses.
export async function lookForSaved() {
  const found = await findSaved();
  // Preserve cross-store selection reasons and rejected-copy issues for the
  // restore banner. Reducing this to the first text would hide conflicts.
  store.ui.savedFound = found.found ? found : null;
  render();
  return store.ui.savedFound;
}

export function forget() { store.ui.savedFound = null; return clearSaved(); }
export { SAVE };
