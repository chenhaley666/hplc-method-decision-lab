import {h,table,details,sourceList} from './dom.mjs';
import {COURSE_STOCK,courseBottleRecipe,addCourseStockRecords,remainingMaterialChecks} from '../presets/documented-materials.mjs';
import {LOCAL_INSTRUMENT_FLEET} from '../presets/reference-equipment.mjs';
import {cite} from '../presets/sources.mjs';
import {commit,setUi} from './state.mjs';
import {downloadText} from './library.mjs';
const rows=items=>items.map(x=>h('tr',x.map(v=>h('td',v))));
export function bottlePreparation(recipe,{print=false}={}){if(!recipe)return null;return h('section',{'data-testid':print?'print-document-bottle-recipe':'document-bottle-recipe'},h('h4','Documented A/B preparation for the next experiment'),
 table(['Bottle','Course-prescribed contents'],rows([['A',recipe.phaseA],['B',recipe.phaseB]])),h('p',{class:'small'},recipe.state+'. Imported conditions remain unchanged. '+recipe.checks.join(' ')),sourceList([recipe.source]));}

// Course references are useful before the first injection. Group datasets are
// developer regression fixtures, not user history or apparatus declarations.
export function documentedMaterialsPanel(st,run=null){
 return details('Documented materials found in your course files',false,h('section',{'data-testid':'documented-materials'},h('h3','Course reference for your own experiment'),
 h('p',{class:'small'},'Start with your actual instrument, column and bottles. These source-backed course prescriptions are reference information, not automatically confirmed user equipment or present inventory. No previous group experiments or historical serials are required.'),
 h('h4','Six course-supplied column products'),table(['Product','Geometry','Availability evidence'],COURSE_STOCK.map(x=>h('tr',h('td',x.product),h('td',`${x.L} × ${x.ID} mm; ${x.PS} µm`),h('td',x.scope)))),sourceList([cite('EQ-MEMO','§4 supplied-column table'),cite('SEL-MEMO','§3: same six products, new instrument allocation')]),
 h('p',{class:'small'},'Different ligands are Selectivity choices, not automatically compatible N-only transfers. Calculator dimensions are examples, not additional inventory or hardware ratings.'),
 h('button',{type:'button','data-testid':'add-course-stock',onclick:()=>{let count;commit(s=>{count=addCourseStockRecords(s);});setUi(u=>{u.message=`Added ${count} sourced course reference column(s). Confirm which are available for your experiment. No run association or measured response was created.`;});}},'Add six course reference columns (availability unconfirmed)'),
 h('h4','Documented local instrument architecture'),table(['Systems','Configuration','Source'],rows([
 ['HPLC 1 / 2 / 5','Manual injection; quaternary low-pressure gradient; UV','Equipment LAB slide 30; Retention ED slide 16'],
 ['HPLC 3','Binary high-pressure gradient; autosampler; PDA','Equipment LAB slides 16, 30, 55'],
 ['HPLC 4 / 6','Autosampler; user-confirmed quaternary low-pressure gradient','Local configuration; exact fitted models require confirmation']
 ])),sourceList([cite('EQ-LAB','slides 16–18, 30, 55 and notes'),cite('RET-ED','slide 16')]),
 h('p',{class:'small'},'Course acquisition settings are method choices, not hardware-capability bounds. Check the fitted module and applicable SOP before a real experiment.'),
 bottlePreparation(courseBottleRecipe(run?.conditions?.organic?.value||'ACN')),
 run?.conditions?.organic?.value==='Mix'?h('p',{class:'warn'},'No mixed B-bottle recipe is assigned: record the actual ACN:MeOH ratio and acid preparation.'):null,
 h('div',h('h4','Before operating the instrument — not an upload checklist'),h('ul',remainingMaterialChecks(run).map(x=>h('li',{class:'small'},x)))),
 h('button',{type:'button','data-testid':'export-materials',onclick:()=>downloadText('HPLC_course_reference_materials.json',JSON.stringify({scope:'Course reference, not user equipment or measured-run confirmation',courseStock:COURSE_STOCK,instruments:LOCAL_INSTRUMENT_FLEET.map(i=>({fleetNumber:i.fleetNumber,pump:i.pump,injector:i.injector,detector:i.detector})),bottlePrescription:courseBottleRecipe(run?.conditions?.organic?.value||'ACN'),beforeRealExperiment:remainingMaterialChecks(run)},null,2),'application/json')},'Export course reference materials (.json)')));
}
