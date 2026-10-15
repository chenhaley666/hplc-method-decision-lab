// Shared, read-only recipe coverage. A course prescription never confirms a run.
import {FIELD_BY_KEY,usable} from '../data-model/conditions.mjs';
export const RECIPE_FIELDS=['mode','phaseA','phaseB','mixAcnPct','additiveName','additiveConc','additiveUnit','pH','injVolume','wavelength','sampleType','sampleConc','sampleId','acquisitionTime'];
export function recipeEvidence(r){
 const value=k=>usable(r?.conditions?.[k])?r.conditions[k].value:null;
 const carrying=RECIPE_FIELDS.map(key=>({key,label:FIELD_BY_KEY[key].label,value:value(key),unit:key==='additiveConc'?value('additiveUnit')||'':r?.conditions?.[key]?.unit||FIELD_BY_KEY[key].unit||'',source:r?.conditions?.[key]?.source||'not recorded',note:r?.conditions?.[key]?.note||'',sourceRunId:r?.id||null}));
 const missing=['mode','phaseA','phaseB','pH','injVolume','wavelength','sampleType','sampleConc','acquisitionTime'].filter(k=>value(k)===null);
 if(value('organic')==='Mix'&&!(Number.isFinite(value('mixAcnPct'))&&value('mixAcnPct')>0&&value('mixAcnPct')<100))missing.push('Mix ratio: ACN % v/v inside B bottle (strictly between 0 and 100; remainder MeOH)');
 const noAdditive=/^(none|no additive|without additive)$/i.test(String(value('additiveName')||'').trim());
 if(value('additiveName')===null)missing.push('additiveName');
 if(!noAdditive){if(value('additiveConc')===null)missing.push('additiveConc');if(value('additiveUnit')===null)missing.push('additiveUnit');else if(/^%$|^percent$/i.test(String(value('additiveUnit')).trim()))missing.push('additive preparation basis (specify e.g. % v/v or % w/v)');}
 if(noAdditive&&Number(value('additiveConc'))>0)missing.push('resolve no-additive / positive-concentration conflict');
 return {carrying,missing,complete:missing.length===0,noAdditive,scope:'Recipe-field coverage only, not hardware verification, model acceptance or experimental validation. Sample/study ID is carried when recorded; it is not inferred from a group label. An explicit no-additive declaration is permitted.'};
}
