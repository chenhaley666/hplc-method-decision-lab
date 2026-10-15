// evaluate.mjs — the whole-session evaluation and the next-experiment result.
//
// evaluateSession(session) is a pure function of the stored session. The UI
// renders its result; it never re-implements a decision.
import { evaluateRun } from '../selectivity/gates.mjs';
import { selectivityProgression, historyRuns } from '../selectivity/progression.mjs';
import { NOMOGRAM_LIMIT } from '../selectivity/nomogram.mjs';
import { retentionAnalysis } from '../retention/analysis.mjs';
import { proposedMethod } from './method.mjs';
import { runColumn, runInstrument, organicOf, percentBOf, flowOf, effectiveTemperature, relevantPeaks, isBlank } from '../data-model/derive.mjs';
import { temperatureBracket, pressureScale, OPERATORS, compare, validateSpecs, SPEC_DOMAINS, validatePolicies, POLICY_DOMAINS, toPsi } from '../rules.mjs';
const opl = op => OPERATORS[op]?.label || op;
const pressurePsi=run=>{const p=run.measured.pressure,c=toPsi(p?.max,p?.unit);return c.ok?c.psi:null;};
import { columnLimit, validateInstrument, validateColumnModel, equipmentConsistency } from '../data-model/equipment.mjs';
import { limitCheck, documentedLimitStatus } from '../data-model/limits.mjs';
import { usable } from '../data-model/conditions.mjs';
import { REGISTER_BY_ID } from '../presets/bps2032.mjs';
import { modelApplicability, runtimeBand, RUNTIME_BAND_POLICY } from './applicability.mjs';
import { chronologyStatus } from '../data-model/session.mjs';
import { retentionOptions, selectivityOptions, predictLatest, POSITION_REASON } from './options.mjs';
import { sampleIdentity } from '../data-model/comparability.mjs';
import { changeContext } from '../equipment/inspector.mjs';
import { labPressureSettings } from '../presets/local-lab.mjs';
import { selectivityPlanning,automaticModelQuality } from '../retention/planning.mjs';
import {worksheetModel} from '../retention/worksheet.mjs';

export const STATUS = {
  NEED_INFO: 'Need information',
  NEED_EXP: 'Need additional experiment',
  PROPOSED: 'Proposed next experiment',
  MAPPING: 'Mapping unresolved',
  LIMITS: 'Operating limits unverified',
  MET: 'Evaluated FC1 numerical criteria met',
  EXHAUSTED: 'Selectivity options exhausted — FC2 required',
};

export const SCOPE_STATEMENT = 'Scope: four numerical criteria are evaluated — back-pressure, peak count, last relevant peak and lowest adjacent-pair resolution. NOT evaluated: the plate-number (efficiency) specification, which is FC2 (Equipment ED slide 14), and the visual confirmation of the chromatogram by a person. Meeting the evaluated criteria is not method validation.';
export const PRESSURE_NOT_CLEARANCE = 'A pressure ESTIMATE is not clearance to inject. Confirm the measured back-pressure stays within the instrument and column limits when the run starts.';

export function evaluateSession(session, context={}) {
  const selectedId=session.settings.currentRunId;
  // An explicit current experiment is a user choice, not a filename ordering.
  // Later known acquisitions cannot count as completed work for an earlier run.
  if(selectedId) {
    const ordered=historyRuns(session), idx=ordered.findIndex(r=>r.id===selectedId);
    if(idx>=0 && chronologyStatus(session,ordered).ok) {
      const allowed=new Set(ordered.slice(0,idx+1).map(r=>r.id));
      session={...session,runs:session.runs.map(r=>({...r,flags:{...r.flags,history:r.flags.history&&allowed.has(r.id)}}))};
    }
  }
  const histForSettings = historyRuns(session);
  const selected = selectedId ? histForSettings.find(r=>r.id===selectedId)||null : histForSettings.at(-1)||null;
  const settings = labPressureSettings(session, session.settings, selected);
  const sets = {
    shown: Object.fromEntries(['equipment', 'retention', 'selectivity'].map(st => [st, session.runs.filter(r => r.flags.show[st]).map(r => r.id)])),
    compare: session.runs.filter(r => r.flags.compare).map(r => r.id),
    fit: session.runs.filter(r => r.flags.fit).map(r => r.id),
    history: session.runs.filter(r => r.flags.history).map(r => r.id),
  };
  const runEvaluations = {};
  for (const r of session.runs) runEvaluations[r.id] = evaluateRun(session, r, settings);
  const ownRetention = retentionAnalysis(session, settings);
  const worksheet=worksheetModel({...session,settings});
  const planning=context.stage==='selectivity'?selectivityPlanning(session,context.retentionReference,ownRetention):null;
  const retention=planning?.mode==='retention'&&planning.ready?planning.analysis:ownRetention;
  const hist = historyRuns(session);
  const current = selected;
  const progression = current ? selectivityProgression(session, settings, current) : null;
  const next = nextExperiment(session, settings, { current, retention, progression, gates: current ? runEvaluations[current.id] : null, hist,planning });
  const pressureGate=current?runEvaluations[current.id]?.gates.find(g=>g.id==='pressure'):null;
  if(context.stage==='retention'&&current&&pressureGate?.pass===true&&!pressureGate.operatingFailures?.length) {
    if(retention.status==='fit-deficient') {
      next.reason='Continue Retention: at least one fitted line fails the selected fit-quality/point-count criterion. Establish an adequate model before starting Selectivity.';
      next.status=STATUS.NEED_EXP;next.actionable=false;
      const choice=retention.plan?.preferred;
      next.preferred={action:choice?.action||'Inspect t0, compound assignments and residuals, then collect an informative modelling run.',why:choice?.why||'Do not remove valid points simply to improve R².'};
      next.method=choice?proposedMethod(session,current,{percentB:{value:choice.percentB,why:choice.why}}):null;
      next.alternatives=(retention.plan?.options||[]).filter(o=>o!==choice).map(o=>({action:o.action,why:o.why}));
      next.draftReasons.push('Adding a point may improve or worsen R². Verify acquisition time and measured pressure for the new modelling condition.');
    } else if(retention.issued?.candidates?.minimum) {
      const B=retention.issued.candidates.minimum.B;
      const qualified=automaticModelQuality(retention);
      next.reason=qualified?`Retention model complete under the selected policy. Next stage: Selectivity, starting at minimum ${B} %B.`:'Continue Retention: automatic progression requires every line to meet R² ≥ 0.995 with at least three distinct %B values.';
      next.status=qualified?STATUS.PROPOSED:STATUS.NEED_EXP;next.actionable=false;
      next.preferred={action:qualified?`Plan the first Selectivity experiment at minimum ${B} %B. It appears automatically there; import Selectivity data only on its own page.`:'Inspect the deficient line and residuals before adding a justified modelling point.'};
      next.method=qualified?proposedMethod(session,current,{percentB:{value:B,why:retention.issued.candidates.explanation}}):null;
      next.alternatives=[];next.draftReasons.push('The minimum is model-derived, not method validation. Confirm source-model applicability and actual limits before injection.');
    } else if(worksheet.ok) {
      next.actionable=false;next.method=null;next.alternatives=[];
      if(worksheet.qualified){
        const B=worksheet.calculation.B;next.status=STATUS.PROPOSED;
        next.reason=`Last-peak line meets R² ≥ 0.995 and the recorded evidence checks. Next stage: Selectivity at ${B} %B.`;
        next.preferred={action:`Open Selectivity; minimum ${B} %B is already available there. Collect its baseline run before progressing.`};
        next.method=proposedMethod(session,current,{percentB:{value:B,why:'Qualified workbook-style last-peak line; not an all-compound model.'}});
      }else{
        next.status=worksheet.qualityPass?STATUS.NEED_INFO:STATUS.NEED_EXP;
        next.reason=worksheet.qualityPass?'R² target met; complete the last-peak model evidence before starting Selectivity.':'Continue Retention: the last-peak line has not met R² ≥ 0.995 / the minimum point requirement.';
        next.preferred={action:worksheet.qualityPass?'Complete the documented t0 and last-peak continuity checks beside the graph.':'Inspect residuals, t0 and the last retained peak. Repeat a suspect acquisition or add a justified %B point; do not delete valid points to raise R².'};
      }
      next.draftReasons.push(worksheet.scope);
    }
  }
  if (current) {
    next.confirmations = confirmationsFor(session, settings, current);
    const hardwareUnknown = runEvaluations[current.id]?.gates.find(g => g.id === 'pressure')?.operatingUnknown || [];
    next.confirmations = [...new Set([...next.confirmations, ...hardwareUnknown])];
    if (next.status === STATUS.MET && next.confirmations.length) { next.provisional = true; next.reason += ' Confirmations are still outstanding (listed below); until they are resolved the verdict is provisional.'; }
  }
  if (current && next.method) applyProposalReadiness(session, settings, current, next);
  next.unasked = planning?unaskedForPlanning(planning,retention):unaskedFor(retention);
  return { settings, sets, current: current ? { id: current.id, label: current.label } : null, runEvaluations, retention, progression, next, planning,worksheet, equipment: equipmentStatus(session) };
}

