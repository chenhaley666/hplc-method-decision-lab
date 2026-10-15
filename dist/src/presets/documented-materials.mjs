// Curated facts from uploaded sources. Historical records and course prescriptions
// never become measured run conditions or current stock declarations by default.
import {cite} from './sources.mjs';
import {REFERENCE_COLUMN_MODELS} from './reference-equipment.mjs';
import {newInstrument,newColumnModel,fromReferenceColumnModel,newPhysicalColumn} from '../data-model/equipment.mjs';

export const ARCHIVE_GR37 = Object.freeze({
 group:'GR37',cycle:3,instrument:3,period:'September 2026 Efficiency session',
 product:'Pinnacle DB C18',catalogue:'9414565',lot:'130213Q',serial:'13031348T',
 L:150,ID:4.6,PS:5,particleType:'fully porous',
 source:cite('EFF-ARCHIVE','PDF pp. 46, 48–49: GR37 Cycle 3; column label photograph and transcribed serial'),
 instrumentSource:cite('EFF-ARCHIVE','PDF p. 52: labelled laboratory photograph and HPLC 3 diagram'),
 modules:'Binary high-pressure gradient (two pumps), degasser, autosampler, column oven and PDA; an additional fluorescence module is pictured. Exact module models and operating bounds are not readable/documented here.',
 t0:{estimated:1.08,observed:1.03,unit:'min',source:cite('EFF-ARCHIVE','PDF pp. 101–104: 150 × 4.6 mm at 1.5 mL/min; volume estimate versus blank disturbance'),scope:'Later Cycle 3 blank on HPLC 3. The reported disturbance is not proof of an identified uracil peak in the earlier HPLC 2 CSVs.'},
 note:'Example/test evidence only, not current user equipment. Do not attach this serial, module configuration or t0 to another injection. Website testing does not require reconstructing historical serials.',
});
export const COURSE_STOCK = REFERENCE_COLUMN_MODELS.map(m=>({refId:m.refId,product:m.product,L:150,ID:4.6,PS:5,source:cite('SEL-MEMO','§3: six Cycle 0 columns remain available; allocation is re-recorded at this phase'),scope:'Course-supplied inventory at Cycle 2; current drawer availability and physical serials require confirmation.'}));
export const CLASS_COLUMN_RECORDS = [
 {key:'GR39-C18aq',group:'GR39',instrument:5,product:'Pinnacle DB Aqueous C18',ligand:'Polar-modified C18',L:150,ID:4.6,PS:5,serial:'13071097M',catalogue:'9418565',status:'Label / column-log record; no different column was fitted',source:cite('EFF-ARCHIVE','GR39, PDF pp. 215–216 and F2, p. 279')},
 {key:'GR40-Ultra-PFPP',group:'GR40',instrument:6,product:'Ultra PFPP',ligand:'PFPP',L:150,ID:4.6,PS:5,serial:'32',catalogue:'9179565',status:'Recorded identifier 32; installed as a substitution, then removed. Not an equivalent Pinnacle N-only transfer.',source:cite('EFF-ARCHIVE','GR40, PDF pp. 335–336, 377–378')},
 {key:'GR40-Pinnacle-PFPP-3',group:'GR40',instrument:6,product:'Pinnacle DB PFPP',ligand:'PFPP',L:150,ID:4.6,PS:3,serial:'8',catalogue:'9419365',status:'Recorded identifier 8; physically fitted, setup pressure unsuitable at required flow; no valid analytical run. Current usability unconfirmed.',source:cite('EFF-ARCHIVE','GR40, PDF pp. 335–338, 377–378')},
 {key:'GR40-Pinnacle-PFPP-5',group:'GR40',instrument:6,product:'Pinnacle DB PFPP',ligand:'PFPP',L:150,ID:4.6,PS:5,serial:'13071105M',catalogue:'9419565',status:'Original column reinstalled; archive assigns subsequent GR40-17 to GR40-21 to it',source:cite('EFF-ARCHIVE','GR40, PDF pp. 337–338, 378')},
 {key:'GR42-IBD',group:'GR42',instrument:2,product:'Ultra IBD',ligand:'Polar-functional embedded alkyl',L:150,ID:4.6,PS:5,serial:'13070883T',catalogue:'9175565',status:'Label / column-log record; not the earlier GR37 HPLC 2 allocation',source:cite('EFF-ARCHIVE','GR42, PDF pp. 497–498 and F2, p. 544')},
];

export function courseBottleRecipe(organic){
 if(!['ACN','MeOH'].includes(organic))return null;
 return {phaseA:'Purified water + 0.1% formic acid',phaseB:(organic==='ACN'?'Acetonitrile':'Methanol')+' + 0.1% formic acid',organic,additiveName:'formic acid',additiveConc:0.1,additiveUnit:'% (preparation basis not specified in memo)',
 source:cite(organic==='ACN'?'RET-MEMO':'SEL-MEMO',organic==='ACN'?'§3; also Selectivity memo §4':'§§2, 4: selected organic solvent with 0.1% formic acid'),
 state:'Course-prescribed preparation, not verification of a historical bottle',
 checks:['Verify the actual bottle label and preparation record before using this recipe.','The memo does not state v/v, w/v or pH adjustment; do not invent those details.','The CP filename concentration 0.1 mg/mL is separate from the formic-acid prescription.']};
}

