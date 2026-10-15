// FC1 announcement 13 Oct 2026 + Cycle 4 combination map, slide 26.
// Course routing is separate from operating clearance and the expert engine.
import {relevantPeaks,isBlank,percentBOf,organicOf,effectiveTemperature,runColumn} from '../data-model/derive.mjs';
import {compare,validateSpecs,linearFit} from '../rules.mjs';
import {worksheetModel} from '../retention/worksheet.mjs';
import {lastPeakCalculation} from '../retention/planning.mjs';
import {nomogramConvert} from '../selectivity/nomogram.mjs';
import {solventSuggestions} from '../selectivity/solvent-plan.mjs';
import {intermediateEvidence,intermediateContext} from '../selectivity/intermediate-evidence.mjs';
import {evaluateRun} from '../selectivity/gates.mjs';
import {shortRunLabel} from '../data-model/workspaces.mjs';
import {TAGGED_TEMPLATE} from '../presets/tagged-template.mjs';
import {efficiencyAnalysis} from '../efficiency/model.mjs';
import {prelabPredictions} from '../efficiency/prelab.mjs';
import {searchInventory} from '../efficiency/inventory.mjs';
import {courseStockPreview} from '../efficiency/course-stock.mjs';
import {noStockEvidence} from '../efficiency/no-stock.mjs';
import {gradientAnalysis} from '../gradient/model.mjs';
import {selectivityHistory,cycleChain,plannedNext,decisionEvidence,previousInTimeComposition} from './workflow.mjs';

