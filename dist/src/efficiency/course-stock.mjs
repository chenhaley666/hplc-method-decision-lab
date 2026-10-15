// Sourced reference comparisons are NOT current physical inventory declarations.
import {REFERENCE_COLUMN_MODELS} from '../presets/reference-equipment.mjs';
import {cite} from '../presets/sources.mjs';
import {runColumn} from '../data-model/derive.mjs';
import {shortRunLabel} from '../data-model/workspaces.mjs';
import {searchInventory,columnDefinition} from './inventory.mjs';
import {recipeEvidence} from './recipe-evidence.mjs';

export function ligandKey(value){const x=String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(/aqueous|polarmodified|c18aq/.test(x))return 'c18aq';
 if(['c18n','c18','c18octadecylsilanemonomeric'].includes(x))return 'c18';
 if(['c8','c8octylsilanemonomeric'].includes(x))return 'c8';
 if(/pentafluorophenyl|^pfpp$|^pfp$/.test(x))return 'pfpp';
 if(x==='biphenyl'||x==='bip')return 'biphenyl';
 if(/embeddedalkyl|^ibd$|^idb$/.test(x))return 'ibd';return null;
}
const examples=[
 {id:'raptor-150-5',product:'C18 Raptor bead-only teaching comparison',L:150,ID:4.6,PS:5,kind:'Teaching simulation, not confirmed stock',source:cite('EFF-ARCHIVE','PDF pp. 15–16, 84: bead-only same-geometry rule; current availability is not established')},
 {id:'raptor-250-5',product:'C18 Raptor 250 mm teaching comparison',L:250,ID:4.6,PS:5,kind:'Teaching simulation, not confirmed stock',source:cite('EFF-ARCHIVE','PDF pp. 17, 85, 95, 110: illustration / retrospective prediction; predicted exchange was not performed')},
 {id:'raptor-250-3',product:'C18 Raptor 250 mm / 3 µm teaching comparison',L:250,ID:4.6,PS:3,kind:'Teaching simulation, not confirmed stock',source:cite('EFF-ARCHIVE','PDF p. 85: above-4000-psi hypothetical row; not evidence of current column availability or rating')}
];
export function failedComparisons(search){
 const groups=new Map();for(const x of search?.evaluations||[]){if(x.allInSpec)continue;if(!groups.has(x.columnId))groups.set(x.columnId,[]);groups.get(x.columnId).push(x);}
 const score=x=>{const e=search.entries.find(e=>e.id===x.columnId),p=e?.limits;return p?Math.max(x.tR/p.time,x.BP/p.pressure,p.rs/Math.max(x.Rs,1e-20)):Infinity;};
 return [...groups.values()].map(xs=>{const safe=xs.filter(x=>x.passes.time&&x.passes.pressure&&x.passes.flow);return safe.length?safe.sort((a,b)=>b.Rs-a.Rs||a.tR-b.tR)[0]:xs.sort((a,b)=>score(a)-score(b)||b.Rs-a.Rs)[0];});
}
export function courseStockPreview(s,r,n){
 const base=runColumn(s,r).model,key=ligandKey(base?.ligand),models=[],columns=[],sourceById=new Map();
 const add=(m,meta)=>{const id='course-preview:'+meta.id,model={...m,id:id+':model'},column={id,modelId:model.id,label:meta.product,serial:null};models.push(model);columns.push(column);sourceById.set(id,meta);};
 for(const ref of REFERENCE_COLUMN_MODELS){const target=ligandKey(ref.ligand),mapped=key!==null&&key===target;add({...ref,ligand:mapped?base.ligand:ref.ligand,beadFamily:ref.product.startsWith('Ultra')?'Ultra':'Pinnacle',provenance:{source:'sourced course reference comparison only',sources:ref.sources}},
  {id:ref.refId,product:ref.product,kind:'Course-supplied product specification; current stock unconfirmed',source:cite('EQ-MEMO','§4 supplied-column table; Selectivity memo §3 preserves the six products'),mapped});}
 for(const x of examples)add({manufacturer:'Restek',product:x.product,ligand:key==='c18'?base.ligand:'C18n',beadFamily:'Raptor',lengthMm:x.L,idMm:x.ID,particleUm:x.PS,particleType:'superficially porous',limits:{pMax:null,pMaxUnit:'psi',tMaxC:null,pH:null},provenance:{source:'course teaching simulation only',sources:[x.source]}},{...x,mapped:key==='c18'});
 const inventory={...s.settings.course?.inventory,columns:Object.fromEntries((s.columns||[]).map(c=>[c.id,{available:false}]))};
 for(const c of columns)inventory.columns[c.id]={definition:columnDefinition(c,models.find(m=>m.id===c.modelId)),available:true};
 const virtual={...s,columnModels:[...s.columnModels,...models],columns:[...s.columns,...columns],settings:{...s.settings,course:{...s.settings.course,inventory,inventoryChoice:null,inventoryChoiceSignature:null}}};
 const z=searchInventory(virtual,r,n),failures=failedComparisons(z),rows=z.entries.filter(x=>sourceById.has(x.id)).map(entry=>{
  const meta=sourceById.get(entry.id),passed=z.feasible.filter(x=>x.columnId===entry.id),best=passed[0]||failures.find(x=>x.columnId===entry.id)||null;
  return {id:meta.id,product:meta.product,kind:meta.kind,source:meta.source,geometry:{L:entry.model.lengthMm,ID:entry.model.idMm,PS:entry.model.particleUm,bead:entry.spp>1?'SPP':'FPP'},compatible:entry.compatible,compatibilityBasis:entry.compatibilityBasis,
   reasons:entry.reasons||[z.reason],checks:entry.checks||[],interval:entry.interval,modelFeasible:passed.length,evaluated:entry.evaluated||0,rejectCounts:entry.rejectCounts,
   best:best?{...best,stockConfirmed:false,verificationComplete:false,sourceRunId:r.id,sourceRunLabel:shortRunLabel(r),source:meta.source,checks:[...new Set(['Current physical availability and exact column identity',...best.checks])]}:null};
 });
 return {ok:z.ok,reason:z.reason,referenceRunId:r.id,referenceRunLabel:shortRunLabel(r),criteria:z.criteria,gridCount:z.gridCount,evaluated:z.evaluated,rows,
  courseProductFeasible:rows.filter(x=>x.kind.startsWith('Course-supplied')).reduce((a,x)=>a+x.modelFeasible,0),teachingSimulationFeasible:rows.filter(x=>x.kind.startsWith('Teaching')).reduce((a,x)=>a+x.modelFeasible,0),
  measured:{tR:n?.ref?.tR??null,BP:n?.ref?.BP??null,Rs:n?.ref?.Rs??null,F:n?.ref?.F??null},referenceConditions:{organic:r.conditions.organic?.value??null,percentB:r.conditions.percentB?.value??null,temperature:r.conditions.ovenSetpoint?.value??null},
  carrying:recipeEvidence(r).carrying,recipe:recipeEvidence(r),
  assumptions:{source:n?.source||'Awesome Calculator',t0:n?.ref?.t0??null,t0Basis:n?.ref?.t0Basis||'not established',particleFactor:n?.ref?.spp??null,particleBasis:n?.ref?.sppBasis||'not established'},
  stockConfirmed:false,planningOnly:true,performed:false,recommended:null,
  scope:'Deterministic sourced reference × flow comparison, not current inventory or a global optimum. Course products, teaching simulations and user-confirmed actual stock are separate. No source comparison can prefill an experiment. Same K / alpha / chemistry / temperature / viscosity assumptions apply. Unknown hardware limits remain checks, never inferred ratings.'};
}
