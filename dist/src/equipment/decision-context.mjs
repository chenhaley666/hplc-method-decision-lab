// Map the active scientific branch to controls, never infer hardware ratings.
import {inspect} from './inspector.mjs';
export function decisionControls(s,e){
 const d=e.current,r=s.runs.find(x=>x.id===d?.runId);if(!d||!r)return [];
 let keys=[];
 if(d.status==='HOLD')keys=['flow','column geometry','organic','ovenSetpoint'];
 else if(d.status==='INVESTIGATE'||d.n===0)keys=['wavelength','acquisitionTime','injVolume'];
 else if(d.status==='RETENTION'||d.observeIntermediate)keys=['percentB'];
 else if(d.gradient)keys=['mode','percentB','flow','acquisitionTime'];
 else if(d.status==='N'||d.status==='MET')keys=['flow','column geometry'];
 else if(d.stage==='selectivity')keys=d.chooseLigand?['column ligand','percentB']:d.solvent?['organic','percentB','ovenSetpoint']:['ovenSetpoint','percentB'];
 return keys.map(key=>inspect(s,s.settings,{kind:'parameter',id:key},{run:r})).filter(x=>x&&!x.error);
}
