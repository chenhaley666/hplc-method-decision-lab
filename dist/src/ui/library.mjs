import {displayRunOrder} from '../data-model/workspaces.mjs';
// library.mjs — import (many files, now or later), the shared run table with
// independent selection controls, filters, editable labels, and run details.
import { h, chip, details, table, f, field } from './dom.mjs';
import { commit, setUi, store } from './state.mjs';
import { importFiles, BATCH_TARGET, detectFormat } from '../importers/batch.mjs';
import { GENERIC_FIELDS, readHeader, autoMap, TEMPLATE_HEADER } from '../importers/generic.mjs';
import { PROFILES, confirmProfileValues, runNameSourceOptions, resolveRunNameProfile, applyRunNameProfile, profileConfirmationStatus } from '../importers/profiles.mjs';
import { setFlag, chronological, chronologyStatus } from '../data-model/session.mjs';
import { autoPrepare } from '../automation/auto.mjs';
import { CONDITION_FIELDS, sourceLabel, knownValue, cond, normaliseSolvent } from '../data-model/conditions.mjs';
import { effectiveTemperature, runColumn, runInstrument, organicOf, percentBOf, t0Of } from '../data-model/derive.mjs';
import { peakStatus, assign, unassign, acceptProposal } from '../alignment/correspondence.mjs';
import { num } from '../rules.mjs';
import { setSampleIdentity, declareSampleEquivalence } from '../data-model/comparability.mjs';
import { SOLVENT_B_OPTIONS } from '../presets/local-lab.mjs';
import { shortRunLabel,compareRunNumbers } from '../data-model/workspaces.mjs';
import { applyStageEquipment,workspaceTransfer,proposeNamedEquipment,acceptNamedMethod,correctNameMetadata } from './stage-context.mjs';
import { heightFilterSummary,heightExcluded } from '../data-model/peak-filter.mjs';
import {applyConfiguredImport} from './first-experiment.mjs';

export function downloadText(name, text, type = 'text/plain') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

async function readFiles(fileList) {
  return Promise.all([...fileList].map(fl => fl.text().then(text => ({ name: fl.name, text, size: fl.size })).catch(e => ({ name: fl.name, text: '', size: fl.size, error: e.message }))));
}

let importBusy = false;