export function materialContext(run){
 const text=run?.raw?.text||'',hit=/Data File Name,[^\r\n]*\b(GR\d+)-(\d+)-(\d+)-/.exec(text)||/\b(GR\d+)-(\d+)-(\d+)-/.exec(run?.raw?.fileName||'');
 const group=hit?.[1]||null,number=hit?Number(hit[3]):null;
 return {group,instrumentHint:number,archiveApplicable:group==='GR37'&&number===3,
  note:group==='GR37'&&number!==3?`The example file identifies HPLC ${number??'unknown'}, while the documented Cycle 3 example belongs to HPLC 3. No archive association or marker has been copied. No historical serial is required for website testing.`:'The archive is example/test evidence only. No historical serial is required for website testing; it does not establish the equipment for your own experiment.'};
}

export function addArchiveRecords(s){
 const source='archive:GR37-cycle3';
 let ins=s.instruments.find(i=>i.provenance?.source===source);
 if(!ins){ins=newInstrument({label:'HPLC 3 — documented GR37 Cycle 3 (historical)',manufacturer:'Shimadzu',fleetNumber:3,instrumentClass:'UHPLC',pump:{type:'binary-hpg'},mixing:'after-pumps (high-pressure mixing)',degasser:{fitted:true},injector:{kind:'autosampler'},oven:{fitted:true},detector:{type:'PDA'},limits:[],provenance:{source,sources:[ARCHIVE_GR37.instrumentSource]},notes:ARCHIVE_GR37.modules+' '+ARCHIVE_GR37.note});s.instruments.push(ins);}
 let col=s.columns.find(c=>c.serial===ARCHIVE_GR37.serial&&c.notes?.includes(source));
 if(!col){const ref=REFERENCE_COLUMN_MODELS.find(m=>m.refId==='ref-pinnacle-db-c18'),m=fromReferenceColumnModel(ref);m.provenance={...m.provenance,source,sources:[...m.provenance.sources,ARCHIVE_GR37.source]};s.columnModels.push(m);col=newPhysicalColumn({modelId:m.id,serial:ARCHIVE_GR37.serial,label:'GR37 Cycle 3 C18 — historical HPLC 3',notes:`${source}; catalogue ${ARCHIVE_GR37.catalogue}; lot ${ARCHIVE_GR37.lot}. ${ARCHIVE_GR37.note} Current stock availability not declared.`});s.columns.push(col);}
 return {instrumentId:ins.id,columnId:col.id};
}
export function addCourseStockRecords(s){
 let added=0;
 for(const item of COURSE_STOCK){if(s.columnModels.some(m=>m.provenance?.courseStockRef===item.refId))continue;
  const ref=REFERENCE_COLUMN_MODELS.find(m=>m.refId===item.refId),m=fromReferenceColumnModel(ref);
  m.provenance.courseStockRef=item.refId;m.provenance.sources.push(item.source);s.columnModels.push(m);s.columns.push(newPhysicalColumn({modelId:m.id,label:item.product+' — course stock, current availability unconfirmed',notes:item.scope}));added++;
 }
 return added;
}
export function addClassColumnRecords(s){let added=0;
 for(const item of CLASS_COLUMN_RECORDS){const origin='archive:'+item.key;if(s.columnModels.some(m=>m.provenance?.source===origin))continue;
  const model=newColumnModel({manufacturer:'Restek',product:item.product,ligand:item.ligand,beadFamily:item.product.startsWith('Ultra')?'Ultra':'Pinnacle DB',lengthMm:item.L,idMm:item.ID,particleUm:item.PS,particleType:'fully porous',limits:{pMax:null,tMaxC:null,pH:null},datasheetRef:null,provenance:{source:origin,sources:[item.source]},notes:`Catalogue ${item.catalogue}. Label-derived identity/geometry only; no operating rating copied from another column.`});s.columnModels.push(model);s.columns.push(newPhysicalColumn({modelId:model.id,serial:item.serial,label:`${item.group}: ${item.product} ${item.L} × ${item.ID} × ${item.PS} — historical`,notes:item.status+' Current availability, condition and GR37 association not established.'}));added++;
 }return added;
}
export function remainingMaterialChecks(run,{example=false}={}){if(example)return [];return [
 'Before your own real experiment, identify the instrument and column you will use. Historical test-column serials are not required to operate or test this website.',
 'Use the approved SOP and applicable operating limits for the selected apparatus before a real injection. The method pressure specification is not a hardware rating; no complete inventory or all-module dossier is required to import one CSV.',
 'Check the actual A/B bottle labels and preparation. The sourced course recipe is already available; mixed solvent needs its actual ACN:MeOH ratio, not a guessed mixture.',
 'Later modelling only: record a t0/marker basis and collect comparable Retention points when fitting minimum %B. Stock alternatives and Gradient dwell data are needed only when using those later modules, not before first-file analysis.'
 ];}
