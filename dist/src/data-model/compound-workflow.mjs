// Explicit analysis copies, never moves or changes to the Dashboard originals.
import {copyRunsToWorkspace,WORKSPACE_STAGES} from './workspaces.mjs';
export function prepareCompoundWorkspace(workspaces,ids){
 const dst=workspaces.retention,chosen=[...new Set(ids)],sources=chosen.map(id=>WORKSPACE_STAGES.map(stage=>({stage,run:workspaces[stage].runs.find(r=>r.id===id)})).find(x=>x.run));
 if(sources.some(x=>!x))return {ok:false,added:[],reason:'A selected run is no longer available. Nothing was copied.'};
 for(const x of sources){const prior=dst.runs.find(r=>r.id===x.run.id);if(prior&&JSON.stringify(prior.raw)!==JSON.stringify(x.run.raw))return {ok:false,added:[],reason:'An analysis record has the same ID but different raw evidence. Resolve this conflict before copying; nothing was overwritten.'};}
 const empty=dst.runs.length===0,added=[];
 for(const {stage,run}of sources)if(stage!=='retention')added.push(...copyRunsToWorkspace(workspaces,stage,'retention',[run.id]));
 if(empty&&added.length)dst.settings.specs=structuredClone(workspaces.equipment.settings.specs);
 for(const id of added)dst.runs.find(r=>r.id===id).flags.fit=true;
 return {ok:true,added,existing:chosen.length-added.length,reason:`${added.length} analysis copies added; ${chosen.length-added.length} existing analysis records kept. Dashboard originals, history and existing analysis work remain unchanged. No compound identities or t0 confirmations were inferred.`};
}
