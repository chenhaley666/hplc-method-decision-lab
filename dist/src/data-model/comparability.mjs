// Sample comparability is an explicit declaration, never a filename, run
// label, sample type or peak-order inference. The file/user states an ID; the
// tool checks that declaration, not whether the chemistry really is identical.
import { cond, usable, sourceLabel } from './conditions.mjs';
import { newId } from './ids.mjs';

const clean = v => typeof v === 'string' ? v.trim() : '';
export function sampleIdentity(run) {
  const field = run?.conditions?.sampleId;
  const value = clean(field?.value);
  const allowedSource = ['file', 'mapping', 'user'].includes(field?.source);
  const basis = clean(field?.note);
  const known = !!value && usable(field) && allowedSource && (field.source !== 'user' || !!basis);
  return { known, value: known ? value : null, stated: value || null,
    source: field?.source || null, basis,
    reason: !value ? 'sample/study identity is not recorded; sample type, sample name and filenames do not establish identity'
      : !field.confirmed ? 'sample/study identity has not been confirmed as a file or user declaration'
      : !allowedSource ? 'sample/study identity needs an explicit file statement or user declaration, not an inferred profile/assumption'
      : field.source === 'user' && !basis ? 'the user-declared sample/study identity needs its basis recorded'
      : `sample/study ID "${value}" (${sourceLabel(field)}${basis ? `; ${basis}` : ''}); this is a declaration, not chemical identification by the tool` };
}

export function setSampleIdentity(run, value, basis) {
  const id = clean(value), note = clean(basis);
  if (id && !note) throw new Error('State the basis for this sample/study identity declaration.');
  run.conditions.sampleId = cond(id || null, id ? 'user' : null,
    { confirmed: !!id, note: id ? note : '' });
  return run.conditions.sampleId;
}

export function validSampleEquivalence(record) {
  return !!record && !!clean(record.id) && !!clean(record.left) && !!clean(record.right)
    && clean(record.left) === record.left && clean(record.right) === record.right
    && record.left !== record.right && record.by === 'user' && !!clean(record.basis)
    && typeof record.declaredAt === 'string' && Number.isFinite(Date.parse(record.declaredAt));
}

// Explicit equivalence is transitive; each connecting declaration is retained
// as provenance. Invalid or malformed records never confer comparability.
function pathBetween(session, from, to) {
  const queue = [{ id: from, records: [] }], seen = new Set([from]);
  const records = (session.sampleEquivalences || []).filter(validSampleEquivalence);
  while (queue.length) {
    const entry = queue.shift();
    if (entry.id === to) return entry.records;
    for (const record of records) {
      const id = record.left === entry.id ? record.right : record.right === entry.id ? record.left : null;
      if (!id || seen.has(id)) continue;
      seen.add(id); queue.push({ id, records: [...entry.records, record] });
    }
  }
  return null;
}

export function sampleCompare(session, run, reference) {
  const a = sampleIdentity(run), b = sampleIdentity(reference);
  const reasons = [], notes = [];
  if (!a.known) reasons.push(`run "${run?.label || run?.id || 'run'}": ${a.reason}`);
  if (reference !== run && !b.known) reasons.push(`reference "${reference?.label || reference?.id || 'run'}": ${b.reason}`);
  if (reasons.length) return { comparable: false, reasons, notes, identities: [a, b], equivalences: [] };
  const records = a.value === b.value ? [] : pathBetween(session, a.value, b.value);
  if (records === null) reasons.push(`different declared sample/study identities ("${a.value}" vs "${b.value}"); no explicit user equivalence is recorded`);
  else {
    notes.push(a.value === b.value ? `Same declared sample/study ID "${a.value}"; file/user statements are not chemical identification by this tool.`
      : `User-declared sample equivalence: ${records.map(r => `"${r.left}" ↔ "${r.right}" (${r.basis})`).join('; ')}. This is a user assertion, not chemical identification by the tool.`);
    const ta = run?.conditions?.sampleType, tb = reference?.conditions?.sampleType;
    if (usable(ta) && usable(tb) && String(ta.value) !== String(tb.value))
      notes.push(`Sample types differ (${ta.value} vs ${tb.value}); type is contextual metadata, not identity. Comparability relies on the explicit sample declaration above.`);
  }
  return { comparable: reasons.length === 0, reasons, notes, identities: [a, b], equivalences: records || [] };
}

export function sampleGroupKey(session, run) {
  const identity = sampleIdentity(run);
  if (!identity.known) return null;
  const ids = new Set([identity.value]);
  for (const record of (session.sampleEquivalences || []).filter(validSampleEquivalence)) {
    ids.add(record.left); ids.add(record.right);
  }
  return [...ids].filter(id => pathBetween(session, identity.value, id) !== null).sort()[0];
}

export function declareSampleEquivalence(session, left, right, basis, idGen) {
  const a = clean(left), b = clean(right), note = clean(basis);
  if (!a || !b || a === b) throw new Error('Choose two different explicit sample/study IDs.');
  if (!note) throw new Error('State the evidence/basis for declaring these samples equivalent.');
  const stated = new Set(session.runs.map(sampleIdentity).filter(x => x.known).map(x => x.value));
  if (!stated.has(a) || !stated.has(b)) throw new Error('Both sample/study IDs must be explicitly recorded on runs in this session.');
  if ((session.sampleEquivalences || []).some(r => validSampleEquivalence(r) && ((r.left === a && r.right === b) || (r.left === b && r.right === a))))
    throw new Error('An equivalence declaration already exists for these sample/study IDs.');
  const record = { id: newId('sampleeq', idGen), left: a, right: b, basis: note, by: 'user', declaredAt: new Date().toISOString() };
  session.sampleEquivalences ||= [];
  session.sampleEquivalences.push(record);
  return record;
}
