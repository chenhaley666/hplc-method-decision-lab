// state-bar.mjs — the state of the tool, visible at all times: which run is
// being read, the specifications in force, what is required next, and whether
// the session is saved in this browser. It also carries the direct links from
// a missing-information message to the input that supplies it.
import { h, chip } from './dom.mjs';
import { setUi, store,switchStage } from './state.mjs';
import { saveStatusText, SAVE } from './persistence.mjs';
import { OPERATORS } from '../rules.mjs';

const opl = op => OPERATORS[op]?.label || op;

// Where does a missing item get supplied? Each target names a stage and the
// control to focus, so the message is a route, not a complaint.
export const TARGETS = [
  { match: /filename.*sample name|sample name.*filename|naming conflict|name-source conflict/i, stage: 'equipment', testid: 'run-detail', open: 'detail', label: 'Review the run-name sources and record your choice' },
  { match: /back-pressure of the current run|measured back-pressure|Measured back-pressure/i, stage: 'equipment', testid: 'run-detail', open: 'detail', label: 'Enter the back-pressure of this run' },
  { match: /flow rate/i, stage: 'equipment', testid: 'run-detail', open: 'detail', label: 'Confirm the flow rate' },
  { match: /acquisition order|order in which these runs were acquired|Acquisition order of/i, stage: 'equipment', testid: 'confirm-run-order', label: 'Set the order of the runs' },
  { match: /maximum temperature|temperature limit|Max temperature/i, stage: 'equipment', testid: 'colmodel-limits', label: 'Record the column maximum temperature' },
  { match: /maximum pressure|pressure limit of|pMax/i, stage: 'equipment', testid: 'colmodel-limits', label: 'Record the column maximum pressure' },
  { match: /instrument pressure limit|instrument limit/i, stage: 'equipment', testid: 'instrument-limits', label: 'Record the instrument pressure limit' },
  { match: /column geometry|internal diameter|particle size/i, stage: 'equipment', testid: 'colmodel-limits', label: 'Record the column geometry' },
  { match: /physical column|column association|associate/i, stage: 'equipment', testid: 'associations', label: 'Associate the run with its column' },
  { match: /specification/i, stage: 'selectivity', testid: 'spec-editor', label: 'Correct the specification' },
  { match: /sample\/study|sample identity|sample equivalence|declared sample/i, stage: 'equipment', testid: 'sample-identity-panel', label: 'Declare the sample/study identity and its basis' },
  { match: /identit|mapping|assign|artefact|unidentified/i, stage: 'retention', testid: 'correspondence', label: 'Assign the peaks' },
  { match: /retention fit|include in retention fit|fit reference/i, stage: 'retention', testid: 'run-table', label: 'Choose the runs for the fit' },
  { match: /t0|t₀|hold-up|marker/i, stage: 'retention', testid: 'correspondence', label: 'Establish t₀ from the marker' },
  { match: /width|plate/i, stage: 'selectivity', testid: 'rs-basis', label: 'Choose a resolution basis every pair supports' },
  { match: /temperature/i, stage: 'equipment', testid: 'run-detail', open: 'detail', label: 'Record the column temperature' },
];

export function targetFor(text) { return TARGETS.find(t => t.match.test(String(text))) || null; }

