// Generated from the unchanged STU_084 workbook by tools/audit_stu084_contract.py.
// Schema/provenance contract; the scaffold has no completed decision formulas.
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const TAGGED_TEMPLATE=freeze({
  "name": "HPLC_FC_STU_084.xlsx",
  "sha256": "c71e3170c358c9563be4389ea6009d938e8dad95277f081eb5c65949252cec3d",
  "tag": {
    "sheet": "SYS",
    "cell": "A1",
    "state": "veryHidden",
    "fingerprint": "de5f6d4ab1ca02d40a8462fd2cae42f33303f8b8effd239d541bbf12c05058e4",
    "originalValuePublished": false
  },
  "specs": [
    {
      "key": "peakCount",
      "cell": "C8",
      "label": "Target # Compounds / Peaks",
      "unit": "peaks"
    },
    {
      "key": "lastPeak",
      "cell": "C9",
      "label": "Run Time Spec (tR last ≤)",
      "unit": "min"
    },
    {
      "key": "minRs",
      "cell": "C10",
      "label": "Resolution Spec (R ≥)",
      "unit": "min R"
    },
    {
      "key": "pressure",
      "cell": "C11",
      "label": "Max Back-Pressure (BP ≤)",
      "unit": "psi"
    }
  ],
  "parameters": [
    {
      "key": "ligand",
      "cell": "C16",
      "label": "Ligand",
      "unit": ""
    },
    {
      "key": "bead",
      "cell": "C17",
      "label": "Bead type",
      "unit": ""
    },
    {
      "key": "pore",
      "cell": "C18",
      "label": "Pore size",
      "unit": "A"
    },
    {
      "key": "coreshell",
      "cell": "C19",
      "label": "Coreshell",
      "unit": ""
    },
    {
      "key": "carbon",
      "cell": "C20",
      "label": "C load",
      "unit": "%"
    },
    {
      "key": "length",
      "cell": "C21",
      "label": "Column Length (L)",
      "unit": "mm"
    },
    {
      "key": "diameter",
      "cell": "C22",
      "label": "Column Internal Diameter (ID)",
      "unit": "mm"
    },
    {
      "key": "particle",
      "cell": "C23",
      "label": "Particle Size (PS)",
      "unit": "µm"
    },
    {
      "key": "organic",
      "cell": "C24",
      "label": "Solvent",
      "unit": ""
    },
    {
      "key": "percentB",
      "cell": "C25",
      "label": "%B",
      "unit": "%"
    },
    {
      "key": "flow",
      "cell": "C26",
      "label": "Flow Rate (F)",
      "unit": "mL/min"
    },
    {
      "key": "concentration",
      "cell": "C27",
      "label": "Sample Concentration",
      "unit": "mg/mL"
    },
    {
      "key": "temperature",
      "cell": "C28",
      "label": "Temperature",
      "unit": "°C"
    },
    {
      "key": "wavelength",
      "cell": "C29",
      "label": "Wavelength",
      "unit": "nm"
    }
  ],
  "dashboard": {
    "headerRow": 34,
    "firstRow": 35,
    "lastRow": 64,
    "range": "B34:W64",
    "columns": [
      {
        "cell": "B34",
        "label": "Run"
      },
      {
        "cell": "C34",
        "label": "Ligand"
      },
      {
        "cell": "D34",
        "label": "Bead Type"
      },
      {
        "cell": "E34",
        "label": "Coreshell"
      },
      {
        "cell": "F34",
        "label": "Pore Size (Å)"
      },
      {
        "cell": "G34",
        "label": "C Load (%)"
      },
      {
        "cell": "H34",
        "label": "Length (mm)"
      },
      {
        "cell": "I34",
        "label": "Ø (mm)"
      },
      {
        "cell": "J34",
        "label": "PS (µm)"
      },
      {
        "cell": "K34",
        "label": "Solvent"
      },
      {
        "cell": "L34",
        "label": "%B"
      },
      {
        "cell": "M34",
        "label": "Flow (mL/min)"
      },
      {
        "cell": "N34",
        "label": "Sample Conc (mg/mL)"
      },
      {
        "cell": "O34",
        "label": "Temp (°C)"
      },
      {
        "cell": "P34",
        "label": "Wavelength (nm)"
      },
      {
        "cell": "Q34",
        "label": "Measured Temp (°C)"
      },
      {
        "cell": "R34",
        "label": "# Peaks"
      },
      {
        "cell": "S34",
        "label": "Run time (tR Last (min))"
      },
      {
        "cell": "T34",
        "label": "Resolution (Rmin)"
      },
      {
        "cell": "U34",
        "label": "Back-pressure (psi)"
      },
      {
        "cell": "V34",
        "label": ""
      },
      {
        "cell": "W34",
        "label": "Decision Point"
      }
    ]
  },
  "engine": {
    "headerRow": 3,
    "range": "B3:BA33",
    "columns": [
      {
        "cell": "B3",
        "label": "Run"
      },
      {
        "cell": "C3",
        "label": "Stage"
      },
      {
        "cell": "D3",
        "label": "Ligand"
      },
      {
        "cell": "E3",
        "label": "Bead Type"
      },
      {
        "cell": "F3",
        "label": "Coreshell"
      },
      {
        "cell": "G3",
        "label": "Pore Size (Å)"
      },
      {
        "cell": "H3",
        "label": "C Load (%)"
      },
      {
        "cell": "I3",
        "label": "Length (mm)"
      },
      {
        "cell": "J3",
        "label": "Ø (mm)"
      },
      {
        "cell": "K3",
        "label": "PS (µm)"
      },
      {
        "cell": "L3",
        "label": "Solvent"
      },
      {
        "cell": "M3",
        "label": "%B"
      },
      {
        "cell": "N3",
        "label": "Flow (mL/min)"
      },
      {
        "cell": "O3",
        "label": "Sample Conc (mg/mL)"
      },
      {
        "cell": "P3",
        "label": "Temp (°C)"
      },
      {
        "cell": "Q3",
        "label": "Wavelength (nm)"
      },
      {
        "cell": "R3",
        "label": "# Peaks"
      },
      {
        "cell": "S3",
        "label": "Run time (tR Last (min))"
      },
      {
        "cell": "T3",
        "label": "Resolution (Rmin)"
      },
      {
        "cell": "U3",
        "label": "Back-pressure (psi)"
      },
      {
        "cell": "V3",
        "label": "Measured Temp (°C)"
      },
      {
        "cell": "W3",
        "label": "Decision Point"
      },
      {
        "cell": "X3",
        "label": "tR 1 (min)"
      },
      {
        "cell": "Y3",
        "label": "W 1 (min)"
      },
      {
        "cell": "Z3",
        "label": "N 1 (plates)"
      },
      {
        "cell": "AA3",
        "label": "tR 2 (min)"
      },
      {
        "cell": "AB3",
        "label": "W 2 (min)"
      },
      {
        "cell": "AC3",
        "label": "N 2 (plates)"
      },
      {
        "cell": "AD3",
        "label": "tR 3 (min)"
      },
      {
        "cell": "AE3",
        "label": "W 3 (min)"
      },
      {
        "cell": "AF3",
        "label": "N 3 (plates)"
      },
      {
        "cell": "AG3",
        "label": "tR 4 (min)"
      },
      {
        "cell": "AH3",
        "label": "W 4 (min)"
      },
      {
        "cell": "AI3",
        "label": "N 4 (plates)"
      },
      {
        "cell": "AJ3",
        "label": "tR 5 (min)"
      },
      {
        "cell": "AK3",
        "label": "W 5 (min)"
      },
      {
        "cell": "AL3",
        "label": "N 5 (plates)"
      },
      {
        "cell": "AM3",
        "label": "tR 6 (min)"
      },
      {
        "cell": "AN3",
        "label": "W 6 (min)"
      },
      {
        "cell": "AO3",
        "label": "N 6 (plates)"
      },
      {
        "cell": "AP3",
        "label": "tR 7 (min)"
      },
      {
        "cell": "AQ3",
        "label": "W 7 (min)"
      },
      {
        "cell": "AR3",
        "label": "N 7 (plates)"
      },
      {
        "cell": "AS3",
        "label": "tR 8 (min)"
      },
      {
        "cell": "AT3",
        "label": "W 8 (min)"
      },
      {
        "cell": "AU3",
        "label": "N 8 (plates)"
      },
      {
        "cell": "AV3",
        "label": "tR 9 (min)"
      },
      {
        "cell": "AW3",
        "label": "W 9 (min)"
      },
      {
        "cell": "AX3",
        "label": "N 9 (plates)"
      },
      {
        "cell": "AY3",
        "label": "tR 10 (min)"
      },
      {
        "cell": "AZ3",
        "label": "W 10 (min)"
      },
      {
        "cell": "BA3",
        "label": "N 10 (plates)"
      }
    ]
  },
  "rawSheets": [
    "R01",
    "R02",
    "R03",
    "R04",
    "R05",
    "R06",
    "R07",
    "R08",
    "R09",
    "R10",
    "R11",
    "R12",
    "R13",
    "R14",
    "R15",
    "R16",
    "R17",
    "R18",
    "R19",
    "R20"
  ],
  "sourceDecisionFormulaCount": 0,
  "sourceRunFormulaCount": 0,
  "logicBasis": "Student-completed scaffold. Decisions implemented from the 13 October 2026 FC1 announcement and course combination table, not copied from completed template decision formulas."
});
export const TEMPLATE_ORIGIN=freeze({name:TAGGED_TEMPLATE.name,workbookSha256:TAGGED_TEMPLATE.sha256,tagFingerprint:TAGGED_TEMPLATE.tag.fingerprint,tagLocation:'SYS!A1',claim:'Application build basis; not grading approval or historical session authorship.'});