export function importPanel(st) {
  const ui = st.ui;
  const course=!!ui.courseDashboard;
  const stageLabel=course?'FC1':ui.stage[0].toUpperCase()+ui.stage.slice(1);
  const guidance=course?'Import one CSV or an ordered batch. Retention / Selectivity roles and the current course decision are inferred automatically. No stage choice is required.':ui.stage==='retention'?'Upload Retention-stage CSVs only. Put Selectivity experiments on the Selectivity page.':ui.stage==='selectivity'?'Upload Selectivity-stage CSVs only. Put the Retention %B-series data on the Retention page.':`Upload ${stageLabel}-stage CSVs only. This FC2 stage does not yet calculate an experimental decision.`;
  const opts = ui.importOpts || (ui.importOpts = st.session.settings.importOptions ? {...st.session.settings.importOptions} : { format: 'auto', profile: true, acceptNamedMethod:true,profileFrom: 'fileName', duplicatePolicy: 'skip', reviewMapping: false, timeUnit: 'min', pressureUnit: 'psi' });
  const option=(key,value)=>{opts[key]=value;commit(ss=>{ss.settings.importOptions={...opts};});};
  const receive = async (fileList, folders = []) => {
      const selected = [...fileList];
      if (!selected.length && !folders.length) return;
      if (importBusy) { setUi(u => { u.message = 'An import is still running. Wait for the import report, then select or drop these files again. These new files were not imported.'; }); return; }
      if (store.ui.pendingGeneric?.length) { setUi(u => { u.message = 'Finish or cancel the pending CSV column mapping before selecting or dropping more files. These new files were not imported.'; }); return; }
      importBusy = true;
      const session = store.session, options = { ...opts };
      setUi(u => { u.importBusy = true; });
      try {
      const rejected = selected.filter(fl => !/\.(csv|txt)$/i.test(fl.name)).map(fl => ({ fileName: fl.name, outcome: 'failed', format: null, runIds: [], warnings: [],
        messages: [/\.json$/i.test(fl.name) ? 'This is a saved-session JSON, not an experiment CSV. Use Open saved session (.json) at the top of the page.' : 'Unsupported file type. Select CSV or text exports; folders and other file types are not imported.'] }));
      rejected.push(...folders.map(name => ({ fileName: name, outcome: 'failed', format: null, runIds: [], warnings: [], messages: ['Folder not imported. Open the folder and select or drag the CSV files inside it.'] })));
      const files = await readFiles(selected.filter(fl => /\.(csv|txt)$/i.test(fl.name)));
      if(course)files.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
      if (store.session !== session) { setUi(u => { u.message = 'The session changed while files were being read. No files from that selection were imported; select or drop them again in the current session.'; }); return; }
      const t0 = performance.now();
      const needMap = [], ready = [];
      for (const fl of files) {
        const fmt = options.format === 'auto' ? detectFormat(fl.text) : options.format;
        if (fmt === 'generic' || (options.format === 'auto' && !fmt && /,/.test(fl.text.split('\n')[0] || ''))) {
          let hdr = null; try { hdr = readHeader(fl.text).header; } catch { /* reported by importer */ }
          const map = hdr ? autoMap(hdr) : {};
          if (hdr && (options.reviewMapping || !('rt' in map))) { needMap.push({ ...fl, header: hdr, mapping: map }); continue; }
        }
        ready.push(fl);
      }
      let report = [...rejected], auto = null;
      if (ready.length) {
      commit(s => {
        const beforeIds=new Set(s.runs.map(r=>r.id));
        report.push(...importFiles(s, ready, { format: options.format, duplicatePolicy: options.duplicatePolicy, units: { time: options.timeUnit, pressure: options.pressureUnit },
          profile: options.profile ? { id: 'monashplc-runname', from: options.profileFrom } : null }));
        // Automatic preparation: the user supplies the files and nothing else.
        if(options.profile&&options.acceptNamedMethod)acceptNamedMethod(s,new Set(s.runs.filter(r=>!beforeIds.has(r.id)).map(r=>r.id)));
        const configured=course?applyConfiguredImport(s,new Set(s.runs.filter(r=>!beforeIds.has(r.id)).map(r=>r.id))):[];
        auto = autoPrepare(s, s.settings);auto.equipment.push(...configured);
        proposeNamedEquipment(s);
        applyStageEquipment(s,s.runs);
        for(const r of s.runs)if(!beforeIds.has(r.id)){r.flags.compare=true;if(course)r.flags.fit=true;}
      });
      }
      setUi(u => { u.importReport = { report, ms: performance.now() - t0, files: selected.length + folders.length }; if (auto) u.autoReport = auto; u.pendingGeneric = needMap.length ? needMap : null; });
      } catch (e) { setUi(u => { u.message = `Import could not finish: ${e.message || e}. Review the import report and library before retrying.`; }); }
      finally { importBusy = false; setUi(u => { u.importBusy = false; }); }
  };
  const input = h('input', { type: 'file', multiple: true, accept: '.csv,.txt', disabled: ui.importBusy, 'data-testid': 'file-input', 'aria-label': 'Choose multiple CSV files to import', 'aria-describedby': 'csv-import-help',
    onchange: e => { const files = [...e.target.files]; e.target.value = ''; void receive(files); } });
  const fileDrag = e => [...(e.dataTransfer?.types || [])].includes('Files');
  const dropZone = h('div', { class: 'csv-drop-zone', 'data-testid': 'csv-drop-zone', role: 'group', 'aria-label': 'Import CSV files by selection or drag and drop', 'aria-busy': ui.importBusy ? 'true' : 'false',
    ondragenter: e => { if (fileDrag(e)) { e.preventDefault(); e.currentTarget.classList.add('drag-active'); } },
    ondragover: e => { if (fileDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = ui.importBusy ? 'none' : 'copy'; e.currentTarget.classList.add('drag-active'); } },
    ondragleave: e => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('drag-active'); },
    ondrop: e => {
      e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('drag-active');
      const folders = [...(e.dataTransfer?.items || [])].map(it => it.webkitGetAsEntry?.()).filter(it => it?.isDirectory).map(it => it.name);
      const files = [...(e.dataTransfer?.files || [])].filter(fl => !folders.includes(fl.name));
      if (!files.length && !folders.length) { setUi(u => { u.message = 'Drop CSV files here, not links or text. No files were imported.'; }); return; }
      void receive(files, folders);
    } }, h('strong', ui.importBusy ? 'Reading files…' : `${stageLabel} data only — choose or drag CSV files`),
    h('p',{class:'banner','data-testid':'stage-import-guidance'},guidance,course?'':' A reference run needed in both stages can be copied explicitly with “Copy selected runs to another stage”.'),
    h('p', { class: 'small', id: 'csv-import-help' }, 'Or use the chooser below. On Mac, hold ⌘ to select separate files, Shift for a range, or ⌘A for all files in a folder. CSVs are added to your library, not sent to a server.'),
    field('Choose CSV files (multiple allowed)', input),
    h('p', { class: 'tiny' }, 'CSV / TXT experiment exports only. To restore an exported .json session, use Open saved session (.json) at the top.'));
  const sel = (v, options, on, tid) => h('select', { 'data-testid': tid, onchange: e => on(e.target.value) }, options.map(([val, lab]) => h('option', { value: val, selected: v === val ? 'selected' : null }, lab)));
  return h('section', { class: 'card', 'data-testid': 'import-panel' }, h('h3', `Import ${stageLabel} data`),
    h('p',{class:'small'},course?'The Dashboard keeps the ordered source records and computes their course role; HPLC number is an instrument ID, not a stage label.':`Files imported here appear only in ${ui.stage}. Switching stages preserves this library and its selections.`),
    h('p', { class: 'small' }, `Select one or many files at once; add more files at any time. Each file is imported independently — a malformed file does not stop the others. Design target: up to ${BATCH_TARGET.files} files (≈${BATCH_TARGET.megabytes} MB) per import; the tested limit is in the verification record.`),
    dropZone,
    h('p',{class:'small','data-testid':'import-auto-summary'},`Import settings in force: ${opts.format==='auto'?'format detected automatically':opts.format}; identical files ${opts.duplicatePolicy}; ${opts.profile&&opts.acceptNamedMethod?'conflict-free course filename conditions accepted automatically with provenance':'course-name acceptance is disabled / requires review'}. Generic fallback units: ${opts.timeUnit}, ${opts.pressureUnit}; explicitly exported units take precedence.`),
    h('button',{type:'button','data-testid':'import-expert',onclick:()=>setUi(u=>{u.importExpert=!u.importExpert;})},ui.importExpert?'Close expert import correction':'Expert: correct import settings'),
    ui.importExpert?h('div',h('div', { class: 'row wrap' },
      field('Format', sel(opts.format, [['auto', 'Detect (LabSolutions or generic peak table)'], ['labsolutions', 'LabSolutions export'], ['generic', 'Generic peak-table CSV']], v => option('format',v), 'import-format')),
      field('Identical files', sel(opts.duplicatePolicy, [['skip', 'Skip and report'], ['keep', 'Keep as a separate record']], v => option('duplicatePolicy',v), 'dup-policy')),
      field('Generic units', h('span', sel(opts.timeUnit, [['min', 'times in min'], ['s', 'times in s']], v => option('timeUnit',v), 'time-unit'), ' ', sel(opts.pressureUnit, [['psi', 'pressure psi'], ['bar', 'bar'], ['MPa', 'MPa']], v => option('pressureUnit',v), 'pressure-unit')))),
    h('div', { class: 'row wrap' },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: opts.profile, 'data-testid': 'profile-toggle', onchange: e => option('profile',e.target.checked) }), ` Apply import profile: ${PROFILES['monashplc-runname'].label}`),
      h('label',{class:'check'},h('input',{type:'checkbox',checked:opts.acceptNamedMethod,disabled:!opts.profile,'data-testid':'accept-named-method',onchange:e=>option('acceptNamedMethod',e.target.checked)}),' Use conflict-free course names as recorded method declarations (optional)'),
      field('Optional profile source (not sample identity)', h('select', { 'data-testid': 'profile-from', disabled: !opts.profile, onchange: e => option('profileFrom',e.target.value) },
        [['fileName', 'External CSV filename'], ['sampleName', 'Internal Sample Name in the export']].map(([v, label]) => h('option', { value: v, selected: opts.profileFrom === v ? 'selected' : null }, label)))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: opts.reviewMapping, onchange: e => option('reviewMapping',e.target.checked) }), ' Always review generic column mapping'))):null,
    details('How automatic import interprets names and units',false,opts.profile ? h('p', { class: 'small', 'data-testid': 'profile-source-help' }, `Selected source: ${opts.profileFrom === 'sampleName' ? 'the internal Sample Name' : 'the external CSV filename'}. `, PROFILES['monashplc-runname'].description,
      opts.acceptNamedMethod?' The optional course-name declaration mode is enabled: conflict-free named method fields are accepted automatically with that provenance. This does not confirm chemical identities, physical column allocation or manufacturer limits.':' Automatic acceptance is off; profile values remain unconfirmed until you confirm them.',
      ' A disagreement is reported, not silently repaired. Open a run’s Details to choose the source with your recorded basis; the raw strings remain unchanged.')
      : h('p', { class: 'small', 'data-testid': 'profile-source-help' }, 'No import profile: chemistry and equipment are never read from file names. Enter or map them explicitly. Folder names may record an origin cycle; that is metadata, not a completed cycle or the next experimental route.')),
    details('Generic peak-table CSV: required and optional fields', false,
      h('p', { class: 'small' }, 'One header row, one row per peak. Rows are grouped into runs by run_key. Run-level fields must be constant within a run. A peak-table CSV has no chromatogram trace; none is drawn for it.'),
      table(['Field', 'Canonical header', 'Level', 'Unit', 'Required'], GENERIC_FIELDS.map(g => h('tr', h('td', g.label), h('td', h('code', g.synonyms[0])), h('td', g.level), h('td', g.unit || ''), h('td', g.required ? 'REQUIRED' : 'optional')))),
      h('button', { type: 'button', onclick: () => downloadText('generic-peak-table-template.csv', TEMPLATE_HEADER.join(',') + '\n', 'text/csv') }, 'Download blank template')),
    st.ui.pendingGeneric ? mappingForm(st) : null,
    st.ui.importReport ? details(`Import report (${st.ui.importReport.report.length} files)`,false,importReport(st.ui.importReport)) : null);
}

