// inspector-view.mjs — the interactive, self-explaining equipment panel.
// Selecting a module or a parameter returns its function, the module that
// controls it, its admissible range and units for the equipment configured in
// THIS session, its effect on retention, selectivity and efficiency, its
// source, and which related setting may be changed. It renders inspect();
// it contains no knowledge of its own.
import { h, chip, table, details } from './dom.mjs';
import { setUi } from './state.mjs';
import { inspect, PARAMETERS, VISUAL_LEGEND, CATEGORY_LEGEND } from '../equipment/inspector.mjs';
import { MODULES } from '../equipment/modules.mjs';

const sel = ui => ui.inspect || null;

export function legendPanel() {
  return h('section', { class: 'card', 'data-testid': 'legend' }, h('h3', 'Legend — what the marks on every view mean'),
    table(['Kind of value', 'How it is shown', 'What it means'], VISUAL_LEGEND.map(l => h('tr', { 'data-legend': l.id },
      h('td', h('strong', l.label)), h('td', { class: `leg-${l.id}` }, l.mark), h('td', { class: 'small' }, l.meaning)))),
    h('h4', 'Parameter categories'),
    table(['Category', 'Mark', 'What it means'], CATEGORY_LEGEND.map(c => h('tr', { 'data-legend-cat': c.id },
      h('td', h('strong', c.label)), h('td', c.mark), h('td', { class: 'small' }, c.meaning)))),
    h('p', { class: 'small' }, 'This legend is the only definition of the convention; every view uses these marks and nothing else.'));
}

function rangeBlock(range) {
  if (!range) return null;
  if (range.known) return h('div', { class: 'range ok-range', 'data-testid': 'inspect-range' },
    h('strong', 'Admissible range: '), range.text, range.basis ? h('div', { class: 'tiny' }, `Basis: ${range.basis}.`) : null,
    range.extra ? h('div', { class: 'tiny' }, range.extra) : null);
  return h('div', { class: 'range unknown-range', 'data-testid': 'inspect-range' },
    h('strong', { class: 'warn-text' }, 'Limit unknown. '), range.text,
    range.requiredField ? h('div', { class: 'small' }, h('strong', 'Required information: '), range.requiredField) : null,
    range.benchDecision ? null : h('div', { class: 'tiny' }, 'No range is shown in place of a missing one, and a limit recorded for another column or instrument is never used here.'));
}

function parameterCard(p, onSelect) {
  return h('div', { class: 'card inner', 'data-testid': `inspect-parameter-${p.key}` },
    h('h4', p.categoryMark ? `${p.categoryMark.mark} ` : '', p.label, p.unit ? h('span', { class: 'small' }, ` (${p.unit})`) : null),
    h('p', null, h('strong', 'Controlled by: '), p.moduleLabel, p.controlledAt ? ` — ${p.controlledAt}` : '',
      p.changeable ? chip('you can change this setting', 'ok') : chip('changed only by fitting different hardware', 'warn')),
    p.moduleFunction ? h('p', { class: 'small' }, h('strong', 'What that module does: '), p.moduleFunction) : null,
    h('p', null, h('strong', 'Category: '), p.categoryMark ? `${p.categoryMark.label} — ${p.categoryMark.meaning}` : p.category),
    rangeBlock(p.range),
    table(['Effect on retention', 'Effect on selectivity', 'Effect on efficiency'], [h('tr', h('td', p.effects.retention), h('td', p.effects.selectivity), h('td', p.effects.efficiency))]),
    p.related.length ? h('p', { class: 'small' }, 'Related settings you can change: ',
      p.related.map(r => h('button', { type: 'button', class: 'linky', 'data-testid': `inspect-related-${r.key}`, onclick: () => onSelect({ kind: 'parameter', id: r.key }) }, r.label))) : null,
    p.sources.length ? h('p', { class: 'tiny' }, `Source: ${p.sources.join(' · ')}`) : null,
    h('p', { class: 'tiny' }, p.equipment));
}

export function inspectorPanel(st,{run=null}={}) {
  const s = st.session, ui = st.ui;
  const onSelect = x => setUi(u => { u.inspect = x; });
  const current = sel(ui);
  const rec = current ? inspect(s, s.settings, current,{run}) : null;
  return h('section', { class: 'card', 'data-testid': 'inspector' },
    h('h3', 'Equipment inspector — select a module or a parameter'),
    run?h('p',{class:'small','data-testid':'inspect-current-run'},`Run-specific view: ${run.label}. Only confirmed associations supply applicable hardware ranges; a reference illustration does not establish the fitted equipment.`):null,
    h('p', { class: 'small' }, 'Everything the tool knows about a module or a setting is here: what it does, which module controls it, the range it may be set within for the equipment configured in this session, its units, what it changes, and where that comes from. A recommendation elsewhere in the tool can be read back to its reasoning from this panel alone.'),
    h('div', { class: 'row wrap', role: 'group', 'aria-label': 'modules' },
      MODULES.map(m => h('button', { type: 'button', class: `pick ${current?.kind === 'module' && current.id === m.id ? 'on' : ''}`, 'data-testid': `pick-module-${m.id}`,
        'aria-pressed': current?.kind === 'module' && current.id === m.id ? 'true' : 'false', onclick: () => onSelect({ kind: 'module', id: m.id }) }, m.label))),
    h('div', { class: 'row wrap', role: 'group', 'aria-label': 'parameters' },
      PARAMETERS.map(p => h('button', { type: 'button', class: `pick small ${current?.kind === 'parameter' && current.id === p.key ? 'on' : ''}`, 'data-testid': `pick-parameter-${p.key}`,
        'aria-pressed': current?.kind === 'parameter' && current.id === p.key ? 'true' : 'false', onclick: () => onSelect({ kind: 'parameter', id: p.key }) }, p.label))),
    !rec ? h('p', { class: 'empty', 'data-testid': 'inspect-empty' }, 'Nothing selected. Choose a module or a parameter above.')
      : rec.error ? h('p', { class: 'warn-text' }, rec.error)
        : rec.kind === 'module' ? h('div', { 'data-testid': `inspect-module-${rec.id}` },
          h('h4', rec.label),
          h('p', null, h('strong', 'What it does: '), rec.function),
          h('p', null, h('strong', 'Which cycle it belongs to: '), rec.cycle),
          h('p', { class: 'tiny' }, rec.equipment),
          rec.measures.length ? h('p', { class: 'small' }, `Responses read here: ${rec.measures.join(', ')}. A response is read, never set.`) : h('p', { class: 'small' }, 'No response is read at this module.'),
          rec.changeable.length ? h('p', { class: 'small' }, `Settings you can change at this module: ${rec.changeable.map(c => c.label).join(', ')}.`) : h('p', { class: 'small' }, 'Nothing here is set in software.'),
          rec.sources.length ? h('p', { class: 'tiny' }, `Source: ${rec.sources.join(' · ')}`) : null,
          rec.controls.length ? h('div', null, h('h4', 'Parameters this module controls'), rec.controls.map(p => parameterCard(p, onSelect)))
            : h('p', { class: 'small' }, 'This module controls no parameter: it conditions the liquid or reads the result.'))
          : parameterCard(rec, onSelect));
}
