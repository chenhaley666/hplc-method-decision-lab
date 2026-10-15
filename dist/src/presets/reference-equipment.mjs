// presets/reference-equipment.mjs — instruments and column models DOCUMENTED in
// the supplied materials, offered as source-labelled REFERENCE EXAMPLES.
//
// These are not a catalogue of all HPLC models. Every field is either taken
// from a named source, explicitly user-confirmed, or left null (unknown).
// Copying a reference creates configuration with provenance "reference:<id>";
// it does not establish which physical instrument or column produced a run.
import { cite } from './sources.mjs';

const U = null; // unknown / not documented

export const FLEET_CONFIRMATION = {
  confirmedAt: '2026-10-11', confirmedBy: 'Chenchen Lin',
  scope: 'User-confirmed local six-instrument fleet, not a universal or independently manufacturer-verified rating',
  maximaPsi: { 1: 6000, 2: 6000, 3: 10000, 4: 6000, 5: 6000, 6: 6000 },
  source: cite('USER-FLEET', 'explicit confirmation on 2026-10-11: HPLC 1, 2, 4, 5, 6 maximum 6000 psi; HPLC 3 is UHPLC, maximum 10000 psi'),
};

// The screenshot demonstrates a method software setting, not the hardware's
// capability. The same setting is prescribed in the course memos. It is only
// reference metadata; it is never included in instrument.limits, applied to a
// run or written into an existing session's configurable method specification.
const methodSetting = () => ({
  value: 4000, unit: 'psi', referenceOnly: true,
  source: cite('METHOD-SCREENSHOT', 'Method Editor → Pump → Pressure limits → Maximum 4000 psi'),
  sources: [cite('RET-MEMO', '§3 chromatographic conditions: upper pressure limit 4000 psi'), cite('SEL-MEMO', '§4 chromatographic conditions: upper pressure limit 4000 psi')],
  note: 'Shown method software pressure cut-off: 4000 psi, not a hardware rating and not confirmation of the active software setting on every instrument. The course measured-pressure acceptance is a separate configurable comparison.',
});

const localInstrument = (n, fields) => ({
  ...fields, refId: `ref-monas-hplc-${n}`, fleetNumber: n,
  label: `MonasHPLC local fleet — HPLC ${n}${n === 3 ? ' (UHPLC)' : ''} — ${fields.description}`,
  instrumentClass: n === 3 ? 'UHPLC' : 'HPLC', identifier: U,
  pump:{...fields.pump,type:n===3?'binary-hpg':'quaternary-lpg'},
  mixing:n===3?'after-pumps (high-pressure mixing)':'before-pump (proportioning valve)',
  limits: [{ quantity: 'pressure', value: FLEET_CONFIRMATION.maximaPsi[n], op: '<=', unit: 'psi',
    basis: `User-confirmed local hardware maximum for HPLC ${n}, ${FLEET_CONFIRMATION.maximaPsi[n]} psi, confirmed by Chenchen Lin on 2026-10-11; not independently verified against a manufacturer datasheet. This is not the course method acceptance or the software cut-off.`,
    source: cite('USER-FLEET', `HPLC ${n} maximum ${FLEET_CONFIRMATION.maximaPsi[n]} psi, explicitly confirmed 2026-10-11`) }],
  methodPressureSetting: methodSetting(),
  sources: [...fields.sources, FLEET_CONFIRMATION.source,cite('USER-PUMP',`HPLC ${n}: ${n===3?'binary high-pressure gradient':'quaternary low-pressure gradient'}; user-confirmed local configuration, not a universal model rating`)],
  note: `${fields.note || ''}${fields.note ? ' ' : ''}Selecting this local fleet reference does not associate it with any run; record and confirm the actual instrument allocation separately. Its hardware pressure rating does not supply any column rating.`,
});