function mappingForm(st) {
  const items = st.ui.pendingGeneric;
  return h('div', { class: 'card inner', 'data-testid': 'mapping-form' }, h('h4', 'Map generic CSV columns'),
    items.map((it, k) => h('div', { class: 'mapping' }, h('p', h('strong', it.name), ` — ${it.header.length} columns`),
      h('div', { class: 'grid2' }, it.header.map((hd, i) => field(hd, h('select', { 'data-testid': `map-${k}-${i}`, onchange: e => { for (const [key, idx] of Object.entries(it.mapping)) if (idx === i) delete it.mapping[key]; if (e.target.value) it.mapping[e.target.value] = i; } },
        h('option', { value: '' }, '(ignore)'), GENERIC_FIELDS.map(g => h('option', { value: g.key, selected: it.mapping[g.key] === i ? 'selected' : null }, `${g.label}${g.required ? ' *' : ''}`)))))))),
    h('button', { type: 'button', 'data-testid': 'apply-mapping', onclick: () => {
      const o = st.ui.importOpts; let all = [];
      commit(s => {const before=new Set(s.runs.map(r=>r.id));for (const it of items) all.push(...importFiles(s, [it], { format: 'generic', mapping: it.mapping, duplicatePolicy: o.duplicatePolicy, units: { time: o.timeUnit, pressure: o.pressureUnit }, profile: o.profile ? { id: 'monashplc-runname', from: o.profileFrom } : null }));if(o.profile&&o.acceptNamedMethod)acceptNamedMethod(s,new Set(s.runs.filter(r=>!before.has(r.id)).map(r=>r.id)));autoPrepare(s,s.settings);proposeNamedEquipment(s);applyStageEquipment(s,s.runs);for(const r of s.runs)if(!before.has(r.id))r.flags.compare=true; });
      setUi(u => { u.pendingGeneric = null; u.importReport = { report: [...(u.importReport?.report || []), ...all], ms: 0, files: all.length }; });
    } }, 'Import with this mapping'),
    h('button', { type: 'button', onclick: () => setUi(u => { u.pendingGeneric = null; }) }, 'Cancel'));
}

function importReport(r) {
  const counts = r.report.reduce((a, e) => { a[e.outcome] = (a[e.outcome] || 0) + 1; return a; }, {});
  return h('div', { class: 'card inner', 'data-testid': 'import-report' }, h('h4', 'Import report'),
    h('p', { class: 'small' }, `${r.report.length} file(s): ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}${r.ms ? ` — ${r.ms.toFixed(0)} ms` : ''}.`),
    table(['File', 'Outcome', 'Runs', 'Messages', 'Warnings'], r.report.map(e => h('tr', { class: `o-${e.outcome}` }, h('td', e.fileName), h('td', chip(e.outcome, e.outcome === 'imported' ? 'ok' : e.outcome === 'failed' ? 'bad' : 'warn')), h('td', String(e.runIds.length)),
      h('td', { class: 'small' }, e.messages.join(' | ')), h('td', { class: 'small' }, e.warnings.length ? details(`${e.warnings.length} warning(s)`, false, h('ul', e.warnings.map(w => h('li', w)))) : '')))));
}

// ---------------------------------------------------------------- run table
function matches(st, r) {
  const fl = st.ui.filter;
  if (fl.text && !(`${r.label} ${r.raw.fileName}`.toLowerCase().includes(fl.text.toLowerCase()))) return false;
  if (fl.format && r.raw.format !== fl.format) return false;
  if (fl.solvent && (organicOf(r) || knownValue(r.conditions.organic) && r.conditions.organic.value || '') !== fl.solvent) return false;
  if (fl.flag === 'fit' && !r.flags.fit) return false;
  if (fl.flag === 'history' && !r.flags.history) return false;
  if (fl.flag === 'compare' && !r.flags.compare) return false;
  if (fl.flag === 'hidden' && r.flags.show[st.ui.stage] !== false) return false;
  return true;
}

export function autoReportPanel(st) {
  const a = st.ui.autoReport;
  if (!a) return null;
  const n = a.equipment.length + a.compounds.length + a.fit.length;
  return details('Automatic preparation: actions and their basis',false,h('section', { class: 'card inner', 'data-testid': 'auto-report' },
    h('h4', `What the tool did for you without being asked (${n} action${n === 1 ? '' : 's'})`),
    a.off ? h('p', { class: 'small' }, a.note) : h('div', null,
      a.equipment.length ? h('div', null, h('h5', 'Equipment'), h('ul', { class: 'small' }, a.equipment.map(x => h('li', x)))) : null,
      a.compounds.length ? h('div', null, h('h5', 'Compounds and the hold-up marker'), h('ul', { class: 'small' }, a.compounds.map(x => h('li', x)))) : null,
      a.fit.length ? h('div', null, h('h5', 'Retention fit group'), h('ul', { class: 'small' }, a.fit.map(x => h('li', x)))) : null,
      h('p', { class: 'tiny' }, a.note))));
}

