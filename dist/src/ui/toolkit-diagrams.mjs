// Original, unmodified PPT artwork assembled as native interactive diagrams.
// Browsing a teaching drawing never changes a run's instrument/column association.
import {h,s,field,details,sourceList,table} from './dom.mjs';
import {ILLUSTRATIONS} from './illustrations.mjs';
import {inspect} from '../equipment/inspector.mjs';
import {setUi} from './state.mjs';
import {REFERENCE_COLUMN_MODELS} from '../presets/reference-equipment.mjs';
const asset=n=>`./assets/toolkit/image${n}.${n===10?'jpg':'png'}`;
// Reuse original component files and the existing teaching diagrams. No photo
// recognition, image upload or change to scientific/equipment records occurs.
function enlargePicture(n,alt,caption){
 const d=h('dialog',{class:'toolkit-zoom module-picture-dialog','aria-label':alt},h('button',{type:'button',onclick:()=>d.close()},'Close'),h('figure',h('img',{src:asset(n),alt}),h('figcaption',caption)));
 d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();
}
function modulePictures(n,key){
 const manual=[1,2,5].includes(n);
 const component={bottles:n===3?3:9,degasser:10,pump:4,pumpA:11,pumpB:11,autosampler:5,oven:manual?6:12,column:35,detector:7,controller:8};
 const pictures=key==='injector'?[
  [16,'Manual injector: lever and LOAD / INJECT markings','Front view: find the lever and the LOAD / INJECT markings. Toolkit slides 11 and 14.'],
  [21,'Manual injector: rear fittings and sample loop','Rear view: the curved tubing is the external sample loop. Its fitted capacity determines the full-loop volume. Toolkit slides 12–17.'],
  [14,'Exploded injector assembly showing stator and rotor components','Inside the valve: stator and rotor components. Teaching exploded view, not an instruction to dismantle an instrument. Toolkit slides 11–17.'],
  [22,'Course injector diagram: LOAD position, sample loop, pump line, column and waste','LOAD reference: labelled pump line, loop, column and waste. Port numbering is specific to this course drawing; follow the actual valve documentation. Toolkit slide 20.'],
 ]:key==='mixer'?[[23,'Pump assembly with two heads, connecting tubing and waste outlet','Context for mixing and delivery: two heads belong to one pump. The outlet marked “To waste” is separate from the analytical outlet. Toolkit slide 22.']]:[[component[key],`${MODULES[key][0]}: original course component artwork`,`${MODULES[key][0]} close-up. Original toolkit artwork${key==='oven'?' includes the surrounding column enclosure':key==='controller'?'; generic upper module, fitted identity must be checked':''}. Yellow lines illustrate connections and are not a verified plumbing map.`]];
 const mechanismId={bottles:'mobile',degasser:'flow',pump:'pump',pumpA:'pump',pumpB:'pump',mixer:'pump',injector:'injector',autosampler:'injector',oven:'flow',column:'column',detector:'detector',controller:'flow'}[key];
 const il=ILLUSTRATIONS.find(x=>x.id===mechanismId);
 const caption=key==='injector'?'LOAD fills the sample loop while the pump continues to the column. INJECT routes mobile phase through the loop. Blue: external sample loop; red: rotor connections.':key==='autosampler'?'Valve principle: automatic sampling meters the programmed volume and switches the injection path. These LOAD / INJECT drawings explain routing, not an autosampler operating sequence.':key==='degasser'?'Position in the liquid path: solvent bottles, then degasser, then pump. Degassing removes dissolved gas before delivery.':key==='oven'?'The oven controls temperature around the column. Follow the liquid path, rather than the physical stacking of modules.':key==='controller'?'Context: the detector signal goes to the data system. This generic drawing does not identify the installed controller model.':key==='mixer'||key.startsWith('pump')?`Compare mixing before one pump with mixing after two independent pumps. HPLC ${n} uses ${n===3?'the binary arrangement on the right':'the quaternary arrangement on the left'}.`:'Read the labelled mechanism together with the component close-up.';
 const mechanism=()=>h('figure',{class:'module-mechanism','data-testid':'module-mechanism'},h('h5',key==='injector'?'How LOAD and INJECT work':key==='autosampler'?'Internal valve routing only — not manual sample loading':'Working principle'),h('div',{class:'diagram-viewport',tabindex:0,role:'region','aria-label':`${MODULES[key][0]} mechanism: scroll horizontally for full-size labels`},il.draw()),h('figcaption',caption),h('p',{class:'small'},'Generic teaching schematic. Labels stay full-size; scroll horizontally on a small screen. This is not a model-specific plumbing diagram.'),sourceList(il.sources));
 return h('div',{class:'module-visuals','data-testid':'module-visuals','data-module':key},
  h('div',{class:'module-picture-grid'},pictures.map(([num,alt,text])=>h('figure',{'data-testid':`module-picture-${num}`},h('img',{src:asset(num),alt,loading:'lazy'}),h('figcaption',text),h('button',{type:'button',onclick:()=>enlargePicture(num,alt,text)},'Enlarge picture')))),
  key==='autosampler'?h('section',{'data-testid':'autosampler-principle'},h('h5','Automatic sampling: vial → needle → metering → injection → wash'),h('ol',h('li','Place the prepared sample vial in the assigned tray position; select that vial in the sequence.'),h('li','The autosampler needle automatically accesses the vial and aspirates the programmed sample volume through its metering system.'),h('li','The instrument introduces the measured sample into the mobile-phase flow path. Needle/loop/valve arrangements depend on the fitted model.'),h('li','The programmed wash reduces carry-over. Check the approved wash method; do not invent solvent, volume or timing.')),h('p',{class:'small'},'This is not manual syringe injection. Programmed injection volume is not the volume of the sample vial. The photograph does not establish the exact internal architecture.'),details('Optional: generic internal injection-valve routing',false,mechanism())):mechanism());
}
function moduleExplanation(n,key,session){
 const id={bottles:'solvent-reservoirs',degasser:'degasser',pump:'pump',pumpA:'pump',pumpB:'pump',mixer:'pump',injector:'injector',autosampler:'injector',oven:'column-oven',column:'column',detector:'detector',controller:'data-system'}[key];
 const info=session?inspect(session,session.settings,{kind:'module',id}):null;
 const usual=p=>p.key==='percentB'?'0–100 %B (composition domain)':p.key==='mode'?'ISO / GRA':p.key==='flow'&&n===4?'0.0001–10 mL/min (LC-2030C NT reference)':p.key==='injVolume'&&n===4?'0.1–100 µL, option dependent (LC-2030C NT reference)':p.key==='ovenSetpoint'&&n===4?'4–60 °C (LC-2030C NT packed-column reference)':p.key==='ovenSetpoint'?'Course experiments: 40, 60 °C; actual oven range is model-specific':p.range.known?p.range.text:'Model / preparation dependent; see sourced reference and actual record';
 return [h('h4',MODULES[key][0]),h('p',MODULES[key][1]),info?h('div',h('h5','Parameters and units'),info.controls.length?table(['Controlled parameter','Mechanical / chemical','Unit','Usual / reference range'],info.controls.map(p=>h('tr',h('td',p.label),h('td',p.categoryMark?.label||p.category||'not a separation lever'),h('td',p.unit||'dimensionless / categorical'),h('td',usual(p))))):h('p',{class:'small'},'No direct separation parameter is controlled here. Degassing protects delivery and baseline stability.'),h('p',{class:'small'},'Reference ranges explain the equipment; they do not confirm the fitted model or grant operating clearance. LC-2030C NT values come from the Shimadzu reference cited below.')):null,modulePictures(n,key)];
}
const MODULES={
 bottles:['Solvent bottles','A supplies water; B supplies ACN, MeOH or Mix. Check bottle labels and inlet filters. %B controls the amount from bottle B, not its identity.'],
 degasser:['Degasser','Removes dissolved gas upstream of the pumps. Air bubbles can disturb pressure and the detector baseline.'],
 pump:['Pump / gradient valve','Quaternary low-pressure mixing: the A/B/C/D proportioning valve selects solvents before pumping. Pump heads deliver the selected flow; the drain diverts purge liquid to waste.'],
 pumpA:['Pump A','Binary high-pressure mixing: this pump delivers the A stream. A and B have separate pump units; their delivered streams meet downstream.'],
 pumpB:['Pump B','The second binary pump delivers B. Changing the relative A/B deliveries changes %B. Do not confuse two pump heads inside one unit with two independently metered solvent pumps.'],
 mixer:['Mixer','Promotes mixing of the mobile-phase streams. Binary mixing is downstream of the two pumps; quaternary proportioning occurs before pumping. The toolkit’s diamond is a schematic mixer symbol, not a fitted-model identification.'],
 injector:['Manual injector','LOAD fills the sample loop; INJECT connects the loop to the mobile-phase path. Check fitted loop capacity. Follow the actual instrument SOP, not a guessed purge sequence.'],
 autosampler:['Autosampler','The needle and switching valve introduce the programmed sample volume into the flow path. Check the actual needle/loop settings and carry-over.'],
 oven:['Column oven','Controls the column temperature. The drawn enclosure is illustrative and may differ from the actual oven. Temperature can change retention and selectivity.'],
 column:['Column','The packed stationary phase separates compounds. Ligand is the bonded chemistry; bead type is the particle architecture/product family. See the separate column drawing below.'],
 detector:['UV / PDA detector','Measures absorbance after the column. Wavelength changes which peaks are visible, not their separation. Verify the fitted detector; a numbered peak is not a chemical identity.'],
 controller:['Controller / optional module','The toolkit includes this upper module but excludes controller/fluorescence details from the method exercise. The installed module must be checked on its label; this generic shape does not identify it.'],
};
// [artwork, x, y, width, height]. Aspect ratios are preserved by SVG image fitting.
function layout(n){
 if([1,2,5].includes(n))return {slide:5,kind:'Modular · manual injection · quaternary',pictures:[[9,290,35,180,123],[10,290,145,180,66],[7,290,201,180,101],[4,290,303,180,101],[6,456,137,180,267]],points:[['bottles',375,90,0],['degasser',375,175,0],['detector',375,250,0],['pump',375,350,0],['injector',484,312,1,325],['oven',550,175,1],['column',592,275,1,250],['mixer',484,377,1,400]]};
 if(n===3)return {slide:3,kind:'UHPLC · autosampler · binary',pictures:[[3,300,22,180,133],[10,303,132,180,66],[11,304,179,180,101],[11,304,267,180,101],[5,304,354,180,267],[8,487,182,180,101],[7,487,268,180,101],[12,496,356,162,262]],points:[['bottles',390,90,0],['degasser',390,165,0],['pumpA',390,225,0],['pumpB',390,315,0],['autosampler',390,480,0],['controller',570,225,1],['detector',570,315,1],['oven',570,400,1],['column',610,492,1],['mixer',512,588,1]]};
 if(n===6)return {slide:4,kind:'Modular · autosampler · quaternary',pictures:[[9,300,107,180,123],[10,303,217,180,66],[4,307,266,180,101],[5,304,354,180,267],[8,487,182,180,101],[7,487,268,180,101],[12,496,356,162,262]],points:[['bottles',390,160,0],['degasser',390,248,0],['pump',390,315,0],['autosampler',390,485,0],['controller',570,225,1],['detector',570,315,1],['oven',570,405,1],['column',610,492,1],['mixer',512,588,1]]};
 return {slide:2,kind:'Integrated · autosampler · quaternary',pictures:[[9,290,15,170,116],[7,290,135,170,95],[5,290,230,170,252],[10,290,482,170,62],[4,290,535,170,95],[12,470,190,255,413]],points:[['bottles',375,75,0],['detector',375,180,0],['autosampler',375,345,0],['degasser',375,510,0],['pump',375,583,0],['oven',575,250,1],['column',650,410,1],['mixer',495,559,1]]};
}
function machineDrawing(n,selected,select){
 const l=layout(n),height=[1,2,5].includes(n)?460:665;
 const svg=s('svg',{viewBox:`0 0 1000 ${height}`,class:'toolkit-machine',role:'group','aria-label':`HPLC ${n} teaching assembly: ${l.kind}`,'data-testid':'toolkit-machine'});
 svg.append(s('title',{},`HPLC ${n}: isolated apparatus assembled from original course artwork`));
 if(n===4)svg.append(s('rect',{x:279,y:127,width:458,height:513,rx:16,fill:'#f4f6f7',stroke:'#8796a3','stroke-width':2}));
 for(const [a,x,y,w,hh]of l.pictures)svg.append(s('image',{href:asset(a),x,y,width:w,height:hh,preserveAspectRatio:'xMidYMid meet','data-artwork':String(a)}));
 l.points.forEach(([key,x,y,right,labelY=y],i)=>{
  const labelX=right?755:18,edgeX=right?740:250;
  const group=s('g',{role:'button',tabindex:0,'aria-label':MODULES[key][0],'aria-pressed':selected===key?'true':'false',class:'toolkit-callout','data-testid':`module-${key}`,
   onclick:()=>select(key),onkeydown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(key);}}});
  group.append(s('path',{d:`M ${x} ${y} L ${edgeX} ${labelY}`,fill:'none',stroke:selected===key?'#1565c0':'#8697aa','stroke-width':2}),s('rect',{x:right?744:8,y:labelY-24,width:right?246:247,height:48,rx:8,fill:selected===key?'#e8f1fc':'#fff',stroke:selected===key?'#1565c0':'#dde4ec'}),s('text',{x:labelX,y:labelY+6,'font-size':19,'font-family':'system-ui',fill:'#23364d'},`${i+1}. ${key==='controller'?'Controller / auxiliary':MODULES[key][0]}`),s('circle',{cx:x,cy:y,r:14,fill:'#1565c0',stroke:'#fff','stroke-width':2}),s('text',{x,y:y+5,'text-anchor':'middle','font-size':14,'font-family':'system-ui',fill:'#fff'},String(i+1)));
  svg.append(group);
 });
 return svg;
}
export function toolkitMachines(st){
 const n=Number(st.ui.toolkitHplc)||4,l=layout(n),key=l.points.some(p=>p[0]===st.ui.toolkitModule)?st.ui.toolkitModule:'bottles';
 const choose=key=>setUi(u=>{u.toolkitModule=key;});
 const drawing=machineDrawing(n,key,choose);
 const zoom=()=>{
  const note=h('section',{class:'toolkit-explanation','aria-live':'polite'},...moduleExplanation(n,key,st.session));
  const d=h('dialog',{class:'toolkit-zoom','aria-label':`Enlarged HPLC ${n} apparatus`},h('div',{class:'row wrap'},h('h3',`HPLC ${n} — enlarged apparatus`),h('button',{type:'button',onclick:()=>{d.close();d.remove();}},'Close')),
   h('p',{class:'small'},'Enlarged reference drawing. Scroll within this panel on a small screen; select a label for its explanation and pictures below.'),h('div',{class:'toolkit-zoom-scroll'},machineDrawing(n,key,k=>{note.replaceChildren(...moduleExplanation(n,k,st.session));})),note);
  d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();
 };
 return h('section',{class:'card inner','data-testid':'toolkit-machine-panel'},h('h3','Build and explore HPLC 1–6'),
  h('p','Choose a system, then click a labelled region to see what it does. These are the original toolkit components, assembled into an apparatus drawing — not a whole-slide screenshot.'),
  h('div',{class:'toolkit-system-tabs',role:'group','aria-label':'Choose an HPLC teaching diagram'},[1,2,3,4,5,6].map(v=>h('button',{type:'button','data-testid':`diagram-hplc-${v}`,'aria-pressed':v===n?'true':'false',class:v===n?'primary':'',onclick:()=>setUi(u=>{u.toolkitHplc=v;u.toolkitModule='bottles';})},`HPLC ${v}`))),
  h('div',{class:'row wrap'},h('h4',`HPLC ${n} · ${l.kind}`),h('button',{type:'button','data-testid':'enlarge-machine',onclick:zoom},'Enlarge drawing')),
  drawing,
  h('div',{class:'toolkit-region-buttons',role:'group','aria-label':'HPLC module explanations'},l.points.map(([k],i)=>h('button',{type:'button','aria-pressed':k===key?'true':'false',onclick:()=>choose(k)},`${i+1}. ${MODULES[k][0]}`))),
  h('section',{class:'toolkit-explanation','data-testid':'module-explanation','aria-live':'polite'},...moduleExplanation(n,key,st.session)),
  h('p',{class:'small'},n===4?'HPLC 4: adapted from toolkit slide 2 components and the supplied integrated-system example. The enclosing case and module arrangement are a teaching adaptation, not a manufacturer internal blueprint.':`Adapted from the prebuilt HPLC ${n===6?'6':n===3?'3':'1/2/5'} assembly on toolkit slide ${l.slide}. ${n===6?'Four-bottle artwork from slide 2 replaces the two-bottle illustration to show the confirmed quaternary configuration.':''}`),
  h('p',{class:'small'},'Source: 2026 ALL CYCLES COLUMN and HPLC TOOLKIT (260807), slides 2–5. The source says to ignore the yellow tubing when building a system: it is illustrative, not a verified plumbing diagram. Physical stacking is not liquid-flow order. Browsing these pictures does not assign equipment to your runs.'),
  h('p',{class:'toolkit-flow'},n===3?'Liquid path: A/B bottles → degasser → separate A/B pumps → high-pressure mixing → autosampler → column / oven → detector → waste.':'Liquid path: bottles → degasser → quaternary proportioning valve → pump / mixing → injector → column / oven → detector → waste.'));
}
const LIGAND_ART={'ref-pinnacle-db-c18':59,'ref-pinnacle-db-c8':55,'ref-pinnacle-db-pfpp':58,'ref-pinnacle-db-c18aq':56,'ref-pinnacle-db-biphenyl':57,'ref-ultra-ibd':60};
export function toolkitColumn(st){
 const r=REFERENCE_COLUMN_MODELS.find(x=>x.refId===st.ui.toolkitColumn)||REFERENCE_COLUMN_MODELS[0];
 const pic=(n,alt,cls)=>h('img',{src:asset(n),alt,class:cls||'',loading:'lazy'});
 return h('section',{class:'card inner','data-testid':'toolkit-column-panel'},h('h3','Build a column: hardware → bead → ligand'),
  field('Column illustration (reference model, not physical allocation)',h('select',{'data-testid':'diagram-column',onchange:e=>setUi(u=>{u.toolkitColumn=e.target.value;})},REFERENCE_COLUMN_MODELS.map(x=>h('option',{value:x.refId,selected:x.refId===r.refId?'selected':null},x.product)))),
  h('figure',{class:'toolkit-column-body'},pic(35,'Generic Restek column body with end fittings; not a model-specific label'),h('figcaption',`${r.product} · length ${r.lengthMm} mm · internal diameter ${r.idMm} mm. Generic source hardware artwork; photograph the actual label and serial number to identify your physical column.`)),
  h('div',{class:'toolkit-column-parts'},
   h('article',h('h4','1. Bead / particle architecture'),pic(46,'Fully porous silica bead: pores run through the particle'),h('p',`${r.particleType} silica · ${r.particleUm} µm particle diameter · ${r.poreA} Å pore size.`),h('p',{class:'small'},'Particle diameter is not pore size. Pinnacle / Ultra / Force / Raptor denotes product family, not the bonded ligand. Drawing is conceptual, not to scale.')),
   h('article',h('h4','2. Bonded ligand'),pic(LIGAND_ART[r.refId],`Toolkit ligand illustration: ${r.ligand}`),h('p',`${r.ligand} · USP ${r.uspL}`),h('p',{class:'small'},'The attached chemical group provides stationary-phase chemistry and selectivity. It is separate from the bead architecture.')),
   h('article',h('h4','3. Surface / end-capping'),r.endcapped?pic(53,'Trimethylsilyl end-capping illustration'):h('div',{class:'toolkit-no-endcap'},'Not end-capped'),r.endcapped?h('p',{class:'small'},'The C1 drawing represents trimethylsilyl (TMS) end-capping, not a second main ligand.'):null,h('p',`End-capped: ${r.endcapped?'yes':'no'} · carbon loading ${r.carbonPct}% · surface area ${r.surfaceM2g} m²/g.`),h('p',{class:'small'},`Operating pH ${r.limits.pH.join('–')}; documented maximum ${r.limits.tMaxC} °C. Column pressure rating remains unknown unless documented for the exact column.`))),
  h('p',{class:'small'},'Artwork: toolkit slides 39–46. Numerical values come from the sourced model records below, not the toolkit’s illustrative 6%/10% pore-wall drawings. Selecting this picture changes only the reference view.'),
  details('Compare with the toolkit’s prebuilt Raptor example',false,h('div',{class:'toolkit-spp'},pic(64,'Superficially porous particle with a solid core'),h('p','Slide 51 builds a Raptor Biphenyl example. Its superficially porous (SPP / core-shell) bead has a solid core and porous outer layer. This is not the fully porous Pinnacle / Ultra bead shown above; the Raptor example’s dimensions and ratings are not copied into those models.'))));
}