export function goTo(target, runId = null) {
  const runTarget = target.open==='detail'||['associations','sample-identity-panel','confirm-run-order','correspondence','run-table','spec-editor'].includes(target.testid);
  // Run inputs belong to the current workspace, not the old shared Equipment library.
  if(!runTarget) switchStage(target.stage);
  setUi(u => {
    if ((target.open === 'detail'||target.testid==='associations'||target.testid==='correspondence') && runId) u.detailRunId = runId;
    if(['spec-editor','rs-basis'].includes(target.testid))u.specsExpert=true;
    if(['sample-identity-panel','confirm-run-order','run-table'].includes(target.testid))u.libraryAdvanced=true;
    if(target.testid==='correspondence'&&u.stage==='retention')u.advancedCompoundOpen=true;
    u.focusTestid = target.testid;
  });
  // focus after the re-render
  setTimeout(() => {
    const el = document.querySelector(`[data-testid="${target.testid}"]`);
    const actual=el||document.querySelector('[data-testid="run-detail"]')||document.querySelector('[data-testid="stage-context"]');
    if (actual) { for(let p=actual.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;actual.scrollIntoView({ block: 'center' }); if (typeof actual.focus === 'function') actual.focus(); actual.classList.add('flash'); setTimeout(() => actual.classList.remove('flash'), 1200); }
  }, 30);
}

// A missing-information line with its route attached.
export function missingLine(text, runId = null) {
  const t = targetFor(text);
  return h('li', null, text, t ? h('button', { type: 'button', class: 'linky', 'data-testid': `goto-${t.testid}`, onclick: () => goTo(t, runId) }, `→ ${t.label}`) : null);
}

const saveKind = save => !save || save.state === null ? 'warn' : save.state === SAVE.saved ? 'ok' : save.state === SAVE.saving ? 'warn' : 'bad';
const saveBehind = save => save?.state === SAVE.stale || save?.state === SAVE.failed;
const BEHIND_TEXT = 'Nothing on screen has been lost; only the copy kept inside this browser is behind.';
const STORAGE_WARNING = 'This session could not be kept in this browser\'s storage (too large or storage blocked). The open session is intact: use "Export session" to keep it in a file.';

// Keep a long batch's full filenames and every scientific blocker available,
// without expanding the sticky region over the experiment controls. Routes
// remain visible even when the complete text is in the native details panel.
function missingSummary(next, runId, ui) {
  const missing = next.missing || [];
  if (!missing.length) return null;
  const routes = [...new Map(missing.map(text => targetFor(text)).filter(Boolean).map(t => [t.testid, t])).values()];
  return h('div', { class: 'sb-cell', 'data-testid': 'sb-missing' },
    h('span', { class: 'sb-label' }, `Missing information — ${missing.length} item${missing.length === 1 ? '' : 's'}`),
    routes.length ? h('div', { class: 'sb-routes' }, routes.slice(0, 3).map(t =>
      h('button', { type: 'button', class: 'linky', 'data-testid': `goto-${t.testid}`, onclick: () => goTo(t, runId) }, `→ ${t.label}`)))
      : h('span', { class: 'small' }, 'Review the full details below before choosing an experiment.'),
    h('details', { class: 'sb-details', open: ui.stateBarMissingOpen || null, 'data-testid': 'sb-full-missing', ontoggle: e => { ui.stateBarMissingOpen = e.target.open; } },
      h('summary', null, `Full blocker details (${missing.length}) — no item omitted`),
      h('div', { class: 'sb-detail-body', tabindex: 0, 'aria-label': 'Complete missing-information details' },
        h('p', { class: 'small' }, next.reason),
        h('ul', { class: 'small' }, missing.map(m => missingLine(m, runId))))));
}

// Saving does not change the scientific view. Update only these static status
// nodes; replacing editing controls would lose typed-but-not-yet-blurred input.
export function updateSaveStatus(st, root) {
  const status = root.querySelector('[data-testid="sb-save"]');
  if (!status) return false;
  const save = st.ui.save || null;
  status.textContent = saveStatusText(save); status.className = `save-${saveKind(save)}`;
  const cell = status.parentElement;
  const behind = cell.querySelector('[data-testid="sb-save-behind"]');
  if (saveBehind(save) && !behind) cell.appendChild(h('div', { class: 'tiny', 'data-testid': 'sb-save-behind' }, BEHIND_TEXT));
  else if (!saveBehind(save) && behind) behind.remove();
  const warning = root.querySelector('[data-testid="storage-warning"]');
  if (st.ui.storageWarning && !warning) {
    root.insertBefore(h('p', { class: 'banner warn', 'data-testid': 'storage-warning' }, STORAGE_WARNING),
      root.querySelector('[data-testid="restore-banner"]') || root.querySelector('.layout') || null);
  } else if (!st.ui.storageWarning && warning) warning.remove();
  return true;
}

export function stateBar(st) {
  const ev = st.evaluation, s = st.session, n = ev.next;
  const sp = ev.settings.specs;
  const save = st.ui.save || null;
  const kind = saveKind(save);
  const stale = saveBehind(save);
  return h('section', { class: 'card statebar', 'data-testid': 'state-bar', role: 'region', 'aria-label': 'state of the tool' },
    h('div', { class: 'sb-row sb-main' },
      h('div', { class: 'sb-cell' }, h('span', { class: 'sb-label' }, 'Run being read'),
        h('strong', { 'data-testid': 'sb-current' }, ev.current ? ev.current.label : 'none — import data or tick a run into the decision history')),
      h('div', { class: 'sb-cell' }, h('span', { class: 'sb-label' }, 'Specifications in force'),
        h('span', { 'data-testid': 'sb-specs' }, `back-pressure ${opl(sp.pressure.op)} ${sp.pressure.value} psi · peaks ${opl(sp.peakCount.op)} ${sp.peakCount.value}${sp.peakCount.includesMarker ? ' (marker included)' : ''} · latest peak ${opl(sp.lastPeak.op)} ${sp.lastPeak.value} min · lowest Rs ${opl(sp.minRs.op)} ${sp.minRs.value}`)),
      h('div', { class: 'sb-cell' }, h('span', { class: 'sb-label' }, 'Action required next'),
        h('span', { 'data-testid': 'sb-action' }, chip(n.readiness?.planningDraft ? `PLANNING DRAFT — ${n.status}` : n.status, n.readiness?.planningDraft ? 'warn' : 'status'),
          h('span', { class: 'sb-action-text' }, n.preferred?.action || (n.missing?.length ? 'Supply the missing information before performing a proposed run.' : n.reason))))),
    h('div', { class: 'sb-row sb-footer' },
      h('div', { class: 'sb-cell' }, h('span', { class: 'sb-label' }, 'Saved in this browser'),
        h('span', { class: `save-${kind}`, 'data-testid': 'sb-save' }, saveStatusText(save)),
        stale ? h('div', { class: 'tiny', 'data-testid': 'sb-save-behind' }, BEHIND_TEXT) : null),
      missingSummary(n, ev.current?.id || null, st.ui)));
}

// The banner offered when a saved session is found. Nothing is restored until
// the user chooses, and the banner states how old the saved copy is.
export function restoreBanner(st, onRestore, onDiscard) {
  const f = st.ui.savedFound;
  if (!f) return null;
  const age = f.savedAt ? `saved ${new Date(f.savedAt).toLocaleString()}` : 'saved at an unrecorded time';
  const stale = st.session.runs.length > 0;
  const valid = (f.candidates || []).filter(c => c.valid);
  return h('div', { class: 'banner restore', 'data-testid': 'restore-banner', role: 'alert' },
    h('strong', valid.length ? 'Stored sessions are available to review. ' : 'Stored copies could not be validated. '),
    f.text ? `${f.runs ?? 'an unrecorded number of'} run(s), ${age}, in ${f.where}, revision ${f.revision ?? 'unknown'}. ` : '',
    h('p', { 'data-testid': 'recovery-reason' }, f.selectionReason || 'Review the saved copy before restoring it.'),
    stale ? h('span', { class: 'warn-text' }, `This tab already holds ${store.session.runs.length} run(s); restoring REPLACES them. ` ) : '',
    f.text ? h('button', { type: 'button', 'data-testid': 'restore-saved', onclick: () => onRestore(f) }, 'Restore suggested copy') : null,
    valid.length > 1 || f.requiresChoice ? h('ul', { 'data-testid': 'recovery-copies' }, valid.map(c => h('li',
      `${c.where}: ${c.runs} run(s), session ${c.sessionId || 'identity unestablished'}, revision ${c.revision ?? 'unknown'}, ${c.savedAt ? new Date(c.savedAt).toLocaleString() : 'save time unknown'}. `,
      h('button', { type: 'button', 'data-testid': `restore-copy-${c.id}`, onclick: () => onRestore(c) }, `Restore ${c.where} copy`),
      c.warnings.length ? h('div', { class: 'tiny' }, c.warnings.join(' ')) : null))) : null,
    f.issues?.length ? h('ul', { class: 'warn-text', 'data-testid': 'recovery-issues' }, f.issues.map(x => h('li', x))) : null,
    valid.length === 1 && valid[0].warnings.length ? h('p', { class: 'tiny' }, valid[0].warnings.join(' ')) : null,
    h('button', { type: 'button', 'data-testid': 'discard-saved', onclick: onDiscard }, 'Keep what is on screen'),
    h('div', { class: 'tiny' }, 'Both stores were inspected. Nothing is restored automatically, and reviewing or declining this offer deletes no stored copy. A stored session can be older than the work in this tab; restoring replaces the current tab only after validation succeeds.'));
}