// Numerical routing and predicted quantities do not establish readiness to
// perform an experiment. Every branch emitting a method passes this common
// final guard; the scientific branch/status is kept, but a draft cannot carry
// an "actionable" claim. This never changes a measured FC1-MET verdict.
export function applyProposalReadiness(session, settings, run, result) {
  const method = result.method;
  if (!method) return result;
  // Some scientific branches amend a carried row after proposedMethod() has
  // constructed the table (e.g. restore the previous %B before selectivity).
  // Decorate the FINAL changed rows, not only the rows changed at construction.
  // This is explanatory metadata only: values, routing and readiness remain
  // governed by the scientific and safety checks below.
  for (const row of method.rows.filter(x => x.state === 'changed')) {
    const context = changeContext(session, settings, row.key === 'column' ? 'column ligand' : row.key, { run });
    if (context) Object.assign(row, { module: context.module, controlledAt: context.controlledAt,
      range: context.range, rangeKnown: context.rangeKnown, requiredField: context.requiredField });
  }
  const reasons = [...(result.draftReasons || [])], checks = [];
  const rows = new Map(method.rows.map(row => [row.key, row]));
  const col = runColumn(session, run), ins = runInstrument(session, run);
  if (!col.column || !col.confirmed) reasons.push('The proposed method has no confirmed physical-column association.');
  if (!ins.instrument || !ins.confirmed) reasons.push('The proposed method has no confirmed instrument association.');
  if (rows.get('column')?.state === 'changed') reasons.push('The proposed column change has no confirmed target-column record: verify its own limits before performing the draft.');

  const doc = documentedLimitStatus(session, settings, run);
  checks.push(...doc.checks); reasons.push(...doc.unverified);
  const cp = columnLimit(col.model, 'pressure'), ip = ins.instrument?.limits?.find(x => x.quantity === 'pressure');
  if (cp.known) {
    const parsed = toPsi(cp.value, cp.unit);
    if (!parsed.ok || !(parsed.psi > 0)) reasons.push(`The column pressure rating is unusable: ${parsed.reason || 'it must be positive'}.`);
  }
  if (ip) {
    const parsed = toPsi(ip.value, ip.unit);
    if (!parsed.ok || !(parsed.psi > 0) || !['<', '<='].includes(ip.op)) reasons.push(`The instrument pressure rating has an unusable value, unit or comparison operator (${ip.value} ${ip.unit}, ${ip.op}).`);
    if (!ip.basis && !ip.source) reasons.push('The instrument pressure rating has no stated basis or source.');
  }
  if ((cp.known || columnLimit(col.model, 'temperature').known) && !col.model?.datasheetRef && !String(col.model?.provenance?.source || '').startsWith('reference:') && !(col.model?.provenance?.sources?.length))
    reasons.push('The column operating-limit values have no datasheet/reference provenance. Record the exact model-specific source; an entered number is not a documented rating.');

  const tRow = rows.get('ovenSetpoint'), effective = effectiveTemperature(run, settings);
  const proposedT = tRow?.state === 'changed' ? (typeof tRow.value === 'number' && Number.isFinite(tRow.value) ? tRow.value : null)
    : effective.known ? effective.value : null;
  if (proposedT === null) reasons.push('The proposed column temperature is not established; its limit cannot be checked.');
  for (const bound of (ins.instrument?.limits || []).filter(x => ['temperature', 'flow'].includes(x.quantity))) {
    const value = bound.quantity === 'temperature' ? proposedT : rows.get('flow')?.value;
    const expectedUnit = bound.quantity === 'temperature' ? '°C' : 'mL/min';
    if (!bound.basis && !bound.source) reasons.push(`The instrument ${bound.quantity} limit has no stated basis or source.`);
    if (bound.unit !== expectedUnit || !Number.isFinite(bound.value) || !OPERATORS[bound.op]) reasons.push(`The instrument ${bound.quantity} limit cannot be used: expected a finite value in ${expectedUnit} with a valid comparison operator.`);
    else if (typeof value !== 'number' || !Number.isFinite(value)) reasons.push(`The proposed ${bound.quantity} is not known, so the recorded instrument limit cannot be checked.`);
    else if (!compare(value, bound.op, bound.value).pass) reasons.push(`DO NOT PERFORM — proposed ${bound.quantity} ${value} ${expectedUnit} does not meet the instrument limit ${opl(bound.op)} ${bound.value} ${expectedUnit}.`);
    else checks.push(`Proposed ${bound.quantity} meets instrument limit ${opl(bound.op)} ${bound.value} ${expectedUnit}.`);
  }

  const chemistryChanged = ['percentB', 'organic', 'phaseA', 'phaseB', 'additiveName', 'additiveConc', 'pH', 'ovenSetpoint', 'column'].some(key => rows.get(key)?.state === 'changed');
  const pRow = rows.get('pressureEstimate');
  let pressure = null;
  if (chemistryChanged) checks.push('No pressure prediction is transferred across a composition, solvent, temperature or column change. Measure pressure under the new condition; a documented rating is not clearance to inject.');
  else if (pRow && Number.isFinite(Number(pRow.value)) && Number(pRow.value) > 0) pressure = Number(pRow.value);
  else if (rows.get('flow')?.state !== 'changed') pressure = pressurePsi(run);
  const lc = limitCheck(session, settings, run, { pressurePsi: pressure, temperatureC: proposedT });
  checks.push(...lc.notes); reasons.push(...lc.unverified, ...lc.breaches.map(x => `DO NOT PERFORM — ${x}`));
  if (pressure !== null) checks.push('The checked pressure is a measurement or explicitly labelled estimate, not clearance to inject. Confirm measured pressure during the proposed run.');

  const pH = rows.get('pH')?.value;
  if (typeof pH === 'number' && Number.isFinite(pH)) {
    const range = columnLimit(col.model, 'pH');
    if (!range.known) reasons.push('The proposed pH is recorded, but the column pH range is undocumented.');
    else if (pH < range.low || pH > range.high) reasons.push(`DO NOT PERFORM — proposed pH ${pH} is outside the column range ${range.low}–${range.high}.`);
  }
  for (const key of ['organic', 'percentB', 'mode', 'flow', 'injVolume', 'wavelength', 'acquisitionTime', 'phaseA', 'phaseB']) {
    const row = rows.get(key);
    if (!row || row.state === 'unknown' || row.state === 'carried-unconfirmed') reasons.push(`Proposed method condition ${row?.label || key} is missing or unconfirmed.`);
  }
  const identity = sampleIdentity(run); if (!identity.known) reasons.push(identity.reason);
  const unique = [...new Set(reasons)];
  const readiness = { ready: unique.length === 0 && result.actionable === true, planningDraft: unique.length > 0 || result.actionable !== true, reasons: unique, checks: [...new Set(checks)],
    note: 'Scientific proposal and analytical model output are not experimental clearance. Verify documented hardware limits and complete confirmed method conditions.' };
  result.readiness = readiness; method.readiness = readiness; method.planningDraft = readiness.planningDraft;
  result.draftReasons = unique;
  if (readiness.planningDraft) result.actionable = false;
  result.evidence.push(...readiness.checks);
  return result;
}

