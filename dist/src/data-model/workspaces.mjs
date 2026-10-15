// Independent scientific sessions per cycle. Only apparatus records are shared.
import { newSession, exportSession, importSessionText } from './session.mjs';
export const WORKSPACE_STAGES = ['equipment', 'retention', 'selectivity', 'efficiency', 'gradient'];
const copy = v => JSON.parse(JSON.stringify(v));
export function createWorkspaces() {
  const workspaces = Object.fromEntries(WORKSPACE_STAGES.map(k => [k, newSession({ localLab: true })]));
  workspaces.equipment.settings.course={assessmentScope:'fc1'};
  shareCatalogue(workspaces, workspaces.equipment);
  return workspaces;
}
export function shareCatalogue(workspaces, source) {
  for (const s of Object.values(workspaces)) for (const key of ['instruments','columnModels','columns']) s[key] = source[key];
}
export function workspaceRunCount(workspaces) { return Object.values(workspaces).reduce((n,s)=>n+s.runs.length,0); }
export function exportWorkspaces(workspaces, active, snapshot = null) {
  const obj = JSON.parse(exportSession(workspaces[active], snapshot));
  obj.workspaceStage = active; obj.workspaceVersion = 1;
  obj.stageSessions = Object.fromEntries(WORKSPACE_STAGES.filter(k=>k!==active).map(k=>[k,JSON.parse(exportSession(workspaces[k]))]));
  // Stable project identity is independent of which stage is currently open.
  obj.projectId = workspaces.equipment.sessionId;
  return JSON.stringify(obj);
}
export function importWorkspaceText(text) {
  let obj; try { obj = JSON.parse(text); } catch { return importSessionText(text); }
  const base = {...obj}; for(const key of ['stageSessions','workspaceStage','workspaceVersion','projectId']) delete base[key];
  const checked = importSessionText(JSON.stringify(base)); if (!checked.ok) return checked;
  const photos=checked.session.equipmentPhotos;
  if(photos!==undefined && (!Array.isArray(photos)||photos.length>8||photos.some(p=>!p||typeof p.id!=='string'||typeof p.name!=='string'||typeof p.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.data)||p.data.length>5700000||!Array.isArray(p.annotations)||p.annotations.some(a=>typeof a.label!=='string'||!['x','y','w','h'].every(k=>Number.isFinite(a[k])&&a[k]>=0&&a[k]<=1)||a.x+a.w>1.000001||a.y+a.h>1.000001))))
    return {ok:false,errors:['Malformed local equipment photo or region annotation. Only bounded PNG/JPEG/WebP data images are allowed.'],warnings:[]};
  const workspaces = createWorkspaces();
  if (obj.workspaceVersion === undefined && obj.stageSessions === undefined) {
    workspaces.equipment = checked.session; shareCatalogue(workspaces, checked.session);
    return {...checked, workspaces, active: 'equipment', warnings: [...checked.warnings, 'Legacy shared library retained as unassigned data in Equipment. Explicitly copy selected runs to a cycle; filenames do not determine the cycle.']};
  }
  if (obj.workspaceVersion !== 1 || !WORKSPACE_STAGES.includes(obj.workspaceStage) || !obj.stageSessions || typeof obj.stageSessions !== 'object')
    return {ok:false, errors:['Malformed independent-stage workspace record.'],warnings:[]};
  const active = obj.workspaceStage;
  const keys=Object.keys(obj.stageSessions);
  if (keys.length!==4 || keys.some(k=>!WORKSPACE_STAGES.includes(k)||k===active)) return {ok:false,errors:['Stage records must contain exactly the four other workspaces.'],warnings:[]};
  workspaces[active] = checked.session;
  const warnings=[...checked.warnings];
  for (const k of keys) {
    const data=obj.stageSessions[k];
    if (data?.stageSessions || data?.workspaceVersion!==undefined) return {ok:false,errors:[`${k}: nested workspace records are not supported.`],warnings};
    const c=importSessionText(JSON.stringify(data));
    if (!c.ok) return {ok:false,errors:c.errors.map(e=>`${k}: ${e}`),warnings};
    workspaces[k]=c.session; warnings.push(...c.warnings);
    if(k!=='equipment'&&c.session.equipmentPhotos!==undefined) return {ok:false,errors:[`${k}: equipment photos belong only in Equipment.`],warnings};
    for (const field of ['instruments','columns','columnModels'])
      if (JSON.stringify(c.session[field])!==JSON.stringify(checked.session[field])) return {ok:false,errors:[`${k}: shared apparatus catalogue disagrees with the active workspace.`],warnings};
  }
  if(active!=='equipment'&&photos!==undefined)return {ok:false,errors:['Equipment photos belong only in Equipment.'],warnings};
  if(active!=='equipment'&&workspaces.equipment.equipmentPhotos!==undefined) {
    const c=importWorkspaceText(exportSession(workspaces.equipment));if(!c.ok)return c;
  }
  if (obj.projectId!==workspaces.equipment.sessionId) return {ok:false,errors:['Project identity disagrees with the Equipment workspace.'],warnings};
  shareCatalogue(workspaces, checked.session);
  return {...checked,workspaces,active,warnings};
}
// Explicit copy, never inferred from run numbers, filename tokens or peak order.
export function copyRunsToWorkspace(workspaces, from, to, ids) {
  if (from===to || !WORKSPACE_STAGES.includes(to) || to==='equipment') throw new Error('Choose another experiment stage.');
  const src=workspaces[from], dst=workspaces[to], selected=src.runs.filter(r=>ids.includes(r.id));
  const added=[];
  for(const r of selected) {
    if(dst.runs.some(x=>x.id===r.id)) continue;
    const c=copy(r); c.seq=++dst.seq; c.flags.show={equipment:true,retention:true,selectivity:true};
    dst.runs.push(c); added.push(c.id);
  }
  const compoundIds=new Set(src.assignments.filter(a=>added.includes(a.runId)).map(a=>a.compoundId));
  for(const c of src.compounds.filter(c=>compoundIds.has(c.id))) if(!dst.compounds.some(x=>x.id===c.id)) dst.compounds.push(copy(c));
  dst.assignments.push(...copy(src.assignments.filter(a=>added.includes(a.runId))));
  // Do not copy history chronology, fit settings or asserted sample equivalence.
  return added;
}
export function shortRunLabel(run) {
  if(run.nameOverrides?.group && Number.isInteger(run.nameOverrides.injectionNo))return `${run.nameOverrides.group}-${String(run.nameOverrides.injectionNo).padStart(2,'0')}`;
  const match=/\b(GR\d+)-(\d+)\b/i.exec(run.raw?.fileName||'');
  return match && (run.label===run.raw.fileName || !run.label) ? `${match[1].toUpperCase()}-${match[2]}` : run.label;
}
export function shortLabelSession(s) {
  return {...s,runs:s.runs.map(r=>({...r,label:shortRunLabel(r)}))};
}
// Display-only ordering. Never mutate acquisition chronology or fixed run IDs.
export function compareRunNumbers(a,b) {
  const key=r=>{if(/^GR\d+$/i.test(r.nameOverrides?.group||'')&&Number.isInteger(r.nameOverrides?.injectionNo))return [Number(r.nameOverrides.group.slice(2)),r.nameOverrides.injectionNo];const m=/\bGR(\d+)-(\d+)\b/i.exec(r.raw?.fileName||r.label||'');return m?[Number(m[1]),Number(m[2])]:null;};
  const x=key(a),y=key(b);
  if(x&&y)return x[0]-y[0]||x[1]-y[1]||(a.seq||0)-(b.seq||0);
  return x?-1:y?1:String(a.label||a.raw?.fileName||'').localeCompare(String(b.label||b.raw?.fileName||''),undefined,{numeric:true,sensitivity:'base'})||(a.seq||0)-(b.seq||0);
}
// Also accepts calculated rows keyed by runId/sourceRunId. Returns a fresh
// array only: calculations, chronology, original import slots and IDs are intact.
export function displayRunOrder(rows,session){
 const byId=new Map((session?.runs||[]).map(r=>[r.id,r])),resolve=x=>byId.get(x.runId||x.sourceRunId||x.id)||x;
 return [...(rows||[])].sort((a,b)=>compareRunNumbers(resolve(a),resolve(b)));
}
