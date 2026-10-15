// persistence.mjs — keeping the session in this browser.
//
// Two rules decide the design:
//  1. A failed write must never look like a successful one. The save status is
//     part of the interface, it names the reason, and it stays visible.
//  2. A saved session is never restored silently. A restore replaces what is
//     on screen, so the user is told what was found — when it was saved, how
//     many runs it holds, whether it is older than this tab's own work — and
//     decides.
//
// IndexedDB is used first because it holds far more than localStorage and
// stores structured data without a string-length ceiling; localStorage remains
// as a fallback for a browser (or a privacy mode) where IndexedDB is refused.
import { SCHEMA, SCHEMA_VERSION } from '../data-model/session.mjs';
import { importWorkspaceText as importSessionText, workspaceRunCount } from '../data-model/workspaces.mjs';
import { sha256 } from '../data-model/ids.mjs';

export const DB_NAME = 'bps2032-fc1';
export const STORE = 'sessions';
export const RECORD_KEY = 'current';
export const LS_KEY = 'bps2032-fc1-session-v2';
export const LS_RECORD_KEY = LS_KEY + ':record';
const ENVELOPE_VERSION = 1;

export const SAVE = {
  saved: 'saved',
  saving: 'saving',
  failed: 'failed',
  stale: 'stale',
  off: 'off',
};

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is not available in this browser.')); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB could not be opened.'));
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab of this application.'));
  });
}

function idbPut(record) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, RECORD_KEY);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('The write was refused.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('The write was aborted (the quota may be exhausted).')); };
  }));
}

function idbGet() {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const rq = tx.objectStore(STORE).get(RECORD_KEY);
    rq.onsuccess = () => { db.close(); resolve(rq.result || null); };
    rq.onerror = () => { db.close(); reject(rq.error || new Error('The read was refused.')); };
  }));
}

// A tab's older save/clear must not complete after a newer save. Storage in
// other tabs is still inspected as potentially conflicting evidence, not
// silently treated as the same writer.
let writeQueue = Promise.resolve();
function enqueue(fn) {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

function idbDelete() {
  return openDb().then(db => new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(RECORD_KEY);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); resolve(false); };
  })).catch(() => false);
}

// A record is the exported session text plus what the user needs to judge it.
export function makeRecord(text, { runs, label, revision = null } = {}) {
  const obj = JSON.parse(text);
  if (obj?.schema !== SCHEMA || ![2, SCHEMA_VERSION].includes(obj.version) || !Array.isArray(obj.runs)) throw new Error('Not a supported FC1 session.');
  const count=obj.runs.length+Object.values(obj.stageSessions||{}).reduce((n,s)=>n+s.runs.length,0);
  if (runs !== undefined && runs !== count) throw new Error('Saved run count disagrees with the session.');
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 0)) throw new Error('The save revision must be a non-negative integer.');
  const sessionId = obj.projectId || (typeof obj.sessionId === 'string' && obj.sessionId.trim() ? obj.sessionId : null);
  return { key: RECORD_KEY, envelopeVersion: ENVELOPE_VERSION, savedAt: new Date().toISOString(),
    runs: count, label: label || '', bytes: new TextEncoder().encode(text).length, revision,
    sessionId, schema: obj.schema, schemaVersion: obj.version, sha256: sha256(text), app: 'fc1', text };
}

// Save. Resolves with {ok, where, reason}. It never throws: the caller shows
// the status it returns, and a failure is reported, not swallowed.
export async function save(text, meta) {
  let record;
  try {
    const checked = importSessionText(text);
    if (!checked.ok) throw new Error(checked.errors.join(' '));
    record = makeRecord(text, meta);
  }
  catch (e) { return { ok: false, where: null, reason: `The session could not be saved: ${e?.message || e}`, bytes: typeof text === 'string' ? text.length : 0 }; }
  return enqueue(async () => {
    const success = where => ({ ok: true, where, savedAt: record.savedAt, bytes: record.bytes, revision: record.revision, sessionId: record.sessionId });
    try {
      await idbPut(record);
      const back = await idbGet();
      if (back?.text !== record.text || back.sha256 !== record.sha256 || back.sessionId !== record.sessionId || back.revision !== record.revision || back.savedAt !== record.savedAt) throw new Error('The saved IndexedDB copy could not be read back identically.');
      return success('IndexedDB');
    } catch (e) {
      const first = e?.message || String(e);
      try {
        // One atomic value binds text, identity, revision and checksum. The
        // old text/:meta pair is read for migration but no longer written.
        const envelope = JSON.stringify(record);
        localStorage.setItem(LS_RECORD_KEY, envelope);
        if (localStorage.getItem(LS_RECORD_KEY) !== envelope) throw new Error('The fallback copy could not be read back identically.');
        return { ...success('localStorage (fallback)'), note: `IndexedDB refused the write or its read-back verification (${first}), so this browser's smaller localStorage was used.` };
      } catch (e2) {
        return { ok: false, where: null, reason: `IndexedDB: ${first} — localStorage: ${e2?.message || String(e2)}`, bytes: record.bytes };
      }
    }
  });
}

