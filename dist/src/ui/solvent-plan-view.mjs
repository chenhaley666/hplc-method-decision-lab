import {displayRunOrder} from '../data-model/workspaces.mjs';
import {h,field,table,details,f} from './dom.mjs';
import {commit,setUi} from './state.mjs';
import {solventSuggestions} from '../selectivity/solvent-plan.mjs';
export function solventPlanPanel(st){const s=st.session,z=solventSuggestions(s),saved=s.settings.solventPlan;
 const choose=x=>commit(ss=>{ss.settings.solventPlan={sourceRunId:x.sourceRunId,B:x.B,to:'MeOH',signature:x.signature};});
 return h('section',{'data-testid':'meoh-suggestions'},h('h4','MeOH choices from imported ACN results'),
 z.references.length?field('ACN reference CSV · run number ascending; current choice retained',h('select',{'data-testid':'meoh-source',onchange:ev=>{commit(ss=>{ss.settings.solventPlan={sourceRunId:ev.target.value};});setUi(u=>{if(u.tools)u.tools.manualComposition=false;});}},displayRunOrder(z.references,s).map(x=>h('option',{value:x.runId,selected:z.source?.runId===x.runId?'selected':null},`${x.label} · ${x.B}% ACN · ${x.peaks} peaks · last ${f(x.last,3)} min · Rs ${f(x.rs,3)}`)))):null,
 h('p',{class:'small'},z.reason),z.source?h('p',{'data-testid':'meoh-source-evidence'},z.candidates[0]?.evidence||z.source.label):null,
 z.source?.pressure?.specificationPass===false||z.source?.pressure?.operatingFailures?.length?h('p',{class:'warn'},'Source operating/pressure failure: correct it before attempting a solvent-change plan. These are previews, not injection clearance.'):null,
 z.candidates.length?h('div',h('p',{class:'small'},'Ascending MeOH %B; the matched-strength reference is labelled, not ranked as a proven optimum.'),table(['MeOH %B','Why test this concentration','Plan'],[...z.candidates].sort((a,b)=>a.B-b.B).map(x=>h('tr',{'data-testid':'meoh-candidate-'+x.B},h('td',x.B,x.B===z.conversion.rounded?' · Matched strength':''),h('td',{class:'small'},x.reason),h('td',h('button',{type:'button','data-testid':'meoh-choose-'+x.B,onclick:()=>choose(x)},z.selected?.B===x.B?'Selected':'Choose hypothesis')))))):null,
 h('p',{'data-testid':'meoh-selected'},z.selected?`Planned ${z.selected.B}% MeOH from ${z.source.label}; not performed. No MeOH minimum, tR, Rs or pressure is inferred.`:saved?.B!==undefined?'Previous choice expired after its source data / specifications changed. Choose again.':'No MeOH hypothesis selected.'),
 z.candidates.length?details('Comparison controls and checks',false,h('p',{class:'small'},z.candidates[0].checks.join(' '))):null);
}