const MANUAL_MODULAR = {
    description: 'modular, manual injector',
    manufacturer: 'Shimadzu', systemModel: 'Modular HPLC system', identifier: U,
    pump: { model: 'LC-40D XR', type: 'quaternary-lpg' }, mixing: 'before-pump (proportioning valve)',
    degasser: { fitted: true, model: 'DGU-405' }, injector: { kind: 'manual', model: 'Manual six-port injector', loopUl: U },
    oven: { fitted: true, model: 'CTO-40S' }, detector: { type: 'UV-Vis', model: 'SPD-40' },
    sources: [cite('EQ-LAB', 'slides 18, 28–30 and notes; slide 13 notes ("Shimadzu systems we have here in Australia")'), cite('RET-ED', 'slide 16 (quaternary low-pressure gradient, manual injector)'), cite('SOP', '§7.1.2 Table 7.2 (module models)')],
    conflicts: ['GR40 SOP §7.1.2 lists the pump as LC-40D XR; SOP Fig 8.3.1-3 shows an LC-40AD pump on HPLC 5. Confirm on the instrument label.',
      'The SOP gives one system number (3-00779) for three instruments; it cannot identify an individual instrument and is not copied.',
      'Equipment LAB slide 13 notes say a quaternary valve is fitted "in some machines like HPLC 2 and HPLC 4"; slides 18 and 30 say HPLC 1, 2 and 5 all have one.'],
    note: 'Loop volume is hardware on a manual injector (EQUIPMENT Discovery Book §4.6). The teaching method injects 20 µL, but the loop actually fitted must be confirmed.',
};

export const LOCAL_INSTRUMENT_FLEET = [
  localInstrument(1, MANUAL_MODULAR),
  localInstrument(2, MANUAL_MODULAR),
  localInstrument(3, {
    description: 'binary, autosampler',
    manufacturer: 'Shimadzu', systemModel: U, identifier: U,
    pump: { model: U, type: 'binary-hpg' }, mixing: 'after-pumps (high-pressure mixing)',
    degasser: { fitted: true, model: U }, injector: { kind: 'autosampler', model: U, loopUl: U },
    oven: { fitted: true, model: U }, detector: { type: 'PDA', model: U },
    sources: [cite('RET-ED', 'slide 16 (binary, high pressure gradient, autosampler)'), cite('EQ-LAB', 'slides 16, 30 and notes (two pumps, UPLC); slide 55 notes (UPLC, autosampler, binary pumps, PDA)'),cite('EFF-ARCHIVE','GR37 Cycle 3, PDF p. 52: labelled HPLC 3 photograph and diagram')],
    conflicts: ['Equipment LAB slide 16 notes say "UV or PDA detector" for HPLC 3; slide 55 notes say PDA.'],
    note: 'The course architecture shows binary pumps, autosampler and PDA. Exact fitted module models and operating bounds require checking on the instrument you will use. Historical class-group allocations are not user equipment declarations.',
  }),
  localInstrument(4, {
    description: 'integrated system',
    manufacturer: 'Shimadzu', systemModel: 'LC-2030C NT Integrated HPLC System', identifier: U,
    pump: { model: U, type: 'quaternary-lpg' }, mixing: 'before-pump (proportioning valve)',
    degasser: { fitted: true, model: 'integrated' }, injector: { kind: 'autosampler', model: U, loopUl: U },
    oven: { fitted: true, model: 'integrated' }, detector: { type: 'UV', model: U },
    sources: [cite('EQ-LAB', 'slide 30 and notes ("integrated: the degasser, pump and quaternary valve are all in the same module")'), cite('SOP', '§7.1.1 Table 7.1')],
    conflicts: [],
    note: 'The user confirmed HPLC4 is quaternary low-pressure gradient on 2026-10-12. Older GR40 SOP §7.1.1 described a binary pump; that historical written difference is retained here but no longer governs this user-confirmed local fleet configuration. Exact pump module model remains unrecorded.',
  }),
  localInstrument(5, MANUAL_MODULAR),
  localInstrument(6, {
    description: 'modular, autosampler',
    manufacturer: 'Shimadzu', systemModel: 'Modular HPLC system', identifier: '3-01205',
    pump: { model: 'LC-20AD', type: 'quaternary-lpg' }, mixing: 'before-pump (proportioning valve)',
    degasser: { fitted: true, model: 'DGU-405' }, injector: { kind: 'autosampler', model: 'SIL-20AC', loopUl: U },
    oven: { fitted: true, model: 'CTO-40S' }, detector: { type: 'UV-Vis', model: 'SPD-40V' },
    sources: [cite('RET-ED', 'slide 16 (quaternary low-pressure gradient, autosampler)'), cite('EQ-LAB', 'slide 17 and notes'), cite('SOP', '§7.1.3 Table 7.3 (module models, system number 3-01205, CBM-20A controller)')],
    conflicts: [], note: 'System number from a team SOP; confirm on the instrument label.',
  }),
];