export function runTable(st) {
  const s = st.session, ui = st.ui, stage = ['equipment', 'retention', 'selectivity'].includes(ui.stage) ? ui.stage : 'equipment';
  const advanced=!!ui.libraryAdvanced;
  const runs = s.runs.filter(r => !advanced||matches(st, r)).sort(compareRunNumbers);
  const sel = ui.selected;
  const ev = st.evaluation;
  const bulk = (fn) => () => commit(ss => { for (const id of sel) { const r = ss.runs.find(x => x.id === id); if (r) fn(ss, r); } });
  const flagBox = (r, flag, label) => h('input', { type: 'checkbox', checked: flag === 'show' ? r.flags.show[stage] : r.flags[flag], 'aria-label': `${label}: ${r.label}`, 'data-testid': `flag-${flag}-${r.id}`,
    onchange: e => commit(ss => setFlag(ss, r.id, flag, e.target.checked, stage)) });
  const solvents = [...new Set(s.runs.map(r => knownValue(r.conditions.organic) ? String(r.conditions.organic.value) : null).filter(Boolean))];
  return h('section', { class: 'card', 'data-testid': 'run-table' },
    h('h3', `Experiment library (${s.runs.length} run${s.runs.length === 1 ? '' : 's'})`),
    h('p', { class: 'small' }, `${stage} data only · run numbers in ascending order. Imported runs are compared automatically; the model uses a compatible method group and decision history uses recorded sample acquisitions, not the display order. No repeated ticking is needed. Details lets you correct a run.`),
    h('button',{type:'button','data-testid':'library-advanced',onclick:()=>setUi(u=>{u.libraryAdvanced=!u.libraryAdvanced;})},advanced?'Return to automatic library':'Advanced: change analysis sets / copy runs'),
    advanced?h('div', { class: 'row wrap filters' },
      field('Filter', h('input', { type: 'search', value: ui.filter.text, placeholder: 'label or file name', 'data-testid': 'filter-text', oninput: e => { ui.filter.text = e.target.value; setUi(() => {}); } })),
      field('Format', h('select', { onchange: e => setUi(u => { u.filter.format = e.target.value; }) }, [['', 'any'], ['labsolutions', 'LabSolutions'], ['generic-peak-table', 'generic']].map(([v, l]) => h('option', { value: v, selected: ui.filter.format === v ? 'selected' : null }, l)))),
      field('Solvent', h('select', { onchange: e => setUi(u => { u.filter.solvent = e.target.value; }) }, [['', 'any'], ...solvents.map(x => [x, x])].map(([v, l]) => h('option', { value: v, selected: ui.filter.solvent === v ? 'selected' : null }, l)))),
      field('Set', h('select', { 'data-testid': 'filter-flag', onchange: e => setUi(u => { u.filter.flag = e.target.value; }) }, [['', 'all runs'], ['fit', 'in fit set'], ['history', 'in history set'], ['compare', 'in comparison'], ['hidden', `hidden in ${stage}`]].map(([v, l]) => h('option', { value: v, selected: ui.filter.flag === v ? 'selected' : null }, l))))):null,
    advanced?h('div', { class: 'row wrap bulk' },
      h('button', { type: 'button', 'data-testid': 'select-all', onclick: () => setUi(u => { for (const r of runs) u.selected.add(r.id); }) }, `Select all (${runs.length} shown)`),
      h('button', { type: 'button', 'data-testid': 'clear-selection', onclick: () => setUi(u => { u.selected.clear(); }) }, 'Clear selection'),
      h('span', { class: 'small' }, `${sel.size} selected → `),
      ...['compare', 'fit', 'history'].flatMap(fl => [
        h('button', { type: 'button', disabled: !sel.size, 'data-testid': `bulk-${fl}-on`, onclick: bulk((ss, r) => setFlag(ss, r.id, fl, true)) }, `+${fl}`),
        h('button', { type: 'button', disabled: !sel.size, 'data-testid': `bulk-${fl}-off`, onclick: bulk((ss, r) => setFlag(ss, r.id, fl, false)) }, `−${fl}`)]),
      h('button', { type: 'button', disabled: !sel.size, onclick: bulk((ss, r) => setFlag(ss, r.id, 'show', true, stage)) }, `show in ${stage}`),
      h('button', { type: 'button', disabled: !sel.size, onclick: bulk((ss, r) => setFlag(ss, r.id, 'show', false, stage)) }, `hide in ${stage}`),
      h('button', { type: 'button', disabled: !sel.size, 'data-testid': 'bulk-confirm-profile', onclick: () => {
        let confirmed = 0, blocked = 0;
        commit(ss => { for (const r of ss.runs.filter(x => sel.has(x.id))) { if (!profileConfirmationStatus(r).ok) blocked++; confirmed += confirmProfileValues(r); } });
        setUi(u => { u.message = `${confirmed} profile value(s) confirmed by you.${blocked ? ` ${blocked} run(s) still have an unresolved naming conflict: open Details and record which source describes the injection.` : ''} No raw data or sample identity was changed.`; });
      } }, 'Confirm profile values'),
      h('select', { disabled: !sel.size || !s.instruments.length, 'data-testid': 'bulk-instrument', onchange: e => { const v = e.target.value; if (v) bulk((ss, r) => { r.assoc.instrumentId = { value: v, source: 'user (bulk association)', confirmed: true }; })(); } },
        h('option', { value: '' }, 'associate instrument…'), s.instruments.map(i => h('option', { value: i.id }, i.label))),
      h('select', { disabled: !sel.size || !s.columns.length, 'data-testid': 'bulk-column', onchange: e => { const v = e.target.value; if (v) bulk((ss, r) => { r.assoc.columnId = { value: v, source: 'user (bulk association)', confirmed: true }; })(); } },
        h('option', { value: '' }, 'associate physical column…'), s.columns.map(c => h('option', { value: c.id }, c.label)))):null,
    runs.length ? table([...(advanced?['']:[]), 'Run', ...(advanced?['Show','Cmp','Fit','Hist']:[]), 'Solvent', '%B', 'Temp °C', 'Column', 'Peaks', 'Last tR', 'Min Rs', 'P max', 'Status', ''],
      runs.map(r => {
        const g = ev.runEvaluations[r.id]; const gg = Object.fromEntries(g.gates.map(x => [x.id, x]));
        const T = effectiveTemperature(r, s.settings); const col = runColumn(s, r);
        const oc = r.conditions.organic, pb = r.conditions.percentB;
        const row=h('tr', { 'data-run': r.id, class: r.flags.show[stage] ? '' : 'hidden-run' },
          advanced?h('td', h('input', { type: 'checkbox', checked: sel.has(r.id), 'aria-label': `select ${r.label}`, 'data-testid': `sel-${r.id}`, onchange: e => setUi(u => { e.target.checked ? u.selected.add(r.id) : u.selected.delete(r.id); }) })):null,
          h('td', advanced?h('input', { class: 'label-edit', value: shortRunLabel(r),title:r.raw.fileName,'aria-label': 'display label', 'data-testid': `label-${r.id}`, onchange: e => commit(ss => { const x = ss.runs.find(y => y.id === r.id); x.label = e.target.value.trim() || x.label; }) }):h('strong',{'data-testid':`run-label-${r.id}`},shortRunLabel(r)),
            details('Full filename / identity',false,h('p',{class:'tiny'},r.raw.fileName),h('p',{class:'tiny'},`${r.id} · ${r.raw.format}${r.measured.trace ? '' : ' · no trace'}`)), sourceCycleLine(r),
            r.measured.fileMeta?.nameConflicts?.length ? h('div', { class: 'tiny warn', 'data-testid': `name-conflict-${r.id}` }, 'Filename / internal name disagree — review Details') : null),
          ...(advanced?[h('td', flagBox(r, 'show', 'show')), h('td', flagBox(r, 'compare', 'compare')), h('td', flagBox(r, 'fit', 'fit')), h('td', flagBox(r, 'history', 'history'))]:[]),
          h('td', knownValue(oc) ? h('span', { class: oc.confirmed ? '' : 'unconf', title: sourceLabel(oc) }, String(oc.value)) : '—'),
          h('td', knownValue(pb) ? h('span', { class: pb.confirmed ? '' : 'unconf', title: sourceLabel(pb) }, String(pb.value)) : '—'),
          h('td', { title: T.reason }, T.known ? f(T.value, 1) : h('span', { class: 'unk' }, '?')),
          h('td', col.column ? h('span', { class: col.confirmed ? '' : 'unconf', title: `${col.column.label} — ${col.source}` }, col.column.label.length > 22 ? col.column.label.slice(0, 21) + '…' : col.column.label) : '—'),
          h('td',{title:`${r.measured.peaks.length} original peaks; ${heightFilterSummary(r).excluded} excluded by height`},String(gg.peakCount.value)), h('td', f(gg.lastPeak.value, 3)), h('td', f(gg.minRs.value, 3)), h('td', f(gg.pressure.value, 0)),
          h('td', chip(g.verdict==='met'?'Criteria met':g.verdict==='not-met'?'Criteria not met':'Missing data', g.verdict === 'met' ? 'ok' : g.verdict === 'not-met' ? 'bad' : 'warn'),h('div',{class:'tiny','data-testid':`verdict-reason-${r.id}`},g.gates.filter(x=>x.pass!==true).map(x=>{const sp=ev.settings.specs[x.id],label={minRs:'Rs',peakCount:'Peak count',lastPeak:'Latest peak',pressure:'Pressure'}[x.id];return `${label}: ${x.value===null?'not available':f(x.value,x.id==='peakCount'?0:3)}${sp?` vs ${sp.op} ${sp.value} ${sp.unit||''}`:''}`;}).join('; '))),
          h('td', h('button', { type: 'button', 'data-testid': `open-${r.id}`,'aria-expanded':ui.detailRunId===r.id?'true':'false', onclick: () => {setUi(u => { u.detailRunId = u.detailRunId === r.id ? null : r.id; });if(store.ui.detailRunId===r.id)document.querySelector('[data-testid="run-detail"]')?.scrollIntoView({block:'nearest'});} }, ui.detailRunId === r.id ? 'Close' : 'Details')));
        return [row,ui.detailRunId===r.id?h('tr',{'data-testid':'inline-run-detail','data-detail-run':r.id},h('td',{colspan:advanced?16:11},runDetail(st,r))):null];
      }), { class: 'runs' }) : h('p', { class: 'empty', 'data-testid': 'empty-library' }, s.runs.length ? 'No run matches the filters.' : 'The library is empty. Import CSV files to begin.'),
    h('p', { class: 'small' }, 'Status compares this run with four standards: back-pressure, retained peak count, latest peak time and lowest adjacent-pair Rs. It is not the R² fit verdict. Details shows the exact values, required standards and reasons beside the run. Italic values are unconfirmed; temperature "?" means not established, not zero. R² and minimum %B are calculated below.'),
    advanced?details('Sample identity and experimental order',false,sampleIdentityPanel(st),runOrderPanel(st)):null,
    advanced?workspaceTransfer(st):null,
    null);
}