export const COURSE_SOURCE='FC1 RET & SEL announcement, Laurence Orlando, 13 October 2026; Cycle 4 combination map, slide 26; FC1 questions-and-answers forum (34 discussions read 14 October 2026). Teacher replies, dates and FC1/FC2 scope are distinguished from unanswered student proposals.';
export const TEMPLATE={...TAGGED_TEMPLATE,specCells:Object.fromEntries(TAGGED_TEMPLATE.specs.map(p=>[p.key,p.cell]))};
export function courseConfig(s){const c=s.settings.course||{};return {...c,shortFraction:Number.isFinite(c.shortFraction)&&c.shortFraction>0&&c.shortFraction<1?c.shortFraction:.5,rsFloorFraction:Number.isFinite(c.rsFloorFraction)&&c.rsFloorFraction>0&&c.rsFloorFraction<1?c.rsFloorFraction:.7,observations:c.observations||{}};}
export function specsSignature(s){return JSON.stringify(s.settings.specs);}
export function courseRsBasis(peaks,preferred){if(peaks.length&&peaks.every(p=>p.widthBase>0))return 'base-width';if(peaks.length&&peaks.every(p=>p.widthHalf>0))return 'half-width';if(peaks.length&&peaks.every(p=>p.plates>0))return 'plate-gaussian';return preferred==='exported'||peaks.some(p=>Number.isFinite(p.exportedRs))?'exported':preferred;}
function methodKey(s,r,blankContext=false){const c=r.conditions,m=runColumn(s,r).model;return JSON.stringify([c.organic?.value,c.mode?.value,c.pH?.value,c.flow?.value,blankContext?null:c.sampleType?.value,blankContext?null:c.sampleConc?.value,c.injVolume?.value,c.wavelength?.value,m?.ligand,m?.beadFamily,m?.lengthMm,m?.idMm,m?.particleUm,c.ovenSetpoint?.value]);}
function chemistryKey(s,r){const c=r.conditions,m=runColumn(s,r).model;if(!m?.ligand||!['organic','mode','percentB','sampleType','flow'].every(k=>c[k]?.value!==null&&c[k]?.value!==undefined))return null;return JSON.stringify([m.ligand,c.organic.value,c.mode.value,c.percentB.value,c.pH?.value,c.sampleType.value,c.sampleConc?.value,c.sampleId?.value,c.phaseA?.value,c.additiveName?.value,c.additiveConc?.value,c.injVolume?.value,c.wavelength?.value,c.ovenSetpoint?.value]);}
function mechanicsKey(s,r){const m=runColumn(s,r).model;return JSON.stringify([m?.lengthMm,m?.idMm,m?.particleUm,m?.beadFamily,m?.particleType,r.conditions.flow?.value]);}
export function courseStages(s){
 const sorted=[...s.runs].sort((a,b)=>a.seq-b.seq),phase=r=>runColumn(s,r).model?.ligand||'unknown chemistry',states=new Map(),stages={};
 for(const r of sorted){const pk=phase(r);if(!states.has(pk)){const base=sorted.find(x=>phase(x)===pk&&!isBlank(x)&&relevantPeaks(x).length);states.set(pk,{base,key:base?methodKey(s,base):null,seen:new Set(),lower:null,selectivityStarted:false});}const state=states.get(pk),{base,key,seen}=state,B=percentBOf(r),same=base&&(isBlank(r)?methodKey(s,r,true)===methodKey(s,base,true):methodKey(s,r)===key);
  if(same&&Number.isFinite(B)&&seen.size>=4&&state.lower!==null&&B<state.lower&&state.lower-B<10-1e-9)state.selectivityStarted=true;
  const ck=chemistryKey(s,r),mechanical=r.conditions.mode?.value==='ISO'&&ck!==null&&sorted.some(x=>x.seq<r.seq&&!isBlank(x)&&relevantPeaks(x).length===s.settings.specs.peakCount.value&&chemistryKey(s,x)===ck&&mechanicsKey(s,x)!==mechanicsKey(s,r));
  const inferred=r.conditions.mode?.value==='GRA'?'gradient':['efficiency','gradient'].includes(r.workspaceOrigin)?r.workspaceOrigin:mechanical?'efficiency':!base?'retention':state.selectivityStarted||!same?'selectivity':'retention',manual=courseConfig(s).stageOverrides?.[r.id];
  stages[r.id]={stage:['retention','selectivity','efficiency','gradient'].includes(manual)?manual:inferred,basis:manual?'Explicit expert correction':r.conditions.mode?.value==='GRA'?'Recorded gradient method; no isocratic fit':!base?'Initial blank/reference; no sample series yet':!same?'Recorded solvent / column / temperature / method differs from this ligand’s initial series':state.selectivityStarted?'Fine composition / selectivity experiments after this ligand’s %B ladder':'Initial comparable %B series for this ligand; inferred workflow role, not proof of physical identity'};
  if(same&&Number.isFinite(B)&&!state.selectivityStarted&&!isBlank(r)){seen.add(B);state.lower=state.lower===null?B:Math.min(state.lower,B);}
 }
 return stages;
}
export function courseModel(s,stages=courseStages(s)){
 const cfg=courseConfig(s),viewed=s.runs.find(r=>r.id===cfg.currentRunId)||[...s.runs].sort((a,b)=>a.seq-b.seq).filter(r=>!isBlank(r)).at(-1),ligand=viewed?runColumn(s,viewed).model?.ligand:null,rs=s.runs.filter(r=>stages[r.id]?.stage==='retention'&&(!ligand||runColumn(s,r).model?.ligand===ligand)),base=worksheetModel({...s,runs:rs,settings:{...s.settings,minFitPoints:4}}),all=base.points||[];
 const candidates=[{label:'All eligible points',points:all},{label:'Exclude ≥90 %B (high-%B course comparison)',points:all.filter(p=>p.x<90)},{label:'Exclude ≥80 %B (high-%B course comparison)',points:all.filter(p=>p.x<80)}]
  .map(c=>({...c,fit:linearFit(c.points)})).filter((c,i,a)=>i===0||!a.slice(0,i).some(p=>p.points.map(x=>x.runId).join()===c.points.map(x=>x.runId).join()));
 for(const c of candidates)c.pass=c.fit.ok&&c.fit.slope<0&&c.fit.r2!==null&&c.fit.r2>=.99&&c.points.length>=4&&new Set(c.points.map(p=>p.x)).size>=4;
 const distinct=[...all].sort((a,b)=>a.x-b.x||s.runs.findIndex(r=>r.id===b.runId)-s.runs.findIndex(r=>r.id===a.runId)).filter((p,i,a)=>a.findIndex(x=>x.x===p.x)===i);
 for(const n of [4,5])if(distinct.length>=n){const points=distinct.slice(0,n),fit=linearFit(points);candidates.push({label:`Lowest ${n} %B compositions (latest eligible replicate)`,points,fit,pass:fit.ok&&fit.slope<0&&fit.r2!==null&&fit.r2>=.99&&points.length>=4});}
 if(Array.isArray(cfg.fitRunIds)){const ids=new Set(cfg.fitRunIds),points=all.filter(p=>ids.has(p.runId)),fit=linearFit(points);candidates.push({label:'User-selected data points',points,fit,pass:points.length>=4&&fit.ok&&fit.slope<0&&fit.r2!==null&&fit.r2>=.99&&new Set(points.map(p=>p.x)).size>=4&&points.length===ids.size});}
 const selected=Array.isArray(cfg.fitRunIds)?candidates.at(-1):cfg.fitChoice?candidates.find(c=>c.label===cfg.fitChoice)||candidates[0]:candidates[0];
 const t0=base.meanT0;
 for(const c of candidates){const temperatures=c.points.filter(p=>p.temperatureKnown).map(p=>p.temperatureValue);c.temperatureMismatch=temperatures.length>1&&Math.max(...temperatures)-Math.min(...temperatures)>s.settings.tempMatchTolerance;if(c.temperatureMismatch)c.pass=false;}
 for(const c of candidates)c.calculation=c.pass?lastPeakCalculation({t0,slope:c.fit.slope,intercept:c.fit.intercept,r2:c.fit.r2},{...s.settings,r2Policy:{mode:'custom',target:.99,op:'>='}}):null;
 const calculation=selected?.pass?lastPeakCalculation({t0,slope:selected.fit.slope,intercept:selected.fit.intercept,r2:selected.fit.r2},{...s.settings,r2Policy:{mode:'custom',target:.99,op:'>='}}):null;
 const signature=JSON.stringify({spec:s.settings.specs.lastPeak,t0,points:selected?.points.map(p=>[p.runId,p.x,p.y,p.t0]),group:base.groupKey});
 const confirmed=cfg.modelConfirmedSignature===signature;
 const suggested=[...candidates].filter(x=>x.pass).sort((a,b)=>b.fit.r2-a.fit.r2||b.points.length-a.points.length)[0];
 return {...base,candidates,selected,suggested,eligiblePoints:all,fit:selected?.fit,points:selected?.points||[],meanT0:t0,calculation,signature,confirmed,qualityPass:!!selected?.pass,
  qualified:!!selected?.pass&&!!calculation?.ready&&!base.rows.some(r=>r.pendingExclusion),exclusions:all.filter(p=>!selected?.points.some(x=>x.runId===p.runId)),estimated:selected?.points.some(p=>p.estimate),
  nextRetentionB:all.length?Math.max(0,Math.min(...all.map(p=>p.x))-10):null,
  reason:!selected?.pass?'Chosen data do not yet meet unrounded R² ≥ 0.99 and at least four comparable points. Compare the four/five-point sets or add a lower-%B measurement; a new point does not guarantee a better fit.':!calculation?.ready?calculation?.reason:'Chosen data meet the course fit criterion. Verify last-peak continuity and t0 before executing the plan.'};
}
export function courseDecision(s,r,model=courseModel(s)){
 const S=s.settings.specs,cfg=courseConfig(s),v=validateSpecs(S),peaks=relevantPeaks(r),n=peaks.length,last=peaks.reduce((a,p)=>Math.max(a,p.tR),0)||null,B=percentBOf(r),rsBasis=courseRsBasis(peaks,s.settings.rsBasis),g=evaluateRun(s,r,{...s.settings,rsBasis}),rsGate=g.gates.find(x=>x.id==='minRs');
 const measuredRs=rsGate?.value??null,rs=n<S.peakCount.value?0:measuredRs,timeOK=compare(last,S.lastPeak.op,S.lastPeak.value).pass,rsOK=compare(rs,S.minRs.op,S.minRs.value).pass;
 const T=effectiveTemperature(r,s.settings),temp=T.known?T.value:r.conditions.ovenSetpoint?.value,organic=organicOf(r),baseSolvent=organicOf(s.runs.find(x=>x.seq<=r.seq&&!isBlank(x)&&runColumn(s,x).model?.ligand===runColumn(s,r).model?.ligand)||r);
 const context=JSON.stringify([r.raw.sha256,B,n,last,measuredRs,temp,organic,S]);
 const observed=cfg.observations[r.id]?.signature===context?cfg.observations[r.id]:{};
 const ref=model.points?.length?s.runs.find(x=>x.id===model.points[0].runId):null;
 const ladderPrediction=model.qualified&&Number.isFinite(B)&&B>=10&&ref&&methodKey(s,ref)===methodKey(s,r)?model.meanT0*(1+10**(model.fit.intercept+model.fit.slope*(B-10))):null;
 const short=observed.short??(Number.isFinite(last)&&last<=S.lastPeak.value*cfg.shortFraction),floor=Number.isFinite(cfg.rsFloor)?cfg.rsFloor:S.minRs.value*cfg.rsFloorFraction,farRs=observed.farRs??(rs!==null&&rs<floor);
 const modelApplicable=!!ref&&methodKey(s,ref)===methodKey(s,r);
 const out={runId:r.id,label:shortRunLabel(r),n,last,B,organic,temp,modelApplicable,rs,measuredRs,rsBasis,rsGate,signature:context,stage:'retention',status:'OBSERVE',action:'Import a valid peak table.',reason:'',safety:g.gates.find(x=>x.id==='pressure'),floor,short,farRs,model,choices:[]};
 if(!v.ok)return {...out,status:'SPECIFICATIONS',action:'Correct the method specifications before importing or deciding.',reason:v.problems.map(p=>p.text).join(' ')};
 if(out.safety?.specificationPass===false||out.safety?.operatingFailures?.length)return {...out,status:'HOLD',action:'Do not repeat these conditions: measured pressure or a documented operating limit is exceeded. Correct the operating condition before peak/time/Rs optimisation.',reason:out.safety.text};
 if(r.conditions.mode?.value==='GRA'){const gradient=gradientAnalysis(s,r,out);return {...out,status:gradient.status,stage:'gradient',gradient,action:gradient.action};}
 if(isBlank(r)){const hasSample=s.runs.some(x=>x.id!==r.id&&!isBlank(x)&&relevantPeaks(x).length);return {...out,status:'BLANK',action:hasSample?'Compare this blank with a compatible sample CSV already in the library; keep it as an interference / carry-over reference.':'Keep this blank as the baseline. Next, acquire and import your first sample CSV; blank/sample comparison becomes available then.',reason:hasSample?'A blank is not a sample optimisation run. Compare only relevant method/sample conditions.':'No sample CSV is present yet. A first blank is valid baseline evidence, not missing historical experimental data.'};}
 if(!n)return {...out,status:'OBSERVE',action:'Check sample, detector wavelength, integration and acquisition duration; no sample peak is available.'};
 if(n>S.peakCount.value)return {...out,status:'INVESTIGATE',action:'INVESTIGATE extra peaks: compare the blank, integration, areas and heights; exclude only justified artefacts or apply the optional height filter.',reason:`${n} peaks exceed target ${S.peakCount.value}. Stop time/Rs routing until investigated. Peaks are never removed automatically to force the target.`};
 const sel=()=>{
  out.stage='selectivity';out.status='SELECTIVITY';
  if(!Number.isFinite(temp)||temp<39){out.action='Run at 40 °C, keeping the current solvent and column.';out.temperature=40;}
  else if(temp<59){
   if(observed.temperatureGood===undefined){out.status='OBSERVE';out.action='Compare the 40 °C chromatogram: are the critical peaks moving towards better separation?';out.observeTemperature=true;}
   else if(observed.temperatureGood){out.action='Run at 60 °C, keeping the current solvent and column.';out.temperature=60;}
   else solvent();
  }else if(organic===baseSolvent)solvent();else{out.status='OBSERVE';out.action=cfg.selectedLigandSignature===context&&cfg.selectedLigand?`Change ligand to ${cfg.selectedLigand} on the selected available column; restart Retention at 100 or 90 %B using a fresh same-chemistry series and verify its own limits.`:'Choose another available column ligand; restart Retention at 100 or 90 %B and keep the new chemistry separate from old history.';out.chooseLigand=true;}
 };
 const solvent=()=>{const to=organic==='ACN'?'MeOH':organic==='MeOH'?'ACN':null,cv=to&&Number.isFinite(B)?nomogramConvert(organic,to,B):null;out.conversion=cv;out.solvent=to;out.action=cv?.available?`Change solvent to ${to} at ${cv.rounded} %B (nomogram), starting at 40 °C.`:'Choose the alternative solvent and read its equivalent %B from the nomogram.';out.temperature=40;};
 if(n<S.peakCount.value){
  out.reason=`${n} < ${S.peakCount.value}: course Rs = 0, not assessable. Visible-pair Rs is retained separately.`;
  if(!timeOK){sel();out.reason+=' Run time exceeds the specification; change selectivity or OBSERVE an intermediate %B.';}
  else if(short){out.status='RETENTION';out.action=Number.isFinite(B)&&B>=10?`Run at ${B-10} %B (decrease by 10 percentage points).`:'Decrease %B by 10 percentage points only within 0–100 %B; review the recorded composition.';out.nextB=Number.isFinite(B)&&B>=10?B-10:null;}
  else{out.status='OBSERVE';out.action=model.qualified&&modelApplicable?`Run at minimum ${model.calculation.B} %B, or compare chromatograms and choose an intermediate %B.`:model.qualified?`Compare the current ${organic||'solvent'} chromatograms and choose an intermediate %B. The Retention minimum applies to its original solvent / temperature / column, not this changed method.`:'Compare chromatograms and choose an intermediate %B; collect the %B series to calculate the minimum.';if(model.qualified&&modelApplicable)out.nextB=model.calculation.B;out.observeIntermediate=true;}
 }else if(rs===null){out.status='OBSERVE';out.stage='selectivity';out.action='Export peak widths / plate numbers, or document the measured critical-pair Rs.';}
 else if(timeOK&&rsOK){out.status='MET';out.stage='selectivity';out.action='MET: target peak count, run time and resolution meet the specifications.';}
 else if(farRs&&!short){sel();out.reason='Resolution is below the floor; change selectivity (Cycle 4 map).';}
 else{out.status='N';out.stage='efficiency';out.action='Proceed to N / Efficiency (FC2).';out.reason=short&&!rsOK?'Time is available: increase column length / N; check back-pressure.':!timeOK&&rsOK?'Shorten the run using the Efficiency / flow strategy.':'Use the N strategy; retain the current selectivity.';}
 if(cfg.assessmentScope==='fc1'&&n===S.peakCount.value&&rs!==null&&!(timeOK&&rsOK)){sel();out.reason='FC1: target peak count reached; evaluate time then Rs. The method is not complete. Explore the recorded Selectivity sequence before identifying the next parameter family; no Efficiency plan is implemented in this scope.';}
 if(cfg.assessmentScope!=='fc1'&&n===S.peakCount.value&&rs!==null){const efficiency=efficiencyAnalysis(s,r,out);out.efficiency=efficiency;
  if(efficiency.combination){const c=efficiency.combination;out.combination=c.id;out.floor=Number.isFinite(cfg.rsFloor)?cfg.rsFloor:efficiency.floor.spp;out.short=c.row===0;out.farRs=c.col===0;
   if(c.route==='SELECTIVITY')sel();else if(c.route==='MET'){out.status='MET';out.stage='efficiency';out.action='MET: target peaks, run time and Rs meet the specifications. Optional faster-flow comparison is available below.';}else{out.status='N';out.stage='efficiency';const p=efficiency.recommended;out.action=p?`${c.action}: L ${p.L.toFixed(1)} mm, PS ${p.PS.toFixed(3)} µm, ${p.spp>1?'SPP':'FPP'}, F ${p.F.toFixed(4)} mL/min. Predicted tR ${p.tR.toFixed(3)} min, BP ${p.BP.toFixed(0)} psi, Rs ${p.Rs.toFixed(3)}${p.allInSpec?' (model meets specifications).':' (not all specifications met; inspect alternatives).'}`:`N route: ${c.action}. No passing numerical plan is available from the single-lever model. Review the exploratory comparisons or record/search actual stock; do not run a failing prediction as the recommended experiment.`;}
   if(c.route!=='SELECTIVITY')for(const k of ['temperature','solvent','conversion','selectivityB','observeTemperature','observeIntermediate','chooseLigand','nextB'])delete out[k];
   out.reason=`FC2 rubric row ${c.id}: time ${c.timeBand}; Rs ${c.rsBand}. ${efficiency.floor.basis}`;
  }else if(out.status==='N')out.action='N modelling inputs needed: '+efficiency.missing.join(', ')+'. Import/correct these records; no new column or flow is guessed.';
 }
 if(out.observeIntermediate&&cfg.intermediateWanted===false&&cfg.intermediateSkipSignature===context){out.intermediateSkipped=true;out.observeIntermediate=false;delete out.nextB;sel();out.reason+=' User skipped the optional intermediate for these run/specification data and retained this measured starting composition.';}
 if(n<S.peakCount.value&&!timeOK){out.restoreComposition=previousInTimeComposition(s,r);if(out.restoreComposition)out.observeTemperature=false;else out.restorationUnavailable=true;}
 out.selectivityHistory=selectivityHistory(s,r,model,{restore:out.restoreComposition});
 if(out.stage==='selectivity'&&['SELECTIVITY','OBSERVE'].includes(out.status)){
  const h=out.selectivityHistory,next=h.next,already60=h.steps.some(x=>x.temp===60&&x.solvent===organic&&x.runs.length);
  if(next&&(!out.observeTemperature||already60)){
   out.observeTemperature=false;out.chooseLigand=next.id==='ligand';
   if(next.id==='ligand'){out.status='OBSERVE';out.action='OBSERVE the completed second-solvent temperature series. Optionally test another temperature between 20 and 60 °C or a mixed solvent; otherwise choose a real available ligand and restart Retention at 100 or 90 %B. New chemistry needs separate history and fits.';out.observeFinalTemperature=true;delete out.temperature;delete out.solvent;delete out.conversion;}
   else{out.temperature=next.temp;out.selectivityB=next.B;out.solvent=next.solvent!==organic?next.solvent:null;out.conversion=out.solvent?h.conversion:null;out.action=`Run ${next.solvent} at ${next.B??'a documented equivalent'} %B and ${next.temp} °C. ${next.why}`;}
  }
 }
 if(out.observeFinalTemperature&&Number.isFinite(observed.extraTemperature)&&observed.extraTemperature>=20&&observed.extraTemperature<=60){out.temperature=observed.extraTemperature;out.chooseLigand=false;out.action=`OBSERVE trial: test ${organic} at ${B} %B and user-selected ${observed.extraTemperature} °C, retaining the current recorded chemistry. Compare with the completed temperature series; no Rs improvement or injection clearance is predicted.`;}
 if(cfg.assessmentScope==='fc1'&&n===S.peakCount.value&&!(timeOK&&rsOK)&&observed.selectivityExhausted===true&&observed.exhaustionBasis?.trim()){
  out.status='EFFICIENCY_NEXT';out.stage='efficiency';out.action='FC1 hand-off: Efficiency is the next parameter family. No column or flow experiment is prescribed in FC1.';out.reason=`User-declared exhausted Selectivity strategies for ${out.label}: ${observed.exhaustionBasis}. Review the retained run history and evidence; this declaration does not mark an unperformed experiment as measured.`;
  for(const k of ['temperature','solvent','conversion','selectivityB','observeTemperature','observeIntermediate','chooseLigand','nextB','observeFinalTemperature'])delete out[k];
 }
 if(out.solvent==='MeOH'&&s.settings.solventPlan?.sourceRunId===r.id){const z=solventSuggestions(s,r.id),p=z.selected;if(p){out.selectivityB=p.B;out.conversion={...z.conversion,rounded:p.B,hypothesis:true};out.solventHypothesis=p;out.action=`Test the user-selected ${p.B} %B MeOH at ${out.temperature??'the controlled comparison'} °C. ${p.reason} Verify pressure and measure peak count / Rs.`;}}
 if(out.observeIntermediate&&intermediateContext(s,r).distinctCount===1){const probes=[B-1,B+1].filter(x=>Number.isFinite(x)&&x>=0&&x<=100);out.action=`Only one ${organic||'solvent'} composition (${B} %B) is measured under similar recorded conditions. Plan an intermediate trial at ${probes.join(' or ')} %B (±1-point exploration), then compare it with ${out.label}. Inspect the run evidence and reasons below; no optimum or passing result is predicted.${modelApplicable?'':' The Retention minimum applies to its original solvent / temperature / column.'}`;}
 if(Number.isFinite(cfg.intermediateB)&&cfg.intermediateSignature===model.signature&&(!cfg.intermediateSolvent||cfg.intermediateSolvent===organic)&&out.observeIntermediate&&(!model.qualified||!modelApplicable||cfg.intermediateB>=model.calculation.B)){out.nextB=cfg.intermediateB;out.action=`Test the user-selected intermediate ${cfg.intermediateB} %B ${organic||''}. Measure peak count, time and separation.`;}
 if(out.status==='RETENTION'&&cfg.intermediateWanted===true&&cfg.intermediateRunId===r.id&&cfg.intermediateSignature===model.signature&&cfg.intermediateSolvent===organic&&model.qualified&&modelApplicable&&Number.isFinite(cfg.intermediateB)&&cfg.intermediateB>=model.calculation.B&&cfg.intermediateB<B){const predicted=model.meanT0*(1+10**(model.fit.intercept+model.fit.slope*cfg.intermediateB));if(compare(predicted,S.lastPeak.op,S.lastPeak.value).pass){out.nextB=cfg.intermediateB;out.alternativeDecrement={B:cfg.intermediateB,decrement:B-cfg.intermediateB,predictedLast:predicted,runIds:model.points.map(x=>x.runId),labels:model.points.map(x=>x.label)};out.action=`Optional user-selected decrement: test ${cfg.intermediateB} %B ${organic} (${(B-cfg.intermediateB).toFixed(2)} percentage points lower). Conditional last-peak prediction ${predicted.toFixed(3)} min from ${model.points.map(x=>x.label).join(', ')}. The default is a 10-point decrease; this fitted alternative does not predict peak count, Rs or pressure and requires experimental verification.`;}}
 if(out.restoreComposition)out.action=`Restore the previous in-time ${out.restoreComposition.B} %B ${organic} from ${out.restoreComposition.label}, then change Selectivity. ${out.action}`;
 else if(out.restorationUnavailable)out.action+=' No comparable previous in-time %B is recorded; do not invent a restoration value. Review the measured starting-run / intermediate choices.';
 out.policy=cfg.assessmentScope==='fc1'?`FC1 assessment: back-pressure, peak count, run time, then Rs. The half-time classification (${cfg.shortFraction} of the time specification) supports the default Retention decrement. No FC2 Rs floor or N experiment is applied. Selectivity observations and exhaustion declarations remain explicit and tied to this run/specification.`:out.efficiency?.combination?`FC2: calculated floor ${out.floor.toFixed(4)}; ${out.efficiency.source}. Ideal floor and continuous targets do not prove physical stock or injection clearance.`:`FC1 forum reply, 20 September 2026: use the half-time-specification rule for a 10-point %B decrease, not a fixed 40% floor. Active time fraction ${cfg.shortFraction}; an expert override or OBSERVE interpretation is explicit. ${ladderPrediction!==null?`Separate model preview after that decrease: ${ladderPrediction.toFixed(3)} min.`:''} Rs-floor fallback ${floor.toFixed(3)} is a tool interpretation only when an FC2 floor is unavailable.`;
 if(out.nextB!==undefined&&model.qualified&&modelApplicable){const f=model.fit,z=model.meanT0;out.predictedLast=z*(1+10**(f.intercept+f.slope*out.nextB));}
 return out;
}
export function courseEvaluation(s){const stages=courseStages(s),model=courseModel(s,stages),runs=[...s.runs].sort((a,b)=>a.seq-b.seq),decisions=runs.map(r=>({...courseDecision(s,r,model),dataRole:stages[r.id]?.stage})),current=decisions.find(d=>d.runId===courseConfig(s).currentRunId)||decisions.filter(d=>d.status!=='BLANK').at(-1)||decisions.at(-1)||null,e={stages,model,decisions,current};
 const minB=current?.modelApplicable&&model.qualified?model.calculation.B:null,upper=model.fit?.ok?model.fit.xMax:100;
 const values=(!current?.modelApplicable||!model.qualified)&&Number.isFinite(current?.B)?[-5,-3,-2,-1,0,1,2,3,5].map(x=>current.B+x):Number.isFinite(minB)?[minB,...Array.from({length:9},(_,i)=>Math.round(minB+(upper-minB)*(i+1)/9))]:[];
 const cfg=courseConfig(s),selectedB=cfg.intermediateSignature===model.signature&&cfg.intermediateSolvent===current?.organic?cfg.intermediateB:null;
 e.intermediate=intermediateEvidence(s,runs.find(r=>r.id===current?.runId),{values,minB,augment:true,selectedB});
 if(current?.efficiency){const z=searchInventory(s,runs.find(r=>r.id===current.runId),current.efficiency);current.efficiency={...current.efficiency,inventory:z};const p=z.selected||z.recommended;
  if(current.status==='N'&&p){current.action=`Stock plan: ${p.label}; L ${p.L.toFixed(1)} mm, ID ${p.ID.toFixed(2)} mm, PS ${p.PS.toFixed(3)} µm, ${p.spp>1?'SPP':'FPP'}, F ${p.F.toFixed(5)} mL/min. Predicted tR ${p.tR.toFixed(3)} min, BP ${p.BP.toFixed(0)} psi, Rs ${p.Rs.toFixed(3)}. ${p.verificationComplete?'Inputs documented; validate experimentally.':'Conditional: verify '+p.checks.join(', ')+'.'}`;current.reason+=` Full search: ${z.evaluated} stock × flow combinations, ${z.feasible.length} model-feasible; ranked by ${z.criteria.priority}.`;
  }
 }
 if(current?.efficiency){const fallback=noStockEvidence(s,current);current.efficiency.noStock=fallback;if(fallback?.blockRecipe){current.action=`${current.label}: ${fallback.headline}`;current.reason+=` ${fallback.coverage}`;}const r=s.runs.find(r=>r.id===current.runId);current.efficiency.prelab=prelabPredictions(s,r,current.efficiency);if(cfg.showCourseStockComparison===true)current.efficiency.coursePreview=courseStockPreview(s,r,current.efficiency);}
 for(const d of decisions){const r=runs.find(r=>r.id===d.runId);d.evidence=decisionEvidence(s,r,d);if(d.observeTemperature&&d.evidence.comparison.length===2){const [a,b]=d.evidence.comparison;d.action=`OBSERVE: compare ${a.label} with ${b.label} at ${b.B}% ${b.solvent}. Are the critical peaks moving towards better separation at ${b.temperature.toFixed(1)} °C? Choose Yes for 60 °C or No for the alternative solvent; inspect both measured rows below.`;}}
 e.chain=cycleChain(s,e);if(cfg.assessmentScope==='fc1'){e.chain[2]={cycle:3,name:'Efficiency (N)',state:current?.status==='EFFICIENCY_NEXT'?'Next parameter family identified · not implemented in FC1':'Outside active FC1 optimisation',basis:current?.status==='EFFICIENCY_NEXT'?current.reason:'FC1 assesses Retention / Selectivity decisions, not the FC2 nine-row N optimisation.',next:current?.status==='EFFICIENCY_NEXT'?current.action:'No automatic column / flow change; retain the selected column until an explicit ligand strategy or later Efficiency work.'};}e.nextPlanned=plannedNext(s,e);return e;}
