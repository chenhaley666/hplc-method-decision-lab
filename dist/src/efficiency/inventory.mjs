// Exhaustive bounded stock × flow search. Columns are records, not generated
// geometries. Predictions are conditional on unchanged K/alpha and viscosity.
import {courseBead,familyTransfer} from './families.mjs';
import {predictEfficiency} from './model.mjs';
import {runColumn,runInstrument,effectiveTemperature} from '../data-model/derive.mjs';
import {usable} from '../data-model/conditions.mjs';
import {toPsi,compare} from '../rules.mjs';
import {sha256} from '../data-model/ids.mjs';
import {instrumentInterval} from '../equipment/inspector.mjs';
export const SEARCH_LIMIT=100000;
export const INVENTORY_DEFAULTS={flowMin:.1,flowMax:3,flowStep:.05,priority:'time'};
export const PRIORITIES=['time','rs','pressure','cost','length','particle'];
const pos=x=>Number.isFinite(x)&&x>0;
export function columnDefinition(column,model){return sha256(JSON.stringify([column?.id,column?.modelId,column?.serial,model]));}
export function referenceChemistry(s,r){const m=runColumn(s,r).model,t=effectiveTemperature(r,s.settings);return sha256(JSON.stringify([m?.manufacturer,m?.product,m?.ligand,m?.beadFamily,m?.poreA,m?.carbonPct,m?.endcapped,...['organic','mode','percentB','pH','phaseA','phaseB','additiveName','additiveConc','additiveUnit','sampleId','sampleType','sampleConc'].map(k=>r.conditions[k]),t.known?t.value:r.conditions.ovenSetpoint]));}
function sameRecordedProduct(a,b){return !!a?.product&&!!a?.ligand&&a.product===b?.product&&a.manufacturer===b?.manufacturer&&a.ligand===b?.ligand&&a.beadFamily===b?.beadFamily&&['poreA','carbonPct','endcapped'].every(k=>a[k]===b[k]);}
export function stockEntries(s,r){const cfg=s.settings.course?.inventory||{},base=runColumn(s,r).model,reference=referenceChemistry(s,r);
 return (s.columns||[]).map(column=>{const model=s.columnModels.find(m=>m.id===column.modelId),definition=columnDefinition(column,model),entry=cfg.columns?.[column.id]||{},fresh=entry.definition===definition,declared=entry.available===true&&fresh,sameLigand=!!base?.ligand&&base.ligand===model?.ligand,family=familyTransfer(base,model),compatible=!!model&&!family.blocked&&(model.id===base?.id||sameRecordedProduct(base,model)||family.compatible||(sameLigand&&entry.compatibleReference===reference&&fresh)),spp=entry.spp===null?null:Number.isFinite(entry.spp)&&fresh?entry.spp:model?.particleType==='fully porous'?1:model?.particleType==='superficially porous'?1.5:courseBead(model)?.factor??null;
  return {id:column.id,column,model,definition,available:declared,familyBlocked:family.blocked,availabilityState:entry.available===true&&!fresh?'Definition changed; reconfirm stock':declared?'User-declared available':'Stock not confirmed',compatible,compatibilityBasis:family.blocked?family.basis:model?.id===base?.id?'Same recorded product model':sameRecordedProduct(base,model)?'Same recorded phase descriptors; transfer assumption':family.compatible?family.basis:compatible?'User-declared phase equivalence for this reference':'Different / unknown stationary phase: no N-only transfer',spp,price:fresh&&Number.isFinite(entry.price)&&entry.price>=0?entry.price:null,reference};
 });
}
function pressureCaps(s,r,m){const ins=runInstrument(s,r),S=s.settings.specs,caps=[{psi:S.pressure.value,op:S.pressure.op,basis:'Method specification'}],checks=[];
 const mc=toPsi(m?.limits?.pMax,m?.limits?.pMaxUnit);if(mc.ok&&pos(mc.psi))caps.push({psi:mc.psi,op:'<=',basis:'Candidate column rating'});else checks.push('Candidate-column pressure rating');
 if(!m?.datasheetRef&&!m?.provenance?.sources?.length)checks.push('Candidate-column datasheet provenance');
 if(!ins.confirmed)checks.push('Confirmed instrument association');
 const ip=ins.confirmed?(ins.instrument.limits||[]).filter(x=>x.quantity==='pressure').map(x=>({...x,psi:toPsi(x.value,x.unit)})).filter(x=>x.psi.ok&&pos(x.psi.psi)&&['<','<='].includes(x.op)):[];
 if(ip.length)for(const x of ip){caps.push({psi:x.psi.psi,op:x.op,basis:'Instrument pressure rating'});if(!x.source&&!x.basis)checks.push('Instrument pressure-rating provenance');}else checks.push('Instrument pressure rating');
 const flows=ins.confirmed?(ins.instrument.limits||[]).filter(x=>x.quantity==='flow'&&x.unit==='mL/min'&&pos(x.value)&&['<','<='].includes(x.op)):[];
 if(!flows.length)checks.push('Instrument maximum flow');
 for(const x of flows)if(!x.source&&!x.basis)checks.push('Instrument flow-rating provenance');
 const bounds=instrumentInterval(ins.confirmed?ins.instrument:null,'flow','mL/min'),failures=bounds.invalid||bounds.contradictory?['Invalid or contradictory instrument flow bounds; resolve them before searching']:[];
 const pressure=Math.min(...caps.map(x=>x.psi)),pressureOp=caps.some(x=>x.psi===pressure&&x.op==='<')?'<':'<=',flowMax=flows.length?Math.min(...flows.map(x=>x.value*(x.op==='<'?1-1e-10:1))):Infinity,flowMin=bounds.lower?bounds.low*(bounds.lower.op==='>'?1+1e-10:1):0;
 if(bounds.lower&&!bounds.lower.basis&&!bounds.lower.source)checks.push('Instrument lower-flow provenance');
 return {pressure,pressureOp,flowMin,flowMax,caps,checks,failures};
}
function operatingCompatibility(s,r,m){const failures=[],checks=[],ph=usable(r.conditions.pH)?r.conditions.pH.value:null,t=effectiveTemperature(r,s.settings),lim=m?.limits||{};
 if(t.stable===false)failures.push('Reference temperature unstable: no constant-temperature N transfer');
 if(!Number.isFinite(ph)||!Array.isArray(lim.pH)||lim.pH.length!==2||!lim.pH.every(Number.isFinite))checks.push('Current pH / candidate-column pH range');else if(ph<lim.pH[0]||ph>lim.pH[1])failures.push('pH outside candidate-column range');
 if(!t.known||!pos(lim.tMaxC))checks.push('Stable temperature / candidate-column maximum temperature');else if(t.value>lim.tMaxC)failures.push('Temperature exceeds candidate-column rating');
 return {failures,checks};
}
// Full continuous feasible interval, not just the values in the finite grid.
export function feasibleFlowInterval(ref,q,spec){
 if(!ref.ok||![q.L,q.ID,q.PS,q.spp,spec.time,spec.pressure,spec.flowMin,spec.flowMax].every(pos)||!Number.isFinite(spec.rs)||spec.rs<0)return {ok:false,reason:'Invalid reference, candidate or search constraints.'};
 let low=0,high=Infinity;if(spec.rs>0){const cc=ref.coefficients,Hlimit=ref.H*(q.L/ref.L)*(ref.Rs/spec.rs)**2*(spec.rsOp==='>'?1-1e-10:1),A=cc.c*q.PS*q.PS,B=cc.a*q.PS-q.spp*Hlimit,C=cc.b,disc=B*B-4*A*C;
  if(disc<0)return {ok:false,reason:'No flow can supply the required N / Rs for this column.'};high=(-B+Math.sqrt(disc))/(2*A);low=high>0?C/(A*high):NaN;
 }
 const scale=ref.F/ref.u*(q.ID/ref.ID)**2,timeMin=ref.F*(q.L/ref.L)*(q.ID/ref.ID)**2*ref.tR/spec.time*(spec.timeOp==='<'?1+1e-10:1),pressureMax=ref.F*spec.pressure/ref.BP*(ref.L/q.L)*((q.PS*q.ID)/(ref.PS*ref.ID))**2*(spec.pressureOp==='<'?1-1e-10:1),lo=Math.max(low*scale,timeMin,spec.flowMin),hi=Math.min(high*scale,pressureMax,spec.flowMax);
 return lo<=hi?{ok:true,min:lo,max:hi,rsMin:low*scale,rsMax:high*scale,timeMin,pressureMax}: {ok:false,reason:'Time, Rs, pressure and flow intervals do not intersect.',min:lo,max:hi};
}
const tie=(a,b)=>a.tR-b.tR||a.BP-b.BP||b.Rs-a.Rs||a.columnId.localeCompare(b.columnId)||a.F-b.F;
export function rankStock(a,b,priority){
 if(a.verificationComplete!==b.verificationComplete)return a.verificationComplete?-1:1;
 if(priority==='cost'){if(a.price===null&&b.price!==null)return 1;if(b.price===null&&a.price!==null)return -1;if(a.price!==null&&b.price!==null&&a.price!==b.price)return a.price-b.price;}
 const difference=priority==='rs'?b.Rs-a.Rs:priority==='pressure'?a.BP-b.BP:priority==='length'?a.L-b.L:priority==='particle'?b.PS-a.PS:0;
 return difference||tie(a,b);
}
export function searchInventory(s,r,n){const ref=n?.ref,cfg={...INVENTORY_DEFAULTS,...s.settings.course?.inventory},entries=stockEntries(s,r),base={ok:false,scope:'Every declared stock record × every flow on the stated finite grid, plus a continuous feasible interval per column. Same K/alpha/chemistry/viscosity assumption; predictions are not injection clearance.',entries:[],feasible:[],recommended:null,totalColumns:entries.length,gridCount:0,evaluated:0,rejected:0,reference:referenceChemistry(s,r),criteria:{flowMin:cfg.flowMin,flowMax:cfg.flowMax,flowStep:cfg.flowStep,priority:cfg.priority}};
 if(![cfg.flowMin,cfg.flowMax,cfg.flowStep].every(pos)||cfg.flowMax<cfg.flowMin||!PRIORITIES.includes(cfg.priority))return {...base,entries,reason:'Enter positive min/max/step, max ≥ min and a supported preference. Blank inputs are not zero.'};
 const count=Math.floor((cfg.flowMax-cfg.flowMin)/cfg.flowStep+1e-10)+1;
 if(!Number.isSafeInteger(count)||count>SEARCH_LIMIT||count*entries.length>SEARCH_LIMIT)return {...base,entries,reason:`Search exceeds ${SEARCH_LIMIT.toLocaleString()} column × flow combinations. Increase step or narrow the range; no combinations were silently omitted.`};
 const flows=Array.from({length:count},(_,i)=>Number((cfg.flowMin+i*cfg.flowStep).toPrecision(14))).filter(F=>F<=cfg.flowMax+1e-12);base.gridCount=flows.length;
 base.signature=sha256(JSON.stringify([n?.signature,cfg,entries.map(x=>[x.definition,x.available,x.compatible,x.spp,x.price]),runInstrument(s,r),s.settings.specs,effectiveTemperature(r,s.settings)]));
 if(!ref?.ok)return {...base,reason:'A valid target-peak isocratic reference with t0, dimensions, flow, Rs and BP is needed.',entries:entries.map(x=>({...x,reasons:['Reference modelling inputs missing']}))};
 if(r.conditions.mode?.value!=='ISO'||n.applicable===false)return {...base,reason:'Stock N-only transfer requires target-peak isocratic data; unresolved co-elution and gradients are not optimised by this model.'};
 const feasible=[],evaluations=[];
 for(const entry of entries){const m=entry.model,reasons=[],caps=pressureCaps(s,r,m),operation=operatingCompatibility(s,r,m),q={L:m?.lengthMm,ID:m?.idMm,PS:m?.particleUm,spp:entry.spp};
  if(!entry.available)reasons.push(entry.availabilityState);
  if(!m||![q.L,q.ID,q.PS].every(pos))reasons.push('Column geometry not recorded');
  if(!entry.compatible)reasons.push(entry.compatibilityBasis);
  if(!pos(q.spp))reasons.push('Particle architecture / explicitly documented bead factor missing');
  reasons.push(...operation.failures,...caps.failures);
  const checks=[...new Set([...caps.checks,...operation.checks,...(ref.estimatedT0?['Measured / documented reference t0']:[])])],spec={time:n.spec.time,timeOp:n.spec.timeOp,rs:n.spec.rs,rsOp:n.spec.rsOp,pressure:caps.pressure,pressureOp:caps.pressureOp,flowMin:Math.max(cfg.flowMin,caps.flowMin),flowMax:Math.min(cfg.flowMax,caps.flowMax)},row={...entry,reasons,checks,limits:spec,caps:caps.caps,interval:null,evaluated:0,feasibleCount:0,rejectCounts:{time:0,pressure:0,rs:0,flow:0},verificationComplete:!checks.length};
  if(!reasons.length){row.interval=feasibleFlowInterval(ref,q,spec);
   for(const F of flows){const p=predictEfficiency(ref,{...q,F}),passes={time:compare(p.tR,spec.timeOp,spec.time).pass,pressure:compare(p.BP,spec.pressureOp,spec.pressure).pass,rs:compare(p.Rs,spec.rsOp,spec.rs).pass,flow:F>=spec.flowMin&&F<=spec.flowMax};row.evaluated++;base.evaluated++;
    const good=Object.values(passes).every(Boolean);for(const [k,v]of Object.entries(passes))if(!v)row.rejectCounts[k]++;
    const result={key:entry.id+':'+F,columnId:entry.id,modelId:m.id,label:entry.column.label,product:m.product,price:entry.price,...p,passes,allInSpec:good,safePressure:passes.pressure,stockConfirmed:true,verificationComplete:!checks.length,checks,modelOnly:true,compatibilityBasis:entry.compatibilityBasis};evaluations.push(result);
    if(good){row.feasibleCount++;feasible.push(result);}else base.rejected++;
   }
   if(!row.feasibleCount)row.reasons.push(row.interval?.ok?'Continuous feasible interval exists, but no selected grid point lands inside it. Refine step.':row.interval?.reason||'No feasible flow on this grid.');
  }
  base.entries.push(row);
 }
 feasible.sort((a,b)=>rankStock(a,b,cfg.priority));const selected=s.settings.course?.inventoryChoiceSignature===base.signature?feasible.find(x=>x.key===s.settings.course.inventoryChoice):null;
 return {...base,ok:true,feasible,evaluations,recommended:feasible[0]||null,selected:selected||null,reason:feasible.length?`${feasible.length} model-feasible combinations among ${base.evaluated} evaluated. Check recorded stock, phase equivalence and missing operating evidence before experimenting.`:'No model-feasible declared stock × flow combination. Review per-column reasons, extend recorded stock or return to Selectivity; no dimension or ligand winner was fabricated.'};
}