// A sample category (CP / STD / QC), run label or filename is not a study
// identity. These are explicit user declarations and retain their basis.
export function sampleIdentityPanel(st) {
  const s = st.session, ui = st.ui;
  if (!s.runs.length) return null;
  const ids = [...new Set(s.runs.map(r => knownValue(r.conditions.sampleId) ? String(r.conditions.sampleId.value) : null).filter(Boolean))];
  const apply = () => {
    const value = (ui.sampleIdDraft || '').trim(), basis = (ui.sampleBasisDraft || '').trim();
    if (!ui.selected.size || !value || !basis) {
      setUi(u => { u.message = 'Select the runs and provide a sample/study identity and its basis. Nothing was changed.'; }); return;
    }
    try {
      let report;
      commit(ss => {
        for (const r of ss.runs.filter(r => ui.selected.has(r.id))) setSampleIdentity(r, value, basis);
        report = autoPrepare(ss, ss.settings);
      });
      setUi(u => { u.autoReport = report; u.message = `Sample identity "${value}" declared for ${ui.selected.size} selected run(s). This is your statement, not chemical identification by the tool.`; });
    } catch (e) { setUi(u => { u.message = `Identity not declared: ${e.message}`; }); }
  };
  const equivalent = () => {
    const left = ui.equivalenceLeft || '', right = ui.equivalenceRight || '', basis = (ui.equivalenceBasis || '').trim();
    if (!left || !right || left === right || !basis) {
      setUi(u => { u.message = 'Choose two different sample identities and state why their analytes can be compared. Nothing was changed.'; }); return;
    }
    try {
      let report;
      commit(ss => { declareSampleEquivalence(ss, left, right, basis); report = autoPrepare(ss, ss.settings); });
      setUi(u => { u.autoReport = report; u.message = 'Comparison equivalence declared by you. Equipment and method compatibility are still checked separately.'; });
    } catch (e) { setUi(u => { u.message = `Equivalence not declared: ${e.message}`; }); }
  };
  const pick = (key, label) => field(label, h('select', { 'data-testid': key, onchange: e => { ui[key === 'equivalence-left' ? 'equivalenceLeft' : 'equivalenceRight'] = e.target.value; } },
    h('option', { value: '' }, 'Choose a declared identity…'), ids.map(id => h('option', { value: id, selected: ui[key === 'equivalence-left' ? 'equivalenceLeft' : 'equivalenceRight'] === id ? 'selected' : null }, id))));
  return h('section', { class: 'card inner', 'data-testid': 'sample-identity-panel' },
    h('h4', 'Sample / study identity'),
    h('p', { class: 'small' }, 'CP, STD and QC describe a sample type, not which sample it is. Matching filenames, run labels or peak positions do not establish identity. Declare an identity only where your experimental records support the comparison; unknown identities block pooled fitting and history completion, not inspection of individual measurements.'),
    h('div', { class: 'row wrap' },
      field('Identity for selected runs', h('input', { value: ui.sampleIdDraft || '', placeholder: 'e.g. your recorded sample batch ID', 'data-testid': 'bulk-sample-id', oninput: e => { ui.sampleIdDraft = e.target.value; } })),
      field('Basis / experimental record', h('input', { value: ui.sampleBasisDraft || '', placeholder: 'Why these runs contain the same analyte population', 'data-testid': 'bulk-sample-basis', oninput: e => { ui.sampleBasisDraft = e.target.value; } })),
      h('button', { type: 'button', disabled: !ui.selected.size, 'data-testid': 'declare-sample-identity', onclick: apply }, `Declare for ${ui.selected.size} selected run(s)`)),
    details('Per-run identities and their provenance', false,
      table(['Run', 'Sample/study ID', 'Source / basis'], displayRunOrder(s.runs,s).map(r => h('tr', h('td', r.label),
        h('td', knownValue(r.conditions.sampleId) ? String(r.conditions.sampleId.value) : 'UNKNOWN'),
        h('td', { class: 'small' }, sourceLabel(r.conditions.sampleId), r.conditions.sampleId?.note ? ` — ${r.conditions.sampleId.note}` : ''))))),
    details('Declare a comparison relationship between two identities', false,
      h('p', { class: 'small' }, 'Use only with a recorded scientific basis. This does not merge the original records or bypass column, solvent, temperature, marker or compound-coverage checks.'),
      h('div', { class: 'row wrap' }, pick('equivalence-left', 'Identity A'), pick('equivalence-right', 'Identity B'),
        field('Comparison basis', h('input', { value: ui.equivalenceBasis || '', 'data-testid': 'equivalence-basis', placeholder: 'Your evidence for comparing these samples', oninput: e => { ui.equivalenceBasis = e.target.value; } })),
        h('button', { type: 'button', 'data-testid': 'declare-equivalence', onclick: equivalent }, 'Declare comparison equivalence')),
      (s.sampleEquivalences || []).length ? table(['Identities', 'Basis', ''], s.sampleEquivalences.map(eq => h('tr', h('td', `${eq.left} ↔ ${eq.right}`), h('td', { class: 'small' }, eq.basis),
        h('td', h('button', { type: 'button', 'aria-label': `Withdraw equivalence ${eq.left} and ${eq.right}`, onclick: () => commit(ss => { ss.sampleEquivalences = ss.sampleEquivalences.filter(x => x.id !== eq.id); }) }, 'Withdraw declaration'))))) : h('p', { class: 'small' }, 'No comparison equivalence declared.')));
}

// Run order. The decision depends on which run is the latest, and that is
// never taken from the order files were selected in or from a label. Where the
// files do not state it, the user states it here.
export function runOrderPanel(st) {
  const s = st.session;
  const hist = s.runs.filter(r => r.flags.history);
  const status = chronologyStatus(s, hist);
  const stated = s.chronology?.confirmed ? (s.chronology.ids || []) : [];
  const ordered = chronological(s, hist);
  const setOrder = ids => commit(ss => { ss.chronology = { ids, confirmed: true, note: 'order stated in the run table' }; });
  const move = (id, by) => {
    const ids = ordered.map(r => r.id); const i = ids.indexOf(id), j = i + by;
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]); setOrder(ids);
  };
  return h('section', { class: 'card inner', 'data-testid': 'run-order' },
    h('h4', 'Order of the runs (decision history)'),
    h('p', { class: status.ok ? 'small' : 'small warn-text', 'data-testid': 'run-order-status' },
      `${status.ok ? 'Established' : 'NOT established'} — basis: ${status.basis}. ${status.reason}`),
    hist.length < 2 ? h('p', { class: 'small' }, 'Fewer than two runs are in the decision history; no ordering question arises.')
      : h('div', null,
        h('ol', { class: 'order-list' }, ordered.map((r, i) => h('li', { 'data-run': r.id },
          h('span', null, `${r.label}${r.measured.fileMeta?.acquiredIso ? ` — acquired ${r.measured.fileMeta.acquired} (from the file)` : ' — no acquisition time in the file'}`),
          h('button', { type: 'button', 'aria-label': `move ${r.label} earlier`, 'data-testid': `order-up-${r.id}`, disabled: i === 0, onclick: () => move(r.id, -1) }, '↑'),
          h('button', { type: 'button', 'aria-label': `move ${r.label} later`, 'data-testid': `order-down-${r.id}`, disabled: i === ordered.length - 1, onclick: () => move(r.id, 1) }, '↓')))),
        h('div', { class: 'row wrap' },
          h('button', { type: 'button', 'data-testid': 'confirm-run-order', onclick: () => setOrder(ordered.map(r => r.id)) },
            'Confirm this order as the order the runs were performed in'),
          stated.length ? h('button', { type: 'button', 'data-testid': 'clear-run-order', onclick: () => commit(ss => { ss.chronology = { ids: [], confirmed: false, note: '' }; }) }, 'Withdraw the stated order') : null),
        h('p', { class: 'tiny' }, 'The list above is shown in the order the tool currently uses: the stated order where you have given one, otherwise acquisition times from the files, otherwise import order — which is NOT evidence and is reported as unestablished.')));
}