// What the tool returns WITHOUT being asked: the minimum %B that satisfies the
// run-time specification and the intermediate %B that maximises the smallest
// adjacent selectivity, both derived from log K against %B across ALL modelled
// compounds. They are offered whenever a model exists, whether or not the
// current decision needs them, and they are labelled EXPLORATORY whenever the
// model does not cover the whole sample or rests on an unconfirmed t0.
export function unaskedFor(retention) {
  const r = retention;
  const block = r?.issued || r?.subset || null;
  const whole = !!r?.issued;
  if (!block || !block.candidates?.ok) {
    return { available: false,
      reason: r?.reasons?.length ? `No minimum or intermediate %B is offered: ${r.reasons[0]}` : 'No minimum or intermediate %B is offered: no retention model has been established yet.',
      missing: r?.missing || [] };
  }
  const c = block.candidates;
  const out = { available: true, whole,
    label: whole ? 'Derived from log K against %B across every modelled compound, and offered without being asked.'
      : 'EXPLORATORY — derived from log K against %B across the compounds that are modelled, which do not cover the whole sample. Not issued as a method.',
    minimum: c.minimum ? { B: c.minimum.B, controlling: c.controlling?.name || null, predictedLast: c.minimum.max,
      why: `The lowest whole-number %B at which every modelled compound is predicted to elute within the run-time specification; ${c.controlling?.name || 'one compound'} is the one that decides it.` } : null,
    intermediate: r.intermediate?.ok ? { B: r.intermediate.best.B, minAlpha: r.intermediate.best.minAlpha, pair: r.intermediate.best.pair,
      predictedLast: r.intermediate.best.lastTR, note: r.intermediate.note,
      why: 'Among the compositions from the minimum upward, the one with the largest smallest-adjacent α: the best predicted spacing. Spacing is not resolution — widths are not modelled — so it is verified by injection.' } : null,
    intermediateWhy: r.intermediate?.ok ? null : (r.intermediate?.reason || 'An intermediate %B needs at least two modelled compounds and a minimum to start from.'),
    lines: block.lines || [],
  };
  return out;
}
// A Selectivity run and its model reference are independent evidence streams.
// Never say an imported reference minimum is absent just because the current
// Selectivity library cannot fit a fresh retention line of its own.
export function unaskedForPlanning(plan,ownRetention) {
  if(plan.analysis){const result=unaskedFor(plan.analysis);return {...result,referenceOnly:true,source:plan.source,qualified:!!plan.ready};}
  if(Number.isFinite(plan.B)&&['auto-lastpeak','calculator','manual'].includes(plan.mode))return {
    available:true,whole:false,referenceOnly:true,qualified:!!plan.ready,source:plan.source,
    label:plan.mode==='auto-lastpeak'?'Retention last-peak reference, calculated from the Retention workspace; not from the current Selectivity run.':'External planning reference, not a fit of the current Selectivity run.',
    minimum:{B:plan.B,predictedLast:plan.worksheet?.calculation?.predictedLast??plan.predictedLast??null,why:plan.ready?'Available for planning; actual baseline and operating limits still require checks.':'Candidate only: '+plan.reason},
    intermediate:null,intermediateWhy:'Intermediate choices are shown in the composition planner above. A last-peak line cannot quantify an all-compound α optimum.',
    lines:plan.worksheet?.points?.map(x=>x.label)||[],missing:[],
  };
  return {available:false,referenceOnly:true,source:plan.source||'No accepted reference yet',qualified:false,missing:[],
    reason:'No usable planning reference is established yet. '+(plan.reason||'Review Retention or choose a sourced external minimum.')};
}

export function equipmentStatus(session) {
  const runs = session.runs.map(r => {
    const c = runColumn(session, r), i = runInstrument(session, r);
    return { runId: r.id, label: r.label, instrument: i.instrument?.label || null, instrumentConfirmed: i.confirmed, column: c.column?.label || null, columnConfirmed: c.confirmed,
      fileInstrumentName: r.measured.fileMeta?.instrumentName || null };
  });
  return { runs, unassociated: runs.filter(r => !r.column || !r.instrument).length,
    unknownColumnLimits: session.columnModels.filter(m => !Number.isFinite(m.limits?.tMaxC) || !Number.isFinite(m.limits?.pMax)).map(m => `${m.manufacturer || ''} ${m.product || m.id}`.trim()),
    recordErrors: [
      ...session.instruments.flatMap(i => validateInstrument(i).map(e => `Instrument "${i.label}": ${e}.`)),
      ...session.columnModels.flatMap(m => validateColumnModel(m).map(e => `Column model "${`${m.manufacturer || ''} ${m.product || m.id}`.trim()}": ${e}.`)),
    ],
    consistency: equipmentConsistency(session) };
}

// Confirmations still outstanding for the current run, listed with every result.
export function confirmationsFor(session, settings, run) {
  const out = [];
  const c = runColumn(session, run), i = runInstrument(session, run);
  if (!c.column) out.push('No physical column is associated with the current run.');
  else if (!c.confirmed) out.push(`Column association "${c.column.label}" is unconfirmed (${c.source}).`);
  if (c.model) { for (const q of ['pressure', 'temperature']) { const l = columnLimit(c.model, q); if (!l.known) out.push(l.reason); } }
  if (!i.instrument) out.push('No instrument record is associated with the current run.');
  else if (!i.confirmed) out.push(`Instrument association "${i.instrument.label}" is unconfirmed (${i.source}).`);
  const unconf = Object.entries(run.conditions).filter(([, v]) => v && v.value !== null && v.value !== undefined && v.value !== '' && !v.confirmed).map(([k]) => k);
  if (unconf.length) out.push(`Unconfirmed recorded conditions: ${unconf.join(', ')}.`);
  const T = effectiveTemperature(run, settings); if (!T.known) out.push(`Column temperature: ${T.reason}`);
  return out;
}

function base(status, reason) {
  return { status, reason, evidence: [], preferred: null, alternatives: [], missing: [], method: null, inspectAfter: [], actionable: false, draftReasons: [], scope: SCOPE_STATEMENT, workflow: REGISTER_BY_ID['rule.decisionOrder'].detail };
}

