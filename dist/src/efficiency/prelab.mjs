import {predictEfficiency} from './model.mjs';
import {relevantPeaks,modeOf,isBlank} from '../data-model/derive.mjs';
import {compare} from '../rules.mjs';
import {runColumn} from '../data-model/derive.mjs';
import {courseBead,familyTransfer} from './families.mjs';
export const PRELAB_SOURCE='Awesome 260907, AWESOME CALC: E29 equivalent u·PS, C62:W62 H, C66:W66 model N, C70:W70 Rs ratios; Method Transfer 260907 E21/E40; Cycle 3 LabArchives B6–B8.';
const pos=x=>Number.isFinite(x)&&x>0;
export function prelabPredictions(s,r,n){
 const ref=n?.ref,spec=n?.spec,cfg=s.settings.course?.prelab||{},out={ok:false,rows:[],source:PRELAB_SOURCE};
 if(!ref?.ok||n?.applicable===false||relevantPeaks(r).length!==s.settings.specs.peakCount.value||modeOf(r)!=='ISO'||isBlank(r))return {...out,reason:'Choose a target-peak isocratic reference with t0, geometry, F, tR, Rs and pressure before predicting. Six-peak data cannot become an N reference.'};
 const peak=relevantPeaks(r).sort((a,b)=>a.tR-b.tR).at(-1),measuredN=pos(peak?.plates)?peak.plates:pos(peak?.widthBase)?16*(peak.tR/peak.widthBase)**2:pos(peak?.widthHalf)?5.54*(peak.tR/peak.widthHalf)**2:null,
 L=cfg.L??250,ID=cfg.ID??ref.ID,PS=cfg.PS??3,F=cfg.F??ref.F*.8,spp=cfg.spp??courseBead({beadFamily:cfg.family})?.factor??ref.sppMax,m=runColumn(s,r).model,transfer=cfg.family?familyTransfer(m,{ligand:m?.ligand,beadFamily:cfg.family}):null;
 if(![L,ID,PS,F,spp].every(pos))return {...out,reason:'Positive proposed L, ID, PS, flow and bead factor are needed. Blank inputs reset to the labelled reference/default; invalid values do not become zero.'};
 const rows=[],add=(id,label,q,basis,actual=false)=>{const p=predictEfficiency(ref,q);if(!p.ok)return;const passes={time:compare(p.tR,spec.timeOp,spec.time).pass,pressure:compare(p.BP,spec.pressureOp,spec.pressure).pass,rs:compare(p.Rs,spec.rsOp,spec.rs).pass,flow:p.F<=spec.flowMax},failed=Object.entries(passes).filter(([,ok])=>!ok).map(([k])=>k),same=(['L','ID','PS','spp','F'].every(k=>p[k]===ref[k]));
  rows.push({...p,id,label,basis,NModel:p.N,NReferenceCalibrated:measuredN===null?null:measuredN*p.N/ref.N,measuredN:actual?measuredN:null,passes,allInSpec:!failed.length,performed:actual,stockConfirmed:actual?null:false,verdict:actual?'Measured reference responses; N model shown separately.':(failed.length?'Excluded by '+failed.join(', ')+'. ':'Numerically meets specifications. ')+(same?'No change from reference. ':'')+'Simulation unless matching physical stock and operating limits are confirmed.'});};
 add('reference','Reference run',{},'Measured tR / BP / Rs, measured or width-derived N alongside the Awesome model N.',true);
 add('length','Length only',{L},'F unchanged; N and time/BP scale with L.');
 add('diameter','Internal diameter only at fixed F',{ID},'Changing ID at fixed flow changes linear velocity, column volume, time and pressure. Check injection-volume scaling and extra-column effects separately.');
 add('particle','Particle size, equivalent system',{PS,F:ref.F*ref.PS/PS},'Method Transfer E21 / Awesome E29 keeps u·PS constant, so F changes with PS; not a fixed-flow particle comparison.');
 add('particle-fixed','Particle size at fixed F',{PS},'Separate van Deemter comparison at the original F.');
 if(spp>ref.spp)add('bead','Bead only (same-phase SPP)',{spp},'Course SPP factor applied relative to the current bead once; tR and BP unchanged. Requires actual same-selectivity chemistry, not a guessed Ultra-to-Raptor exchange.');
 add('flow','Flow only',{F},'H changes along the van Deemter curve; decreasing F need not always improve N.');
 add('time','Flow for tR at specification',{F:ref.F*ref.tR/spec.time},'Exact time-boundary flow; strict operators may reject equality.');
 add('pressure','Flow for BP at specification',{F:ref.F*spec.pressure/ref.BP},'Exact effective pressure-boundary flow; no pressure margin, strict operators may reject equality.');
 if(transfer?.blocked)rows.push({id:'custom',label:'User-entered geometry / family comparison',ok:false,verdict:transfer.basis+'. No N-only tR / BP / Rs prediction issued; record separate chemistry data.'});
 else add('custom','User-entered geometry / family comparison',{L,ID,PS,F,spp},`Simulation only: editable L / ID / PS / F. ${cfg.family?`Selected ${cfg.family}; ${transfer.basis}.`:'Particle factor is a labelled model assumption.'} Requires unchanged selectivity, viscosity and exact stock/limits confirmation. ID changes also need injection / extra-column review.`);
 const stock=n.inventory?.selected||n.inventory?.recommended;
 if(stock){add('combined','Selected stock / combined plan',stock,stock.compatibilityBasis);Object.assign(rows.at(-1),{stockConfirmed:true,columnId:stock.columnId,checks:stock.checks,verdict:stock.verificationComplete?'Declared-stock model plan; validate experimentally.':'Declared-stock conditional plan: '+stock.checks.join('; ')});}
 else {const best=rows.filter(x=>!x.performed&&x.allInSpec).sort((a,b)=>a.tR-b.tR)[0];if(best){rows.push({...best,id:'combined',label:'Best passing comparison (simulation)',basis:'Among these displayed comparisons only; not an exhaustive stock winner.'});}else rows.push({id:'combined',label:'Combined run to make',ok:false,verdict:'No displayed comparison meets all specifications. Use the stock × flow search or return to Selectivity; no performed run is invented.'});}
 rows.push({id:'uplc',label:'Above method-pressure limit / UPLC',ok:false,verdict:'Not automatically prescribed. Change the method specification only when justified and use the actual instrument and new column ratings; then recalculate.'});
 return {...out,ok:true,rows,measuredN,requiredGain:(spec.rs/ref.Rs)**2,targetMeasuredN:measuredN===null?null:measuredN*(spec.rs/ref.Rs)**2,reason:'Pre-lab hypotheses. Measured N and Awesome model N remain separate; reference-calibrated N uses measured N × model N₂/N₁, not a mixed denominator.'};
}
