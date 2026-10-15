# Rubric workflow improvements — 15 October 2026

This record supersedes the website-improvement backlog in the preceding rubric
audit. It documents implementation and tests, not awarded marks or actual injections.

## Completed website improvements

### Current FC1 assessment scope and prospective setup

New and legacy-unspecified Dashboards now use FC1; an explicitly selected extended
scope is retained. At the target peak count, unmet time/Rs returns to the recorded
Selectivity sequence. A signature-bound user declaration with a reason can identify
Efficiency as the next family; it does not prescribe an N experiment in FC1.
Extended Efficiency/Gradient tools and all original history remain available.

The main Dashboard automatically displays a complete, comparable all-compound model
from explicitly labelled CSVs, including intermediate/minimum %B, predicted time,
alpha, fitted coefficients/R² and source runs. No manual analysis copy or Calculate
button is needed. Incompatible or unidentified data do not acquire a whole-sample
result. The optional guided analysis remains independent and is not overwritten.

Optional prospective configuration supports free-form apparatus notes and an
editable Pinnacle 150 × 4.6 mm / 5 µm starting column. Ligand and hardware limits
are not invented; serial/photo and a complete inventory are not prerequisites.
Explicit reuse fills missing fields only in newly imported compatible CSVs, never
overrides their stated values or changes earlier runs. Quick-edit identifiers and
geometry lock after use; changed hardware needs a separate record.

Mix has its own provenance-bearing ACN % v/v within bottle B, with MeOH as the
remainder. It is distinct from pump %B, appears in CSV mapping/template and carried
recipes, and survives saved-session roundtrips. Unknown/invalid ratio means an
incomplete recipe; no pure-solvent nomogram is applied to Mix.

The current compact FC1 evidence records the configured CSV-only positive test and
the separate blank-to-GR37 preservation/pressure regression. Synthetic inputs are
software tests only. GR37 remains QA data, not new-user defaults or a requirement
for historical apparatus documentation. No full rubric mark or injection clearance
is claimed.

1. **Guided all-compound entry.** Dashboard now has “Optional · All-compound
   intermediate model”. The user explicitly selects comparable existing CSV runs
   and opens guided analysis. Independent copies retain raw evidence, associations
   and annotations; repeated entry never overwrites existing analysis. Dashboard
   specifications are copied only when the analysis workspace is empty. No sample
   identity, compound assignment or t0 confirmation is invented. Five steps link
   to fit selection, t0, compound definition, per-run identities and automatic
   results. The run selector supports reviewing each analysis run. Detailed
   exclusions remain available without burying the main guidance in a long warning.
   Export carries actual model scope and source-run IDs/hashes. The rubric audit
   reads this separate analysis, with comparability checks before any route-A claim.

2. **Candidate recipe evidence.** Every stock candidate carries additive name,
   concentration, unit/preparation basis, notes and sample/study ID where recorded,
   alongside the original method records and source run. A course prescription
   never confirms actual preparation. Missing fields, ambiguous percentage basis
   and conflicting no-additive declarations leave recipe coverage incomplete.
   Explicit “none” is permitted without fictitious concentration/unit values.
   Candidate and reference headings no longer unconditionally say “Complete”.
   Recipe coverage, numerical model acceptance, hardware evidence and experimental
   validation are separate states. Failed predictions remain unselectable.
   Carried next-method records also retain additive units and preparation notes.

3. **Full pump-flow bounds.** Equipment editing supports lower/upper comparisons.
   The inspector shows both recorded bounds, their sources and missing-bound status;
   it does not substitute zero for an unrecorded hardware minimum. The stock grid
   and continuous feasible interval both enforce lower and upper limits, including
   strict operators. Contradictory/invalid recorded bounds cannot establish a
   passing stock search.

4. **Autosampler range versus capacity.** Existing fitted loop/metering capacity
   records remain unchanged. Separate model-/mode-specific programmed injection
   bounds are stored as sourced operating limits in µL. Capacity alone is not a
   software range; absent, one-sided, invalid and contradictory ranges stay explicit.
   A documented programmed range may exist while capacity remains unknown. Manual
   loop operation remains a separate explanation. Recorded autosampler injection
   bounds are checked against the current run; violations cause HOLD before
   optimisation. Direct equipment-record links open the actual editor.

## Data and UI protections

- New users still start with no group data. No testing/example entry or synthetic
  dataset was added to the public application.
- English text throughout; no visible website numbering in header, reports or
  evidence download filename. Internal compatibility/source metadata is retained.
- Original CSV text, measured peaks, GR37-19/20 history, prior associations and
  existing analysis work survive the workflow and session roundtrip.
- Copying for optional analysis is explicit and idempotent, not a move or another
  performed injection. Existing analysis and Dashboard originals may deliberately
  differ; the original is not silently replaced by its edited copy.

## What software cannot supply

GR37 is only a QA dataset. Its unresolved compound mapping is not automatically
identified, and its test catalogue does not establish actual available stock.
The synthetic positive fixtures establish software behaviour only; they do not
prove an executable GR37 method or appear in ordinary new-user defaults.

The automation 20-point descriptor permits either all-compound log k–%B output or
multiple admissible complete condition sets with stated grounds, in addition to
the preceding automation requirement. Both routes are not mandatory. Source-labelled
permitted t0 estimates remain conditional planning inputs; no new measured t0 is
requested merely to clear an internal badge. Hardware and recipe coverage flags
are application checks, not additional verbatim rubric rules.

For a real-configuration demonstration, record the applicable fitted-module bounds,
actual available column geometry/chemistry/own limits, and intended method/bottle
preparation. For route A, compound correspondences and a suitable documented t0
basis are also needed. Historical GR37 serials are not prerequisites. The equipment
and usability highest bands describe what a returning user or someone who did not
build the tool can understand and do unaided. A separate unfamiliar-user test
record is not listed as a required submission in the supplied announcement; such
a check is a useful validation, not an extra upload requirement. Automated checks
alone do not establish that human ability. Truthful build/AI declarations, complete
conversation and actual course submission remain the student's responsibility.
No mark is guaranteed.

## Fresh verification

Machine-readable checks and matching source are in the build-evidence export.
Local runs include the complete GR37 sequence from blank, an independent raw and
explicit-filter grading-order audit, pressure-boundary/legacy checks, and focused
new-workflow interactions. Positive all-compound/candidate tests use explicitly
synthetic fixtures, separate from GR37 and from public defaults. The final local
verification report records exact counts and public confirmation.
