// Annotation only: preserved measurements, heights, numbers and CSV never change.
export const HEIGHT_UNITS=['raw','µAU','mAU','AU','µV','mV','V','counts'];
export const HEIGHT_THRESHOLD_MIN=10000,HEIGHT_THRESHOLD_MAX=100000;
export const validHeightThreshold=v=>Number.isFinite(v)&&v>=HEIGHT_THRESHOLD_MIN&&v<=HEIGHT_THRESHOLD_MAX;
export function heightExcluded(run, peak) {
  const f=run.heightFilter;
  return f?.enabled===true && validHeightThreshold(f.threshold) && Number.isFinite(peak.height) && peak.height<f.threshold;
}
export function peakExcluded(run, peak) { return !!run.peakNotes?.[peak.no]?.exclude || heightExcluded(run,peak); }
export function heightFilterSummary(run) {
  return {raw:run.measured.peaks.length, excluded:run.measured.peaks.filter(p=>heightExcluded(run,p)).length,
    missing:run.measured.peaks.filter(p=>!Number.isFinite(p.height)).length};
}
export function setHeightFilter(run,enabled,threshold,unit='raw') {
  if(!validHeightThreshold(threshold)) throw new Error('Peak-height threshold must be between 10,000 and 100,000 inclusive.');
  if(!HEIGHT_UNITS.includes(unit))throw new Error('Unsupported exported peak-height unit.');
  run.heightFilter={enabled:!!enabled,threshold,unit,unitBasis:unit==='raw'?'Exported numbers; physical unit unspecified':'User-declared unit of the original exported Height numbers; not inferred from the chromatogram axis',basis:'User-selected threshold on the original exported peak-height scale; no signal-unit conversion. Not a course noise rule.'};
}