export function nextExperiment(session, settings, ctx) {
  const { current, retention, progression, gates, hist,planning } = ctx;
  // The specifications decide every comparison, so an impossible one is
  // refused before any run is judged against it.
  const pv = validatePolicies(settings);
  if (!pv.ok) {
    const r = base(STATUS.NEED_INFO, `A tool policy in Settings cannot be applied: ${pv.problems.map(p => p.text).join(' ')} These are the tool's own policies, not course rules, but a policy that cannot mean anything is never applied silently.`);
    r.preferred = { action: 'Correct the policy in Settings. "Reset to the preset" restores the BPS2032 defaults.' };
    for (const p of pv.problems) r.missing.push(`A usable ${POLICY_DOMAINS[p.key]?.label || p.key}: ${p.text}`);
    r.policyProblems = pv.problems;
    return r;
  }
  const sv = validateSpecs(settings.specs);
  if (!sv.ok) {
    const r = base(STATUS.NEED_INFO, `The specifications in force cannot be applied: ${sv.problems.map(p => p.text).join(' ')} No run is judged against a specification that the quantity does not admit.`);
    r.preferred = { action: 'Correct the specification in Settings (Specifications in force). The default BPS2032 values are restored by the "Reset to the preset" control.' };
    for (const p of sv.problems) r.missing.push(`A valid ${SPEC_DOMAINS[p.key].label} specification: ${p.text}`);
    r.specProblems = sv.problems;
    return r;
  }
  if (!session.runs.length) {
    const r = base(STATUS.NEED_INFO, 'No experiments have been imported.');
    r.preferred = { action: 'Import one or more CSV files (Equipment & data → Import).' };
    r.missing.push('Experimental data'); return r;
  }
  if (!current) {
    const r = base(STATUS.NEED_INFO, 'No sample run (non-blank, with peaks) is in the decision-history set.');
    r.preferred = { action: 'Tick "Include in decision history" for the runs that were performed, in the run table.' };
    r.missing.push('A sample run in the decision history'); return r;
  }
  // Which run is the latest decides the whole decision. It is never taken from
  // the order files happened to be selected in, or from a label.
  const chron = chronologyStatus(session, hist);
  if (!chron.ok) {
    const r = base(STATUS.NEED_INFO, `The order of the runs in the decision history is not established, so "the latest run" cannot be identified. ${chron.reason}`);
    r.evidence.push(`Ordering basis: ${chron.basis}.`, 'A run label and the order in which files were imported are annotations, not evidence of when a run was performed.');
    r.preferred = { action: 'State the order in which these runs were acquired (run table → "Set run order"), or import exports that carry an acquisition time.' };
    r.missing.push(`Acquisition order of: ${chron.ambiguous.map(a => a.label).join(', ')}.`);
    r.inspectAfter.push('Whether the run you intend as the latest is the last in the stated order.');
    return r;
  }
  const g = Object.fromEntries(gates.gates.map(x => [x.id, x]));
  const evidence = gates.gates.map(x => `${x.order}. ${x.label}: ${x.text}`);
  const withEvidence = r => { r.evidence.unshift(`Current run: "${current.label}" (${session.settings.currentRunId ? 'explicitly selected in this stage' : 'latest sample run in this stage history'}; ${hist.length} run(s) in that set).`, ...evidence); return r; };
  const S = settings.specs;

  // 1. pressure
  // A hardware breach is not the same question as the software cut-off. A
  // flow estimate aimed only at 4000 psi could otherwise INCREASE the flow
  // even though a lower fitted-component rating has already been exceeded.
  if (g.pressure.operatingFailures?.length) {
    const r = withEvidence(base(STATUS.LIMITS, `DO NOT PERFORM the recorded method unchanged. Confirmed associated equipment operating constraints were exceeded: ${g.pressure.operatingFailures.join('; ')}. The software back-pressure cut-off does not override a lower hardware rating.`));
    r.preferred = { action: 'Review the exact fitted instrument/column ratings and the recorded conditions. Reduce flow and measure pressure where appropriate, or select compatible equipment/temperature conditions; no nominal flow increase or cleared next-run method is issued.', module: 'pump / column oven / column', parameter: 'documented operating constraints' };
    r.draftReasons.push(...g.pressure.operatingFailures, ...(g.pressure.operatingUnknown || []));
    r.inspectAfter.push('Measured pressure and temperature against the applicable hardware ratings and project specifications.');
    return r;
  }
  if (g.pressure.operatingRatingUnusable && g.pressure.specificationPass !== null) {
    const r = withEvidence(base(STATUS.NEED_INFO, `The measured back-pressure is known (${g.pressure.value} psi), but a recorded associated-equipment rating cannot be interpreted. ${g.pressure.operatingUnknown.join(' ')} Correct the rating unit/operator/value before the binding operating constraint can be checked.`));
    r.preferred = { action: 'Correct the exact associated instrument/column operating rating, unit and source in Equipment. Do not replace or re-enter the valid measured pressure merely to resolve this hardware-record problem.' };
    r.missing.push(...g.pressure.operatingUnknown);
    return r;
  }
  if (g.pressure.pass === null) {
    const r = withEvidence(base(STATUS.NEED_INFO, 'The back-pressure of the current run is not known, and pressure is checked first.'));
    r.missing.push('Measured back-pressure of the current run'); r.preferred = { action: 'Enter the peak back-pressure read from the run, or import the export that contains the pressure trace.' };
    return r;
  }
  if (g.pressure.pass === false) return withEvidence(pressureSafeProposal(session, settings, current));

  // Selectivity begins with a measured minimum-%B baseline. Planning values
  // never mark a run as performed. Pressure remains the first gate.
  if(planning) {
    if(!planning.ready) {
      const r=withEvidence(base(STATUS.NEED_INFO,planning.reason));
      r.referenceBlocker={source:planning.mode==='auto-lastpeak'||planning.mode==='retention'?'Retention reference':'Composition planning reference',reason:planning.reason};
      r.preferred={action:Number.isFinite(planning.B)?`Review the model-reference checks for candidate ${planning.B} %B above. The current Selectivity measurements remain available; qualify the reference before executing a next-run proposal.`:'Establish minimum %B in the planning section above the import box. Continue Retention if the fit is deficient.'};
      r.missing.push(Number.isFinite(planning.B)?'Qualification of the existing reference minimum %B (see model reference checks)':'Sourced minimum %B for the first Selectivity experiment');return r;
    }
    const currentIdentity=sampleIdentity(current);
    const baseline=hist.some(run=>percentBOf(run)===planning.B&&run.assoc.columnId?.confirmed&&run.assoc.instrumentId?.confirmed&&
      currentIdentity.known&&sampleIdentity(run).known&&sampleIdentity(run).value===currentIdentity.value&&
      (!planning.analysis||modelApplicability(session,settings,run,planning.analysis).ok));
    if(!baseline) {
      const r=withEvidence(base(STATUS.NEED_EXP,`Selectivity starts with the minimum-%B baseline (${planning.B} %B). No confirmed matching baseline run is recorded in this stage history.`));
      r.preferred={action:`First run at minimum ${planning.B} %B on the documented baseline column, solvent and temperature; import that run before progressing to intermediate %B or temperature/solvent changes.`};
      r.method=proposedMethod(session,current,{percentB:{value:planning.B,why:planning.source}});
      r.draftReasons.push('Verify the source model applies to the actual baseline sample, column, solvent and temperature. A planned composition is not evidence that the experiment was performed.');
      return r;
    }
    const chosen=session.settings.plannedIntermediateB;
    if(Number.isFinite(chosen)&&chosen>planning.B&&chosen<=100&&(g.peakCount.direction==='below'||g.minRs.pass===false)&&g.lastPeak.pass!==false) {
      const applicable=!planning.analysis||modelApplicability(session,settings,current,planning.analysis).ok;
      const performed=hist.some(run=>percentBOf(run)===chosen&&sampleIdentity(run).known&&sampleIdentity(run).value===currentIdentity.value&&
        run.assoc.columnId?.confirmed&&run.assoc.instrumentId?.confirmed&&(!planning.analysis||modelApplicability(session,settings,run,planning.analysis).ok));
      if(applicable&&!performed) {
        const predicted=planning.analysis?.issued?.candidates?.rows.find(x=>x.B===chosen);
        if(!predicted||predicted.feasible) {
          const r=withEvidence(base(STATUS.NEED_EXP,`The minimum-%B baseline is recorded. You selected optional intermediate ${chosen} %B; it has not been measured on the matching condition.`));
          r.preferred={action:`Test the selected intermediate ${chosen} %B before temperature/solvent changes.`,why:predicted?`Predicted latest peak ${predicted.max.toFixed(3)} min. Verify peak count, widths/Rs and measured pressure.`:'Experimental hypothesis; no quantified resolution or pressure prediction.'};
          r.method=proposedMethod(session,current,{percentB:{value:chosen,why:'User-selected optional intermediate planning composition'}});
          r.draftReasons.push('Optional intermediate experiment. A predicted spacing is not a predicted Rs or experimental clearance.');return r;
        }
      }
    }
  }

  // 2. peak count
  const pc = g.peakCount;
  if (pc.direction === 'above') {
    const r = withEvidence(base(STATUS.NEED_INFO, `${pc.value} peaks exceed the target of ${S.peakCount.value}; extra peaks are not accepted automatically.`));
    r.preferred = { action: 'Inspect the blank, the integration (artefacts, split peaks) and possible interfering or carry-over peaks. Mark confirmed artefacts in the peak table with a reason.' };
    r.alternatives.push({ action: 'If the extra peaks are real compounds, the target peak count does not describe this sample: adjust the target in Settings with a stated reason.' });
    r.inspectAfter.push('Whether the counted peaks now correspond to the expected sample composition.');
    return r;
  }
  if (pc.direction === 'below') {
    const r = withEvidence(belowTarget(session, settings, current, retention, progression, g));
    const acq = usable(current.conditions.acquisitionTime) ? Number(current.conditions.acquisitionTime.value) : null;
    const lastT = g.lastPeak.value;
    r.checksFirst = [
      'Import, integration and detection: compare with the blank; check integration events and thresholds; a compound that does not absorb at the detection wavelength gives no peak (EQUIPMENT Discovery Book §5.3).',
      acq !== null && lastT !== null ? `Acquisition time: the run was acquired to ${acq.toFixed(2)} min and its last peak is at ${lastT.toFixed(3)} min — a compound eluting after ${acq.toFixed(2)} min would be missing.` : 'Acquisition time not recorded: late peaks may lie outside it.',
      'Marker and suspected co-elution: confirm which peak is the hold-up marker; inspect shoulders and valley-integrated peaks (export marks) for hidden co-elution. Peaks are never split or invented to reach the target.',
      'Then the experimental levers in order: retention (%B ladder, minimum or intermediate %B), configured temperature steps, available solvents, available stationary phases.',
    ];
    return r;
  }

  // 3. last peak
  if (g.lastPeak.pass === false) return withEvidence(tooLong(session, settings, current, retention, g));
  // 4. Rs
  if (g.minRs.pass === null) {
    const r = withEvidence(base(STATUS.NEED_INFO, 'The lowest adjacent-pair resolution cannot be established, so the run cannot be judged.'));
    r.missing.push('Peak widths (or plate numbers) for every adjacent pair, under the selected Rs basis');
    r.preferred = { action: 'Re-integrate or export the missing peak data, or choose another documented Rs basis available for every pair (Settings). Bases are never mixed.' };
    return r;
  }
  if (g.minRs.pass === false) {
    const r = withEvidence(selectivityStep(session, settings, current, progression, `Lowest adjacent Rs ${g.minRs.value.toFixed(3)} does not meet ${opl(S.minRs.op)} ${S.minRs.value}; resolution below specification is directed to selectivity (FC1 rubric).`));
    // The quantity that places this run here, and the quantity that places
    // each option where it is. No option predicts a NEW Rs: that needs the
    // widths of the new run, which do not exist yet.
    const rs = g.minRs.rs, lim = rs.limiting;
    r.deficiency = {
      quantity: 'lowest adjacent-pair resolution',
      value: g.minRs.value, spec: `${opl(S.minRs.op)} ${S.minRs.value}`,
      shortfall: +(S.minRs.value - g.minRs.value).toFixed(4),
      pair: lim ? `peaks ${lim.from} and ${lim.to}` : 'not established',
      basis: g.minRs.basis?.label || settings.rsBasis,
      text: `The limiting pair is ${lim ? `peaks ${lim.from}–${lim.to}` : 'not established'} at Rs ${g.minRs.value.toFixed(3)} on the ${g.minRs.basis?.label || settings.rsBasis} basis, ${(S.minRs.value - g.minRs.value).toFixed(3)} short of ${opl(S.minRs.op)} ${S.minRs.value}. ${rs?.closestIsLimiting === false ? `The closest pair in time (${rs.closest.from}–${rs.closest.to}) is not the limiting pair, so spacing alone does not identify the problem pair.` : ''}`,
      noRsPrediction: 'No option below predicts a resolution value. Rs needs the peak widths (or plate numbers) of the new run under the same basis, and those do not exist until the run is made; retention spacing alone does not give Rs. What each option states is the quantity that places it in the order — the step it represents, what has already been done, and where available a predicted latest retention time.',
    };
    r.evidence.push(r.deficiency.text, r.deficiency.noRsPrediction);
    return r;
  }
  const r = withEvidence(base(STATUS.MET, 'Every evaluated FC1 numerical criterion is met in the same run.'));
  r.preferred = { action: 'Confirm the chromatogram visually and record the result. The efficiency specification is assessed in FC2.' };
  r.inspectAfter.push('Visual confirmation of the chromatogram (not assessed by this tool).');
  return r;
}

