import {shortRunLabel} from '../data-model/workspaces.mjs';
import {courseBottleRecipe} from '../presets/documented-materials.mjs';
import {recipeEvidence} from './recipe-evidence.mjs';
export function stockChoiceEvidence(s,r,n,x){
 const entry=n.inventory.entries.find(e=>e.id===x.columnId),limits=entry?.limits||n.spec,priority=n.inventory.criteria.priority;
 const margins={time:limits.time-x.tR,pressure:limits.pressure-x.BP,rs:x.Rs-limits.rs};
 const recipe=recipeEvidence(r),carrying=recipe.carrying;
 return {referenceRunId:r.id,referenceRunLabel:shortRunLabel(r),reference:{tR:n.ref.tR,BP:n.ref.BP,Rs:n.ref.Rs,F:n.ref.F,L:n.ref.L,ID:n.ref.ID,PS:n.ref.PS,t0:n.ref.t0,t0Basis:n.ref.t0Basis},conditions:{L:x.L,ID:x.ID,PS:x.PS,bead:x.spp>1?'SPP':'FPP',F:x.F,organic:r.conditions.organic?.value??null,percentB:r.conditions.percentB?.value??null,temperature:r.conditions.ovenSetpoint?.value??null},carrying,recipe,documentedPreparation:courseBottleRecipe(r.conditions.organic?.value),margins,limits,reason:`Reference ${shortRunLabel(r)}: measured last tR ${n.ref.tR.toFixed(3)} min, BP ${n.ref.BP.toFixed(0)} psi, calculated/exported Rs ${n.ref.Rs.toFixed(3)}. This recorded stock/flow set ${x.allInSpec?'meets the model comparisons':'fails '+Object.entries(x.passes||{}).filter(([,v])=>!v).map(([k])=>k).join(', ')}: time margin ${margins.time.toFixed(3)} min, pressure margin ${margins.pressure.toFixed(0)} psi, Rs margin ${margins.rs.toFixed(3)}. Rank preference: ${priority}; documented-input sets rank before conditional sets. ${x.compatibilityBasis}.`,scope:'Course Awesome / Method Transfer prediction with unchanged K, alpha, chemistry and viscosity; margins are calculated, not experimental evidence. Carrying values are reference declarations, not new measurements.'};
}
