import {displayRunOrder} from '../data-model/workspaces.mjs';
import { h,field,details,table } from './dom.mjs';
import { commit,setUi,store,switchStage } from './state.mjs';
import { LOCAL_INSTRUMENT_FLEET } from '../presets/reference-equipment.mjs';
import { fromReferenceInstrument,newColumnModel,newPhysicalColumn } from '../data-model/equipment.mjs';
import { profileConfirmationStatus,confirmProfileValues } from '../importers/profiles.mjs';
import { historyRuns } from '../selectivity/progression.mjs';
import { shortRunLabel,copyRunsToWorkspace } from '../data-model/workspaces.mjs';
import { setHeightFilter,heightFilterSummary,HEIGHT_UNITS,HEIGHT_THRESHOLD_MIN,HEIGHT_THRESHOLD_MAX,validHeightThreshold } from '../data-model/peak-filter.mjs';
export function decodeColumnCode(code) {
  const families={P:'Pinnacle',U:'Ultra',F:'Force',R:'Raptor'},last=String(code||'').slice(-1).toUpperCase();
  return families[last]?{ligand:String(code).slice(0,-1),beadFamily:families[last]}:{ligand:String(code||'')||null,beadFamily:null};
}
export function acceptNamedMethod(s, ids=null) {
  for(const r of s.runs) if((!ids||ids.has(r.id))&&r.profileExtras && profileConfirmationStatus(r).ok)
    for(const c of Object.values(r.conditions)) if(String(c.source||'').startsWith('profile:monashplc-runname') && c.value!==null) {
      c.confirmed=true; c.note=(c.note||'')+' Accepted as a recorded method declaration under the enabled course-name convention; not independent measurement verification.';
    }
}
export function correctNameMetadata(s,r,values) {
  r.nameOverrides={...values,source:'user correction of auto-read course fields; original names preserved'};
  let i=s.instruments.find(i=>i.fleetNumber===values.hplcNo);
  if(!i){i=fromReferenceInstrument(LOCAL_INSTRUMENT_FLEET.find(i=>i.fleetNumber===values.hplcNo));s.instruments.push(i);}
  r.assoc.instrumentId={value:i.id,source:'user selected HPLC in optional correction form',confirmed:true};
  const m=newColumnModel({product:`${values.ligand} / ${values.beadFamily}`,ligand:values.ligand,beadFamily:values.beadFamily,
    lengthMm:values.lengthMm,idMm:values.idMm,particleUm:values.particleUm,provenance:{source:'user correction of file-name column descriptors'},notes:'Descriptors corrected by user. Physical allocation and operating limits require their own evidence.'});
  s.columnModels.push(m);const column=newPhysicalColumn({modelId:m.id,label:`${values.ligand} / ${values.beadFamily} ${values.lengthMm}×${values.idMm}×${values.particleUm} (allocation unconfirmed)`});s.columns.push(column);
  r.assoc.columnId={value:column.id,source:'user corrected column descriptors; physical column unconfirmed',confirmed:false};
}
export function proposeNamedEquipment(s) {
  for(const r of s.runs) {
    const v=r.profileExtras;if(!v)continue;
    let instrument=s.instruments.find(i=>i.fleetNumber===v.hplcNo);
    if(!instrument&&LOCAL_INSTRUMENT_FLEET.some(i=>i.fleetNumber===v.hplcNo)) {instrument=fromReferenceInstrument(LOCAL_INSTRUMENT_FLEET.find(i=>i.fleetNumber===v.hplcNo));s.instruments.push(instrument);}
    const g=v.geometry,key=`${v.columnCode} / ${g.lengthMm}×${g.idMm}×${g.particleUm}`;
    let model=s.columnModels.find(m=>m.provenance?.nameProfileKey===key);
    if(!model){model=newColumnModel({product:v.columnCode,...decodeColumnCode(v.columnCode),...g,provenance:{source:v.source,nameProfileKey:key},notes:'Ligand code and bead/product family parsed under the user-confirmed course naming convention (P Pinnacle, U Ultra, F Force, R Raptor). This is not the porous-particle architecture, serial number or a manufacturer operating limit.'});s.columnModels.push(model);}
    let column=s.columns.find(c=>c.modelId===model.id&&c.notes==='Unconfirmed name-profile allocation');
    if(!column){column=newPhysicalColumn({modelId:model.id,label:key+' (allocation unconfirmed)',notes:'Unconfirmed name-profile allocation'});s.columns.push(column);}
    r.equipmentSuggestion={instrumentId:instrument?.id||null,columnId:column.id,from:v.parsedFrom,code:v.columnCode};
    if(!r.assoc.columnId?.value)r.assoc.columnId={value:column.id,source:v.source+' (type only; physical allocation not confirmed)',confirmed:false};
    if(!r.assoc.instrumentId?.value&&instrument)r.assoc.instrumentId={value:instrument.id,source:v.source,confirmed:false};
    // Fill the heading from the current stage's latest name, but never confirm.
    s.settings.stageInstrumentId||=instrument?.id||null;s.settings.stageColumnId||=column.id;
  }
}
export function applyStageEquipment(s,runs) {
  for(const r of runs) {
    for(const [setting,key] of [['stageInstrumentId','instrumentId'],['stageColumnId','columnId']])
      if(s.settings[setting] && s.settings[setting+'Confirmed']===true && !r.assoc[key]?.value) r.assoc[key]={value:s.settings[setting],source:'user-selected stage equipment (explicit allocation)',confirmed:true};
  }
}
export function stageContext(st) {
  const s=st.session, set=s.settings, stage=st.ui.stage;
  const chooseInstrument=value=>commit(ss=>{
    if(value.startsWith('fleet:')) {
      const n=Number(value.slice(6)); let ins=ss.instruments.find(i=>i.fleetNumber===n);
      if(!ins) {ins=fromReferenceInstrument(LOCAL_INSTRUMENT_FLEET.find(i=>i.fleetNumber===n));ss.instruments.push(ins);}
      ss.settings.stageInstrumentId=ins.id;
    } else ss.settings.stageInstrumentId=value||null;
    ss.settings.stageInstrumentIdConfirmed=!!value;
  });
  return h('section',{class:'card','data-testid':'stage-context'},h('h3',`${stage[0].toUpperCase()+stage.slice(1)} setup`),
    h('p',{class:'small'},'Equipment is shared reference material. The CSV library, selections, compounds, settings and current experiment below belong only to this stage.'),
    h('div',{class:'row wrap'},
      field('HPLC used in this stage',h('select',{'data-testid':'stage-instrument',onchange:e=>chooseInstrument(e.target.value)},h('option',{value:''},'Choose HPLC…'),
        s.instruments.map(i=>h('option',{value:i.id,selected:set.stageInstrumentId===i.id?'selected':null},i.label)),LOCAL_INSTRUMENT_FLEET.filter(i=>!s.instruments.some(x=>x.fleetNumber===i.fleetNumber)).map(i=>h('option',{value:`fleet:${i.fleetNumber}`},`HPLC ${i.fleetNumber} (${i.description})`)))),
      field('Physical column used in this stage',h('select',{'data-testid':'stage-column',onchange:e=>commit(ss=>{ss.settings.stageColumnId=e.target.value||null;ss.settings.stageColumnIdConfirmed=!!e.target.value;})},h('option',{value:''},s.columns.length?'Choose physical column…':'No columns recorded yet'),s.columns.map(c=>h('option',{value:c.id,selected:set.stageColumnId===c.id?'selected':null},c.label)))),
      h('button',{type:'button','data-testid':'stage-equipment-reference',onclick:()=>switchStage('equipment')},'View / add equipment'),
      h('button',{type:'button','data-testid':'apply-stage-equipment',disabled:!s.runs.length,onclick:()=>commit(ss=>{ss.settings.stageInstrumentIdConfirmed=!!ss.settings.stageInstrumentId;ss.settings.stageColumnIdConfirmed=!!ss.settings.stageColumnId;applyStageEquipment(ss,ss.runs.filter(r=>!st.ui.selected.size||st.ui.selected.has(r.id)));})},st.ui.selected.size?'Confirm / fill missing equipment for selected runs':'Confirm / fill missing equipment for this stage')),
    s.runs.some(r=>r.equipmentSuggestion)?details('Equipment detected from course-format names: review and confirm',false,
      h('p',{class:'small'},'Names automatically suggest HPLC number, column code and dimensions. They do not establish a column serial number or prove that repeated types are one physical column. Confirm only the selected runs whose laboratory records establish their actual allocation. Existing file-stated associations are kept unless you explicitly confirm this alternative.'),
      table(['Run','HPLC suggestion','Ligand type','Bead / product family','Column / geometry','Name-source status'],displayRunOrder(s.runs.filter(r=>r.equipmentSuggestion),s).map(r=>{const c=s.columns.find(c=>c.id===r.equipmentSuggestion.columnId),m=s.columnModels.find(m=>m.id===c?.modelId);return h('tr',h('td',shortRunLabel(r)),h('td',`HPLC ${r.profileExtras.hplcNo}`),h('td',m?.ligand||'unknown'),h('td',m?.beadFamily||'unknown'),h('td',c?.label),h('td',profileConfirmationStatus(r).reason));})),
      h('button',{type:'button','data-testid':'confirm-named-equipment',disabled:!st.ui.selected.size,onclick:()=>{
        let n=0;commit(ss=>{for(const r of ss.runs.filter(r=>st.ui.selected.has(r.id)&&r.equipmentSuggestion&&profileConfirmationStatus(r).ok)) {
          confirmProfileValues(r);for(const key of ['instrumentId','columnId'])if(r.equipmentSuggestion[key])r.assoc[key]={value:r.equipmentSuggestion[key],confirmed:true,source:'user-confirmed course-name allocation; user declares these selected type-matched runs used the indicated physical column'};n++;
        }});setUi(u=>{u.message=`Confirmed your equipment allocation for ${n} selected run(s). Conflicting names require a recorded source choice in Details first. No CSV, serial number or manufacturer limit was invented.`;});
      }},'I confirm the selected runs used these HPLCs and physical columns')):null,
    h('p',{class:'tiny'},'Selections supply missing associations for new imports, never overwrite file-stated equipment or earlier run allocations. Changing column or HPLC does not relabel past measurements. Column limits remain separate.'),
    ['retention','selectivity'].includes(stage)?field('Current experiment for the next-step decision',h('select',{'data-testid':'current-experiment',onchange:e=>commit(ss=>{ss.settings.currentRunId=e.target.value||null;})},
      h('option',{value:''},'Latest eligible sample run in this stage (acquisition order)'),displayRunOrder(historyRuns(s),s).map(r=>h('option',{value:r.id,selected:set.currentRunId===r.id?'selected':null},shortRunLabel(r))))):null,
    set.currentRunId?h('p',{class:'tiny'},'This is an explicit user selection. Later known acquisitions are excluded from decision history for this earlier experiment; retained fit selections stay visible.'):null);
}
export function workspaceTransfer(st) {
  if(!st.session.runs.length)return null;
  let target='selectivity'; if(st.ui.stage==='selectivity')target='retention';
  return details(st.ui.stage==='equipment'?'Legacy data: explicitly assign runs to an experiment stage':'Copy selected runs to another stage',false,
    h('p',{class:'small'},'Select rows in this library, then copy. No cycle is inferred from a filename. The other stage receives an independent copy of the measurements and recorded assignments; subsequent selections and edits do not affect this stage.'),
    h('select',{'data-testid':'transfer-target',onchange:e=>{target=e.target.value;}},['retention','selectivity','efficiency','gradient'].filter(x=>x!==st.ui.stage).map(x=>h('option',{value:x,selected:x===target?'selected':null},x))),
    h('button',{type:'button','data-testid':'transfer-runs',disabled:!st.ui.selected.size,onclick:()=>{
      let ids;commit(()=>{ids=copyRunsToWorkspace(store.workspaces,st.ui.stage,target,[...st.ui.selected]);});setUi(u=>{u.message=`Copied ${ids.length} run(s) to ${target}. This stage is unchanged. Switch stages to inspect them.`;});
    }},'Copy selected runs'));
}
export function peakFilterPanel(st) {
  const s=st.session, draft=s.settings.heightFilterDraft||{threshold:10000,enabled:false};
  const chosen=s.runs.filter(r=>!st.ui.libraryAdvanced||!st.ui.selected.size||st.ui.selected.has(r.id));
  const setThreshold=v=>{const n=Number(v);if(v!==''&&validHeightThreshold(n))commit(ss=>{ss.settings.heightFilterDraft={...draft,threshold:n};});else setUi(u=>{u.message='Peak-height threshold must be 10,000–100,000 inclusive. Previous value kept; no filter applied.';});};
  const live=s.runs.filter(r=>r.heightFilter?.enabled),unit=draft.unit||'raw';
  return h('section',{class:'card compact','data-testid':'peak-filter-panel'},h('h3','Optional small-peak filter'),
    h('p',{class:'small'},'Off by default. Choose a threshold from 10,000 to 100,000 inclusive with the slider or numeric input. Preview the remaining peaks before applying. Equal heights and missing heights remain. A peak count of eight does not prove that one peak should be removed.'),
    h('p',{class:'small warn'},'Thresholds use the original exported Height numbers. Optional unit selection labels that original scale; it does not convert numbers. Select a physical unit only when your export documentation confirms it. Chromatogram-axis units do not establish peak-table Height units. Never treat absorbance and voltage as interchangeable.'),
    h('div',{class:'row wrap'},
      field('Unit of the exported Height numbers (optional)',h('select',{'data-testid':'height-unit',onchange:e=>commit(ss=>{ss.settings.heightFilterDraft={...draft,unit:e.target.value,unitConfirmed:false};})},HEIGHT_UNITS.map(u=>h('option',{value:u,selected:unit===u?'selected':null},u==='raw'?'Raw export units / unknown':u)))),
      field('Threshold (10,000–100,000)',h('input',{type:'range',min:HEIGHT_THRESHOLD_MIN,max:HEIGHT_THRESHOLD_MAX,step:1000,value:Math.min(HEIGHT_THRESHOLD_MAX,Math.max(HEIGHT_THRESHOLD_MIN,draft.threshold)),'data-testid':'height-threshold-slider',onchange:e=>setThreshold(e.target.value)})),
      field(`Threshold (10,000–100,000 ${unit==='raw'?'raw export units':unit})`,h('input',{type:'number',min:HEIGHT_THRESHOLD_MIN,max:HEIGHT_THRESHOLD_MAX,step:'any',value:draft.threshold,'data-testid':'height-threshold',onchange:e=>setThreshold(e.target.value)})),
      h('button',{type:'button','data-testid':'apply-height-filter',disabled:!chosen.length||!validHeightThreshold(draft.threshold)||(unit!=='raw'&&!draft.unitConfirmed),onclick:()=>commit(ss=>{for(const r of chosen)setHeightFilter(r,true,draft.threshold,unit);ss.settings.heightFilterDraft={...draft,enabled:true};})},`Apply to ${st.ui.libraryAdvanced&&st.ui.selected.size?'selected':'all stage'} runs (${chosen.length})`),
      h('button',{type:'button','data-testid':'clear-height-filter',disabled:!chosen.length,onclick:()=>commit(ss=>{for(const r of chosen)setHeightFilter(r,false,validHeightThreshold(draft.threshold)?draft.threshold:HEIGHT_THRESHOLD_MIN);ss.settings.heightFilterDraft={...draft,enabled:false};})},'Restore all heights')),
    h('p',{class:live.length?'small warn':'small','data-testid':'height-filter-status'},live.length?`Height filtering active on ${live.length} run(s): ${live.reduce((n,r)=>n+heightFilterSummary(r).excluded,0)} peaks excluded. Results are conditional on your exclusions; a height cut-off does not prove noise or interference.`:'No peak-height filter is active.'),
    unit!=='raw'?h('label',{class:'check small'},h('input',{type:'checkbox',checked:!!draft.unitConfirmed,'data-testid':'height-unit-confirm',onchange:e=>commit(ss=>{ss.settings.heightFilterDraft={...draft,unitConfirmed:e.target.checked};})}),` I confirm that the selected files' exported Height numbers are in ${unit}; no conversion is requested. If units/scales differ, apply separately to selected runs.`):null,
    s.runs.length?h('div',{'data-testid':'per-run-height-filters'},h('h4','Preview / adjust one run'),h('p',{class:'small'},'Each Apply changes only that run. Different raw scales need different thresholds. No peaks are automatically removed to reach the target count.'),
      table(['Run','Threshold (10,000–100,000)','Would remain','Active / original peaks','Apply / restore'],displayRunOrder(s.runs,s).map(r=>{const v=st.ui.heightRowDrafts?.[r.id]??r.heightFilter?.threshold??draft.threshold,n=Number(v),valid=v!==''&&validHeightThreshold(n),remain=valid?r.measured.peaks.filter(p=>!Number.isFinite(p.height)||p.height>=n).length:null;return h('tr',h('td',shortRunLabel(r)),h('td',h('input',{type:'number',min:HEIGHT_THRESHOLD_MIN,max:HEIGHT_THRESHOLD_MAX,step:'any',value:v,'aria-label':`Peak-height threshold for ${shortRunLabel(r)}`,'data-testid':`height-run-${r.id}`,onchange:e=>setUi(u=>{u.heightRowDrafts||={};u.heightRowDrafts[r.id]=e.target.value;})})),h('td',{'data-testid':`height-remain-${r.id}`,class:remain===0?'warn':''},remain===null?'Enter 10,000–100,000':`${remain}${remain===0?' — all peaks would be excluded':''}`),h('td',`${r.measured.peaks.length-heightFilterSummary(r).excluded} / ${r.measured.peaks.length}`),h('td',h('button',{type:'button',disabled:!valid||(unit!=='raw'&&!draft.unitConfirmed),'data-testid':`height-apply-${r.id}`,onclick:()=>commit(ss=>setHeightFilter(ss.runs.find(x=>x.id===r.id),true,n,unit))},'Apply'),h('button',{type:'button',disabled:!r.heightFilter?.enabled,'data-testid':`height-restore-${r.id}`,onclick:()=>commit(ss=>setHeightFilter(ss.runs.find(x=>x.id===r.id),false,validHeightThreshold(r.heightFilter.threshold)?r.heightFilter.threshold:HEIGHT_THRESHOLD_MIN,r.heightFilter.unit||'raw'))},'Restore')));}),{'data-testid':'height-run-preview'})):null,
    details('Preview, excluded peaks and unit warning',false,
      h('p',{class:'small'},'Thresholds refer to the original peak-table Height values, not a converted chromatogram axis. If the export does not state peak-height units, that scale is UNKNOWN. Apply separately to selected compatible files when scales differ. No signal units are converted. Excluding a marker blocks its use as t0; an exported Rs cannot be reassigned to a newly adjacent pair.'),
      table(['Run','Original peaks','Below proposed threshold','Height missing (kept)','Active threshold / declared unit'],chosen.map(r=>h('tr',h('td',shortRunLabel(r)),h('td',String(r.measured.peaks.length)),h('td',String(r.measured.peaks.filter(p=>Number.isFinite(p.height)&&p.height<draft.threshold).length)),h('td',String(heightFilterSummary(r).missing)),h('td',r.heightFilter?.enabled?`${r.heightFilter.threshold} ${r.heightFilter.unit||'raw'}`:'off')))),
      live.map(r=>h('p',{class:'tiny'},`${shortRunLabel(r)}: excluded peak numbers ${r.measured.peaks.filter(p=>Number.isFinite(p.height)&&p.height<r.heightFilter.threshold).map(p=>p.no).join(', ')||'none'}. Original CSV unchanged.`))));
}