// ---------------------------------------------------------------- run detail
export function runDetail(st, run) {
  if (!run) return null;
  const s = st.session, ui = st.ui;
  const tab = ui.detailTab;
  const tabs = [['conditions', 'Recorded conditions'], ['peaks', 'Peaks & identities'], ['marker', 'Marker / t0'], ['file', 'File metadata & original data']];
  return h('div', { class: 'card inner detail', 'data-testid': 'run-detail' },
    h('h4', `Run: ${run.label}`), h('p', { class: 'tiny' }, `Internal ID ${run.id} · imported ${run.raw.importedAt} · SHA-256 ${run.raw.sha256.slice(0, 16)}…`),
    h('h4','Why this run meets / does not meet the numerical criteria'),
    table(['Criterion','Measured result','Required standard','Result / explanation'],st.evaluation.runEvaluations[run.id].gates.map(g=>{const spec=st.evaluation.settings.specs[g.id];return h('tr',h('td',g.id==='minRs'?'Lowest adjacent-pair Rs':g.id==='lastPeak'?'Latest retained peak':g.id==='peakCount'?'Retained peak count':'Back-pressure'),h('td',g.value===null?'not available':f(g.value,g.id==='peakCount'?0:3)),h('td',spec?`${spec.op} ${spec.value} ${spec.unit||''}`:'see operating limits'),h('td',g.pass===true?'Met':g.pass===false?'Not met':'Cannot judge',g.text?` — ${g.text}`:''));}),{'data-testid':'run-criteria-details'}),
    sourceCycleLine(run, true),
    run.warnings.length ? details(`${run.warnings.length} import warning(s)`, true, h('ul', { class: 'small' }, run.warnings.map(w => h('li', w)))) : null,
    profileSourceReview(st, run),
    h('div', { class: 'tabs small-tabs' }, tabs.map(([id, lab]) => h('button', { type: 'button', class: tab === id ? 'active' : '', onclick: () => setUi(u => { u.detailTab = id; }) }, lab))),
    tab === 'conditions' ? conditionsEditor(st, run) : tab === 'peaks' ? peakEditor(st, run) : tab === 'marker' ? markerEditor(st, run) : fileView(run));
}

function sourceCycleLine(run, full = false) {
  const origin = run.measured.fileMeta?.sourceCycle;
  const text = origin?.status === 'recorded' ? `Origin: ${origin.label} — recorded folder metadata`
    : origin?.status === 'conflict' ? 'Origin cycle: conflicting folder metadata — review the original paths'
      : 'Origin cycle: not recorded';
  return h('div', { class: `source-cycle ${full ? 'small' : 'tiny'}${origin?.status === 'conflict' ? ' warn' : ''}`, 'data-testid': `${full ? 'origin-detail' : 'origin'}-${run.id}` },
    text,
    full ? h('p', { class: 'tiny' }, origin?.note || 'This is an origin label only: it neither assigns the next experimental route nor proves that a cycle was completed.') : null,
    full && origin?.evidence?.length ? details('Original paths supporting the origin label', false,
      h('ul', { class: 'tiny' }, origin.evidence.map(e => h('li', `${e.field}: ${e.path} — ${e.segment}`)))) : null);
}

function profileSourceReview(st, run) {
  const options = runNameSourceOptions(run);
  if (!options.sources.some(x => x.parsed?.ok)) return null;
  const ui = st.ui;
  const drafts = ui.profileSourceDrafts || (ui.profileSourceDrafts = {});
  const draft = drafts[run.id] || (drafts[run.id] = { from: run.profileExtras?.parsedFrom || 'fileName', basis: '' });
  const open = ui.profileReviewOpen || (ui.profileReviewOpen = {});
  const status = profileConfirmationStatus(run);
  const review = h('details', { class: 'fold profile-review', 'data-testid': `profile-review-${run.id}`, open: open[run.id] || null, ontoggle: e => { open[run.id] = e.target.open; } },
    h('summary', null, options.nameConflict ? 'Review filename / internal Sample Name conflict' : 'Choose or change the optional run-name profile source'),
    h('p', { class: 'small' }, 'Choose the record that describes this injection. This updates profile-derived values; file-stated and user-corrected values are kept. It does not identify any compound, marker, physical column or sample/study.'),
    table(['Source', 'Original string (preserved)', 'Profile readable'], options.sources.map(x => h('tr', h('td', x.label), h('td', { class: 'small' }, x.rawName || '(not recorded)'), h('td', x.parsed?.ok ? 'yes' : 'no')))),
    options.conflicts.length ? h('p', { class: 'small warn' }, `Run-name fields that disagree: ${options.conflicts.map(c => c.field).join(', ')}.`) : null,
    h('p', { class: status.ok ? 'tiny' : 'small warn', 'data-testid': `profile-conflict-status-${run.id}` }, status.ok ? 'No unresolved source-choice conflict. Each method value below shows whether it was automatically accepted under the optional course convention, confirmed by you, or remains unconfirmed.' : 'Source choice is unresolved. Bulk confirmation cannot resolve this disagreement.'),
    h('div', { class: 'row wrap' },
      field('Read conditions from', h('select', { 'data-testid': `profile-source-${run.id}`, onchange: e => { draft.from = e.target.value; } },
        options.sources.map(x => h('option', { value: x.from, disabled: !x.parsed?.ok, selected: draft.from === x.from ? 'selected' : null }, x.label)))),
      field('Your record / reason for this choice', h('input', { 'data-testid': `profile-basis-${run.id}`, value: draft.basis, placeholder: 'Required when the names disagree', oninput: e => { draft.basis = e.target.value; } })),
      h('button', { type: 'button', 'data-testid': `apply-profile-source-${run.id}`, onclick: () => {
        if (options.nameConflict && !draft.basis.trim()) { setUi(u => { u.message = 'Record your basis for choosing between the conflicting names. Nothing was changed.'; }); return; }
        try {
          let report;
          commit(ss => {
            const current = ss.runs.find(x => x.id === run.id);
            report = options.nameConflict ? resolveRunNameProfile(current, { from: draft.from, basis: draft.basis.trim() }) : applyRunNameProfile(current, { from: draft.from });
            current.profileReport = report;
          });
          setUi(u => { u.message = report.applied ? `Run-name profile read from ${draft.from === 'sampleName' ? 'internal Sample Name' : 'external CSV filename'} with explicit provenance. Values remain unconfirmed; original file and names are unchanged.` : report.messages.join(' '); });
        } catch (e) { setUi(u => { u.message = `Profile source was not changed: ${e.message}`; }); }
      } }, 'Apply this source — keep values unconfirmed')),
    run.profileReport?.messages?.length ? h('ul', { class: 'tiny' }, run.profileReport.messages.map(m => h('li', m))) : null);
  return review;
}