// Every proposal that changes a condition passes through limitCheck, which now
// lives in data-model/limits.mjs so the retention planner uses the same check.
// Re-exported here because the decision layer is its main caller.
export { limitCheck };

function pressureSafeProposal(session, settings, run) {
  const S = settings.specs;
  const P = pressurePsi(run), F = flowOf(run);
  const r = base(STATUS.PROPOSED, `Measured back-pressure ${P.toFixed(0)} psi does not meet ${opl(S.pressure.op)} ${S.pressure.value} psi. A pressure-safe run comes first.`);
  r.preferred = { module: 'pump', parameter: 'flow' };
  if (F === null) { r.status = STATUS.NEED_INFO; r.missing.push('Confirmed flow rate of the current run'); r.preferred = { action: 'Confirm the flow rate so a lower flow can be proposed.', module: 'pump', parameter: 'flow' }; return r; }
  const { model } = runColumn(session, run);
  const geom = { length: model?.lengthMm, dp: model?.particleUm, id: model?.idMm };
  const estAt = f => pressureScale(P, { flow: F, ...geom }, { flow: f, ...geom });
  // Largest 0.05 mL/min step whose estimate SATISFIES the configured operator.
  // With a strict "<" limit an estimate exactly at the limit is not admissible.
  // Integer step counts avoid a floating-point flow of 1.2000000000000002,
  // whose estimate would read 4000.0000000000005 and be rejected at a limit of
  // 4000. The estimate is compared at 12 significant figures, so an estimate
  // that is exactly the limit is accepted by "<=" and refused by "<".
  const STEP = 0.05;
  let target = null;
  const startN = Math.max(1, Math.ceil((F * S.pressure.value / P) / STEP));
  for (let n = startN; n >= 1; n--) {
    const f2 = +(n * STEP).toFixed(2), e = estAt(f2);
    if (!e.ok) { target = null; break; }
    if (compare(Number(e.estimate.toPrecision(12)), S.pressure.op, S.pressure.value).pass) { target = f2; break; }
  }
  if (!estAt(F).ok) {
    r.status = STATUS.NEED_INFO;
    r.missing.push('Column length, internal diameter and particle size of the associated column');
    r.preferred = { action: 'Record the column geometry so a pressure-safe flow can be estimated, or reduce the flow and measure the pressure directly.', module: 'column', parameter: 'column geometry' };
    return r;
  }
  if (target === null || !(target > 0)) {
    r.status = STATUS.NEED_EXP;
    r.preferred = { action: 'No positive flow down to 0.05 mL/min brings the estimated back-pressure within the limit on this column. Change the column (shorter, wider, or a larger particle) or raise the limit if the hardware documents a higher rating.', module: 'column', parameter: 'column geometry' };
    r.evidence.push(`At 0.05 mL/min the Darcy estimate is still ${estAt(0.05).ok ? estAt(0.05).estimate.toFixed(0) + ' psi' : 'not computable'}.`);
    r.actionable = false;
    return r;
  }
  const est = estAt(target);
  const lim = limitCheck(session, settings, run, { pressurePsi: est.estimate });
  const last = relevantPeaks(run).length ? relevantPeaks(run).at(-1) : null;
  r.preferred = { action: `Reduce the flow rate from ${F} to ${target} mL/min (largest ${STEP} mL/min step whose Darcy estimate satisfies ${opl(S.pressure.op)} ${S.pressure.value} psi).`,
    why: 'Pressure scales with flow at unchanged mobile phase and column; K is unchanged by flow, and retention times scale by F/F′.',
    checks: [...lim.notes, ...lim.unverified], module: 'pump', parameter: 'flow' };
  r.method = proposedMethod(session, run, { flow: { value: target, why: 'pressure-safe flow' } }, {
    predictedLast: { label: 'Predicted latest peak', value: last ? (last.tR * F / target).toFixed(2) : null, unit: 'min', basis: 'tR × F/F′ (times scale with 1/flow at unchanged chemistry)' },
    pressureEstimate: { label: 'Back-pressure estimate', value: est.estimate.toFixed(0), unit: 'psi', basis: est.formula + ' — ' + PRESSURE_NOT_CLEARANCE } });
  r.alternatives.push({ action: 'A shorter column, a wider internal diameter or a larger particle also lower the pressure — mechanical (efficiency) levers, FC2.' });
  if (!lim.verified) { r.status = STATUS.LIMITS; r.draftReasons.push(...lim.unverified); }
  if (!lim.ok) { r.status = STATUS.LIMITS; r.draftReasons.push(...lim.breaches); }
  r.inspectAfter.push('Measured back-pressure against the limit', 'Whether the latest peak is still within the run-time limit');
  r.actionable = r.status === STATUS.PROPOSED;
  return r;
}

function testedOnCondition(session, settings, run, B) {
  const col = runColumn(session, run).column?.id;
  const sol = organicOf(run);
  const T = effectiveTemperature(run, settings);
  return historyRuns(session).some(r => {
    const c = runColumn(session, r);
    const Tr = effectiveTemperature(r, settings);
    return c.confirmed && c.column?.id === col && organicOf(r) === sol && percentBOf(r) === B && T.known && Tr.known && Math.abs(Tr.value - T.value) <= settings.tempMatchTolerance;
  });
}

