import { h,details,table,field,sourceList } from './dom.mjs';
import { store,commit,setUi,switchStage } from './state.mjs';
import { LOCAL_INSTRUMENT_FLEET,REFERENCE_COLUMN_MODELS } from '../presets/reference-equipment.mjs';
import { fromReferenceColumnModel,newPhysicalColumn } from '../data-model/equipment.mjs';
import { SOLVENT_B_OPTIONS,newLabDefaults } from '../presets/local-lab.mjs';
import { cite } from '../presets/sources.mjs';
import { shortRunLabel } from '../data-model/workspaces.mjs';
import { ILLUSTRATIONS,illustrationCard } from './illustrations.mjs';
import {toolkitMachines,toolkitColumn} from './toolkit-diagrams.mjs';
import {documentedMaterialsPanel} from './documented-materials-view.mjs';
const MODULES=['Solvent bottles','Degasser','Pump / gradient valve','Mixer','Manual injector','Autosampler','Column oven','Column','UV / PDA detector','Controller','Waste drain','Other / unknown'];
const TOOLKIT='2026 ALL CYCLES COLUMN and HPLC TOOLKIT (260807)';
export function equipmentReference(st) {
  return h('section',{class:'card','data-testid':'equipment-reference'},h('h2','Equipment reference'),
    h('p','A laboratory reference for HPLC 1–6, their modules, operation and column records. Choose your apparatus above or in Dashboard step 2; use Dashboard step 3 to import the first CSV. No earlier experiment or historical column serial is required.'),
    table(['System','Pump / mixing','Injection','Detection','Course source'],LOCAL_INSTRUMENT_FLEET.map(i=>h('tr',h('td',`HPLC ${i.fleetNumber}`),
      h('td',i.fleetNumber===3?'Binary high-pressure gradient: two solvent pumps':'Quaternary low-pressure gradient: proportioning before the pump'),
      h('td',[1,2,5].includes(i.fleetNumber)?'Manual six-port injector':'Autosampler'),h('td',[1,2,4,5].includes(i.fleetNumber)?'UV':'UV / PDA (verify fitted detector)'),h('td',`${TOOLKIT}, slide ${i.fleetNumber===3?3:i.fleetNumber===6?4:[1,2,5].includes(i.fleetNumber)?5:2}${i.fleetNumber===4?' + supplied HPLC 4 illustration':''}`)))),
    h('p',{class:'small'},'All systems have a mobile-phase path through degassing, pumping/mixing, injection, column/oven and detection to waste. Physical stacking is not the liquid flow order. Model numbers and installed limits must come from the instrument label or documented record.'),
    h('p',{class:'small','data-testid':'fleet-pump-confirmation'},'Local configuration confirmed by the user on 12 October 2026: only HPLC 3 has binary high-pressure gradient pumps; HPLC 1, 2, 4, 5 and 6 use quaternary low-pressure gradient. Historical SOP differences are retained in record details.'),
    h('button',{type:'button','data-testid':'apply-fleet-pumps',onclick:()=>{let n=0;commit(ss=>{for(const i of ss.instruments.filter(i=>Number.isInteger(i.fleetNumber)&&i.fleetNumber>=1&&i.fleetNumber<=6)){i.pump.type=i.fleetNumber===3?'binary-hpg':'quaternary-lpg';i.mixing=i.fleetNumber===3?'after-pumps (high-pressure mixing)':'before-pump (proportioning valve)';i.provenance.pumpConfirmation='User applied confirmed local pump configuration, 12 October 2026';n++;}});setUi(u=>{u.message=`Updated ${n} saved local fleet record(s) to the confirmed pump types. Imported CSVs and recorded experimental conditions were not changed.`;});}},'Update saved local fleet pump records'),
    toolkitMachines(st),
    h('section',{'data-testid':'module-gallery'},h('h3','HPLC regions: pictures, functions and controls'),
      h('p',{class:'small'},'Select a module in the inspector below for its current admissible range. The pictures explain the mechanism; they do not establish which exact module or column produced an imported run.'),
      details('Additional mechanism diagrams: flow, pump, injector, column and detector',false,h('div',{class:'illus-grid'},ILLUSTRATIONS.map(illustrationCard))),
      table(['Region','What it does / where to look','Experimental relevance'],[
        ['Solvent bottles / inlet filters','Provide mobile phase; check A/B bottle labels and immersed inlet filters.','Identity, pH and additives belong to bench preparation.'],
        ['Degasser','Removes dissolved gas before delivery; check the low-pressure inlet path.','Air can disturb pressure and baseline; it is not a retention control.'],
        ['Pump heads / check valves / drain valve','Pistons deliver flow, check valves direct it, drain diverts purge liquid to waste.','Flow and %B are set in the pump method. Keep purge and analytical flow paths distinct.'],
        ['Gradient valve / mixer','Quaternary systems proportion before the pump; binary systems combine two pumped streams downstream.','Only local HPLC3 is binary; the other five are quaternary.'],
        ['Injector / autosampler','Introduces sample after pumping; manual LOAD fills a loop, INJECT puts the loop in the flow path.','Confirm loop capacity or programmed injection volume; sample carry-over can create extra peaks.'],
        ['Column / oven','The packed stationary phase separates compounds; the oven controls temperature.','Ligand and temperature change selectivity. Column geometry and flow also affect time and efficiency.'],
        ['UV / PDA detector','Measures absorbance in a flow cell after the column.','Wavelength changes visibility, not separation. Peaks are not automatically compound identities.'],
        ['Controller / workstation','Sets timing and records chromatograms, integration and module signals.','Retain measured vs calculated values and the exported units.'],
        ['Waste drain','Collects detector effluent and separate purge waste.','Check waste capacity and the lab disposal procedure.'],
      ].map(row=>h('tr',row.map(x=>h('td',x))))),sourceList([cite('SHIMADZU-MODULES','configuration, pump, injection and oven figures')]),
      details('Shimadzu model-specific reference and unresolved fitted-model differences',false,
        h('p','LC-2030C NT manufacturer page: four-solvent low-pressure gradient; flow settings 0.0001–10 mL/min; autosampler 0.1–100 µL (option-dependent); oven set range 4–60 °C for packed columns. These reference ranges are not automatically applied to another local instrument.'),
        h('p',{class:'warn'},'Verify HPLC4 model/configuration: the checked manufacturer page lists PDA detection and packed-column maximum 34 MPa at ≤5 mL/min (about 4931 psi), while the local record says UV and user-confirmed 6000 psi hardware maximum. The method acceptance criterion is configured separately in Specifications. Resolve the exact fitted-model label before relying on the higher hardware rating; no manufacturer range is silently copied into saved records.'),sourceList([cite('SHIMADZU-2030','Pump, Autosampler, Column Oven and PDA Detector')]))),
    documentedMaterialsPanel(st),solventReference(st),toolkitColumn(st),columnReference(st),
    details('Purge / injection reference and precautions',false,
      h('p','The manual injector diagrams distinguish LOAD and INJECT. The toolkit’s manual-injector purge illustration specifies pump OFF, MeOH and LOAD position (slide 19); slide 18 explains residual sample in the stator channel. This is an injector illustration, not a universal pump-purge procedure.'),
      h('p','For pump purge, identify the solvent inlet/filter, degasser, pump heads and drain valve to waste (slide 24). Follow the applicable instrument SOP and demonstrator’s instruction for valve setting, compatible solvent, purge flow and duration. The supplied toolkit does not specify those values or a complete model-specific start-up sequence. Do not run a generic guessed purge procedure through the column.'),
      h('p','For manual injection, check LOAD/INJECT and loop capacity (slides 11–19); for autosamplers use the verified needle/loop method. Confirm solvent supply, waste capacity, leaks and the applicable pressure limits before acquisition.')),
    details('Optional column notes and sources',false,h('p',`${TOOLKIT}, slide 38 describes label/box photographs and a serial for laboratory record keeping. In this website a serial/photo is optional: a local label can identify the same selected column during Retention / Selectivity. Record known geometry/ligand and applicable limits when available; leave unknowns blank. The 6% and 10% drawings in slides 47–49 are illustrations, not a datasheet or proof of stock.`)),
    h('div',{class:'row wrap'},['retention','selectivity','efficiency','gradient'].map(k=>h('button',{type:'button',onclick:()=>switchStage(k)},`Open ${k}`))),
    photoPanel(st));
}
function solventReference(st) {
  const lab=st.session.settings.localLab||newLabDefaults();
  return h('section',{class:'card inner','data-testid':'solvent-reference'},h('h3','Solvent reference and bottle assignment'),
    h('p',`Solvent A: ${lab.phaseA||'water'}. Solvent B: ${SOLVENT_B_OPTIONS.find(x=>x[0]===lab.solventB)?.[1]||'choose ACN, MeOH or Mix'}. Local planning pH ${lab.pH}; flow ${lab.flow} mL/min.`),
    field('Solvent B for local planning (optional)',h('select',{'data-testid':'equipment-solvent-b',onchange:e=>commit(ss=>{ss.settings.localLab={...newLabDefaults(),...ss.settings.localLab,solventB:e.target.value};})},SOLVENT_B_OPTIONS.map(([v,label])=>h('option',{value:v,selected:lab.solventB===v?'selected':null},label)))),
    table(['Line / solvent','Meaning','What changes'],[
      ['A: water','Aqueous mobile phase. Record actual pH/additives separately.','Increasing the aqueous fraction generally increases reversed-phase retention.'],
      ['B: ACN','Acetonitrile organic phase.','Changing %B changes retention; ACN and MeOH can move individual compounds differently.'],
      ['B: MeOH','Methanol organic phase.','Same %B is not equivalent to ACN. Measure pressure and critical-pair resolution after changing solvent.'],
      ['B: Mix (ACN + MeOH)','Record ACN % v/v inside B bottle; MeOH is the remainder. This is separate from pump %B.','No pure-solvent nomogram or quantified mixed-solvent prediction is applied. Unknown ratio leaves the recipe incomplete, not the original CSV unreadable.'],
      ['ISO / GRA','ISO: constant composition. GRA: composition changes with time.','The isocratic retention fit cannot be applied to a gradient run.'],
    ].map(row=>h('tr',row.map(x=>h('td',x))))),h('p',{class:'small'},'%B is the proportion delivered from bottle B, not a name for its contents. Planning defaults never overwrite measured conditions or imported method declarations. Follow the lab SOP for solvent handling and waste.'));
}
function columnReference(st) {
  return h('section',{class:'card inner','data-testid':'column-reference'},h('h3','Course column catalogue: six ligand choices'),
    h('p',{class:'small'},'Mechanical: geometry, particle/pore size and particle architecture. Chemical: ligand, end-capping, carbon loading and operating pH. Bead/product family (Pinnacle / Ultra / Force / Raptor) is separate from ligand type. Choose your current column when known; a label, serial and full inventory are optional. Reference products do not prove current availability or a historical allocation.'),
    REFERENCE_COLUMN_MODELS.map(r=>h('article',{class:'column-reference-row','data-testid':`catalogue-${r.refId}`},h('h4',`${r.product} (${r.uspL})`),
      table(['Characteristic','Value'],[['Ligand',r.ligand],['Geometry',`${r.lengthMm} × ${r.idMm} mm; ${r.particleUm} µm`],['Particles / pore',`${r.particleType}; ${r.poreA} Å`],['Carbon loading / surface',`${r.carbonPct}% / ${r.surfaceM2g} m²/g`],['End-capping',r.endcapped?'yes':'no'],['pH / temperature',`${r.limits.pH.join('–')}; ≤ ${r.limits.tMaxC} °C`],['Column pressure rating',r.limits.pMax===null?'Not published on the checked product page; verify the exact datasheet':`${r.limits.pMax} ${r.limits.pMaxUnit}`]].map(row=>h('tr',row.map(x=>h('td',x))))),
      h('p',{class:'small'},r.note),sourceList(r.sources),
      h('button',{type:'button','data-testid':`add-catalogue-${r.refId}`,onclick:()=>{commit(ss=>{const m=fromReferenceColumnModel(r);ss.columnModels.push(m);ss.columns.push(newPhysicalColumn({modelId:m.id,label:r.product+' (physical allocation not yet confirmed)'}));});setUi(u=>{u.message='Added a reference model. Select it only if it describes your current column; serial/photo optional. No historical CSV or stock declaration was changed.';});}},'Add this model to equipment records'))),
    h('p',{class:'small warn'},'A team notebook records 4000 psi for a PFPP column, but does not provide an independently verifiable manufacturer pressure document. This is retained as team-record evidence, not promoted to a product-family rating. Pinnacle PFPP and Ultra PFP Propyl are different families; their dimensions and pore/surface specifications must not be mixed.'));
}
export function photoPanel(st) {
  const catalogue=store.workspaces.equipment;
  const photos=catalogue.equipmentPhotos||[];
  const selected=photos.find(p=>p.id===st.ui.photoId)||photos.at(-1);
  const add=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>4*1024*1024||photos.length>=8){setUi(u=>{u.message='Use JPEG, PNG or WebP up to 4 MB. Maximum eight local photos. Nothing uploaded.';});return;}
    const project=store.workspaces;
    try {
      const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Image could not be read'));r.readAsDataURL(file);});
      // Decode before accepting a corrupt or falsely named picture.
      await new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=()=>reject(new Error('Invalid image'));img.src=data;});
      if(store.workspaces!==project)return;
      const id=crypto.randomUUID();commit(()=>{catalogue.equipmentPhotos||=[];catalogue.equipmentPhotos.push({id,name:file.name,data,annotations:[],basis:'User-provided laboratory photograph. Manual annotation; no automatic recognition.'});});setUi(u=>{u.photoId=id;});
    } catch(err){setUi(u=>{u.message=err.message+'; nothing uploaded.';});}
  };
  let label=st.ui.photoLabel||MODULES[0];
  let start=null;
  const image=selected?h('div',{class:'photo-region','data-testid':'photo-region',tabindex:0,'aria-label':'Laboratory photograph. Drag to mark a region; numeric region controls are also available.',
    onpointerdown:e=>{if(e.target.closest('button'))return;const b=e.currentTarget.getBoundingClientRect();start={x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))};e.currentTarget.setPointerCapture(e.pointerId);},
    onpointerup:e=>{if(!start)return;const b=e.currentTarget.getBoundingClientRect(),x=Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y=Math.max(0,Math.min(1,(e.clientY-b.top)/b.height));const a={id:crypto.randomUUID(),label,x:Math.min(x,start.x),y:Math.min(y,start.y),w:Math.abs(x-start.x),h:Math.abs(y-start.y),confirmed:false};start=null;if(a.w<.015||a.h<.015)return;commit(()=>{selected.annotations.push(a);});}},
    h('img',{src:selected.data,alt:`Local HPLC photo: ${selected.name}`,draggable:false}),selected.annotations.map(a=>h('button',{type:'button',class:'photo-box',style:`left:${a.x*100}%;top:${a.y*100}%;width:${a.w*100}%;height:${a.h*100}%;`,'aria-label':`${a.label}, ${a.confirmed?'user confirmed':'unconfirmed manual label'}`,onclick:()=>setUi(u=>{u.photoAnnotationId=a.id;})},a.label,a.confirmed?' ✓':' ?'))):null;
  return h('section',{class:'card inner','data-testid':'photo-panel'},h('h3','Your laboratory photo: local region annotation'),
    h('p',{class:'small','data-testid':'photo-privacy'},'Photos stay in this browser and exported session JSON. No upload to a server or vision service. This feature is manual region annotation, not automatic recognition. It does not establish equipment limits or run associations.'),
    field('Choose a laboratory photo (JPEG / PNG / WebP, ≤ 4 MB)',h('input',{type:'file',accept:'image/jpeg,image/png,image/webp','data-testid':'photo-input',onchange:add})),
    photos.length?field('Local photo',h('select',{'data-testid':'photo-select',onchange:e=>setUi(u=>{u.photoId=e.target.value;})},photos.map(p=>h('option',{value:p.id,selected:p===selected?'selected':null},p.name)))):h('p',{class:'empty'},'Upload a photo, choose the module name, then drag a box around it. You can also add and edit a box numerically.'),
    selected?h('div',field('Name for the next region',h('select',{'data-testid':'photo-label',onchange:e=>{label=e.target.value;st.ui.photoLabel=label;}},MODULES.map(n=>h('option',{value:n,selected:label===n?'selected':null},n)))),image,
      h('button',{type:'button','data-testid':'add-photo-region',onclick:()=>commit(()=>selected.annotations.push({id:crypto.randomUUID(),label,x:.1,y:.1,w:.25,h:.2,confirmed:false}))},'Add an editable region'),
      selected.annotations.map(a=>details(`${a.label} (${a.confirmed?'confirmed by user':'unconfirmed'})`,a.id===st.ui.photoAnnotationId,
        field('Region name',h('input',{value:a.label,onchange:e=>commit(()=>{a.label=e.target.value.trim()||a.label;})})),
        ['x','y','w','h'].map(k=>field(`${k} (% of image)`,h('input',{type:'number',min:0,max:100,step:1,value:Math.round(a[k]*100),onchange:e=>{const n=Number(e.target.value);if(n>=0&&n<=100)commit(()=>{a[k]=n/100;a.x=Math.min(a.x,1-a.w);a.y=Math.min(a.y,1-a.h);});}}))),
        h('label',h('input',{type:'checkbox',checked:a.confirmed,onchange:e=>commit(()=>{a.confirmed=e.target.checked;})}),' I confirmed this label from the photograph / instrument'),
        h('button',{type:'button',onclick:()=>commit(()=>{selected.annotations=selected.annotations.filter(x=>x!==a);})},'Remove this label'))),
      h('button',{type:'button','data-testid':'remove-photo',onclick:()=>{commit(()=>{catalogue.equipmentPhotos=catalogue.equipmentPhotos.filter(p=>p.id!==selected.id);});setUi(u=>{u.message='Removed this local photo and its annotations. It remains recoverable from any session JSON you exported earlier.';});}},'Remove this photo')):null);
}