function optionalNameCorrection(st,run) {
  if(!run.profileExtras&&!run.nameOverrides)return null;
  const v=run.profileExtras||{},o=run.nameOverrides||{};
  const c=st.session.columns.find(c=>c.id===run.assoc.columnId.value),m=st.session.columnModels.find(m=>m.id===c?.modelId);
  const drafts=st.ui.metadataDrafts||(st.ui.metadataDrafts={});
  const d=drafts[run.id]||(drafts[run.id]={group:o.group||v.group||'',injectionNo:o.injectionNo??v.injectionNo??0,hplcNo:o.hplcNo??v.hplcNo??1,
    ligand:o.ligand||m?.ligand||'',beadFamily:o.beadFamily||m?.beadFamily||'',lengthMm:o.lengthMm??m?.lengthMm??null,idMm:o.idMm??m?.idMm??null,particleUm:o.particleUm??m?.particleUm??null});
  const input=(key,label,type='text')=>field(label,h('input',{type,value:d[key]??'','data-testid':`name-${key}`,oninput:e=>{d[key]=type==='number'?Number(e.target.value):e.target.value;}}));
  const select=(key,label,options)=>field(label,h('select',{'data-testid':`name-${key}`,onchange:e=>{d[key]=key==='hplcNo'?Number(e.target.value):e.target.value;}},[...new Set([String(d[key]??''),...options.map(String)])].map(v=>h('option',{value:v,selected:String(d[key])===v?'selected':null},v||'unknown'))));
  return details('Optional correction: group, injection, HPLC, ligand, bead family and dimensions',false,
    h('p',{class:'small'},'Auto-read values are shown below. No correction is required when correct. Method/solvent/sample/temperature/wavelength inputs are in the recorded-conditions table. Corrections never rename or alter the original CSV.'),
    h('div',{class:'grid3'},input('group','Group ID'),input('injectionNo','Injection / run number','number'),select('hplcNo','HPLC number',[1,2,3,4,5,6]),select('ligand','Ligand type',['C18','C18n','C18aq','C8','PFP','IDB','DB','Bip']),select('beadFamily','Bead / product family',['Pinnacle','Ultra','Force','Raptor']),input('lengthMm','Column length (mm)','number'),input('idMm','Internal diameter (mm)','number'),input('particleUm','Particle size (µm)','number')),
    h('button',{type:'button','data-testid':'apply-name-correction',onclick:()=>{
      if(!/^GR\d+$/i.test(d.group)||!Number.isInteger(d.injectionNo)||d.injectionNo<1||![1,2,3,4,5,6].includes(d.hplcNo)||!d.ligand||!d.beadFamily||![d.lengthMm,d.idMm,d.particleUm].every(n=>Number.isFinite(n)&&n>0)){setUi(u=>{u.message='Correction refused: enter a GR group, positive integer injection, HPLC 1–6, ligand/bead family and positive dimensions. Original data kept.';});return;}
      commit(ss=>correctNameMetadata(ss,ss.runs.find(r=>r.id===run.id),{...d,group:d.group.toUpperCase()}));setUi(u=>{u.message='Optional correction recorded. Original CSV unchanged; corrected column descriptors do not prove a physical column allocation or operating limits.';});
    }},'Apply these optional corrections'));
}
function conditionsEditor(st, run) {
  const s = st.session;
  return h('div',
    h('p', { class: 'small' }, 'Recorded conditions of THIS run, each with its source. Editing equipment records never changes these values. Entering a value here records it as a user entry.'),
    optionalNameCorrection(st,run),
    table(['Condition', 'Value', 'Unit', 'Source', 'Category', ''], CONDITION_FIELDS.map(fd => {
      const c = run.conditions[fd.key];
      const onChange = e => { const v = e.target.value.trim();
        const val = v === '' ? null : fd.type === 'number' ? num(v) : fd.type === 'temperature' ? (/^amb(ient)?$/i.test(v) ? 'ambient' : num(v)) : fd.key === 'organic' ? normaliseSolvent(v) : v;
        if (v !== '' && val === null) { setUi(u => { u.message = `"${v}" is not a valid value for ${fd.label}; nothing was changed.`; }); return; }
        if (fd.key === 'percentB' && val !== null && (val < 0 || val > 100)) { setUi(u => { u.message = '%B must be between 0 and 100; nothing was changed.'; }); return; }
        commit(ss => { const r = ss.runs.find(x => x.id === run.id); if (fd.key === 'sampleId') setSampleIdentity(r, val, 'Identity entered by the user in this run’s recorded conditions; not inferred from its label or sample type.'); else r.conditions[fd.key] = cond(val, 'user', { unit: fd.unit });
          if(fd.key==='organic')r.conditions.phaseB=cond(val==='Mix'?'ACN + MeOH (Mix)':val,'user',{note:'Solvent B chosen explicitly by the user; original CSV is preserved.'});
        });
      };
      const options = [['','unknown'],...SOLVENT_B_OPTIONS];
      const enumerated={mode:[['ISO','Isocratic (ISO)'],['GRA','Gradient (GRA)']],sampleType:['CP','BLK','URA','SUL','NAP','KET','PIR','DIC','PHE','STD','QC'].map(v=>[v,v])};
      if(enumerated[fd.key])options.splice(1,options.length-1,...enumerated[fd.key]);
      if(knownValue(c)&&!options.some(([v])=>v===String(c.value)))options.push([String(c.value),`Recorded: ${c.value}`]);
      const inp = fd.key==='organic'||enumerated[fd.key]?h('select',{'data-testid':`cond-${fd.key}`,'aria-label':fd.label,onchange:onChange},options.map(([v,l])=>h('option',{value:v,selected:(c.value||'')===v?'selected':null},l))):h('input', { value: knownValue(c) ? String(c.value) : '', placeholder: 'unknown', 'data-testid': `cond-${fd.key}`, 'aria-label': fd.label,
        onchange: onChange });
      return h('tr', h('td', fd.label), h('td', inp), h('td', fd.unit), h('td', { class: knownValue(c) && !c.confirmed ? 'unconf small' : 'small' }, sourceLabel(c), c?.note ? h('div', { class: 'tiny' }, c.note) : null), h('td', { class: 'small' }, fd.category),
        h('td', knownValue(c) && !c.confirmed ? h('button', { type: 'button', 'data-testid': `confirm-${fd.key}`, onclick: () => {
          const current = store.session.runs.find(x => x.id === run.id);
          if (String(current.conditions[fd.key].source || '').startsWith('profile:') && !profileConfirmationStatus(current).ok) {
            setUi(u => { u.message = 'This profile value cannot be confirmed while the filename / internal Sample Name conflict is unresolved. Open the source review for this run and record your choice and its basis. Nothing was changed.'; });
            return;
          }
          commit(ss => { const r = ss.runs.find(x => x.id === run.id); r.conditions[fd.key].confirmed = true; r.conditions[fd.key].note = `${r.conditions[fd.key].note || ''} Confirmed by user.`; });
        } }, 'Confirm') : ''));
    })),
    h('p', { class: 'small' }, 'Temperature: enter a number for a setpoint or "ambient" for no setpoint. With a recorded oven trace, the trace decides the effective temperature.'),
    associationEditor(st, run));
}

