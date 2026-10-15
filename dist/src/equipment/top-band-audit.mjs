// Evidence readiness, not a grading engine. No missing fact is inferred.
import {inspect,instrumentInterval} from './inspector.mjs';
import {MODULES} from './modules.mjs';
import {runColumn,runInstrument} from '../data-model/derive.mjs';
import {automaticModelQuality} from '../retention/planning.mjs';
import {lineageCompare} from '../retention/eligibility.mjs';
import {usable} from '../data-model/conditions.mjs';
import {courseBottleRecipe,materialContext,remainingMaterialChecks} from '../presets/documented-materials.mjs';
import {recipeEvidence} from '../efficiency/recipe-evidence.mjs';
export function highestBandAudit(s,e,analysis=null){
 const d=e.current,r=s.runs.find(x=>x.id===d?.runId),col=r?runColumn(s,r):{},ins=r?runInstrument(s,r):{},instrument=ins.confirmed?ins.instrument:null,model=col.confirmed?col.model:null;
 const parameters=['percentB','flow','ovenSetpoint','pH','injVolume','wavelength','acquisitionTime','column ligand','column geometry'].map(id=>inspect(s,s.settings,{kind:'parameter',id},{run:r||null}));
 const missing=[];if(!r)missing.push('Import a measured run to scope the inspection.');
 if(!ins.confirmed)missing.push('Confirm the actual instrument association, not its filename suggestion.');
 if(!col.confirmed)missing.push('Confirm the associated column label and product model; a serial number is optional.');
 if(instrument&&!instrument.detector?.model)missing.push('Record the exact fitted detector model (UV/PDA alone is not its wavelength specification).');
 for(const p of parameters.filter(x=>!x.range.known&&x.range.requiredField))missing.push(`${p.label}: ${p.range.requiredField}.`);
 if(model&&!model.datasheetRef&&!model.provenance?.sources?.length)missing.push('Exact column datasheet/source for its operating limits.');
 if(model&&!model.particleType)missing.push('Record the actual column particle construction (FPP or SPP), not a guessed architecture from a generic illustration.');
 if(model&&!Number.isFinite(model.limits?.pMax))missing.push('Own column pressure rating and unit, not a rating copied from another column.');
 for(const [quantity,unit]of [['pressure','psi'],['flow','mL/min'],['temperature','°C'],['wavelength','nm']]){
  const bounds=instrumentInterval(instrument,quantity,unit);if(!bounds.sourced)missing.push(`${quantity}: record an exact fitted-module bound and its source (pressure may also use a documented bar/MPa rating).`);
  if(quantity!=='pressure'&&(!bounds.lower||!bounds.upper))missing.push(`${quantity}: the full fitted-module interval is incomplete; ${!bounds.lower?'lower':''}${!bounds.lower&&!bounds.upper?' and ':''}${!bounds.upper?'upper':''} bound not recorded. A method/search setting is not a hardware bound.`);
  if(bounds.invalid||bounds.contradictory)missing.push(`Resolve invalid or contradictory ${quantity} bounds; they do not establish an admissible range.`);
 }
 const z=d?.efficiency?.inventory,active=['N','MET'].includes(d?.status),feasible=z?.feasible||[],documented=feasible.filter(x=>x.verificationComplete),plan=e.nextPlanned,required=['mode','phaseA','phaseB','pH','injVolume','wavelength','sampleType','sampleConc','acquisitionTime'],unknownRecipe=[...new Set([...recipeEvidence(r).missing,...required.filter(k=>plan?.methodRecords?!plan.methodRecords.some(x=>x.key===k&&x.value!==null):!r||!usable(r.conditions[k]))])];
 const reference=analysis?.eligibility?.reference,compatible=!!r&&!!reference&&lineageCompare(s,s.settings,r,reference).comparable;
 const compoundReady=!!d&&!['HOLD','INVESTIGATE','SPECIFICATIONS','BLANK'].includes(d.status)&&compatible&&!!analysis?.fits?.coverage?.complete&&!!analysis?.intermediate?.ok&&automaticModelQuality(analysis)&&unknownRecipe.length===0,stockReady=active&&documented.length>=2&&unknownRecipe.length===0;
 const compoundMissing=[];
 if(!analysis?.fits)compoundMissing.push('Comparable selected isocratic runs, established t0 and a checked cross-run peak-to-compound table are needed before full compound fits can be evaluated.');
 if(analysis?.fits&&!analysis.fits.coverage?.complete)compoundMissing.push(`All-analyte coverage is incomplete: ${analysis.fits.coverage?.adequate??0}/${analysis.fits.coverage?.expected??'unknown'} adequately modelled; confirm missing/unattributed peaks rather than assigning by order or AUC alone.`);
 if(analysis?.fits&&!automaticModelQuality(analysis))compoundMissing.push('Every compound line must pass the existing explicit fit/coverage gate in Expert Retention; a qualified Dashboard last-peak fit does not substitute for this.');
 if(reference&&!compatible)compoundMissing.push('The selected measured reference is not comparable with the compound-model reference; do not transfer it across solvent/column/temperature/sample changes.');
 if(unknownRecipe.length)compoundMissing.push('Complete carried next-method records: '+unknownRecipe.join(', ')+'.');
 if(['HOLD','INVESTIGATE','SPECIFICATIONS','BLANK'].includes(d?.status))compoundMissing.push('Resolve the active stop/investigation/specification state before issuing next-run conditions.');
 return {scope:r?`Measured reference: ${d.label}`:'No current measured reference',foundMaterials:{context:s.settings.usagePurpose==='example'?materialContext(r):null,bottlePrescription:courseBottleRecipe(r?.conditions?.organic?.value),stillNeeded:remainingMaterialChecks(r,{example:s.settings.usagePurpose==='example'})},equipment:{modules:MODULES.length,parameters,missing:[...new Set(missing)],inputsPresent:!!r&&missing.length===0,humanCheck:'Ask a returning user to select modules/parameters and reconstruct why the active action is recommended, without another document.'},automation:{routes:'Either all-compound log K–%B intermediate calculation OR several admissible complete condition sets with individual reasons.',compound:{inputsPresent:compoundReady,status:analysis?.status||'not-started',coverage:analysis?.fits?.coverage||null,missing:compoundReady?[]:compoundMissing},stock:{inputsPresent:stockReady,active,feasible:feasible.length,documented:documented.length,unknownRecipe,missing:[...(!active?['The selected reference is not on the active N/MET route; view a valid target-peak reference before selecting stock plans.']:[]),...(documented.length<2?['At least two model-feasible stock × flow sets with documented t0, actual availability, compatible phase, column ratings and instrument limits.']:[]),...(unknownRecipe.length?['Complete carried method records: '+unknownRecipe.join(', ')+'. Course-prescribed bottle contents are already available in Documented materials; confirm actual preparation rather than resupplying the memo.']:[]),...new Set(feasible.flatMap(x=>x.checks))]},inputsPresent:compoundReady||stockReady,limitation:'This is input readiness for demonstration, not a score, experimental validation or clearance to inject.'}};
}