function belowTarget(session, settings, run, retention, progression, g) {
  const S = settings.specs;
  const B = percentBOf(run);
  const why = `${g.peakCount.value} peak(s) below the target of ${S.peakCount.value}.`;
  const app = modelApplicability(session, settings, run, retention);
  const band = runtimeBand(g.lastPeak.value, S.lastPeak, settings.runtimeApproachingFraction);
  const { options, testedOnCondition } = retentionOptions(session, settings, run, retention, app, band);
  const Tcur = effectiveTemperature(run, settings);

  const frame = r => {
    r.runtimeBand = band;
    r.evidence.push(`Run-time band: ${band.text} (${RUNTIME_BAND_POLICY.label}: ${(band.fraction ?? RUNTIME_BAND_POLICY.fraction) * 100} % of the limit).`);
    r.evidence.push(app.ok ? `Retention model applies to this run (fitted on "${app.reference.label}"; this run's own t0 ${app.t0.t0.toFixed(3)} min is used for every prediction).${app.notes?.length ? ' ' + app.notes.join('; ') + '.' : ''}`
      : `No retention time is predicted for this run: ${app.reasons.join('; ')}.`);
    if (testedOnCondition.length) r.evidence.push(`Compositions already measured on this condition: ${testedOnCondition.join(', ')} %B.`);
    r.options = options;
    return r;
  };

  // The %B series can only continue on a defined condition.
  if (!Tcur.known) {
    const r = base(STATUS.NEED_INFO, `${why} The column temperature of the current run is not established, so the %B series cannot be continued on a defined condition: ${Tcur.reason}`);
    r.preferred = { action: 'Establish the column temperature of the current run (confirm the setpoint; a recorded oven trace must be stable), or repeat the run once the oven is stable.', module: 'column oven', parameter: 'ovenSetpoint' };
    r.missing.push('Column temperature of the current run');
    return frame(r);
  }
  if (B === null) {
    const r = base(STATUS.NEED_INFO, `${why} The %B of the current run is not confirmed, so no composition change can be proposed.`);
    r.preferred = { action: 'Confirm %B for this run (Details → Recorded conditions).', module: 'pump', parameter: 'percentB' };
    r.missing.push('%B of the current run');
    return frame(r);
  }

  // ---- run time BEYOND the specification: return %B to its previous value and change selectivity
  if (band.band === 'beyond') {
    const back = options.find(o => o.id === 'return-previous');
    const r = base(STATUS.PROPOSED, `${why} ${band.text} With the peak count below target and the run time already beyond the specification, lowering %B further is not admissible: %B returns to its previous value and selectivity changes (FC1 rubric).`);
    const sel = selectivityStep(session, settings, run, progression, '', { suppressBase: true });
    if (back) {
      r.preferred = { action: `Return %B to ${back.percentB} % and change selectivity: ${sel.preferred ? sel.preferred.action : 'see the selectivity options below'}`, why: back.ground, module: 'pump', parameter: 'percentB' };
      r.method = sel.method && sel.method.rows ? sel.method : proposedMethod(session, run, { percentB: { value: back.percentB, why: 'return to the previous composition' } });
      if (r.method) { const row = r.method.rows.find(x => x.key === 'percentB'); if (row) { row.value = back.percentB; row.state = 'changed'; row.source = 'returned to the previous composition on this condition'; } }
    } else {
      r.status = STATUS.NEED_INFO;
      r.preferred = { action: 'No earlier composition on this condition is in the decision history: record the composition you intend to return to, or add the earlier run.', module: 'pump', parameter: 'percentB' };
      r.missing.push('An earlier, shorter-running composition on this condition');
    }
    r.alternatives.push(...(sel.alternatives || []));
    if (sel.preferred) r.alternatives.unshift({ action: `Selectivity step to apply at that composition: ${sel.preferred.action}`, why: sel.preferred.why });
    r.selectivityOptions = sel.selectivityOptions || null;
    r.remainingPath = sel.remainingPath || null;
    r.draftReasons.push(...(sel.draftReasons || []));
    if (sel.status === STATUS.LIMITS) r.status = STATUS.LIMITS;
    r.actionable = r.status === STATUS.PROPOSED && !!back;
    r.inspectAfter.push('Peak count and the latest retention time at the restored composition', 'Whether the selectivity change moves the critical pair');
    return frame(r);
  }

  // ---- run time WELL INSIDE or APPROACHING: the admissible compositions, together
  const admissible = options.filter(o => o.admissible && o.id !== 'return-previous');
  const prefer = band.band === 'approaching'
    ? (admissible.find(o => o.id === 'minimum') || admissible.find(o => o.id === 'intermediate') || admissible.find(o => o.id === 'ladder') || null)
    : (admissible.find(o => o.id === 'ladder') || admissible.find(o => o.id === 'minimum') || null);
  const rubricNote = band.band === 'approaching'
    ? 'A run time approaching the specification is directed to the minimum %B or an intermediate %B rather than a further fixed decrement (FC1 rubric).'
    : 'A run time well inside the specification is directed to the next decrement of the taught series (FC1 rubric).';

  if (!prefer) {
    const r = base(retention.status === 'mapping-unresolved' ? STATUS.MAPPING : STATUS.NEED_INFO, `${why} ${band.text} ${rubricNote} No admissible composition can be issued: ${app.ok ? 'every candidate is already measured or outside 0–100 %B' : app.reasons.join('; ')}`);
    r.preferred = retention.status === 'mapping-unresolved'
      ? { action: 'Assign compound identities to the peaks of the eligible retention runs (Retention → Peak correspondence), then re-evaluate.', module: 'data system', parameter: 'peak identities' }
      : { action: 'Establish the retention model: tick the %B series for the fit, establish t0 and assign peak identities.', module: 'data system', parameter: 'retention model' };
    r.missing.push(...retention.missing);
    if (retention.exploratory?.ok) r.alternatives.push({ action: 'Exploratory position hypotheses are shown in the Retention stage. They are not identities and are not issued as a method.' });
    r.alternatives.push({ action: 'Move to the next selectivity step at the current %B, accepting that the minimum %B has not been established.' });
    return frame(r);
  }

  // A run time "approaching" the specification is directed to the minimum or an
  // intermediate %B. Where neither can be issued, the decrement is a FALLBACK
  // and is said to be one, with the reason the rubric's own step is unavailable.
  const fallback = band.band === 'approaching' && prefer.id === 'ladder';
  const fallbackNote = fallback
    ? ` The minimum %B that the rubric's step calls for cannot be issued here: ${app.ok ? (options.find(o => o.id === 'minimum')?.blocked || 'no minimum %B is available from the current model') : app.reasons.join('; ')}. The next decrement of the taught series is offered INSTEAD, as a fallback, and it is not the step the rubric describes for this band.`
    : '';
  const r = base(STATUS.PROPOSED, `${why} ${band.text} ${rubricNote}${fallbackNote}`);
  r.fallback = fallback || undefined;
  r.preferred = { action: `${fallback ? 'FALLBACK — ' : ''}Run at ${prefer.percentB} %B — ${prefer.quantity}.`, why: `${prefer.ground}${fallback ? ' This is a fallback: establishing the retention model (identities, t0 and a comparable %B series) would allow the minimum or an intermediate %B to be issued instead.' : ''}`, checks: prefer.notes, module: 'pump', parameter: 'percentB' };
  if (fallback) r.missing.push(...retention.missing.slice(0, 4));
  for (const o of admissible.filter(o => o !== prefer))
    r.alternatives.push({ action: `${o.percentB} %B — ${o.quantity}`, why: o.ground, predicted: o.predicted, notes: o.notes });
  const back = options.find(o => o.id === 'return-previous');
  if (back && band.band === 'approaching') r.alternatives.push({ action: `${back.percentB} %B — ${back.quantity}, then change selectivity`, why: back.ground });
  r.method = proposedMethod(session, run, { percentB: { value: prefer.percentB, why: prefer.quantity } }, {
    predictedLast: { label: 'Predicted latest peak', value: prefer.predicted === null ? 'not predicted' : prefer.predicted.toFixed(2), unit: prefer.predicted === null ? '' : 'min',
      basis: prefer.predicted === null ? (app.reasons[0] || 'no applicable model') : `${prefer.controlling} controls; model fitted on "${app.reference.label}", this run's t0 ${app.t0.t0.toFixed(3)} min` } });
  if (retention.status === 'fit-deficient' && retention.plan) {
    r.evidence.push(`Retention model: ${retention.reasons.join(' ')}`, retention.plan.statement);
    if (retention.plan.preferred?.percentB === prefer.percentB) r.preferred.why += ` This composition is also the preferred retention modelling point: ${retention.plan.preferred.why}`;
  }
  r.actionable = true;
  const acq = usable(run.conditions.acquisitionTime) ? Number(run.conditions.acquisitionTime.value) : null;
  r.inspectAfter.push('Peak count and identities at the new composition',
    `Whether the latest peak still meets ${opl(S.lastPeak.op)} ${S.lastPeak.value} min${acq !== null ? ` (acquisition currently ${acq.toFixed(1)} min — extend it if a later peak is expected)` : ''}`,
    'Measured back-pressure (not predicted across compositions)');
  return frame(r);
}