export function associationEditor(st, run) {
  const s = st.session;
  const ci = runInstrument(s, run), cc = runColumn(s, run);
  const pick = (key, list, labelOf) => h('select', { 'data-testid': `assoc-${key}-${run.id}`, onchange: e => commit(ss => { const r = ss.runs.find(x => x.id === run.id); r.assoc[key] = e.target.value ? { value: e.target.value, source: 'user', confirmed: true } : { value: null, source: null, confirmed: false }; }) },
    h('option', { value: '' }, '(not associated)'), list.map(x => h('option', { value: x.id, selected: run.assoc[key].value === x.id ? 'selected' : null }, labelOf(x))));
  return h('div', { class: 'row wrap' },
    field('Instrument', pick('instrumentId', s.instruments, x => x.label), ci.instrument && !ci.confirmed ? h('span', { class: 'unconf' }, `suggested (${ci.source}) — `, h('button', { type: 'button', onclick: () => commit(ss => { ss.runs.find(x => x.id === run.id).assoc.instrumentId.confirmed = true; }) }, 'confirm')) : null),
    field('Physical column', pick('columnId', s.columns, x => x.label), cc.column && !cc.confirmed ? h('span', { class: 'unconf' }, `suggested (${cc.source}) — `, h('button', { type: 'button', onclick: () => commit(ss => { ss.runs.find(x => x.id === run.id).assoc.columnId.confirmed = true; }) }, 'confirm')) : null));
}

function peakEditor(st, run) {
  const s = st.session;
  const ps = peakStatus(s, run);
  const opts = s.compounds;
  return h('div',
    h('p', { class: 'small' }, 'Identities are user statements. Proposals (from file labels, positions or model predictions) are shown with their basis and are not used until accepted. A peak with two confirmed compounds is co-eluted.'),
    table(['#', 'tR (min)', 'Area', 'Plates', 'Exported Rs', 'Wb', 'Wh', 'Mark', 'State', 'Identity', 'Proposal', 'Co-eluted', 'Artefact (reason)'], ps.map(p => {
      const pk = run.measured.peaks.find(x => x.no === p.no);
      const note = run.peakNotes[p.no] || {};
      return h('tr', { class: `ps-${p.state}` }, h('td', String(p.no)), h('td', f(pk.tR, 3)), h('td', f(pk.area, 0)), h('td', f(pk.plates, 0)), h('td', f(pk.exportedRs, 3)), h('td', f(pk.widthBase, 4)), h('td', f(pk.widthHalf, 4)), h('td', pk.mark || ''),
        h('td', chip(p.state, p.state)),
        h('td', h('select', { 'data-testid': `ident-${run.id}-${p.no}`, onchange: e => commit(ss => { unassign(ss, run.id, p.no); if (e.target.value) assign(ss, run.id, p.no, e.target.value); }) },
          h('option', { value: '' }, '(none)'), opts.map(c => h('option', { value: c.id, selected: p.confirmed.includes(c.id) ? 'selected' : null }, `${c.name}${c.role === 'marker' ? ' [marker]' : ''}`))),
          p.confirmed.length > 1 ? h('div', { class: 'tiny' }, p.confirmed.map(id => s.compounds.find(c => c.id === id)?.name).join(' + ')) : null),
        h('td', { class: 'small' }, p.proposed.map(a => h('div', `${s.compounds.find(c => c.id === a.compoundId)?.name} — ${a.basis}; ${a.uncertainty || ''} `, h('button', { type: 'button', 'data-testid': `accept-${a.id}`, onclick: () => commit(ss => acceptProposal(ss, a.id)) }, 'accept')))),
        h('td', h('input', { type: 'checkbox', checked: !!note.coeluted, 'aria-label': 'co-eluted', onchange: e => commit(ss => { const r = ss.runs.find(x => x.id === run.id); r.peakNotes[p.no] = { ...(r.peakNotes[p.no] || {}), coeluted: e.target.checked }; }) })),
        h('td', h('input', { type: 'checkbox', checked: !!note.exclude, 'aria-label': 'artefact', 'data-testid': `artefact-${run.id}-${p.no}`, onchange: e => commit(ss => { const r = ss.runs.find(x => x.id === run.id); r.peakNotes[p.no] = { ...(r.peakNotes[p.no] || {}), exclude: e.target.checked, reason: e.target.checked ? (note.reason || 'marked by user') : '' }; }) }),
          note.exclude ? h('input', { value: note.reason || '', placeholder: 'reason', onchange: e => commit(ss => { ss.runs.find(x => x.id === run.id).peakNotes[p.no].reason = e.target.value; }) }) : null));
    })),
    opts.length ? null : h('p', { class: 'warn small' }, 'No compounds are defined yet. Define them in the Retention stage.'));
}

function markerEditor(st, run) {
  const s = st.session, m = run.marker;
  const t0 = t0Of(s, run, s.settings);
  const setM = patch => commit(ss => { const r = ss.runs.find(x => x.id === run.id); r.marker = { ...r.marker, ...patch }; });
  return h('div',
    h('p', { class: run.marker && t0.ok ? '' : 'warn' }, `Current t0: ${t0.ok ? `${f(t0.t0, 3)} min — ${t0.text}` : t0.text}`),
    h('p', { class: 'small' }, 'The preferred route is to assign the hold-up marker compound to its peak (Peaks & identities). Alternatively record a documented t0 or choose the column-volume estimate. The first-peak proxy is a session setting (Retention), off by default.'),
    field('Method', h('select', { 'data-testid': `marker-method-${run.id}`, onchange: e => setM({ method: e.target.value, confirmed: e.target.value === 'documented' ? m.confirmed : false }) },
      [['none', 'none'], ['documented', 'documented t0 value'], ['estimate', 'column-volume estimate (Equipment LAB slide 48)'], ['peak', 'designated marker peak']].map(([v, l]) => h('option', { value: v, selected: m.method === v ? 'selected' : null }, l)))),
    m.method === 'documented' ? h('div', { class: 'row wrap' }, field('t0 (min)', h('input', { value: m.t0 ?? '', 'data-testid': `marker-t0-${run.id}`, onchange: e => setM({ t0: num(e.target.value) }) })),
      field('How it was established', h('input', { value: m.note || '', onchange: e => setM({ note: e.target.value }) })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: m.confirmed, onchange: e => setM({ confirmed: e.target.checked }) }), ' I confirm this documented t0')) : null,
    m.method === 'peak' ? h('div', { class: 'row wrap' }, field('Peak number', h('input', { value: m.peakNo ?? '', onchange: e => setM({ peakNo: num(e.target.value) }) })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: m.confirmed, onchange: e => setM({ confirmed: e.target.checked }) }), ' I confirm this peak is the unretained marker')) : null);
}

function fileView(run) {
  const fm = run.measured.fileMeta || {};
  return h('div',
    table(['Item', 'Value (as written in the file)'], Object.entries(fm).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => h('tr', h('td', k), h('td', String(v))))),
    run.profileExtras ? h('p', { class: 'small' }, `Run-name profile extras (not used for associations unless you map them): ${JSON.stringify(run.profileExtras)}`) : null,
    run.measured.oven ? h('p', { class: 'small' }, `Oven trace: mean ${f(run.measured.oven.mean, 2)} °C, range ${f(run.measured.oven.min, 2)}–${f(run.measured.oven.max, 2)} °C (${run.measured.oven.n} points).`) : null,
    run.measured.room ? h('p', { class: 'small' }, `Room temperature trace: mean ${f(run.measured.room.mean, 2)} °C (room, not column).`) : null,
    details('Original file content (preserved unchanged; first 4,000 characters)', false, h('pre', { class: 'raw' }, run.raw.text.slice(0, 4000))));
}
