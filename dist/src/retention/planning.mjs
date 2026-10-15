// Pre-experiment planning. A handoff refers to a freshly recomputed model,
// never to stored predictions or a merged experiment library.
import { predictTR } from './candidates.mjs';
import { compare } from '../rules.mjs';
import { activeR2Policy,projectR2 } from './fit.mjs';
import { sha256 } from '../data-model/ids.mjs';

export function lastPeakCalculation(input,settings) {
  const {t0,slope,intercept,r2}=input||{}, spec=settings.specs.lastPeak,policy=activeR2Policy(settings);
  if(settings.r2Policy?.mode==='custom'&&!Number.isFinite(settings.r2Policy.target))return {ok:false,ready:false,reason:'Set the custom R² target in Model setup, or select an explicit report-only/project policy.'};
  if(![t0,slope,intercept,r2,spec.value].every(Number.isFinite)||!(t0>0)||!(slope<0)||!(spec.value>t0)||r2<0||r2>1)
    return {ok:false,ready:false,reason:'Enter t0 > 0 min, a negative slope, intercept, R² from 0 to 1, and a run-time limit greater than t0. Blank inputs are not zero.'};
  const k=(spec.value-t0)/t0,logK=Math.log10(k),continuous=(logK-intercept)/slope;
  let B=Math.max(0,Math.ceil(continuous));
  while(B<=100&&!compare(predictTR({intercept,slope},t0,B),spec.op,spec.value).pass)B++;
  const feasible=B<=100,pass=!policy.judged||compare(policy.mode==='project'?projectR2(r2):r2,policy.op,policy.target).pass;
  return {ok:true,ready:feasible&&pass,k,logK,continuous,B:feasible?B:null,
    predictedLast:feasible?predictTR({intercept,slope},t0,B):null,previousLast:B>0?predictTR({intercept,slope},t0,B-1):null,
    r2Pass:pass,policy,reason:(!feasible?'No feasible whole-number %B from 0 to 100.':!pass?'R² fails the selected criterion. Continue Retention and investigate the fit before using this calculation.':'Last-peak model calculation.')+' It does not establish an all-compound minimum or validate a method.'};
}
export function modelFingerprint(r) {
  if(!r?.issued?.candidates?.minimum)return null;
  const ref=r.eligibility.reference;
  return sha256(JSON.stringify({minimum:r.issued.candidates.minimum.B,spec:r.steps.lastPeakSpec,t0:r.steps.t0Proposed,
    fits:r.steps.fits,reference:{id:ref?.id,conditions:ref?.conditions,assoc:ref?.assoc,marker:ref?.marker,
      measuredHash:sha256(JSON.stringify(ref?.measured)),sourceHash:ref?.raw?.sha256},policy:r.fits?.policy}));
}
export function automaticModelQuality(r){const fits=r?.fits?.results?.filter(x=>x.adequate)||[];return !!r?.issued?.candidates?.minimum&&fits.length>0&&fits.every(x=>projectR2(x.fit.r2)!==null&&projectR2(x.fit.r2)>=.995&&new Set(x.points.map(p=>p.x)).size>=3);}
export function selectivityPlanning(session,reference=null,own=null) {
  const p=session.settings.compositionPlan||{};
  const compatible=spec=>!spec||(spec.value===session.settings.specs.lastPeak.value&&spec.op===session.settings.specs.lastPeak.op);
  const mismatch='Selectivity has a different run-time requirement from Retention. Align the specifications or recompute the Retention minimum for this requirement before using it.';
  if(p.mode==='retention') {
    if(!reference?.analysis?.issued?.candidates?.minimum||p.referenceSessionId!==reference.sessionId||p.fingerprint!==modelFingerprint(reference.analysis))
      return {ready:false,reason:'The Retention reference is missing or has changed. Return to Retention, review minimum %B and re-apply the handoff. No stored prediction is trusted.'};
    return {ready:compatible(reference.analysis.steps.lastPeakSpec),reason:compatible(reference.analysis.steps.lastPeakSpec)?'':mismatch,mode:'retention',B:reference.analysis.issued.candidates.minimum.B,analysis:reference.analysis,source:'Freshly recomputed Retention model; experiment libraries remain independent.'};
  }
  if(p.mode==='calculator') {
    const c=lastPeakCalculation(p.input,session.settings);
    return {...c,mode:'calculator',source:p.basis||'',ready:c.ready&&!!p.basis?.trim(),reason:c.ready&&!p.basis?.trim()?'Record the source and scope of the last-peak fit.':c.reason,input:p.input};
  }
  if(p.mode==='manual') {
    const ready=Number.isFinite(p.B)&&p.B>=0&&p.B<=100&&!!p.basis?.trim();
    return {ready,mode:'manual',B:ready?p.B:null,source:p.basis||'',reason:ready?'User-recorded minimum from an external calculation. No automatic fit quality or all-compound coverage is claimed.':'Enter a minimum %B from 0 to 100 and its experimental/calculation basis.'};
  }
  if(own?.issued?.candidates?.minimum)return {ready:automaticModelQuality(own),reason:automaticModelQuality(own)?'':'Automatic progression requires every fitted line to have at least three distinct %B values and R² ≥ 0.995.',mode:'own',B:own.issued.candidates.minimum.B,analysis:own,source:'All-compound model of the explicitly selected fit runs in this stage.'};
  const auto=reference?.analysis;
  if(automaticModelQuality(auto))
    return {ready:compatible(auto.steps.lastPeakSpec),reason:compatible(auto.steps.lastPeakSpec)?'':mismatch,mode:'retention',automatic:true,B:auto.issued.candidates.minimum.B,analysis:auto,source:'Automatically read from the fresh Retention all-compound model, all R² ≥ 0.995. CSV libraries remain separate.'};
  const w=reference?.worksheet;
  if(w?.calculation?.B!==null&&w?.calculation?.ok)return {ready:!!w.qualified&&compatible(w.spec),mode:'auto-lastpeak',automatic:true,B:w.calculation.B,candidate:w.calculation.B,worksheet:w,input:{t0:w.meanT0,slope:w.fit.slope,intercept:w.fit.intercept,r2:w.fit.r2},source:'Fresh Retention workbook-style last-peak line, not an all-compound model.',reason:compatible(w.spec)?w.reason:mismatch};
  return {ready:false,reason:'Minimum %B has not been established. Use the Retention handoff or record a sourced external calculation before starting Selectivity.'};
}
export function intermediateChoices(plan,upperB,spec,{preview=false}={}) {
  // Preview never changes plan.ready or bypasses the experiment engine's checks.
  if(!Number.isFinite(plan.B)||!Number.isFinite(upperB)||plan.B<0||upperB<plan.B||upperB>100)return [];
  if(!plan.ready&&!(preview&&plan.mode==='auto-lastpeak'&&plan.worksheet?.calculation?.ok&&Number.isFinite(plan.B)))return [];
  const model=plan.analysis,table=model?.intermediate?.table||[];
  if(table.length) {
    const best=model.intermediate.best.B;
    const ids=[...new Set([plan.B,best,...Array.from({length:9},(_,i)=>Math.round(plan.B+(upperB-plan.B)*(i+1)/9))])];
    return ids.map(B=>table.find(x=>x.B===B)).filter(Boolean).map(x=>({...x,feasible:compare(x.lastTR,spec.op,spec.value).pass,
      reason:x.B===plan.B?'Minimum %B: first Selectivity experiment.':x.B===best?'Largest modelled smallest-adjacent α. Verify the proposed spacing experimentally.':'Alternative composition within the modelled planning range.',
      extrapolated:model.fits.results.some(r=>r.adequate&&(x.B<r.fit.xMin||x.B>r.fit.xMax))}));
  }
  const values=[...new Set([plan.B,...Array.from({length:9},(_,i)=>(i+1)/9).map(f=>Math.round((plan.B+(upperB-plan.B)*f)*100)/100)])].filter(B=>B>=plan.B&&B<=100);
  return values.map(B=>{const lastTR=['calculator','auto-lastpeak'].includes(plan.mode)?predictTR(plan.input,plan.input.t0,B):null;
    return {B,lastTR,minAlpha:null,pair:null,feasible:lastTR===null?null:compare(lastTR,spec.op,spec.value).pass,preview:!plan.ready,
      extrapolated:!!plan.worksheet&&(B<plan.worksheet.fit.xMin||B>plan.worksheet.fit.xMax),
      reason:!plan.ready?'Exploratory preview only: conditional last-peak time, not an executable recommendation. No predicted Rs, pressure or all-compound optimum.':B===plan.B?'Minimum %B: first Selectivity experiment.':'Optional experimental candidate. Increasing %B is expected to shorten retention in reversed phase; effects on peak order/separation are unquantified. No predicted Rs or pressure.'};});
}
