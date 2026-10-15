// Recorded responses and explicit exploration reasons, never peak identities or an optimum.
import {relevantPeaks,isBlank,organicOf,percentBOf,modeOf,runColumn,effectiveTemperature} from '../data-model/derive.mjs';
import {evaluateRun} from './gates.mjs';
import {shortRunLabel} from '../data-model/workspaces.mjs';
import {compare} from '../rules.mjs';
const present=v=>v!==null&&v!==undefined&&v!=='';
const value=(r,k)=>r.conditions[k]?.value;
const number=(v,d=3)=>Number.isFinite(v)?v.toFixed(d):'not recorded';
export function intermediateContext(s,reference){
 if(!reference||isBlank(reference)||modeOf(reference)!=='ISO'||!organicOf(reference)||!Number.isFinite(percentBOf(reference))||!relevantPeaks(reference).length)return {reference:null,records:[],similar:[],distinctCount:0};
 const solvent=organicOf(reference),model=runColumn(s,reference),T=effectiveTemperature(reference,s.settings);
 const records=s.runs.filter(r=>!isBlank(r)&&modeOf(r)==='ISO'&&organicOf(r)===solvent&&Number.isFinite(percentBOf(r))&&relevantPeaks(r).length).map(r=>{
  const differences=[],unknown=[],c=runColumn(s,r),t=effectiveTemperature(r,s.settings);
  for(const k of ['flow','pH','sampleType','sampleConc','sampleId','phaseA','mixAcnPct','additiveName','additiveConc','injVolume','wavelength']){
   const a=value(reference,k),b=value(r,k);if(present(a)&&present(b)&&a!==b)differences.push(k);else if(!present(a)||!present(b))unknown.push(k);
  }
  for(const k of ['ligand','beadFamily','lengthMm','idMm','particleUm']){const a=model.model?.[k],b=c.model?.[k];if(present(a)&&present(b)&&a!==b)differences.push('column '+k);else if(!present(a)||!present(b))unknown.push('column '+k);}
  if(model.confirmed&&c.confirmed&&model.column.id!==c.column.id)differences.push('physical column');
  if(!model.confirmed||!c.confirmed)unknown.push('physical column allocation');
  const a=value(reference,'ovenSetpoint'),b=value(r,'ovenSetpoint');
  if(present(a)&&present(b)&&a!==b)differences.push('temperature');
  if(T.known&&t.known&&Math.abs(T.value-t.value)>(s.settings.tempMatchTolerance??1))differences.push('measured temperature');
  if(!T.known||!t.known)unknown.push('measured temperature');
  if(T.stable===false||t.stable===false)differences.push('unstable temperature');
  const peaks=relevantPeaks(r),basis=peaks.every(p=>p.widthBase>0)?'base-width':peaks.every(p=>p.widthHalf>0)?'half-width':peaks.every(p=>p.plates>0)?'plate-gaussian':s.settings.rsBasis,g=evaluateRun(s,r,{...s.settings,rsBasis:basis}),rs=peaks.length===s.settings.specs.peakCount.value?g.gates.find(x=>x.id==='minRs')?.value??null:null;
  const last=Math.max(...peaks.map(p=>p.tR)),spec=s.settings.specs;
  return {runId:r.id,label:shortRunLabel(r),B:percentBOf(r),solvent,n:peaks.length,last,rs,rsBasis:basis,timeHeadroom:spec.lastPeak.value-last,timePass:compare(last,spec.lastPeak.op,spec.lastPeak.value).pass,countPass:compare(peaks.length,spec.peakCount.op,spec.peakCount.value).pass,rsPass:rs===null?null:compare(rs,spec.minRs.op,spec.minRs.value).pass,temperature:t.known?t.value:present(b)?b:null,similar:r.id===reference.id||differences.length===0,differences:[...new Set(differences)],unknown:[...new Set(unknown)],filtered:peaks.length!==r.measured.peaks.length,unsafe:g.gates.find(x=>x.id==='pressure')?.specificationPass===false||!!g.gates.find(x=>x.id==='pressure')?.operatingFailures?.length};
 }).sort((a,b)=>a.B-b.B||a.label.localeCompare(b.label));
 const similar=records.filter(x=>x.similar),ref=records.find(x=>x.runId===reference.id);
 return {reference:ref,records,similar,distinctCount:new Set(similar.map(x=>x.B)).size};
}
export function intermediateRunEvidence(r){return `${r.label}: ${r.B}% ${r.solvent}, ${r.n} peaks${r.filtered?' (after filtering)':''} (${r.countPass?'PASS':'FAIL'}), last tR ${number(r.last)} min (${r.timePass?'PASS':'FAIL'}), time headroom ${number(r.timeHeadroom)} min, ${r.rs===null?'Rs not assessable (peak count differs from target or widths are missing)':'Rs '+number(r.rs)+' ('+r.rsBasis+', '+(r.rsPass?'PASS':'FAIL')+')'}, T ${typeof r.temperature==='number'?number(r.temperature,1)+' °C':r.temperature??'not recorded'}${r.unsafe?'; a known operating limit is exceeded':''}`;}
export function intermediateEvidence(s,reference,{values=[],minB=null,upperB=100,augment=false,selectedB=null}={}){
 const context=intermediateContext(s,reference),ref=context.reference;
 if(!ref)return {...context,candidates:[],summary:'Import an isocratic sample CSV with a recorded solvent and composition first. Blank and gradient runs do not generate intermediate choices.',caution:'No measured reference: do not guess a composition.'};
 const lower=Number.isFinite(minB)?minB:0,within=B=>Number.isFinite(B)&&B>=lower&&B<=Math.min(100,upperB),same=(a,b)=>Math.abs(a-b)<1e-6;
 let options=[...values];
 if(augment){options.push(...[-2,-1,0,1,2,3].map(d=>ref.B+d),...context.similar.map(x=>x.B));const xs=[...new Set(context.similar.map(x=>x.B))].sort((a,b)=>a-b),i=xs.indexOf(ref.B);for(const neighbor of [xs[i-1],xs[i+1]])if(Number.isFinite(neighbor))options.push(Math.round((neighbor+ref.B)/2));}
 if(Number.isFinite(selectedB))options.push(selectedB);
 const candidates=[...new Set(options.filter(within))].map(B=>{
  const measured=context.records.filter(x=>same(x.B,B)),matched=measured.filter(x=>x.similar),left=ref.B<B?ref:context.similar.filter(x=>x.B<B).at(-1),right=ref.B>B?ref:context.similar.find(x=>x.B>B),bracket=left&&right&&left.B!==right.B;
  const nearest=[...context.similar].sort((a,b)=>Math.abs(a.B-B)-Math.abs(b.B-B)||a.label.localeCompare(b.label))[0]||ref;
  const sources=matched.length?matched:bracket?[left,right]:[nearest],delta=B-nearest.B;
  const status=matched.length?'Already measured · similar recorded conditions':measured.length?'Already measured · different conditions':'Untested · exploratory plan';
  let reason=matched.length?'Measured data already exist at this composition. Review them first; running it again is a repeat check, not a new composition.':bracket?`Add a trial between the measured ${left.B}% and ${right.B}% points to explore the trade-off between time and peak separation. Rs cannot be linearly predicted from these two points.`:`Starting from ${nearest.label} at ${nearest.B}%, ${delta<0?'decrease':'increase'} ${number(Math.abs(delta),2)} percentage points ${Math.abs(delta)<=2?'for a small exploratory step':'for a wider exploratory step; ±1–2 points are usually easier to interpret first'}. ${delta<0?'Check whether peak spacing or count improves; retention may become longer.':'Check whether retention becomes shorter; watch for poorer peak spacing or co-elution.'}`;
  if(!matched.length&&measured.length)reason+=' Existing measurements at this composition use different temperatures or method conditions; do not transfer their performance directly.';
  if(!matched.length&&nearest.last>=s.settings.specs.lastPeak.value*.75)reason+=` Reference last peak: ${number(nearest.last)} min; time limit: ${s.settings.specs.lastPeak.value} min. Check for a time overrun, especially when decreasing %B.`;
  if(!matched.length)reason+=' This is a reason to test, not an optimum or a guarantee of passing. Measure peak count, tR, Rs and pressure in the next run.';
  return {B,status,measuredRunIds:measured.map(x=>x.runId),sourceRunIds:sources.map(x=>x.runId),evidence:sources.map(intermediateRunEvidence),otherConditions:measured.filter(x=>!x.similar).map(x=>intermediateRunEvidence(x)+'; differences: '+x.differences.join(', ')),reason,alreadyMeasured:matched.length>0,planningOnly:true,priority:matched.length?1:bracket?0:Math.abs(B-ref.B)<=2?0:2};
 }).sort((a,b)=>a.priority-b.priority||Math.abs(a.B-ref.B)-Math.abs(b.B-ref.B)||a.B-b.B);
 const probes=[...candidates].filter(x=>!x.alreadyMeasured).sort((a,b)=>Math.abs(a.B-ref.B)-Math.abs(b.B-ref.B)||a.B-b.B).slice(0,2);
 const summary=context.distinctCount===1?`Only ${ref.B}% ${ref.solvent} has been measured under similar recorded conditions (repeat runs do not count as a second composition). ${probes.length?'Consider testing '+probes.map(x=>x.B+'%').join(' or ')+' first; see the reasons below. ':'Add a nearby composition within the allowed range first. '}Compare the critical peaks after measuring a second composition.`:`There are ${context.distinctCount} measured ${ref.solvent} compositions under similar recorded conditions. Start with trials between adjacent measured points or exploratory ±1–2-point steps. The listed run data provide evidence, not automatic confirmation of compound identity.`;
 return {...context,candidates,summary,caution:'Grouping uses recorded conditions only; missing sample identity, physical-column allocation or temperature cannot be confirmed automatically. Different runs may have different worst peak pairs; peak numbers do not establish compound correspondence. Address known exceeded limits first. A candidate is not clearance to inject.'};
}
