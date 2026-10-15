# Import instructions

**FC1 HPLC experiment organiser v15.3 · Chenchen Lin — 34154760**

## Supported formats

1. **Shimadzu LabSolutions ASCII export (.csv)**, detected automatically. The following are read from the file itself:
   * The first `[Peak Table(Detector X)]`: R.Time, Area, Height, k', Plate #, Resolution, Tailing, Mark and Name.
   * The detector trace.
   * `[LC Status Trace(Pump A Pressure)]`, multiplied by its Intensity Multiplier.
   * The oven and room temperature traces.
   * `Injection Volume`.
   * Sample name, data-file name, method-file name and instrument name, kept as metadata only.

   Exported `0` plate numbers and resolutions mean "not calculated" and are never treated as zero. Chemistry and equipment are **not** read from any name.
2. **Generic peak-table CSV**: one header row, then one row per peak. Several runs may share one file and are grouped by `run_key`. A peak table has no chromatogram trace; none is drawn.

Anything else is reported as *format not recognised*, and the other files in the same batch still import.

## Generic CSV fields

Canonical headers are listed below. If yours differ, the mapping form lets you assign each column.
Nonblank values of a run-level field must agree within that run; conflicting entries reject that run
with the field named. Keep units consistent with the choices at import.

| Header | Meaning | Level | Unit | Required |
|---|---|---|---|---|
| `rt_min` | retention time | peak | min (or s, chosen at import) | **yes** |
| `run_key` | groups rows into runs | key | — | if the file holds several runs |
| `peak_no` | peak number | peak | — | no (elution order used) |
| `area`, `height` | peak size | peak | detector units | no |
| `width_base_min` | tangent base width Wb | peak | min (or s) | for the base-width Rs basis |
| `width_half_min` | width at half height Wh | peak | min (or s) | for the half-height Rs basis |
| `plates` | plate number N | peak | — | for the plate-derived Rs basis |
| `exported_rs` | instrument Rs of this peak against the previous peak | peak | — | for the exported basis |
| `compound_label` | identity stated by the file author; can be used by automatic preparation, never chemically identified by the tool | peak | — | for an automatically attributed fit |
| `is_marker` | yes/no: file-stated hold-up marker; conflicting marker flags are reported | peak | — | no |
| `organic_solvent` | e.g. ACN, MeOH | run | — | for retention |
| `percent_b` | organic percentage (0–100) | run | % | for retention |
| `mode` | ISO or GRA | run | — | for retention |
| `flow_ml_min` | flow rate | run | mL/min | no |
| `oven_temp_c` | column temperature | run | °C | for comparability and temperature steps |
| `inj_volume_ul`, `wavelength_nm` | injection volume, detection wavelength | run | µL, nm | no |
| `pressure_max_psi` | maximum back-pressure during the run | run | psi (or bar/MPa, chosen at import) | for the pressure check |
| `acquisition_min` | acquisition time | run | min | recommended |
| `t0_min`, `t0_method` | documented t0 and how it was obtained | run | min, text | an alternative to a marker peak |
| `phase_a`, `phase_b`, `additive`, `additive_conc`, `additive_unit`, `ph` | mobile phase | run | as stated | recommended |
| `sample_name` | human-readable sample/run description; does not establish identity | run | text | no |
| `sample_type`, `sample_conc_mg_ml` | category, e.g. CP, STD, QC, BLK; and recorded concentration | run | —, mg/mL | no |
| `column_label`, `instrument_label` | file-stated physical-column and instrument labels; automatic preparation can create records without inventing geometry or limits | run | — | for automatic equipment association |
| `sample_id` | explicit sample/study identity declared by the file author; not sample name, type, run key or filename | run | text | optional for import; required identity evidence for automatic grouping/model use/history comparisons |

`templates/generic-peak-table-template.csv` is the blank header.
`generic-peak-table-example-ILLUSTRATIVE.csv` shows the layout with **illustrative values that are not data**.
Its `sample_id` is deliberately blank; it is not a complete modelling or independent-user test pack.

## Sample identity and a declared comparison relationship

Use the same `sample_id` only when your experimental record supports comparing the same sample/analyte
population. Keep it consistent on every row of a run. Two samples both called `CP` do not establish this
relationship, and different display names do not disprove it. Do not supply an invented identity merely
to enable a fit.

If a LabSolutions export or generic CSV does not state the identity, the file still imports and its
measurements can be inspected. Pooling fits, applying a model to another run, and completing comparative
history steps require the missing declaration:

1. Select the relevant runs in the library.
2. In **Sample / study identity**, enter **Identity for selected runs** and **Basis / experimental record**.
3. Click **Declare for … selected run(s)** only when that basis is supported.

For two recorded identities that may legitimately be compared, open **Declare a comparison relationship
between two identities**, choose **Identity A** and **Identity B**, record the **Comparison basis**, then
click **Declare comparison equivalence**. This records a user assertion, not chemical identification,
and does not bypass column, solvent, temperature, marker or compound-coverage checks. **Withdraw
declaration** removes that comparison assertion without changing the original files.

## Provenance

Every recorded value is shown with its source:
* *from file*
* *mapped CSV column*
* *user entry*
* *import profile "…" — unconfirmed*
* *reference record*
* *ASSUMPTION*

Unconfirmed profile/suggested values are shown in italics and are not used as confirmed conditions.
File-stated labels and marker flags may prepare the analysis automatically, but remain attributed to
the file author. Unknown or conflicting identity information must not be replaced by peak order.

## Duplicates and conflicts

* A file whose content is identical to an imported run is skipped and reported. Choose *Keep as a separate record* to keep it.
* A file name that disagrees with the internal sample name is reported as a **NAME CONFLICT**. Neither name sets conditions.

## Sessions, recovery and large batches

You can select many files at once and add more later. Available memory, file size and browser quotas
limit capacity; consult the current release's verification record for measured batch/storage limits.
Historical capacities are not new measurements of v15.3; consult its current verification log.

**Export session** produces schema 3 with stable session identity and your explicit comparison
declarations. **Import session** accepts a supported schema 2 file through migration: measured data stay
preserved, but sample/study identities are left UNKNOWN rather than inferred from old names/types.
Derived results are recomputed, so stricter eligibility can legitimately change an older result.

On reload, both IndexedDB and localStorage are inspected. A banner offers validated copies and the
reason for any suggestion; conflicts and rejected copies are reported. Nothing is restored until you
choose. **Keep what is on screen** dismisses the offer and deletes no saved copy.

**Saved** follows validation and read-back verification. **NOT SAVED** means the open work is not
confirmed as persisted; export it before closing or reloading. Keep an exported file as a backup even
when browser saving succeeds. A numerical result or a saved session is not permission to inject:
resolve any **PLANNING DRAFT** conditions and hardware-limit warnings first.
