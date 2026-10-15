import {organicOf,percentBOf,modeOf,isBlank,relevantPeaks,effectiveTemperature} from '../data-model/derive.mjs';
import {nomogramConvert} from './nomogram.mjs';
import {evaluateRun} from './gates.mjs';
import {shortRunLabel} from '../data-model/workspaces.mjs';
import {sha256} from '../data-model/ids.mjs';
// OBSERVE hypotheses, not compound-specific MeOH predictions.
export function acnReferences(s){return s.runs.filter(r=>!isBlank(r)&&modeOf(r)==='ISO'&&organicOf(r)==='ACN'&&Number.isFinite(percentBOf(r))&&relevantPeaks(r).length).map(r=>{
 const p=relevantPeaks(r),basis=p.every(x=>x.widthBase>0)?'base-width':p.every(x=>x.widthHalf>0)?'half-width':p.every(x=>x.plates>0)?'plate-gaussian':s.settings.rsBasis,g=evaluateRun(s,r,{...s.settings,rsBasis:basis}),rs=g.gates.find(x=>x.id==='minRs')?.value??null,t=effectiveTemperature(r,s.settings);
 return {runId:r.id,label:shortRunLabel(r),B:percentBOf(r),peaks:p.length,last:Math.max(...p.map(x=>x.tR)),rs:p.length===s.settings.specs.peakCount.value?rs:null,temperature:t.known?t.value:r.conditions.ovenSetpoint?.value,pressure:g.gates.find(x=>x.id==='pressure'),run:r};
 }).sort((a,b)=>(b.peaks===s.settings.specs.peakCount.value)-(a.peaks===s.settings.specs.peakCount.value)||(b.rs??-1)-(a.rs??-1)||a.last-b.last||a.runId.localeCompare(b.runId));}
export function solventSuggestions(s,sourceId=s.settings.solventPlan?.sourceRunId){
 const references=acnReferences(s),source=sourceId?references.find(x=>x.runId===sourceId):references[0],strip=({run,...x})=>x,out={references:references.map(strip),source:source?strip(source):null,candidates:[],selected:null};
 if(!source)return {...out,reason:sourceId?'Selected ACN reference is no longer eligible; select a current CSV.':'Import an ACN isocratic sample CSV to obtain reference-based MeOH hypotheses.'};
 const conversion=nomogramConvert('ACN','MeOH',source.B);if(!conversion.available)return {...out,conversion,reason:conversion.reason};
 const signature=sha256(JSON.stringify([source.runId,source.run.raw.sha256,source.run.measured,source.run.conditions,source.run.assoc,source.run.peakNotes,source.run.heightFilter,s.settings.specs,s.settings.rsBasis]));
 const centre=conversion.rounded,timeLimit=s.settings.specs.lastPeak.value,values=[...new Set([centre,...[-5,-2,-1,1,2,5].map(d=>centre+d)])].filter(B=>B>=0&&B<=100);
 out.candidates=values.map(B=>({B,fromB:source.B,sourceRunId:source.runId,to:'MeOH',planningOnly:true,signature,
  reason:B===centre?`Matched-strength starting point: ${source.B}% ACN reads ${conversion.value.toFixed(1)}% MeOH on the course nomogram; rounded to ${centre}%.`:B<centre?`Weaker-solvent probe ${centre-B} points below the matched-strength estimate; may lengthen retention. ${source.last>=timeLimit?'ACN is already near/over the time limit: weaker MeOH is especially exploratory.':'Test whether critical peaks spread; do not assume Rs improves.'}`:`Stronger-solvent probe ${B-centre} points above the matched-strength estimate; may shorten retention. Test peak count and critical-pair spacing; no MeOH tR or Rs is predicted.`,
  evidence:`${source.label}: ${source.peaks} peaks, last tR ${source.last.toFixed(3)} min, ${source.rs===null?'Rs not assessable at the target peak count':'ACN worst-pair Rs '+source.rs.toFixed(3)}. Temperature ${Number.isFinite(source.temperature)?source.temperature.toFixed(1)+' °C':source.temperature??'not established'}.`,
  checks:[...(source.pressure?.specificationPass===false||source.pressure?.operatingFailures?.length?['Source run has an operating/pressure failure; correct it before attempting the plan.']:[]),'Keep sample, column, additives and comparison temperature controlled; solvent chemistry may change peak order.','Measure full MeOH pressure trace, peak count, last tR and Rs; nomogram strength does not prove separation.']}));
 const saved=s.settings.solventPlan;out.selected=saved?.sourceRunId===source.runId&&saved?.signature===signature?out.candidates.find(x=>x.B===saved.B):null;
 return {...out,conversion,signature,reason:'Choose a matched-strength start or an explicitly exploratory bracket. These choices are not a calculated MeOH minimum or a guaranteed optimum.'};
}