export const REFERENCE_INSTRUMENTS = [
  ...LOCAL_INSTRUMENT_FLEET,
  {
    refId: 'ref-agilent-11xx', label: 'Agilent 1100/1200/1260 series (described for the Malaysia campus)',
    manufacturer: 'Agilent', systemModel: '1100, 1200 or 1260 series', identifier: U,
    pump: { model: 'G1311A (quaternary) or similar', type: U }, mixing: U,
    degasser: { fitted: true, model: U }, injector: { kind: 'autosampler', model: 'G1329A (ALS)', loopUl: U },
    oven: { fitted: true, model: 'TCC (thermostatted column compartment)' }, detector: { type: 'VWD or DAD/PDA', model: U },
    limits: [], sources: [cite('EQ-LAB', 'slide 13 speaker notes (Malaysian version)')], conflicts: [],
    note: 'Generic description from speaker notes; individual configurations vary.',
  },
];

export const REFERENCE_COLUMN_MODELS = [
  {
    refId: 'ref-pinnacle-db-c18', manufacturer: 'Restek', product: 'Pinnacle DB C18', uspL: 'L1',
    ligand: 'C18 (octadecylsilane), monomeric', lengthMm: 150, idMm: 4.6, particleUm: 5, particleType: 'fully porous',
    poreA: 140, carbonPct: 11, surfaceM2g: 150, endcapped: true,
    limits: { tMaxC: 80, pMax: U, pMaxUnit: 'psi', pH: [2.5, 8] },
    datasheetRef: 'Restek 9414565 — https://www.restek.com/p/9414565 (checked 2026-10-12)',
    sources: [cite('RESTEK-C18','exact 150 × 4.6 mm, 5 µm product; chemistry and operating pH/temperature'),cite('EQ-ED', 'slide 19 and notes; slide 16 (150 × 4.6 × 5)'), cite('EQ-LAB', 'slides 21–26 and notes')],
    note: 'These limits belong to THIS column model only. They are never applied to another stationary phase.',
  },
  {
    refId: 'ref-pinnacle-db-c8', manufacturer: 'Restek', product: 'Pinnacle DB C8', uspL: 'L7',
    ligand: 'C8 (octylsilane), monomeric', lengthMm: 150, idMm: 4.6, particleUm: 5, particleType: 'fully porous',
    poreA: 140, carbonPct: 6, surfaceM2g: 150, endcapped: true,
    limits: { tMaxC: 80, pMax: U, pMaxUnit: 'psi', pH: [2.5, 8] },
    datasheetRef: 'Restek product 9413565, Pinnacle DB C8 5 µm, 150 × 4.6 mm — https://www.restek.com/p/9413565 (checked 2026-10-11)',
    sources: [cite('RESTEK-C8', 'product 9413565: exact 5 µm, 150 × 4.6 mm specification and product-family overview'), cite('EQ-MEMO', '§4 supplied-column table: Pinnacle DB C8, L7, 150 × 4.6 mm with 5 µm particles')],
    note: 'Exact-size manufacturer product reference, not evidence that this catalogue item or any particular physical column was used in a run. Maximum pressure is not stated on the checked product page and remains unknown; the instrument rating is not substituted.',
  },
  {
    refId: 'ref-pinnacle-db-pfpp', manufacturer: 'Restek', product: 'Pinnacle DB PFPP (family reference; course geometry)', uspL: 'L43',
    ligand: 'Pentafluorophenyl propyl (PFPP)', lengthMm: 150, idMm: 4.6, particleUm: 5, particleType: 'fully porous',
    poreA: 140, carbonPct: 6, surfaceM2g: 150, endcapped: true,
    limits: { tMaxC: 80, pMax: U, pMaxUnit: 'psi', pH: [2.5, 8] },
    datasheetRef: 'Restek Pinnacle DB PFPP family overview — https://www.restek.com/p/9419362 (checked 2026-10-11); linked SKU is 3 µm, 150 × 2.1 mm, NOT the course 5 µm, 150 × 4.6 mm geometry; exact-size SKU not verified',
    sources: [cite('RESTEK-PFPP', 'Pinnacle DB PFPP family overview: L43, fully porous base-deactivated spherical silica, 140 Å, 6% carbon, 150 m²/g, endcapped, pH 2.5–8, max 80 °C; linked SKU has different dimensions'), cite('EQ-MEMO', '§4 supplied-column table: PFPP L43, 150 × 4.6 mm with 5 µm particles'), cite('SOP', '§7.2')],
    note: 'Mixed sources are explicit: geometry is from the course column fleet, while chemistry and temperature/pH values are from the manufacturer\'s PFPP FAMILY overview, not a C18 datasheet. The linked product is 3 µm, 150 × 2.1 mm; it does not verify the exact-size SKU or any physical-column association. Maximum pressure remains unknown; no 400 bar value from another Restek family and no instrument rating is borrowed. Confirm the actual product/column label before applying this reference to a run.',
  },
  {
    refId:'ref-pinnacle-db-c18aq',manufacturer:'Restek',product:'Pinnacle DB Aqueous C18',uspL:'L1',
    ligand:'Proprietary polar-modified, functionally bonded C18',lengthMm:150,idMm:4.6,particleUm:5,particleType:'fully porous',
    poreA:140,carbonPct:6,surfaceM2g:150,endcapped:false,
    limits:{tMaxC:80,pMax:U,pMaxUnit:'psi',pH:[2.5,8]},
    datasheetRef:'Restek 9418565 — https://www.restek.com/p/9418565 (checked 2026-10-12)',
    sources:[cite('RESTEK-C18AQ','product specification and chemistry'),cite('EQ-MEMO','§4 course column fleet')],
    note:'Compatible with highly aqueous mobile phases, including 100% aqueous. Polar selectivity differs from conventional C18. Maximum pressure is not published on the checked page; no instrument rating is borrowed.',
  },
  {
    refId:'ref-pinnacle-db-biphenyl',manufacturer:'Restek',product:'Pinnacle DB Biphenyl',uspL:'L11',
    ligand:'Biphenyl',lengthMm:150,idMm:4.6,particleUm:5,particleType:'fully porous',poreA:140,carbonPct:8,surfaceM2g:150,endcapped:true,
    limits:{tMaxC:80,pMax:U,pMaxUnit:'psi',pH:[2.5,8]},
    datasheetRef:'Restek 9409565 — https://www.restek.com/p/9409565 (checked 2026-10-12)',
    sources:[cite('RESTEK-BIPHENYL','product specification and chemistry'),cite('EQ-MEMO','§4 course column fleet')],
    note:'Aromatic interactions can change retention/selectivity, especially for unsaturated or conjugated analytes. MeOH and ACN may give different selectivity. Pressure not published on the checked product page.',
  },
  {
    refId:'ref-ultra-ibd',manufacturer:'Restek',product:'Ultra IBD',uspL:'L68',
    ligand:'Proprietary polar-functional embedded alkyl',lengthMm:150,idMm:4.6,particleUm:5,particleType:'fully porous',poreA:100,carbonPct:12,surfaceM2g:300,endcapped:false,
    limits:{tMaxC:80,pMax:U,pMaxUnit:'psi',pH:[2.5,8]},
    datasheetRef:'Restek 9175565 — https://www.restek.com/p/9175565 (checked 2026-10-12)',
    sources:[cite('RESTEK-IBD','product specification and chemistry'),cite('EQ-MEMO','§4 course column fleet')],
    note:'Polar-embedded phase with hydrogen-bonding interactions. Supports highly aqueous phases and different separation modes. Ultra is a product/bead family, not the ligand. Do not copy Pinnacle pore size or surface area onto Ultra IBD. Pressure not published on the checked product page.',
  },
];

// The column fleet as described in Equipment ED slide 22 notes: six instruments,
// six ligands, all 5 µm, 150 mm, 4.6 mm. Bead/product names are not given there.
export const FLEET_NOTE = {
  text: 'The Equipment memo §4 names six supplied column products — Pinnacle DB C18, C8, C18aq, PFPP, Biphenyl and Ultra IBD — all 5 µm, 150 mm, 4.6 mm ID. It does not allocate them to individual instruments: each actual pairing must be recorded and confirmed separately. Optional manufacturer reference data are source-labelled and never copied automatically from a filename. Local instrument hardware maxima were user-confirmed on 2026-10-11: HPLC 1, 2, 4, 5, 6 at 6000 psi; HPLC 3 (UHPLC) at 10000 psi. These maxima neither define column limits nor replace measured method acceptance < 4000 psi or the separate 4000 psi software cut-off.',
  source: cite('EQ-MEMO', '§4 supplied-column table and allocation requirement'),
};
