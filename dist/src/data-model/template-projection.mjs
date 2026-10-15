// Pure projection of recorded data and recomputed course decisions into STU_084.
import {solventSuggestions} from '../selectivity/solvent-plan.mjs';
import {TAGGED_TEMPLATE,TEMPLATE_ORIGIN} from '../presets/tagged-template.mjs';
import {knownValue} from './conditions.mjs';
import {runColumn,relevantPeaks} from './derive.mjs';
import {toPsi} from '../rules.mjs';

export const templateSlot=i=>'R'+String(i+1).padStart(2,'0');
const finite=v=>Number.isFinite(v)?v:null;
export function peakResponse(p){
 const exportedN=p.plates>0?finite(p.plates):null;
 const N=exportedN??(p.widthBase>0?16*(p.tR/p.widthBase)**2:p.widthHalf>0?5.54*(p.tR/p.widthHalf)**2:null);
 const W=p.widthBase>0?p.widthBase:exportedN?4*p.tR/Math.sqrt(exportedN):null;
 return {no:p.no,tR:p.tR,height:finite(p.height),W,N,widthBasis:p.widthBase>0?'Measured/exported base width':exportedN?'Gaussian-equivalent base width from exported N':'Base width not available',nBasis:exportedN?'Exported N':p.widthBase>0?'16(tR/Wb)²':p.widthHalf>0?'5.54(tR/Wh)²':'N not available'};
}
function projectTemplateRecord(s,e){
 const decisions=new Map(e.decisions.map(d=>[d.runId,d]));
 const rows=s.runs.map((r,i)=>{
  const d=decisions.get(r.id),m=runColumn(s,r).model,c=r.conditions,v=k=>knownValue(c[k])?c[k].value:null;
  const core=m?.particleType?/SPP|superficially|core.shell/i.test(m.particleType)?'yes':/FPP|fully.porous/i.test(m.particleType)?'no':null:null;
  const parameters={ligand:m?.ligand??null,bead:m?.beadFamily??null,coreshell:core,pore:m?.poreA??null,carbon:m?.carbonPct??null,length:m?.lengthMm??null,diameter:m?.idMm??null,particle:m?.particleUm??null,organic:v('organic'),percentB:v('percentB'),flow:v('flow'),concentration:v('sampleConc'),temperature:v('ovenSetpoint'),wavelength:v('wavelength')};
  const measuredTemp=finite(r.measured.oven?.window?.mean)??finite(r.measured.oven?.mean);
  const conditions=['ligand','bead','coreshell','pore','carbon','length','diameter','particle','organic','percentB','flow','concentration','temperature','wavelength'].map(k=>parameters[k]);
  const peaks=relevantPeaks(r).map(peakResponse);
  const originalPressure=r.measured.pressure,converted=toPsi(originalPressure?.max,originalPressure?.unit),pressurePsi=converted.ok?converted.psi:null;
  const dashboard=[templateSlot(i),...conditions,measuredTemp,d?.n??null,d?.last??null,d?.rs??null,pressurePsi,'',d?.status??null];
  const engine=[templateSlot(i),d?.dataRole??null,...conditions,d?.n??null,d?.last??null,d?.rs??null,pressurePsi,measuredTemp,d?.status??null,...Array.from({length:10},(_,j)=>peaks[j]?[peaks[j].tR,peaks[j].W,peaks[j].N]:[null,null,null]).flat()];
  return {slot:templateSlot(i),sourceRunId:r.id,sourceFile:r.raw.fileName,rawSha256:r.raw.sha256,dashboard,engine,parameters,peaks,originalPeaks:r.measured.peaks.map(peakResponse),excludedOriginalPeakNos:r.measured.peaks.filter(p=>!peaks.some(x=>x.no===p.no)).map(p=>p.no),heightFilter:r.heightFilter??null,peakAnnotations:r.peakNotes??{},allPeaksIncluded:peaks.length===r.measured.peaks.length,pressure:{originalMax:finite(originalPressure?.max),originalUnit:originalPressure?.unit??null,source:originalPressure?.source??null,psi:pressurePsi,conversionKnown:converted.ok},decision:{status:d?.status,action:d?.action,reason:d?.reason,policy:d?.policy,evidence:d?.evidence??null},omittedFromEngineView:Math.max(0,peaks.length-10)};
 });
 const blankRows=(kind,columns)=>Array.from({length:30},(_,i)=>rows[i]?.[kind]??[templateSlot(i),...Array(columns.length-1).fill(null)]);
 const current=rows.find(r=>r.sourceRunId===e.current?.runId);
 const pad=kind=>blankRows(kind,TAGGED_TEMPLATE[kind==='dashboard'?'dashboard':'engine'].columns);
 const model=e.model||{},retentionModel={scope:'Retention last-peak reference only; not an automatically optimal separation or a changed-solvent minimum',selection:model.selected?.label??null,fit:model.fit?.ok?{slope:model.fit.slope,intercept:model.fit.intercept,r2:model.fit.r2}:null,minimumB:model.calculation?.B??null,qualityPass:!!model.qualityPass,qualified:!!model.qualified,confirmed:!!model.confirmed,meanT0:model.meanT0??null,estimatedT0:!!model.estimated,signature:model.signature??null,reason:model.reason??null,points:(model.points||[]).map(p=>({sourceRunId:p.runId,label:p.label,percentB:p.x,lastTR:p.lastTR,t0:p.t0,logK:p.y,t0Basis:p.basis})),excludedFromFit:(model.exclusions||[]).map(p=>p.runId)};
 retentionModel.minimumB=model.qualified?model.calculation.B:null;
 retentionModel.selectionNote=s.settings.course?.fitSelectionNote??'All eligible points by default';
 retentionModel.comparisons=(model.candidates||[]).map(c=>({selection:c.label,runIds:c.points.map(p=>p.runId),pointCount:c.points.length,r2:c.fit?.r2??null,criterionPass:!!c.pass,minimumB:c.pass&&c.calculation?.ready?c.calculation.B:null}));
 retentionModel.intermediatePlanning=e.intermediate??null;
 return {template:TEMPLATE_ORIGIN,logicBasis:TAGGED_TEMPLATE.logicBasis,fc2Basis:'Initial modules: FC2_N_RUBRIC_261008b, Awesome Calculator 260914; Gradient Discovery Book §1.4. Bounded exhaustive recorded-stock × flow search added; no compound-gradient predictor.',cycleChain:e.chain,nextPlanned:e.nextPlanned,efficiency:e.current?.efficiency??null,solventPlanning:solventSuggestions(s),gradient:e.current?.gradient??null,retentionModel,currentDecision:e.current?{sourceRunId:e.current.runId,status:e.current.status,action:e.current.action,dataRole:e.current.dataRole,modelApplicable:e.current.modelApplicable}:null,specificationCells:Object.fromEntries(TAGGED_TEMPLATE.specs.map(p=>[p.cell,{...s.settings.specs[p.key],label:p.label,unit:p.unit}])),currentParameterCells:Object.fromEntries(TAGGED_TEMPLATE.parameters.map(p=>[p.cell,{value:current?.parameters[p.key]??null,label:p.label,unit:p.unit}])),dashboard:{range:TAGGED_TEMPLATE.dashboard.range,headers:TAGGED_TEMPLATE.dashboard.columns.map(x=>x.label),rows:pad('dashboard')},engine:{range:TAGGED_TEMPLATE.engine.range,headers:TAGGED_TEMPLATE.engine.columns.map(x=>x.label),rows:pad('engine')},runs:rows,overflowRuns:rows.slice(30).map(x=>x.sourceRunId),note:'Derived export snapshot: recalculated from raw data/settings. Missing values remain null. Minimum/R² and planned conditions are separate reference metadata, not substituted into measured grading columns. Fixed template view: 30 slots and ten peak triples; complete run/peak records remain in this file and session. No original workbook, raw hidden tag or private photo is published.'};
}
export function templateRecord(s,e){const record=projectTemplateRecord(s,e);record.specificationCells.C11.label='Measured back-pressure';return record;}
export function templateCsv(headers,rows){const q=x=>{const t=typeof x==='string'&&/^[=+@-]/.test(x)?"'"+x:String(x??'');return '"'+t.replaceAll('"','""')+'"';};return [headers,...rows].map(row=>row.map(q).join(',')).join('\n');}
