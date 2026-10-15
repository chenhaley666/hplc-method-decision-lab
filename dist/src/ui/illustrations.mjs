// illustrations.mjs — explanatory SVG diagrams of HPLC modules. They are
// schematic teaching drawings made for this application, not photographs or
// drawings of any particular instrument model.
import { h, s, sourceList, table } from './dom.mjs';
import { cite } from '../presets/sources.mjs';

const BOX = (x, y, w, hh, label, sub, cls = 'mod') => [s('rect', { x, y, width: w, height: hh, rx: 6, class: cls }), s('text', { x: x + w / 2, y: y + hh / 2 - (sub ? 4 : -4), 'text-anchor': 'middle', class: 'mlab' }, label), sub ? s('text', { x: x + w / 2, y: y + hh / 2 + 12, 'text-anchor': 'middle', class: 'msub' }, sub) : null];
const ARROW = (x1, y1, x2, y2, cls = 'flow') => s('line', { x1, y1, x2, y2, class: cls, 'marker-end': 'url(#arr)' });
const DEFS = () => s('defs', {}, s('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, s('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrowhead' })));
const NOTE = 'Schematic explanatory diagram drawn for this application — not a photograph or drawing of any particular instrument model.';

function svgFrame(w, hh, kids, label) { return s('svg', { viewBox: `0 0 ${w} ${hh}`, class: 'illus', role: 'img', 'aria-label': label }, DEFS(), ...kids); }

export const ILLUSTRATIONS = [
  { id: 'flow', title: 'Flow path of an HPLC system',
    draw: () => svgFrame(900, 210, [
      ...BOX(10, 20, 110, 50, 'Solvent bottles', 'A, B (C, D)'), ...BOX(10, 120, 110, 50, 'Degasser', 'dissolved gas out'),
      ...BOX(170, 120, 110, 50, 'Pump', 'flow, %B'), ...BOX(330, 120, 120, 50, 'Injector', 'sample enters'),
      s('rect', { x: 490, y: 105, width: 170, height: 80, rx: 8, class: 'oven' }), s('text', { x: 575, y: 120, 'text-anchor': 'middle', class: 'msub' }, 'column oven (temperature)'),
      ...BOX(505, 130, 140, 40, 'Column', 'separation'), ...BOX(700, 120, 100, 50, 'Detector', 'signal out'), ...BOX(830, 120, 60, 50, 'Waste'),
      ARROW(65, 70, 65, 118), ARROW(120, 145, 168, 145), ARROW(280, 145, 328, 145), ARROW(450, 145, 503, 145), ARROW(645, 150, 698, 150), ARROW(800, 145, 828, 145),
      ARROW(390, 70, 390, 118, 'side'), s('text', { x: 395, y: 62, class: 'msub' }, 'sample (syringe or needle)'),
      ARROW(750, 118, 750, 70, 'side'), s('text', { x: 700, y: 62, class: 'msub' }, 'signal → data system'),
      s('text', { x: 180, y: 200, class: 'msub' }, 'Solid arrows: mobile phase, one direction only. Broken arrows: sample in, signal out.')], 'HPLC flow path'),
    fn: 'Mobile phase travels one way from the bottles through every module to waste. The sample joins at the injector; the signal leaves at the detector. The order is fixed: degassing must precede the pump, the injector needs flowing liquid, and the detector reads the outcome of the separation.',
    params: [['Flow rate', 'mL/min', 'pump (software)'], ['%B', '%', 'pump (software)'], ['Injection volume', 'µL', 'loop (manual) or software (autosampler)'], ['Column temperature', '°C', 'oven (software)'], ['Wavelength', 'nm', 'detector (software)']],
    relevance: { retention: '%B, solvent and temperature set how long compounds are held.', selectivity: 'Solvent type, temperature and the column ligand change peak spacing.', efficiency: 'Flow rate, particle size and column length set peak width (FC2).' },
    sources: [cite('EQ-DB', '§1.5–1.6, Figure 1.1'), cite('EQ-LAB', 'slides 13–18, 40–41 and notes')] },
  { id: 'pump', title: 'Pumps and solvent mixing',
    draw: () => svgFrame(900, 260, [
      s('text', { x: 20, y: 18, class: 'mlab' }, 'Mixing BEFORE the pump (quaternary, low-pressure gradient)'),
      ...['A', 'B', 'C', 'D'].flatMap((l, i) => BOX(20, 30 + i * 52, 40, 40, l)),
      ...BOX(110, 70, 120, 90, 'Proportioning', 'valve (time-shared)'), ...BOX(260, 80, 120, 70, 'One pump', 'two heads'),
      ...[0, 1, 2, 3].map(i => ARROW(60, 50 + i * 52, 108, 115)), ARROW(230, 115, 258, 115), ARROW(380, 115, 420, 115), s('text', { x: 385, y: 105, class: 'msub' }, 'to injector'),
      s('text', { x: 480, y: 18, class: 'mlab' }, 'Mixing AFTER the pumps (binary, high-pressure gradient)'),
      ...BOX(480, 40, 40, 40, 'A'), ...BOX(480, 150, 40, 40, 'B'), ...BOX(560, 35, 110, 50, 'Pump A', 'two heads'), ...BOX(560, 145, 110, 50, 'Pump B', 'two heads'),
      ...BOX(720, 90, 80, 50, 'Mixer'), ARROW(520, 60, 558, 60), ARROW(520, 170, 558, 170), ARROW(670, 60, 718, 105), ARROW(670, 170, 718, 125), ARROW(800, 115, 860, 115),
      s('text', { x: 20, y: 236, class: 'msub' }, 'Each pump head: a piston driven by an off-centre cam; inlet and outlet check valves (ruby/sapphire) open and close with the pressure.'),
      s('text', { x: 20, y: 252, class: 'msub' }, 'Two heads working out of step give a near-continuous flow. Counting pumps and counting heads are not the same thing.')], 'pump and mixing arrangements'),
    fn: 'The pump delivers a constant flow against the column\'s resistance and sets the composition. With a proportioning valve one pump draws up to four lines in timed slugs; with two pumps each delivers one solvent and the streams meet under pressure.',
    params: [['Flow rate', 'mL/min', 'software'], ['%B (composition)', '%', 'software'], ['Back-pressure', 'psi', 'RESPONSE — built by the system, not set; the value entered is a safety cut-off']],
    relevance: { retention: '%B is the main retention lever.', selectivity: 'Composition can change spacing because compound lines are not parallel.', efficiency: 'Flow affects peak width; pressure rises with flow.' },
    sources: [cite('EQ-DB', '§3.2–3.6'), cite('PUMPS', 'slides 3–14'), cite('EQ-LAB', 'slides 29–36 and notes'), cite('RET-ED', 'slide 16')] },
  { id: 'injector', title: 'Manual injector and autosampler',
    draw: () => svgFrame(900, 250, ['LOAD', 'INJECT'].flatMap((pos, k) => {
      const cx = 200 + k * 430, cy = 120, R = 62;
      // port roles: loop between the opposite ports 0 and 3 (standard six-port arrangement)
      const roles = ['loop', 'sample in', 'waste', 'loop', 'from pump', 'to column'];
      const ports = [0, 1, 2, 3, 4, 5].map(i => [cx + R * Math.cos(-Math.PI / 2 + i * Math.PI / 3), cy + R * Math.sin(-Math.PI / 2 + i * Math.PI / 3)]);
      const pairs = pos === 'LOAD' ? [[0, 1], [2, 3], [4, 5]] : [[1, 2], [3, 4], [5, 0]];
      return [s('circle', { cx, cy, r: 78, class: 'stator' }), s('text', { x: cx, y: 22, 'text-anchor': 'middle', class: 'mlab' }, `${pos} position`),
        ...pairs.map(([a, b]) => s('line', { x1: ports[a][0], y1: ports[a][1], x2: ports[b][0], y2: ports[b][1], class: 'groove' })),
        s('path', { d: `M${ports[0][0]},${ports[0][1]} C ${cx + 40},${cy - 140} ${cx + 230},${cy - 60} ${cx + 180},${cy} S ${cx + 40},${cy + 140} ${ports[3][0]},${ports[3][1]}`, class: 'loop' }),
        ...ports.map((p, i) => s('circle', { cx: p[0], cy: p[1], r: 7, class: 'port' })),
        ...ports.map((p, i) => i === 0 || i === 3 ? null : s('text', { x: cx + (p[0] - cx) * 1.55, y: cy + (p[1] - cy) * 1.45 + 4, 'text-anchor': 'middle', class: 'msub' }, roles[i])),
        s('text', { x: cx + 188, y: cy + 4, class: 'msub' }, 'sample loop'),
        s('text', { x: cx - 170, y: 240, class: 'msub' }, pos === 'LOAD' ? 'Pump → column directly. Sample fills the loop; excess goes to waste.' : 'Pump → loop → column: the mobile phase sweeps the sample onto the column.')];
    }), 'six-port injection valve, load and inject positions'),
    fn: 'Both injector types use the same rotor and stator with six ports. In LOAD the loop is filled while flow continues to the column; in INJECT the mobile phase sweeps the loop contents onto the column. A manual injector is turned by a lever and injects the loop volume; an autosampler turns automatically and meters a programmed volume.',
    params: [['Injection volume (manual)', 'µL', 'hardware — the loop fitted'], ['Injection volume (autosampler)', 'µL', 'software'], ['Time zero', 'min', 'the moment of injection']],
    relevance: { retention: 'None directly.', selectivity: 'None.', efficiency: 'Overloading or a slow lever turn can broaden peaks.' },
    sources: [cite('EQ-DB', '§4.2–4.9'), cite('INJ', 'slides 3–8'), cite('EQ-LAB', 'slides 29, 68–69 and notes')] },
  { id: 'column', title: 'Column structure and stationary phase',
    draw: () => svgFrame(900, 250, [
      s('rect', { x: 20, y: 60, width: 300, height: 50, rx: 10, class: 'tube' }), s('rect', { x: 20, y: 60, width: 12, height: 50, class: 'frit' }), s('rect', { x: 308, y: 60, width: 12, height: 50, class: 'frit' }),
      ...Array.from({ length: 60 }, (_, i) => s('circle', { cx: 40 + (i % 20) * 13.5, cy: 70 + Math.floor(i / 20) * 15, r: 6, class: 'bead' })),
      ARROW(5, 85, 18, 85), s('text', { x: 20, y: 50, class: 'msub' }, 'flow direction (arrow on the label); inlet and outlet frits'),
      s('text', { x: 20, y: 135, class: 'msub' }, 'L = length (mm), ID = internal diameter (mm), dp = particle size (µm)'),
      s('circle', { cx: 450, cy: 90, r: 55, class: 'bead' }), ...Array.from({ length: 10 }, (_, i) => s('line', { x1: 450 + 15 * Math.cos(i), y1: 90 + 15 * Math.sin(i), x2: 450 + 50 * Math.cos(i), y2: 90 + 50 * Math.sin(i), class: 'pore' })),
      s('text', { x: 400, y: 165, class: 'msub' }, 'fully porous particle (pores)'),
      s('circle', { cx: 600, cy: 90, r: 55, class: 'bead' }), s('circle', { cx: 600, cy: 90, r: 38, class: 'core' }), s('text', { x: 545, y: 165, class: 'msub' }, 'superficially porous'), s('text', { x: 570, y: 181, class: 'msub' }, '(solid core)'),
      s('line', { x1: 680, y1: 200, x2: 880, y2: 200, class: 'surface' }),
      ...[700, 740, 800, 860].map(x => s('path', { d: `M${x},200 l0,-12 l6,-8 l-6,-8 l6,-8 l-6,-8 l6,-8`, class: 'ligand' })),
      ...[720, 770, 830].map(x => s('text', { x, y: 215, class: 'msub' }, 'SiOH')),
      s('text', { x: 680, y: 120, class: 'msub' }, 'pore wall: bonded ligands'), s('text', { x: 680, y: 135, class: 'msub' }, 'and free silanols (some end-capped)')], 'column, particles and bonded surface'),
    fn: 'The column is a steel tube packed with porous particles. Almost all the surface is inside the pores (e.g. about 150 m²/g for one documented column). The bonded ligand and the unreacted silanols decide how compounds interact. A column PRODUCT MODEL (datasheet values) is not a PHYSICAL COLUMN (its serial number and history).',
    params: [['Ligand / stationary-phase category', '—', 'choice of column'], ['Length × ID', 'mm', 'column hardware'], ['Particle size', 'µm', 'column hardware'], ['Pore size', 'Å', 'datasheet'], ['Carbon load', '% (mass)', 'datasheet'], ['Limits: temperature, pressure, pH', '°C, psi, pH', 'datasheet of THIS column model only']],
    relevance: { retention: 'Ligand, carbon load and surface area set how strongly compounds are held.', selectivity: 'Changing the ligand changes interactions unpredictably — the last selectivity lever.', efficiency: 'Particle size, particle type (SPP) and length set peak width (FC2).' },
    sources: [cite('EQ-ED', 'slides 19–25 and notes'), cite('EQ-LAB', 'slides 21–26 and notes'), cite('RET-COL', 'slides 3–8 and notes'), cite('SEL-DB', '§2.7')] },
  { id: 'detector', title: 'UV and PDA detectors',
    draw: () => svgFrame(900, 180, [
      ...BOX(20, 60, 120, 60, 'Lamp', 'UV light'), s('rect', { x: 230, y: 50, width: 160, height: 80, rx: 8, class: 'cell' }), s('text', { x: 310, y: 95, 'text-anchor': 'middle', class: 'mlab' }, 'flow cell'),
      ...BOX(480, 60, 140, 60, 'Sensor', 'one λ (UV) or all λ (PDA)'), ARROW(140, 90, 228, 90, 'light'), ARROW(390, 90, 478, 90, 'light'),
      ARROW(310, 20, 310, 48), s('text', { x: 320, y: 30, class: 'msub' }, 'column effluent'), ARROW(310, 132, 310, 165), s('text', { x: 320, y: 160, class: 'msub' }, 'to waste'),
      s('text', { x: 650, y: 80, class: 'msub' }, 'absorbance ↑ when a compound'), s('text', { x: 650, y: 96, class: 'msub' }, 'passes → peak in mAU')], 'detector flow cell'),
    fn: 'The detector measures how much light the liquid in the flow cell absorbs. A UV detector records one chosen wavelength; a PDA records wavelengths across its acquisition range. The detector does not affect separation. Peak count is the count of observed UV peaks at the selected wavelength, not proof of the number of compounds present: nonabsorbing compounds can be invisible and several absorbing compounds may coelute in one peak.',
    params: [['Detection wavelength', 'nm', 'software'], ['Signal', 'mAU', 'response']],
    relevance: { retention: 'None.', selectivity: 'None — changes which compounds are seen, not separation.', efficiency: 'None.' },
    sources: [cite('EQ-DB', '§5.1–5.5 (detector principle and UV/PDA distinction)'), cite('EQ-ED', 'slides 39–42 and notes (signal units, wavelength and compound-dependent absorbance; not a detector model specification)')] },
  { id: 'mobile', title: 'Mobile phase',
    draw: () => svgFrame(900, 170, [
      ...BOX(20, 20, 90, 60, 'Line A', 'aqueous'), ...BOX(130, 20, 90, 60, 'Line B', 'organic'), ...BOX(240, 20, 90, 60, 'Line C', 'organic'),
      s('rect', { x: 400, y: 30, width: 450, height: 36, class: 'bar-a' }), s('rect', { x: 400, y: 30, width: 450 * 0.45, height: 36, class: 'bar-b' }),
      s('text', { x: 410, y: 54, class: 'mlab' }, '45 % B (organic)'), s('text', { x: 700, y: 54, class: 'mlab' }, '55 % aqueous'),
      s('text', { x: 20, y: 110, class: 'msub' }, '%B alone does not name the solvent: 45 % ACN and 45 % MeOH are different mobile phases. Additives (e.g. formic acid) and pH must be recorded with their units.'),
      s('text', { x: 20, y: 130, class: 'msub' }, 'BPS2032 example convention: B/C/D are organic lines. Verify your configured bottles; 100 % B delivers whatever is in line B.')], 'mobile phase composition'),
    fn: 'The mobile phase is water mixed with an organic solvent; its composition is given as %B plus the solvent identity. Solvents are prepared at the bench (identity, additive, pH); %B and isocratic/gradient mode are set at the pump.',
    params: [['Organic solvent identity', '—', 'bench'], ['Additive and concentration', 'e.g. % v/v', 'bench'], ['pH', '—', 'bench'], ['%B', '%', 'software'], ['ISO / GRA', '—', 'software']],
    relevance: { retention: 'Lower %B → longer retention.', selectivity: 'Changing ACN ↔ MeOH moves compounds by different amounts; pH changes ionisation.', efficiency: 'Viscosity affects pressure and diffusion.' },
    sources: [cite('EQ-DB', '§2.2–2.4'), cite('EQ-LAB', 'slides 41, 59 and notes'), cite('SEL-DB', '§2.4–2.5')] },
];

export function illustrationCard(il) {
  return h('article', { class: 'card illus-card', 'data-testid': `illus-${il.id}` }, h('h4', il.title), il.draw(), h('p', { class: 'tiny' }, NOTE),
    h('details', { class: 'diagram-enlarge', 'data-testid': `enlarge-${il.id}` },
      h('summary', `Enlarge diagram — ${il.title}`),
      h('p', { class: 'small', id: `diagram-help-${il.id}` }, 'Full-size labels. Swipe or scroll horizontally within the diagram; keyboard users can focus the diagram and use the arrow keys.'),
      h('div', { class: 'diagram-viewport', tabindex: '0', role: 'region', 'aria-label': `Enlarged ${il.title}`, 'aria-describedby': `diagram-help-${il.id}`, 'data-testid': `enlarged-pane-${il.id}` }, il.draw())),
    h('p', h('strong', 'Function. '), il.fn),
    table(['Controlled parameter', 'Unit', 'Where it is controlled'], il.params.map(p => h('tr', p.map(x => h('td', x))))),
    h('ul', { class: 'small' }, h('li', h('strong', 'Retention: '), il.relevance.retention), h('li', h('strong', 'Selectivity: '), il.relevance.selectivity), h('li', h('strong', 'Efficiency: '), il.relevance.efficiency)),
    sourceList(il.sources));
}