function contentFingerprint(session) {
  const obj = { ...session };
  // Export timestamps and saved derived values are not scientific edits.
  delete obj.exportedAt; delete obj.app; delete obj.derivedSnapshot;
  return sha256(JSON.stringify(obj));
}

function inspectRecord(record, where, id) {
  const c = { id, where, valid: false, text: null, issues: [], warnings: [] };
  try {
    if (!record || typeof record !== 'object' || typeof record.text !== 'string' || !record.text) throw new Error('Stored copy has no session text.');
    if (record.envelopeVersion !== undefined && record.envelopeVersion !== ENVELOPE_VERSION) throw new Error(`Unsupported storage envelope version ${record.envelopeVersion}.`);
    if (record.envelopeVersion !== undefined && (typeof record.sha256 !== 'string' || !record.sha256)) throw new Error('Checksummed storage envelope is missing its SHA-256.');
    if (record.sha256 && sha256(record.text) !== record.sha256) throw new Error('Saved text does not match its SHA-256 checksum.');
    const imported = importSessionText(record.text);
    if (!imported.ok) throw new Error(imported.errors.join(' '));
    const savedObj=JSON.parse(record.text);
    const sessionId = savedObj.projectId || imported.session.sessionId || null;
    const count = savedObj.workspaceVersion ? workspaceRunCount(imported.workspaces) : imported.session.runs.length;
    if (record.sessionId && record.sessionId !== sessionId) throw new Error('Stored identity disagrees with the exported session identity.');
    if (record.runs !== undefined && record.runs !== null && record.runs !== count) throw new Error('Stored run count disagrees with the exported session.');
    if (record.revision !== undefined && record.revision !== null && (!Number.isSafeInteger(record.revision) || record.revision < 0)) throw new Error('Invalid stored revision.');
    if (!record.sha256) c.warnings.push('Legacy copy has no complete-snapshot checksum; session schema and preserved original-data checks passed, but old split metadata is unverified.');
    if (!sessionId) c.warnings.push('Session identity is not established: revision numbers cannot establish that this is the same session as another copy.');
    const savedAt = record.savedAt && Number.isFinite(Date.parse(record.savedAt)) ? record.savedAt : null;
    if (!savedAt) c.warnings.push('Save time is unrecorded or invalid.');
    Object.assign(c, { valid: true, text: record.text, sessionId, revision: record.revision ?? null,
      savedAt, runs: count, bytes: new TextEncoder().encode(record.text).length,
      fingerprint: contentFingerprint(JSON.parse(record.text)), warnings: [...c.warnings, ...(imported.warnings || [])] });
  } catch (e) { c.issues.push(`${where}: ${e?.message || e}`); }
  return c;
}

