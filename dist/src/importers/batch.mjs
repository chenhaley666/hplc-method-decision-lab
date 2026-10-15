// batch.mjs — import many files at once. Each file is handled independently:
// one malformed file never prevents the others from importing. Every file gets
// an explicit outcome and its messages.
import { looksLikeLabSolutions, parseLabSolutions } from './labsolutions.mjs';
import { looksLikeGeneric, parseGeneric, autoMap, readHeader } from './generic.mjs';
import { applyRunNameProfile } from './profiles.mjs';
import { newRun, addRuns } from '../data-model/session.mjs';
import { resolveFileInstrument } from '../data-model/instrument-association.mjs';

export const BATCH_TARGET = { files: 100, megabytes: 30, note: 'Documented design target. The tested limit is reported in the verification record.' };

export function detectFormat(text) {
  if (looksLikeLabSolutions(text)) return 'labsolutions';
  if (looksLikeGeneric(text)) return 'generic';
  return null;
}

function suggestInstrument(session, run) {
  const resolved = resolveFileInstrument(session, run);
  if (resolved.association) run.assoc.instrumentId = resolved.association;
  return resolved.record;
}
function suggestColumn(session, run) {
  const name = run.measured.fileMeta?.columnLabel;
  if (!name) return null;
  const hit = session.columns.filter(c => c.label.trim() === name.trim() || (c.serial && c.serial.trim() === name.trim()));
  if (hit.length === 1) { run.assoc.columnId = { value: hit[0].id, source: 'mapped column label = record label (exact match)', confirmed: false }; return hit[0]; }
  return null;
}

// files: [{name, text, size}]
export function importFiles(session, files, opts = {}) {
  const { format = 'auto', mapping = null, units = { time: 'min', pressure: 'psi' }, profile = null, duplicatePolicy = 'skip', idGen } = opts;
  const report = [];
  for (const f of files) {
    const entry = { fileName: f.name, outcome: 'failed', format: null, runIds: [], messages: [], warnings: [] };
    try {
      if (typeof f.text !== 'string' || !f.text.trim()) throw new Error('File is empty or unreadable as text.');
      const fmt = format === 'auto' ? detectFormat(f.text) : format;
      entry.format = fmt;
      if (!fmt) throw new Error('Format not recognised: neither a LabSolutions export nor a peak-table CSV with a retention-time column. Use the generic import with a column mapping.');
      let built = [];
      if (fmt === 'labsolutions') {
        const p = parseLabSolutions(f.text, f.name);
        if (!p.ok) throw new Error(p.error);
        built.push(newRun({ fileName: f.name, format: 'labsolutions', text: f.text, ...p.run }, idGen));
      } else {
        const map = mapping || autoMap(readHeader(f.text).header);
        const p = parseGeneric(f.text, f.name, map, units);
        if (!p.ok) throw new Error(p.error);
        for (const e of p.partialErrors || []) entry.messages.push(`Run "${e.runKey}" NOT imported: ${e.errors.join('; ')}`);
        for (const r of p.runs) {
          const run = newRun({ fileName: f.name, format: 'generic-peak-table', text: f.text, measured: r.measured, conditions: r.conditions, fileMeta: r.fileMeta, warnings: r.warnings,
            label: p.runs.length > 1 ? `${f.name} · ${r.runKey}` : f.name, genericKey: r.runKey, importSpec: { mapping: { ...map }, units: { ...units } } }, idGen);
          if (r.documentedT0) run.marker = { method: 'documented', peakNo: null, t0: r.documentedT0.t0, note: r.documentedT0.note, confirmed: true };
          const mk = r.measured.peaks.filter(pk => pk.markerFlag);
          if (mk.length === 1 && !r.documentedT0) run.marker = { method: 'peak', peakNo: mk[0].no, t0: mk[0].tR, note: 'Marker flagged in the imported CSV.', confirmed: false };
          if (mk.length > 1) run.warnings.push(`${mk.length} peaks are flagged as the marker; none was used.`);
          built.push(run);
        }
        if (p.partialErrors?.length) entry.outcome = 'partial';
      }
      for (const run of built) {
        if (profile && profile.id === 'monashplc-runname') {
          const rep = applyRunNameProfile(run, { from: profile.from || 'fileName', codeMaps: profile.codeMaps || {} });
          run.warnings.push(...rep.messages.map(m => `[profile] ${m}`));
          run.profileReport = rep;
        }
        suggestInstrument(session, run); suggestColumn(session, run);
      }
      const { added, skipped } = addRuns(session, built, { duplicatePolicy });
      entry.runIds = added.map(r => r.id);
      for (const s of skipped) entry.messages.push(`DUPLICATE: ${s.reason}`);
      for (const r of added) entry.warnings.push(...r.warnings);
      entry.outcome = added.length ? (entry.outcome === 'partial' ? 'partial' : 'imported') : (skipped.length ? 'skipped-duplicate' : 'failed');
    } catch (e) {
      entry.outcome = 'failed'; entry.messages.push(e.message || String(e));
    }
    report.push(entry);
    session.importLog.push({ at: new Date().toISOString(), fileName: entry.fileName, outcome: entry.outcome, runIds: entry.runIds, messages: entry.messages });
  }
  return report;
}
