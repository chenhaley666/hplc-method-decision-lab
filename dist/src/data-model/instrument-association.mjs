// One contract for importer suggestions and automatic file associations.
// A file-created identifier is file evidence, not human confirmation. Matching
// a user/reference record by name alone never transfers its hardware ratings.
export const INSTRUMENT_SUGGESTION = 'file instrument name = record identifier (exact match)';
export const INSTRUMENT_FILE_SOURCE = 'file: instrument name stated in the export';

export function fileInstrumentName(run) {
  return String(run.measured.fileMeta?.instrumentName || run.measured.fileMeta?.instrumentLabel || '').trim();
}

export function resolveFileInstrument(session, run) {
  const name = fileInstrumentName(run);
  const matches = name ? session.instruments.filter(i =>
    String(i.identifier || '').trim() === name || String(i.label || '').trim() === name) : [];
  const record = matches.length === 1 ? matches[0] : null;
  const fileDeclared = !!record && record.provenance?.source === 'file'
    && String(record.identifier || '').trim() === name;
  return { name, matches, record, association: record ? {
    value: record.id,
    source: fileDeclared ? INSTRUMENT_FILE_SOURCE : INSTRUMENT_SUGGESTION,
    confirmed: fileDeclared,
  } : null };
}