// Small, explicit ordering rule. Conflicting metadata is not resolved by
// guessing. Across DIFFERENT sessions only save times may rank suggestions;
// the user is always shown every recoverable copy and must approve restoring.
function choose(candidates) {
  if (!candidates.length) return { selected: null, requiresChoice: true, selectionReason: 'No stored copy passed validation. Nothing will be restored.' };
  if (candidates.length === 1) return { selected: candidates[0], requiresChoice: false, selectionReason: 'This is the only stored copy that passed validation.' };
  if (candidates.every(c => c.sessionId && c.sessionId === candidates[0].sessionId)) {
    if (candidates.every(c => c.fingerprint === candidates[0].fingerprint)) {
      const order = [...candidates].sort((a, b) => (b.revision ?? -1) - (a.revision ?? -1) || (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0));
      return { selected: order[0], requiresChoice: false, selectionReason: 'Both stores hold identical session contents; the higher recorded revision/save time is suggested.' };
    }
    if (candidates.some(c => c.revision === null)) return { selected: null, requiresChoice: true, selectionReason: 'Copies of the same session differ, but a revision is missing. Choose the copy after reviewing the metadata.' };
    const order = [...candidates].sort((a, b) => b.revision - a.revision);
    const newest = order[0];
    if (order.some(c => c.revision === newest.revision && c.fingerprint !== newest.fingerprint)) return { selected: null, requiresChoice: true, selectionReason: 'Conflict: the same session and revision contain different contents. Choose explicitly; neither is automatically preferred.' };
    if (newest.savedAt && order.some(c => c.revision < newest.revision && c.savedAt && Date.parse(newest.savedAt) < Date.parse(c.savedAt))) return { selected: null, requiresChoice: true, selectionReason: 'Conflict: revision order contradicts save-time order. Choose explicitly; neither is automatically preferred.' };
    return { selected: newest, requiresChoice: false, selectionReason: 'The higher revision of this same session is suggested; both stores were inspected.' };
  }
  const order = [...candidates].sort((a, b) => (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0));
  if (order.some(c => !c.savedAt) || Date.parse(order[0].savedAt) === Date.parse(order[1].savedAt)) return { selected: null, requiresChoice: true, selectionReason: 'Different sessions (or unestablished identity) have missing or tied save times. Revision numbers are not comparable across sessions. Choose explicitly.' };
  return { selected: order[0], requiresChoice: false, selectionReason: 'These are different sessions: the later valid save time is suggested, not the larger revision number.' };
}

// Inspect BOTH stores and return their status. Never applies or deletes a
// copy, including corrupt copies that might need export/recovery outside here.
export async function findSaved() {
  await writeQueue;
  const candidates = [], issues = [];
  try { const rec = await idbGet(); if (rec) candidates.push(inspectRecord(rec, 'IndexedDB', 'idb')); }
  catch (e) { issues.push(`IndexedDB: ${e?.message || e}`); }
  try {
    const envelope = localStorage.getItem(LS_RECORD_KEY);
    if (envelope) {
      try { candidates.push(inspectRecord(JSON.parse(envelope), 'localStorage', 'local')); }
      catch (e) { issues.push(`localStorage: stored envelope is not valid JSON (${e?.message || e}).`); }
    }
    const legacy = localStorage.getItem(LS_KEY);
    if (legacy) {
      let meta = {};
      try { meta = JSON.parse(localStorage.getItem(LS_KEY + ':meta') || '{}'); }
      catch { issues.push('Legacy localStorage metadata is corrupt; its save time/revision are not used.'); }
      candidates.push(inspectRecord({ ...meta, text: legacy }, 'localStorage (legacy)', 'local-legacy'));
    }
  } catch (e) { issues.push(`localStorage: ${e?.message || e}`); }
  for (const c of candidates) issues.push(...c.issues);
  const decision = choose(candidates.filter(c => c.valid));
  return { ...(decision.selected || { text: null }), found: candidates.length > 0 || issues.length > 0,
    candidates, issues, selectedId: decision.selected?.id || null, requiresChoice: decision.requiresChoice,
    selectionReason: decision.selectionReason };
}

export async function clearSaved() {
  return enqueue(async () => {
    await idbDelete();
    try { localStorage.removeItem(LS_RECORD_KEY); localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_KEY + ':meta'); } catch { /* ignore */ }
    return true;
  });
}

// The sentence shown beside the save indicator. One place, so a failed write
// can never be described as a save anywhere in the interface.
export function saveStatusText(st) {
  if (!st?.state) return 'New blank session — not saved yet. Stored copies, if any, are offered separately for review; nothing has been restored.';
  if (st.state === SAVE.saving) return 'Saving to this browser…';
  if (st.state === SAVE.saved) return `Saved in this browser (${st.where}) at ${new Date(st.savedAt).toLocaleTimeString()} — revision ${st.revision ?? '?'}, ${st.runs} run(s), ${(st.bytes / 1024).toFixed(0)} kB.${st.note ? ' ' + st.note : ''}`;
  if (st.state === SAVE.stale) return `NOT SAVED: the copy in this browser is revision ${st.revision ?? '?'}, saved at ${st.savedAt ? new Date(st.savedAt).toLocaleTimeString() : 'an unrecorded time'}, and the session on screen is revision ${st.currentRevision ?? '?'}. The change you just made is NOT in it. ${st.reason || ''}`;
  if (st.state === SAVE.off) return 'Saving to this browser is switched off. Nothing is being kept here; use "Export session".';
  return `NOT SAVED in this browser. ${st.reason || ''} The open session is intact — use "Export session" to keep it in a file. Anything saved earlier in this browser is OLDER than what is on screen.`;
}