function lowerAlreadyTooLong(session, settings, run) {
  const col = runColumn(session, run).column?.id, sol = organicOf(run), B = percentBOf(run);
  return historyRuns(session).some(r => runColumn(session, r).column?.id === col && organicOf(r) === sol && percentBOf(r) !== null && percentBOf(r) < B && relevantPeaks(r).length && relevantPeaks(r).at(-1).tR > settings.specs.lastPeak.value);
}

function ladderStep(session, settings, run, newB, reason, retention) {
  const r = base(STATUS.PROPOSED, reason);
  r.preferred = { action: `Run at ${newB} %B (one ${settings.retentionStep}-point step below the current ${percentBOf(run)} %B).` };
  const acq = usable(run.conditions.acquisitionTime) ? Number(run.conditions.acquisitionTime.value) : null;
  r.method = proposedMethod(session, run, { percentB: { value: newB, why: 'retention ladder step' } }, {
    predictedLast: { label: 'Predicted last peak', value: 'not predicted', unit: '', basis: 'no adequate retention model; the run itself measures it' } });
  r.inspectAfter.push('Peak count', `Whether the last peak still meets the ${opl(settings.specs.lastPeak.op)} ${settings.specs.lastPeak.value} min limit${acq !== null ? ` (acquisition currently ${acq.toFixed(1)} min — extend it if late peaks may be missed)` : ''}`, 'Back-pressure (not predicted across compositions)');
  if (retention.status === 'mapping-unresolved') r.alternatives.push({ action: 'Assign peak identities in the existing runs so the minimum %B can be calculated instead of stepping.' });
  if (retention.status === 'fit-deficient' && retention.plan) {
    r.evidence.push(`Retention model: ${retention.reasons.join(' ')}`, retention.plan.statement);
    if (retention.plan.preferred && retention.plan.preferred.percentB === newB) r.preferred.why = `This composition is also the preferred retention modelling point: ${retention.plan.preferred.why}`;
    for (const o of retention.plan.options.filter(o => o.percentB !== newB)) r.alternatives.push({ action: o.action, why: o.why });
  }
  r.actionable = true;
  return r;
}

function tooLong(session, settings, run, retention, g) {
  const S = settings.specs;
  const B = percentBOf(run);
  const app = modelApplicability(session, settings, run, retention);
  const r = base(STATUS.PROPOSED, `Latest relevant peak ${g.lastPeak.value.toFixed(3)} min does not meet ${opl(S.lastPeak.op)} ${S.lastPeak.value} min.`);
  r.evidence.push(app.ok ? `Retention model applies to this run (fitted on "${app.reference.label}"; this run's own t0 ${app.t0.t0.toFixed(3)} min).` : `No retention time is predicted for this run: ${app.reasons.join('; ')}.`);
  // The composition that brings the latest peak inside the limit: the smallest
  // whole-number %B at or above the current one that the APPLICABLE model
  // predicts within the specification.
  let fix = null;
  if (app.ok && B !== null) {
    for (let b = Math.ceil(B); b <= 100; b++) {
      const p = predictLatest(app, b);
      if (p.ok && compare(p.tR, S.lastPeak.op, S.lastPeak.value).pass) { fix = { B: b, ...p }; break; }
    }
  }
  if (fix) {
    r.preferred = { action: `Raise %B to ${fix.B} %.`, module: 'pump', parameter: 'percentB',
      why: `The smallest whole-number %B at or above the current ${B} % that every modelled compound is predicted to meet ${opl(S.lastPeak.op)} ${S.lastPeak.value} min (${fix.controlling} controls at ${fix.tR.toFixed(2)} min).`,
      checks: [fix.extrapolated.length ? `EXTRAPOLATION for ${fix.extrapolated.join(', ')}` : 'within the fitted range of every modelled compound',
        'raising %B shortens retention and may merge peaks: check the peak count after the run',
        'back-pressure at a different composition is not predicted; measure it'] };
    r.method = proposedMethod(session, run, { percentB: { value: fix.B, why: 'composition that brings the latest peak inside the run-time specification' } },
      { predictedLast: { label: 'Predicted latest peak', value: fix.tR.toFixed(2), unit: 'min', basis: `${fix.controlling} controls; model fitted on "${app.reference.label}", this run's t0 ${app.t0.t0.toFixed(3)} min` } });
    r.actionable = true;
  } else {
    r.status = retention.status === 'mapping-unresolved' ? STATUS.MAPPING : STATUS.NEED_INFO;
    r.preferred = { action: app.ok ? 'No whole-number %B up to 100 % is predicted to bring the latest peak within the limit on this condition: shorten the column, raise the flow or change selectivity.' : 'Establish a retention model that applies to this run (identities, t0 and a comparable %B series), so the composition that meets the run-time limit can be calculated.', module: 'pump', parameter: 'percentB' };
    r.missing.push(...(app.ok ? [] : app.reasons));
  }
  const F = flowOf(run);
  if (F !== null) {
    const faster = +(F * g.lastPeak.value / (S.lastPeak.value * 0.95)).toFixed(2);
    const { model } = runColumn(session, run);
    const est = pressureScale(pressurePsi(run), { flow: F, length: model?.lengthMm, dp: model?.particleUm, id: model?.idMm }, { flow: faster, length: model?.lengthMm, dp: model?.particleUm, id: model?.idMm });
    const lim = est.ok ? limitCheck(session, settings, run, { pressurePsi: est.estimate }) : null;
    r.alternatives.push({ action: `Raise the flow rate to about ${faster} mL/min (mechanical): retention times scale by F/F′ and K is unchanged, but back-pressure rises in proportion${est.ok ? ` — estimate ${est.estimate.toFixed(0)} psi${lim && !lim.ok ? ', which EXCEEDS a documented limit' : ''}${lim && !lim.verified ? ', and a documented limit is missing' : ''}` : ''}.` });
  }
  r.alternatives.push({ action: 'Change selectivity at the current composition, accepting the run time until the separation is adequate.' });
  r.inspectAfter.push('Peak count (raising %B can merge peaks)', 'Latest retention time and measured back-pressure');
  return r;
}

