// Group detector traces by their recorded unit without converting signal values.
// Placeholder units cannot establish a shared scale, so each run stays separate.
const UNKNOWN_UNITS = new Set([
  '', 'unknown', 'as exported', 'n.a.', 'n.a', 'n/a', 'na', 'a.u.', 'a.u',
  'arbitrary units', 'arbitrary unit', 'unspecified', 'not available',
  'intensity', 'detector units',
]);

export function signalUnitInfo(series) {
  const sourceUnit = series.run?.measured?.trace?.unit;
  const unit = typeof sourceUnit === 'string' ? sourceUnit.trim() : '';
  const known = unit !== '' && !UNKNOWN_UNITS.has(unit.toLowerCase());
  return known
    ? { key: `unit:${unit}`, unit, label: unit, known: true }
    : { key: `unknown:${series.id}`, unit: null, label: `Unit unknown — ${series.label ?? series.id}`, known: false };
}

export function groupSignalSeries(series) {
  const groups = new Map();
  for (const item of series) {
    const info = signalUnitInfo(item);
    if (!groups.has(info.key)) groups.set(info.key, { ...info, series: [] });
    groups.get(info.key).series.push(item);
  }
  return [...groups.values()];
}
