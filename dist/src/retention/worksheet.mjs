// Workbook-style last-peak line, separate from compound identification.
// Automatic preview never promotes peak position, geometry or R² to identity.
import {linearFit,retentionFactor,columnVolumeT0} from '../rules.mjs';
import {knownValue,usable} from '../data-model/conditions.mjs';
import {relevantPeaks,isBlank,t0Of,runColumn,effectiveTemperature} from '../data-model/derive.mjs';
import {lastPeakCalculation} from './planning.mjs';
import {sha256} from '../data-model/ids.mjs';
import {projectR2} from './fit.mjs';
export const WORKSHEET_TARGET=.995;
export function worksheetSettings(input){
 const text=v=>typeof v==='string'?v:'',number=v=>Number.isFinite(v)?v:null,c=input&&typeof input==='object'?input:{};
 return {groupKey:text(c.groupKey),sharedT0:number(c.sharedT0),t0Basis:text(c.t0Basis),reviewBasis:text(c.reviewBasis),confirmedSignature:text(c.confirmedSignature),
  rows:Object.fromEntries(Object.entries(c.rows&&typeof c.rows==='object'?c.rows:{}).map(([id,r])=>[id,{t0:number(r?.t0),t0Basis:text(r?.t0Basis),exclude:r?.exclude===true,reason:text(r?.reason)}]))};
}
function groupOf(s,r){
 const c=r.conditions,col=runColumn(s,r).model;
 const v=k=>usable(c[k])?c[k].value:null;
 const geometry=col?[col.ligand,col.beadFamily,col.lengthMm,col.idMm,col.particleUm]:null;
 const core=[v('organic'),v('mode'),v('flow'),v('pH'),v('sampleType'),v('sampleConc'),geometry,v('ovenSetpoint'),v('sampleId'),v('phaseA'),v('phaseB'),v('additiveName'),v('additiveConc'),v('additiveUnit'),v('injVolume'),v('wavelength'),r.assoc.columnId?.confirmed?r.assoc.columnId.value:null];
 const missing=['organic','mode','flow','sampleType'].filter(k=>v(k)===null);
 if(!geometry||!geometry.slice(2).every(Number.isFinite))missing.push('column geometry');
 return {key:missing.length?'unresolved:'+r.id:JSON.stringify(core),label:`${v('organic')||'solvent not recorded'} · ${col?.product||'column not recorded'} · ${v('ovenSetpoint')??'temperature not recorded'} · ${v('sampleType')||'sample not recorded'}`,missing};
}
export function worksheetModel(s){
 const cfg=worksheetSettings(s.settings.worksheet),chosen=s.runs.filter(r=>r.flags.fit&&!isBlank(r));
 const input=chosen.length?chosen:s.runs.filter(r=>r.flags.show.retention!==false&&!isBlank(r));
 const map=new Map();for(const r of input){const g=groupOf(s,r);if(!map.has(g.key))map.set(g.key,{...g,runs:[]});map.get(g.key).runs.push(r);}
 const groups=[...map.values()].sort((a,b)=>new Set(b.runs.map(r=>r.conditions.percentB?.value)).size-new Set(a.runs.map(r=>r.conditions.percentB?.value)).size||a.key.localeCompare(b.key));
 const group=groups.find(g=>g.key===cfg.groupKey)||groups[0];
 if(!group)return {ok:false,qualified:false,groups,rows:[],reason:'Import a Retention %B series. Blank runs are not fitted.'};
 const rows=group.runs.map(r=>{
  const peaks=relevantPeaks(r),last=peaks.reduce((a,p)=>!a||p.tR>a.tR?p:a,null),override=cfg.rows?.[r.id]||{};
  let t0=null,basis='',estimate=false;
  if(Number.isFinite(override.t0)&&override.t0<=0||Number.isFinite(cfg.sharedT0)&&cfg.sharedT0<=0){basis='Entered t0 must be greater than zero; invalid input is not replaced with an estimate.';}
  else if(Number.isFinite(override.t0)&&override.t0>0&&override.t0Basis?.trim()){t0=override.t0;basis=override.t0Basis;}
  else if(Number.isFinite(cfg.sharedT0)&&cfg.sharedT0>0&&cfg.t0Basis?.trim()){t0=cfg.sharedT0;basis=cfg.t0Basis;}
  else {const existing=t0Of(s,r,s.settings);
   if(existing.ok&&!existing.proxy){t0=existing.t0;basis=existing.text;estimate=!!existing.estimate;}
   else if((r.marker?.method||'none')!=='none'||s.assignments.some(a=>a.runId===r.id&&a.state==='confirmed'&&s.compounds.some(c=>c.id===a.compoundId&&c.role==='marker'))){basis=existing.text;}
   else {const m=runColumn(s,r).model,e=columnVolumeT0(m?.lengthMm,m?.idMm,usable(r.conditions.flow)?r.conditions.flow.value:null);if(e.ok){t0=e.t0;basis='Column-volume estimate: '+e.formula;estimate=true;}else basis=e.reason;}
  }
  const B=usable(r.conditions.percentB)?r.conditions.percentB.value:null;
  const k=last&&Number.isFinite(t0)?retentionFactor(last.tR,t0):null;
  const pendingExclusion=override.exclude===true&&!override.reason?.trim(),excluded=override.exclude===true&&!!override.reason?.trim(),reasons=[];
  if(group.missing.length)reasons.push('Missing '+group.missing.join(', '));
  if(!last)reasons.push('No retained peak after exclusions; no timing point');
  if(last&&r.peakNotes?.[last.no]?.coeluted)reasons.push('Last retained peak is marked co-eluted; it cannot define a clean single-compound line.');
  if(B===null)reasons.push('%B is missing/unconfirmed');
  if(r.conditions.mode?.value!=='ISO')reasons.push('Isocratic model only');
  if(!usable(r.conditions.flow)||!Number.isFinite(r.conditions.flow.value)||r.conditions.flow.value<=0)reasons.push('A confirmed positive flow rate is required.');
  if(/^mix/i.test(String(r.conditions.organic?.value)))reasons.push('Mix model not defined');
  if(!k?.ok)reasons.push(k?.reason||basis||'Supply t0');
  const T=effectiveTemperature(r,s.settings);
  return {runId:r.id,label:r.label,B,lastTR:last?.tR??null,peakNo:last?.no??null,t0,basis,estimate,logK:k?.ok?k.logK:null,k:k?.ok?k.k:null,
   included:!excluded&&reasons.length===0,excluded,pendingExclusion,exclusionReason:override.reason||'',reasons,temperatureKnown:T.known,temperatureValue:T.value,temperatureReason:T.reason};
 }).sort((a,b)=>(b.B??-1)-(a.B??-1)||a.label.localeCompare(b.label));
 const points=rows.filter(r=>r.included).map(r=>({...r,x:r.B,y:r.logK})),fit=linearFit(points);
 // Match workbook D26: mean available t0 values, including explicitly excluded
 // regression points. They remain visible in the calculation table.
 const t0s=rows.filter(r=>Number.isFinite(r.t0)).map(r=>r.t0),meanT0=t0s.length?t0s.reduce((a,b)=>a+b,0)/t0s.length:null;
 const out=fit.ok&&fit.r2!==null?lastPeakCalculation({t0:meanT0,slope:fit.slope,intercept:fit.intercept,r2:fit.r2},{...s.settings,r2Policy:{mode:'project'}}):null;
 const temperatures=points.filter(p=>p.temperatureKnown).map(p=>p.temperatureValue),tempMismatch=temperatures.length>1&&Math.max(...temperatures)-Math.min(...temperatures)>s.settings.tempMatchTolerance;
 const signature=sha256(JSON.stringify({r2Convention:'user-project-round-3-decimals',key:group.key,rows:rows.map(r=>[r.runId,r.B,r.peakNo,r.lastTR,r.t0,r.basis,r.estimate,r.included,r.pendingExclusion,r.exclusionReason,r.temperatureKnown,r.temperatureValue]),temperatureTolerance:s.settings.tempMatchTolerance,spec:s.settings.specs.lastPeak}));
 const minPoints=Math.max(3,s.settings.minFitPoints||3),qualityPass=fit.ok&&projectR2(fit.r2)!==null&&projectR2(fit.r2)>=WORKSHEET_TARGET&&fit.slope<0&&new Set(points.map(p=>p.x)).size>=minPoints;
 const review=cfg.confirmedSignature===signature&&!!cfg.reviewBasis?.trim();
 const evidenceReady=review&&!tempMismatch&&!rows.some(r=>r.pendingExclusion)&&points.every(p=>!p.estimate&&p.temperatureKnown);
 const qualified=qualityPass&&out?.ready&&evidenceReady;
 const blockers=[];
 if(!fit.ok)blockers.push(fit.reason);
 else {if(new Set(points.map(p=>p.x)).size<minPoints)blockers.push(`Need at least ${minPoints} distinct %B values; two-point R² = 1 is not sufficient.`);if(!(fit.slope<0))blockers.push('Slope must be negative.');if(projectR2(fit.r2)===null||projectR2(fit.r2)<WORKSHEET_TARGET)blockers.push(`R² ${fit.r2??'undefined'} rounds to ${projectR2(fit.r2)??'undefined'} (3 decimals), below 0.995 under the user-confirmed project convention.`);}
 if(points.some(p=>p.estimate))blockers.push('t0 is estimated, not measured. Enter a documented t0 or confirm the hold-up marker.');
 if(points.some(p=>!p.temperatureKnown))blockers.push('Some column temperatures are not established: review the recorded temperature/stability before relying on this fit.');
 if(tempMismatch)blockers.push(`Recorded temperatures differ by more than the ${s.settings.tempMatchTolerance} °C comparison tolerance. Do not pool these conditions as a %B-only model.`);
 if(rows.some(r=>r.pendingExclusion))blockers.push('An exclusion has no reason: the point remains in the preview and qualification is blocked until the reason is recorded or the exclusion is withdrawn.');
 if(!review)blockers.push('Confirm from your experimental record that these points follow the same last-eluting compound, sample and physical column under comparable conditions.');
 return {ok:fit.ok,qualified,qualityPass,groups,groupKey:group.key,rows,points,fit,meanT0,calculation:out,signature,review,spec:{...s.settings.specs.lastPeak},reason:blockers.join(' '),scope:'Last-peak line only. It does not identify peaks or establish all-compound coverage.'};
}