function selectivityStep(session, settings, run, progression, why, opts = {}) {
  if (!progression || !progression.ok) {
    const r = base(STATUS.NEED_INFO, `${why} The selectivity history cannot be read.`);
    r.missing.push(...(progression?.missing || ['current run']));
    r.preferred = { action: 'Associate the runs with their physical column and confirm their solvent and temperature (Equipment stage).', module: 'column', parameter: 'column association' };
    return r;
  }
  const steps = progression.steps.map(s => `${s.label}: ${s.done ? `DONE (${s.evidence.join(', ')})` : s.available ? 'open' : `not available — ${s.unavailableReason}`}${s.rejected.length ? ` [not counted: ${s.rejected.join('; ')}]` : ''}`);
  if (progression.exhausted) {
    const r = base(STATUS.EXHAUSTED, `${why} Every applicable selectivity option is done or unavailable.`);
    r.evidence.push(...steps);
    r.preferred = { action: 'Hand over to Efficiency (FC2). Efficiency is named here and not implemented.', module: 'column', parameter: 'efficiency levers (FC2)' };
    r.remainingPath = [];
    return r;
  }
  const n = progression.next;
  const { options: selOpts } = selectivityOptions(session, settings, run, progression);
  const r = base(STATUS.PROPOSED, opts.suppressBase ? `Next open selectivity step: ${n.label}.` : `${why} Next open selectivity step: ${n.label}.`);
  r.evidence.push(...steps);
  r.selectivityOptions = selOpts;
  r.remainingPath = selOpts.map(o => ({ label: o.label, quantity: o.quantity, positionReason: o.positionReason, available: o.available, unavailableReason: o.unavailableReason }));
  const changes = {}; const extras = {};
  const curT = effectiveTemperature(run, settings);
  const last = relevantPeaks(run).length ? relevantPeaks(run).at(-1) : null;
  const first = selOpts.find(o => o.id === n.id) || selOpts[0];
  const solventChanges = !!(n.solventName && n.solventName !== organicOf(run));
  if (n.kind === 'ligand') {
    r.preferred = { action: `Change to a column with a different ligand${n.alternatives?.length ? `: ${n.alternatives.join(' or ')}` : ''}.`,
      why: first?.positionReason || POSITION_REASON.ligand, checks: first?.notes || [], module: 'column', parameter: 'stationary-phase ligand' };
    changes.column = { text: n.alternatives?.[0] || 'alternative column (choose one)', why: 'ligand step' };
    r.inspectAfter.push('Peak count, elution order and identities (all may change)', 'Back-pressure on the new column');
  } else {
    if (solventChanges) {
      const cv = n.conversion;
      changes.organic = { value: n.solventName, why: 'solvent step' };
      if (cv?.available) changes.percentB = { value: cv.rounded, why: `nomogram: ${cv.reason}` };
      else { changes.percentB = { value: null, why: cv?.reason || 'conversion unavailable' }; r.missing.push(`%B for ${n.solventName}: ${cv?.reason || 'no conversion'}`); }
      r.evidence.push(NOMOGRAM_LIMIT);
    }
    if (n.temperature) {
      changes.ovenSetpoint = { value: n.temperature, why: 'temperature step' };
      if (solventChanges) {
        extras.predictedLast = { label: 'Predicted latest peak', value: 'not predicted', unit: '',
          basis: 'The 1–2 %/°C rule of thumb describes a temperature change on its own. This step changes the organic solvent at the same time, and the solvent moves each compound by a different amount (SELECTIVITY Discovery Book §2.4), so no retention time is predicted. Measure it.' };
      } else {
        const br = last ? temperatureBracket(last.tR, curT.known ? curT.value : null, n.temperature) : { ok: false, reason: 'no latest peak' };
        extras.predictedLast = { label: 'Predicted latest peak', value: br.ok ? `${br.min.toFixed(2)}–${br.max.toFixed(2)}` : 'not predicted', unit: br.ok ? 'min' : '',
          basis: br.ok ? `rule of thumb 1–2 %/°C over ΔT ${br.dT.toFixed(1)} °C (Selectivity ED slides 27–28)${Math.abs(br.dT) > 30 ? '; beyond ~30 °C the f = 0.02 end is less dependable' : ''}` : br.reason };
      }
    } else if (n.temp === 'base') {
      changes.ovenSetpoint = { value: run.conditions.ovenSetpoint?.value === 'ambient' ? 'no setpoint (ambient)' : 'base condition of the retention runs', why: 'solvent step at base temperature' };
    }
    r.preferred = { action: `${n.label}: ${first ? first.quantity : ''}.`, why: first?.positionReason || '', checks: first?.notes || [],
      module: n.temperature ? 'column oven' : 'pump / mobile phase', parameter: n.temperature ? 'ovenSetpoint' : 'organic solvent and %B' };
    extras.pressureEstimate = { label: 'Back-pressure estimate', value: 'not predicted', unit: '', basis: 'Viscosity changes with solvent, composition and temperature; no viscosity data are supplied. Measure it. ' + PRESSURE_NOT_CLEARANCE };
    r.inspectAfter.push('Peak count and identities (order may change)', 'Lowest adjacent Rs and which pair limits it', 'Latest retention time and measured back-pressure');
  }
  r.method = proposedMethod(session, run, changes, extras);
  for (const o of selOpts.slice(1)) r.alternatives.push({ action: `${o.label}: ${o.quantity}${o.prediction ? ` — predicted latest peak ${o.prediction.min.toFixed(2)}–${o.prediction.max.toFixed(2)} min` : ''}${o.available ? '' : ` (NOT AVAILABLE: ${o.unavailableReason})`}`, why: o.positionReason });
  if (n.limitsUnverified) { r.status = STATUS.LIMITS; r.draftReasons.push(...n.needs); r.reason += ' PLANNING DRAFT until the column temperature limit is documented.'; }
  // An earlier attempt at this very step that breached the back-pressure
  // specification stays in the history, but the tool must not quietly
  // prescribe running that method again. The step is kept open and the
  // proposal carries the breach and a pressure-safe way to make the attempt.
  if (n.priorUnsafe?.length) {
    const u = n.priorUnsafe[0];
    const safe = safeFlowFor(session, settings, run, u);
    r.unsafePrior = { ...u, safe };
    r.evidence.push(`An earlier attempt at this step ("${u.label}") measured ${u.pressurePsi.toFixed(0)} psi, which does not meet ${opl(settings.specs.pressure.op)} ${settings.specs.pressure.value} psi. It remains in the history as a performed experiment; it is not evidence that the step was completed, and this proposal does not repeat that method as it stood.`);
    if (safe.ok) {
      r.preferred.checks = [...(r.preferred.checks || []), `Do not repeat the earlier attempt unchanged: lower the flow to about ${safe.flow} mL/min first (Darcy estimate ${safe.estimate.toFixed(0)} psi from ${u.pressurePsi.toFixed(0)} psi at ${u.flow} mL/min on this column geometry), then measure the back-pressure before accepting the run. ${PRESSURE_NOT_CLEARANCE}`];
      if (r.method) r.method.rows.push({ key: 'flow', label: 'Flow rate (reduced for the retry)', value: safe.flow, unit: 'mL/min', state: 'changed', source: 'the earlier attempt at this step breached the back-pressure specification; this flow is the Darcy estimate that brings it within the limit', module: 'Pump', controlledAt: 'software (pump)', range: safe.rangeText, rangeKnown: false, requiredField: 'Instrument record → Documented operating limits → add a flow limit, with its basis (pump datasheet)' });
    } else {
      r.status = STATUS.NEED_EXP;
      r.actionable = false;
      r.draftReasons.push(`The earlier attempt at this step breached the back-pressure specification and no pressure-safe flow can be estimated here: ${safe.reason} Change the column or the conditions before attempting this step again; the tool does not prescribe repeating the unsafe method.`);
    }
  }
  if (r.missing.length) r.status = STATUS.NEED_INFO;
  r.actionable = r.status === STATUS.PROPOSED;
  return r;
}

// The largest 0.05 mL/min flow whose Darcy estimate meets the configured
// back-pressure specification, scaled from the breaching run's own
// measurement on this column geometry. An estimate is not clearance.
function safeFlowFor(session, settings, run, unsafe) {
  const S = settings.specs;
  if (!Number.isFinite(unsafe.pressurePsi) || !(unsafe.flow > 0)) return { ok: false, reason: 'the breaching run records no usable flow rate, so no scaling is possible.' };
  const { model } = runColumn(session, run);
  const geom = { length: model?.lengthMm, dp: model?.particleUm, id: model?.idMm };
  const estAt = f => pressureScale(unsafe.pressurePsi, { flow: unsafe.flow, ...geom }, { flow: f, ...geom });
  if (!estAt(unsafe.flow).ok) return { ok: false, reason: 'the column geometry (length, internal diameter, particle size) is not recorded, so back-pressure cannot be scaled.' };
  const STEP = 0.05;
  for (let nSteps = Math.max(1, Math.ceil((unsafe.flow * S.pressure.value / unsafe.pressurePsi) / STEP)); nSteps >= 1; nSteps--) {
    const f = +(nSteps * STEP).toFixed(2), e = estAt(f);
    if (!e.ok) break;
    if (compare(Number(e.estimate.toPrecision(12)), S.pressure.op, S.pressure.value).pass)
      return { ok: true, flow: f, estimate: e.estimate, rangeText: 'No documented maximum flow is recorded for the associated instrument; the flow that may be used is bounded by the back-pressure it produces, which is a measured response.' };
  }
  return { ok: false, reason: 'no flow down to 0.05 mL/min brings the estimated back-pressure within the configured specification on this column.' };
}

export { isBlank };
