// nomogram.mjs — isoeluotropic conversion from the nomogram supplied in the
// SELECTIVITY Discovery Book p. 12/28 (§2.4). Carried over from v13 unchanged
// in substance: digitised tick positions, interpolation only inside the drawn
// span of BOTH axes, refusal (with the reason) outside it. Unsupported solvent
// systems return an explanation, never a guessed number.
const NOMOGRAM_DECADES=[0,10,20,30,40,50,60,70,80,90,100];
const NOMOGRAM_AXES={
  ACN :[57.5,105.0,152.5,200.0,247.5,295.0,343.5,391.5,439.5,487.0,535.5],
  MeOH:[57.0, 89.0,123.0,162.0,204.0,247.0,294.5,343.0,400.0,468.0,535.0],
  THF :[57.0,123.0,185.0,247.0,312.5,377.0,448.0,519.5,593.0,669.5,743.5],
};
// Reading tolerance. The digitisation itself resolves about 0.2 percentage
// points, but the artefact is a printed teaching nomogram read by eye: the
// notebook's own reading of the same figure at 42 % ACN (p. 27/70, "42 % ACN
// approximately 50-51 % MeOH") differs from the digitised value by one to two
// points. +/- 2 percentage points is reported so the number is never presented
// as exact.
// v13: this is a CHOSEN READING ALLOWANCE, not a figure any source states or
// validates. The supplied material gives no uncertainty for reading the
// nomogram. +/- 2 percentage points was chosen here because the notebook's own
// eye reading of the same figure at 42 % ACN (p. 27/70, "approximately
// 50-51 % MeOH") differs from the digitised value by one to two points. It is
// labelled as a choice everywhere it appears.
export const NOMOGRAM_TOLERANCE=2;
export const NOMOGRAM_TOLERANCE_BASIS=
  'The \u00b12 percentage-point figure is a READING ALLOWANCE CHOSEN FOR THIS TOOL, not a value any supplied source states or validates. It was chosen because the LabArchives notebook p. 27/70 reads the same figure at 42 % ACN as "approximately 50-51 % MeOH", one to two points from the digitised value. Treat it as an indication of reading precision, not a measured uncertainty.';

// The solvents this teaching workflow actually uses. The supplied nomogram also
// carries a THF/H2O axis, and that axis is retained below so the digitisation
// of the whole figure stays traceable \u2014 but THF is NOT a method this tool
// offers, and no decision proposes it. The figure containing an axis is not a
// reason to add a solvent to the workflow.
export const NOMOGRAM_ATTRIBUTION=
  'Digitised from the nomogram figure supplied in the SELECTIVITY Discovery Book, p. 12/28 section 2.4. Reproduces the figure’s own worked example: 50 % ACN reads 60 % MeOH. The MeOH and THF axes are not linear, so no fixed offset or fixed ratio reproduces the figure across its range.';
// The course's supplied approximation, used by the notebook (p. 27/70) only as
// a CHECK on the nomogram reading, never as the rule: "%MeOH = %ACN x 60/50".
// Note this is a RATIO, not "+10 percentage points": at 42 % ACN it gives 50.4,
// not 52.
export const NOMOGRAM_APPROXIMATION_NOTE=
  'Cross-check only. The course’s supplied approximation is the ratio %MeOH = %ACN × 60/50 (and %ACN = %MeOH × 50/60), taken from the single worked pair 50 % ACN / 60 % MeOH. The LabArchives notebook p. 27/70 records the rule for using it: "The relationship is not exactly linear across the whole range. Read the value from the nomogram, and use the approximation only as a check on what you have read." It is NOT a +10 percentage-point rule and it is not used as the planned composition.';

// Linear interpolation WITHIN the measured span only. v12 clamped to the first
// or last value when x fell outside, which fabricated an endpoint: reading
// 80 % THF across to the ACN axis returned "100 % ACN" because the THF axis is
// 208 px longer than the ACN axis and the clamp hid that. This returns null
// outside the span and the caller refuses the conversion.
function interp(xs,ys,x){
  if(x<xs[0]-1e-9||x>xs[xs.length-1]+1e-9)return null;
  if(x<=xs[0])return ys[0];
  if(x>=xs[xs.length-1])return ys[ys.length-1];
  for(let i=1;i<xs.length;i++)
    if(x<=xs[i]){const t=(x-xs[i-1])/(xs[i]-xs[i-1]);return ys[i-1]+t*(ys[i]-ys[i-1]);}
  return null;
}

// The two axes do not start and end at the same pixel, so only the part of the
// figure where BOTH axes are drawn can be read across. This returns that
// overlap expressed in percent of the source solvent.
export function nomogramReadableRange(from,to){
  const F=NOMOGRAM_AXES[from],T=NOMOGRAM_AXES[to];
  if(!F||!T)return null;
  const lowPx=Math.max(F[0],T[0]),highPx=Math.min(F[F.length-1],T[T.length-1]);
  if(!(highPx>lowPx))return {low:null,high:null,empty:true};
  return {low:interp(F,NOMOGRAM_DECADES,lowPx),high:interp(F,NOMOGRAM_DECADES,highPx),
    lowPx,highPx,empty:false};
}

