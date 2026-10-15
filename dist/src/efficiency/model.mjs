// Initial isocratic N module: the supplied Awesome 14 Sep workbook convention.
// Predictions assume unchanged K/alpha, chemistry, viscosity and packing shape.
import {courseBead} from './families.mjs';
import {toPsi,columnVolumeT0,compare} from '../rules.mjs';
import {runColumn,runInstrument,t0Of,flowOf,relevantPeaks} from '../data-model/derive.mjs';
import {columnLimit} from '../data-model/equipment.mjs';
import {sha256} from '../data-model/ids.mjs';
export const N_SOURCE='FC2_N_RUBRIC_261008b: nine combinations; Awesome Calculator 260914, AWESOME CALC (2)!E43:E45, E98:E111';
export const N_DEFAULTS={a:1.5,b:3,c:.15,sppMax:1.5};
const positive=x=>Number.isFinite(x)&&x>0;
export function plateHeight(dp,u,spp=1,c=N_DEFAULTS){return positive(dp)&&positive(u)&&positive(spp)?(c.a*dp+c.b/u+c.c*dp*dp*u)/spp:null;}
export function nReference(s,r,d={}){
 const cfg=s.settings.course?.efficiency||{},m=runColumn(s,r).model,p=r.measured.pressure,pc=toPsi(p?.max,p?.unit),marker=t0Of(s,r,s.settings),volume=columnVolumeT0(m?.lengthMm,m?.idMm,flowOf(r));
 const t0=cfg.t0!==undefined&&cfg.t0!==null?cfg.t0:marker.ok&&!marker.proxy?marker.t0:volume.ok?volume.t0:null;
 const coefficients={a:cfg.a===undefined?1.5:cfg.a,b:cfg.b===undefined?3:cfg.b,c:cfg.c===undefined?.15:cfg.c},column=runColumn(s,r).column,record=s.settings.course?.inventory?.columns?.[column?.id],fresh=record?.definition===sha256(JSON.stringify([column?.id,column?.modelId,column?.serial,m])),declared=fresh&&positive(record?.spp)?record.spp:null,bead=m?.particleType?null:courseBead(m);
 const ref={L:m?.lengthMm,ID:m?.idMm,PS:m?.particleUm,F:flowOf(r),t0,tR:d.last??Math.max(0,...relevantPeaks(r).map(p=>p.tR)),Rs:d.rs??null,BP:pc.ok?pc.psi:null,spp:cfg.refSPP??declared??bead?.factor??(/SPP|core.shell|superficially/i.test(m?.particleType||'')?1.5:1),sppBasis:cfg.refSPP!=null?'User-entered reference factor':declared!==null?'User-declared current-stock architecture':bead?bead.basis:m?.particleType?'Recorded reference particle construction':'Course FPP assumption; architecture not verified',coefficients,source:N_SOURCE,
  t0Basis:cfg.t0!==undefined&&cfg.t0!==null?'User-entered documented t0':marker.ok&&!marker.proxy?marker.text:'Labelled column-volume estimate, not measured marker',estimatedT0:!(cfg.t0!==undefined&&cfg.t0!==null)&&!(marker.ok&&!marker.proxy),sppMax:cfg.sppMax===undefined?1.5:cfg.sppMax};
 ref.missing=['L','ID','PS','F','t0','tR','Rs','BP','spp','sppMax'].filter(k=>!positive(ref[k]));
 if(!Number.isFinite(coefficients.a)||coefficients.a<0||!positive(coefficients.b)||!positive(coefficients.c))ref.missing.push('valid van Deemter A/B/C');
 ref.ok=!ref.missing.length;if(ref.ok){ref.u=ref.L/(60*ref.t0);ref.H=plateHeight(ref.PS,ref.u,ref.spp,coefficients);ref.N=ref.L*1000/ref.H;}
 return ref;
}
export function predictEfficiency(ref,target){
 const q={L:target.L??ref.L,ID:target.ID??ref.ID,PS:target.PS??ref.PS,F:target.F??ref.F,spp:target.spp??ref.spp};
 if(!ref.ok||Object.values(q).some(v=>!positive(v)))return {ok:false,reason:'Positive reference and proposed dimensions, flow and bead factor are required.'};
 const ratio=(ref.F/q.F)*(q.ID/ref.ID)**2*(q.L/ref.L),t0=ref.t0*ratio,u=q.L/(60*t0),H=plateHeight(q.PS,u,q.spp,ref.coefficients),N=q.L*1000/H;
 return {ok:true,...q,t0,u,H,N,tR:ref.tR*ratio,BP:ref.BP*(q.L*q.F)/(ref.L*ref.F)*((ref.PS*ref.ID)/(q.PS*q.ID))**2,Rs:ref.Rs*Math.sqrt(N/ref.N),basis:'Awesome worksheet convention; Rs ratios use model N at both reference and proposed conditions. Exported peak N is retained separately, never mixed into this denominator.'};
}
export function efficiencyFloor(ref,spec){
 if(!ref.ok||!positive(spec.time)||!positive(spec.pressure)||!positive(spec.rs))return {ok:false};
 const HR=Math.sqrt((spec.pressure/ref.BP)*(spec.time/ref.tR)),Nmax=1000*ref.L*HR/(ref.PS*(ref.coefficients.a+2*Math.sqrt(ref.coefficients.b*ref.coefficients.c))),NmaxSPP=Nmax*ref.sppMax;
 return {ok:true,HR,Nref:ref.N,Nmax,NmaxSPP,fpp:spec.rs*Math.sqrt(ref.N/Nmax),spp:spec.rs*Math.sqrt(ref.N/NmaxSPP),basis:'Ideal continuous column/flow upper bound from Awesome E106:E111. Not proof that that column, bead, chemistry or rating is physically available.'};
}
export function nCombination({last,rs,time,rsSpec,floor,shortFraction=.5,timeOp='<=',rsOp='>='}){
 if(![last,rs,time,rsSpec,floor].every(Number.isFinite)||time<=0)return null;
 const row=compare(last,timeOp,time).pass?(last<=time*shortFraction?0:1):2,col=compare(rs,rsOp,rsSpec).pass?2:rs<floor?0:1;
 return {id:row*3+col+1,row,col,timeBand:['far below','within / near','above'][row],rsBand:['below floor','floor to specification','meets specification'][col],levers:[[['L'],['L','F-','PS','SPP'],['F+']],[[],['F-','PS','SPP'],['F+']],[[],['PS+F'],['F+']]][row][col],route:col===2&&row<2?'MET':col===0&&row>0?'SELECTIVITY':'N',action:[['Increase L (watch BP)','Increase L, decrease F, decrease PS or use SPP','MET; optionally increase F'],['Change selectivity','Decrease F, decrease PS or use SPP','MET; optionally increase F'],['Change selectivity','Decrease PS, then increase F','Increase F']][row][col]};
}
function constraints(pred,spec){return pred.ok&&pred.F<=spec.flowMax&&compare(pred.tR,spec.timeOp,spec.time).pass&&compare(pred.BP,spec.pressureOp,spec.pressure).pass&&compare(pred.Rs,spec.rsOp,spec.rs).pass;}
function flowInterval(ref,q,spec){
 const L=q.L??ref.L,ID=q.ID??ref.ID,PS=q.PS??ref.PS,spp=q.spp??ref.spp,Hbound=ref.H*(L/ref.L)*(ref.Rs/spec.rs)**2,cc=ref.coefficients,
  A=cc.c*PS*PS,B=cc.a*PS-spp*Hbound,C=cc.b,disc=B*B-4*A*C;
 if(disc<0)return null;
 const scale=ref.F/ref.u*(ID/ref.ID)**2,lo=(-B-Math.sqrt(disc))/(2*A)*scale,hi=(-B+Math.sqrt(disc))/(2*A)*scale;
 const timeMin=ref.F*(L/ref.L)*(ID/ref.ID)**2*ref.tR/spec.time*(spec.timeOp==='<'?1+1e-8:1),pressureMax=ref.F*spec.pressure/ref.BP*(ref.L/L)*((PS*ID)/(ref.PS*ref.ID))**2*(spec.pressureOp==='<'?1-1e-8:1);
 return {lo:Math.max(lo,timeMin,1e-8),hi:Math.min(hi,pressureMax,spec.flowMax)};
}
export function efficiencyAnalysis(s,r,d){
 const ref=nReference(s,r,d),S=s.settings.specs,cfg=s.settings.course||{},col=runColumn(s,r),ins=runInstrument(s,r),bounds=[{value:S.pressure.value,unit:'psi',op:S.pressure.op}];
 if(col.confirmed){const b=columnLimit(col.model,'pressure');if(b.known)bounds.push(b);}if(ins.confirmed)bounds.push(...(ins.instrument?.limits||[]).filter(x=>x.quantity==='pressure'));
 const caps=bounds.map(b=>({...b,p:toPsi(b.value,b.unit)})).filter(b=>b.p.ok&&b.p.psi>0&&['<','<='].includes(b.op)),pressureCap=Math.min(...caps.map(b=>b.p.psi)),strict=caps.some(b=>b.p.psi===pressureCap&&b.op==='<'),flowBound=ins.confirmed?ins.instrument?.limits?.find(x=>x.quantity==='flow'&&x.unit==='mL/min'&&positive(x.value)&&['<','<='].includes(x.op)):null;
 const spec={time:S.lastPeak.value,timeOp:S.lastPeak.op,pressure:pressureCap,pressureOp:strict?'<':'<=',flowMax:flowBound?flowBound.value*(flowBound.op==='<'?1-1e-8:1):Infinity,rs:S.minRs.value,rsOp:S.minRs.op},floor=efficiencyFloor(ref,spec),chosenFloor=Number.isFinite(cfg.rsFloor)?cfg.rsFloor:floor.ok?floor.spp:null;
 const combination=nCombination({last:d.last,rs:d.rs,time:spec.time,rsSpec:spec.rs,floor:chosenFloor,shortFraction:cfg.shortFraction??.5,timeOp:spec.timeOp,rsOp:spec.rsOp}),signature=sha256(JSON.stringify([r.id,r.raw.sha256,ref,spec,chosenFloor])),out={ref,spec,floor,combination,signature,options:[],source:N_SOURCE,missing:ref.missing};
 if(d.n!==S.peakCount.value||r.conditions.mode?.value==='GRA')return {...out,applicable:false,reason:'Isocratic N modelling needs the target peak count; unresolved co-elution and gradients use their own decisions.'};
 if(!ref.ok)return {...out,applicable:true,reason:'Supply '+ref.missing.join(', ')+'. No tR / pressure / Rs is invented.'};
 const add=(lever,q,why)=>{const pred=predictEfficiency(ref,q);out.options.push({lever,label:why,...pred,allInSpec:constraints(pred,spec),safePressure:pred.ok&&compare(pred.BP,spec.pressureOp,spec.pressure).pass,modelOnly:true,stockConfirmed:false});};
 // Single-lever targets and PS+F are a first module, not an exhaustive stock search.
 if(combination?.levers.includes('L')){
  const needed=ref.L*(spec.rs/ref.Rs)**2,cap=Math.min(ref.L*spec.time/ref.tR,ref.L*spec.pressure/ref.BP)*(spec.timeOp==='<'||spec.pressureOp==='<'?1-1e-8:1);
  if(cap>ref.L)add('L',{L:Math.min(needed*(1+1e-7),cap)},'Increase L within time / pressure headroom');
 }
 if(combination?.levers.includes('F-')){const v=flowInterval(ref,{},spec);if(v&&v.lo<=v.hi&&v.lo<ref.F){const F=Math.min(v.hi*(1-1e-8),ref.F*(1-1e-6));if(F>=v.lo)add('F-',{F},'Decrease F towards the feasible van Deemter interval');}}
 if(combination?.levers.includes('F+')){const v=flowInterval(ref,{},spec);if(v&&v.lo<=v.hi&&v.hi>ref.F)add('F+',{F:v.hi*(1-1e-8)},'Increase F while maintaining predicted Rs and BP');}
 if(combination?.levers.some(x=>x==='PS'||x==='PS+F')){
  const cc=ref.coefficients,Hbound=ref.H*(ref.Rs/spec.rs)**2,disc=cc.a**2+4*cc.c*ref.u*(ref.spp*Hbound-cc.b/ref.u),bound=disc>=0?(-cc.a+Math.sqrt(disc))/(2*cc.c*ref.u):null;
  if(positive(bound)&&bound<ref.PS){const PS=bound*(1-1e-6),v=flowInterval(ref,{PS},spec);if(combination.levers.includes('PS')&&predictEfficiency(ref,{PS}).BP<=spec.pressure)add('PS',{PS},'Decrease PS; verify packing and maximum pressure');if(v&&v.lo<=v.hi&&combination.levers.includes('PS+F'))add('PS+F',{PS,F:v.hi*(1-1e-8)},'Decrease PS, then raise F within all predicted specifications');}
 }
 if(combination?.levers.includes('SPP')&&ref.sppMax>ref.spp)add('SPP',{spp:ref.sppMax},'Compare theoretical SPP bead at unchanged dimensions and flow');
 out.recommended=out.options.find(x=>x.allInSpec)||null;
 out.applicable=true;out.reason=combination?.action||'Rs floor cannot be established.';
 out.scope='Initial sourced model. Coefficients and SPP factor are course calculator assumptions, not measured fits. Same chemistry/temperature/viscosity required. Physical stock and operating limits must be checked; predictions are not injection clearance.';
 return out;
}
