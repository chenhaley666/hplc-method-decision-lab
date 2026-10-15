// sources.mjs — the documents this application cites. Citations elsewhere refer
// to these ids so every rule can show where it came from.
//
// kind:
//   course   — BPS2032 teaching material (defines the teaching workflow)
//   rubric   — FC1 assessment rubric (defines the assessed workflow)
//   project  — the user's own project records (examples and history only)
//   general  — general scientific background
//   user     — an explicit user confirmation; not independent verification
export const SOURCES = {
  'EFF-ARCHIVE':{kind:'project',title:'2026_10_14_notebook_11535.pdf — class Efficiency LabArchives export; GR37 section',sha256:'108618023f873b508678ef1dd7ee86ba0ec97bb87e53d0e3c0fe2b44766957e7'},
  'SHIMADZU-MODULES':{kind:'manufacturer',title:'Shimadzu Fundamentals of HPLC: Apparatus constituting HPLC, LAAN-E-LC215 (checked 2026-10-12)',url:'https://www.shimadzu.com/an/sites/shimadzu.com.an/files/pim/pim_document_file/technical/primers/14145/laan-e-lc215-3-1.pdf'},
  'SHIMADZU-2030':{kind:'manufacturer',title:'Shimadzu LC-2030C NT specifications (checked 2026-10-12; model reference, not confirmation of fitted configuration)',url:'https://www.shimadzu.com/an/products/liquid-chromatography/hplcuhplc/lc-2030c-nt/spec.html'},
  'RESTEK-C18':{kind:'manufacturer',title:'Restek Pinnacle DB C18 9414565 (checked 2026-10-12)',url:'https://www.restek.com/p/9414565'},
  'RESTEK-C18AQ':{kind:'manufacturer',title:'Restek Pinnacle DB Aqueous C18 9418565 (checked 2026-10-12)',url:'https://www.restek.com/p/9418565'},
  'RESTEK-BIPHENYL':{kind:'manufacturer',title:'Restek Pinnacle DB Biphenyl 9409565 (checked 2026-10-12)',url:'https://www.restek.com/p/9409565'},
  'RESTEK-IBD':{kind:'manufacturer',title:'Restek Ultra IBD 9175565 (checked 2026-10-12)',url:'https://www.restek.com/p/9175565'},
  'EQ-DB': { kind: 'course', title: 'EQUIPMENT Discovery Book (MonashELMS1)' },
  'RET-DB': { kind: 'course', title: 'RETENTION Discovery Book (MonashELMS1)' },
  'SEL-DB': { kind: 'course', title: 'SELECTIVITY Discovery Book' },
  'RES-DB': { kind: 'course', title: 'RESOLUTION Discovery Book (MonashELMS1)' },
  'EQ-ED': { kind: 'course', title: '2026 CYCLE 0 EQUIPMENT 2 ED (with feedback) deck, incl. speaker notes' },
  'EQ-LAB': { kind: 'course', title: '2026 CYCLE 0 EQUIPMENT 3 LAB (with feedback) deck, incl. speaker notes' },
  'PUMPS': { kind: 'course', title: '2021 CYCLE 0 EQUIPMENT 0 PUMPS slides' },
  'INJ': { kind: 'course', title: '2021 CYCLE 0 EQUIPMENT 0 INJECTORS slides' },
  'RET-ED': { kind: 'course', title: '2026 CYCLE 1 RETENTION 2 ED (with feedback) deck' },
  'RET-COL': { kind: 'course', title: '2026 CYCLE 1 RETENTION 3b HPLC & COLUMN deck' },
  'SEL-ED': { kind: 'course', title: '2026 CYCLE 2 SELECTIVITY 2 ED (with feedback) deck, incl. speaker notes' },
  'PROBLEM-MEMO': { kind: 'course', title: '2026 OVERARCHING PROBLEM — Lorenzo memo 000 (2026-TGA-MON-000)' },
  'EQ-MEMO': { kind: 'course', title: '2026 CYCLE 0 EQUIPMENT — Lorenzo memo 001 (2026-TGA-MON-001)',file:'2026-CYCLE_0-EQUIPMENT-Lorenzo-memo-001.docx',sha256:'3907b367d3d8c2d0724156b74d7e269c75d352407911550ef75a505a85695597' },
  'RET-MEMO': { kind: 'course', title: '2026 CYCLE 1 RETENTION — Lorenzo letter RET-260810 (2026-TGA-MON-002)',file:'2026-CYCLE_1-RETENTION-0-Lorenzo_letter_RET-260810.docx',sha256:'5ab747c8bc1806415a857826f3c7600900cdb4aed58ee341825fe9705ded184c' },
  'SEL-MEMO': { kind: 'course', title: '2026 CYCLE 2 SELECTIVITY — Lorenzo memo 003 (2026-TGA-MON-003)',file:'2026-CYCLE_2-SELECTIVITY-Lorenzo-memo-003_1 (1).docx',sha256:'27f252145ad8bc5e5e37adf17fb507b3b81a0a82d86bb6106e1ccb0ed07f9cac' },
  'USER-FLEET': { kind: 'user', title: 'Chenchen Lin — local six-instrument hardware pressure maxima explicitly confirmed 2026-10-11 (not independently manufacturer-verified)' },
  'USER-PUMP': {kind:'user',title:'Chenchen Lin — local pump configuration confirmed 2026-10-12: HPLC3 binary high-pressure gradient; HPLC1/2/4/5/6 quaternary low-pressure gradient'},
  'METHOD-SCREENSHOT': { kind: 'user', title: 'User-supplied Method Editor screenshot, 2026-10-11 18:24:42 — software pressure setting, not hardware rating' },
  'RESTEK-C8': { kind: 'manufacturer', title: 'Restek Pinnacle DB C8 product 9413565, 5 µm, 150 × 4.6 mm (checked 2026-10-11)', url: 'https://www.restek.com/p/9413565', checkedAt: '2026-10-11' },
  'RESTEK-PFPP': { kind: 'manufacturer', title: 'Restek Pinnacle DB PFPP family overview (checked 2026-10-11); linked product 9419362 is 3 µm, 150 × 2.1 mm, not the course geometry', url: 'https://www.restek.com/p/9419362', checkedAt: '2026-10-11' },
  'ARDENT-3': { kind: 'general', title: 'Ardent chapter 3 — HPLC hardware (background reading)' },
  'RUBRIC': { kind: 'rubric', title: 'FC1 rubric (screenshots supplied by the student)' },
  'FLOW': { kind: 'project', title: 'BPS2032 flow chart revised FINAL 2026-09-25 (student flow chart)' },
  'SOP': { kind: 'project', title: 'GR40 Team HPLC SOP v3, 21/09/2026 (team document)' },
  'NB': { kind: 'project', title: 'GR40 LabArchives notebook export 2026-10-08 (team record)' },
  'TOOL': { kind: 'tool', title: 'Tool default chosen for this application (not a course rule)' },
};

export function cite(id, loc) {
  const s = SOURCES[id];
  return { id, loc: loc || '', title: s ? s.title : id, kind: s ? s.kind : 'unknown', ...(s?.url ? { url: s.url, checkedAt: s.checkedAt } : {}),...(s?.sha256?{sha256:s.sha256}:{}),...(s?.file?{file:s.file}:{}) };
}
export function citeText(c) { return `${c.title}${c.loc ? ', ' + c.loc : ''}`; }