export const NOMOGRAM_SOLVENTS=Object.keys(NOMOGRAM_AXES);

// Returns the isoeluotropic composition of `to` matching `percent` of `from`.
// Never invents a number: an unsupported solvent, a missing %B or a value
// outside the axis range returns available:false with what must be confirmed.
export function nomogramConvert(from,to,percent){
  const base={from,to,input:percent,available:false,value:null,rounded:null,
    tolerance:NOMOGRAM_TOLERANCE,toleranceBasis:NOMOGRAM_TOLERANCE_BASIS,
    approximation:null,attribution:NOMOGRAM_ATTRIBUTION,
    approximationNote:NOMOGRAM_APPROXIMATION_NOTE,readableRange:null,reason:''};
  if(!NOMOGRAM_AXES[from]||!NOMOGRAM_AXES[to])
    return {...base,reason:`CANNOT BE CONVERTED — confirm. The supplied nomogram carries ${Object.keys(NOMOGRAM_AXES).join(', ')} against water only. ${!NOMOGRAM_AXES[from]?`"${from}"`:`"${to}"`} is not on it.`};
  // Number(null) and Number('') are 0, which is a finite number but not a
  // recorded composition. An unrecorded %B must never read as 0 %B.
  if(percent===null||percent===undefined||percent==='')
    return {...base,reason:'CANNOT BE CONVERTED — confirm the current %B. It is not recorded on this run, so there is nothing to read across the nomogram.'};
  const p=Number(percent);
  if(!Number.isFinite(p))
    return {...base,reason:'CANNOT BE CONVERTED — confirm the current %B. The recorded value is not a number, so there is nothing to read across the nomogram.'};
  if(p<0||p>100)
    return {...base,reason:`CANNOT BE CONVERTED — confirm. ${p}%B lies outside the 0–100 % range the supplied nomogram covers.`};
  const range=nomogramReadableRange(from,to);
  if(from===to)return {...base,available:true,value:p,rounded:Math.round(p),approximation:p,
    readableRange:range,reason:'Same solvent: no conversion needed.'};
  const xFrom=interp(NOMOGRAM_DECADES,NOMOGRAM_AXES[from],p);
  if(xFrom===null)
    return {...base,readableRange:range,
      reason:`CANNOT BE CONVERTED — ${p}% ${from} is outside the span of the ${from} axis as digitised.`};
  // v13 CORRECTION: validate the COMMON range before reading across. The two
  // axes are not drawn to the same length, so a coordinate can sit on one axis
  // and beyond the end of the other. v12 clamped and returned a fabricated
  // endpoint; this refuses and says why.
  const value=interp(NOMOGRAM_AXES[to],NOMOGRAM_DECADES,xFrom);
  if(value===null||!Number.isFinite(value))
    return {...base,readableRange:range,
      reason:`CANNOT BE CONVERTED — ${p}% ${from} falls beyond the end of the ${to} axis on the supplied figure, so the figure carries no ${to} equivalent for it. The two axes are not drawn to the same length. On this figure the readable range is ${range&&range.low!==null?`${range.low.toFixed(1)}–${range.high.toFixed(1)}% ${from}`:'empty'}. No value is issued; confirm the composition another way.`};
  let approximation=null;
  if(from==='ACN'&&to==='MeOH')approximation=p*60/50;
  else if(from==='MeOH'&&to==='ACN')approximation=p*50/60;
  const rounded=Math.round(value);
  const approxRounded=approximation===null?null:Math.round(approximation*10)/10;
  const approxNote=approxRounded===null?''
    :approxRounded>100||approxRounded<0
      ? ` The course’s ratio approximation gives ${approxRounded.toFixed(1)}%, which is not a possible composition: the approximation is anchored on the single pair 50 % ACN / 60 % MeOH and does not hold here. The nomogram reading is the value to use.`
      : ` The course’s ratio approximation gives ${approxRounded.toFixed(1)}%, recorded as the cross-check the notebook procedure asks for (p. 27/70). Where the two differ, the nomogram reading is the planned composition.`;
  return {...base,available:true,value,rounded,approximation:approxRounded,
    approximationUsable:approxRounded===null?null:(approxRounded>=0&&approxRounded<=100),
    readableRange:range,
    reason:`Read across the supplied nomogram: ${p}% ${from} is isoeluotropic with ${value.toFixed(1)}% ${to} (plan ${rounded}% ${to}, chosen reading allowance ±${NOMOGRAM_TOLERANCE} percentage points).${approxNote}`};
}


export const NOMOGRAM_LIMIT=
  'The nomogram matches ELUTION STRENGTH, not selectivity. That is the point of the change: matching the strength is what makes the two chromatograms comparable, so any change in peak spacing can be attributed to solvent chemistry rather than to strength. Individual compounds shift by different amounts, so peak spacing, the identity of the critical pair and the ELUTION ORDER may all change. Any retention time predicted at the converted composition is a starting estimate and must be confirmed by injection.';

