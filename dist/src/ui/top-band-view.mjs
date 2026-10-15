import {h,table,details} from './dom.mjs';
import {highestBandAudit} from '../equipment/top-band-audit.mjs';
import {inspectorPanel} from './inspector-view.mjs';
import {downloadText} from './library.mjs';
import {switchStage,setUi} from './state.mjs';
export function topBandPanel(st,s,e,analysis){
 const a=highestBandAudit(s,e,analysis),r=s.runs.find(x=>x.id===e.current?.runId),A=a.automation;
 return details('Highest-band rubric checks · evidence needed, not a grade',false,
 h('section',{'data-testid':'top-band-audit'},h('h3','Automation · 20-point band'),h('p',A.routes),
 h('p',{class:'small'},'Optional assessment audit for the tool author, not a first-use checklist or an import gate. Later-model evidence is not prior history that a beginner must already have.'),
 table(['Route','Current evidence','What is still needed'],[
 h('tr',h('td','A · all-compound log K–%B'),h('td',A.compound.inputsPresent?'Inputs present for a conditional model demonstration':`Not established · ${A.compound.status}`),h('td',A.compound.missing.map(x=>h('p',{class:'small'},x)))),
 h('tr',h('td','B · multiple admissible condition sets'),h('td',`${A.stock.feasible} model-feasible; ${A.stock.documented} with model inputs documented. ${A.stock.inputsPresent?'Inputs present for a conditional demonstration':'Not established for this session'}.`),h('td',A.stock.missing.map(x=>h('p',{class:'small'},x))))]),
 h('p',{class:'warn'},A.limitation),h('p',{class:'small'},'Route A appears automatically on the main Dashboard when comparable file-labelled compounds and a usable t0 establish a complete model; optional guided analysis remains available. A last-peak line is not that model. Route B is an extended stock × flow tool, not the active FC1 optimisation. A complete zero-correction import demonstration is separate from input readiness; unknown scientific records are never guessed for automation.'),h('p',{class:'small'},'The no-unresolved-checks status is this tool’s evidence check, not a quoted grading rule requiring a new t0 measurement. Source-labelled course t0 estimates remain valid conditional planning inputs; retain their assumption label rather than presenting them as measurements.'),
 h('h3','Equipment · 10-point band'),h('p',a.scope),h('p',a.equipment.inputsPresent?'The recorded inputs are present for a run-specific inspection demonstration; human usability is not proved.':'The interactive explanation exists, but applicable equipment evidence is incomplete.'),h('ul',a.equipment.missing.map(x=>h('li',{class:'small'},x))),h('p',{class:'small'},a.equipment.humanCheck),
 h('p',{class:'small'},'Documented materials supplies the course bottle recipes and six course products. Before an actual experiment, verify your own equipment, current stock and bottle preparation. Class-group history and historical test-column serials are not prerequisites for website operation or testing.'),
 h('button',{type:'button','data-testid':'open-equipment-records',onclick:()=>{switchStage('equipment');setUi(u=>{u.openEquipmentRecords=true;});}},'Open equipment records / enter sourced limits'),
 details('Inspect every module / parameter for this measured reference',false,inspectorPanel({...st,session:s},{run:r||null})),
 h('h3','Other highest-band requirements'),table(['Criterion','Evidence / remaining task'],[
 ['Each decision row / combinations','Constructed boundary and malformed-file tests cover the priority branches. Demonstrate with teacher-permitted laboratory runs/specification changes or the supplied marker files if available; synthetic fixtures are not the official files.'],
 ['Selectivity order','History, next and following steps are visible in the cycle path. Missing experiments remain unperformed; OBSERVE choices are signature-bound.'],
 ['Usability · 5-point band','Have someone who has not built the tool complete one file-to-next-conditions cycle unaided, including print/mobile if used. Record their difficulties and the fixes.'],
 ['Build record · 5-point band','Supply the complete AI conversation PDF, your truthful authorship/AI declaration, matching code/repository and constructed test evidence. The source download is a supplement, not a verified course upload.'],
 ['Provenance','STU_084 lineage and source hashes are retained. Only your own development and truthful submission documents can satisfy the authorship requirement.']].map(x=>h('tr',x.map(t=>h('td',t))))),
 h('button',{type:'button','data-testid':'export-top-band-audit',onclick:()=>downloadText('HPLC_highest_band_evidence_check.json',JSON.stringify(a,null,2),'application/json')},'Export current evidence gaps (.json)')));
}
