# HPLC Method Decision Lab

Final FC1 website source for Chenchen Lin, student ID 34154760.

Public application: https://hplc-method-decision-lab.wisebeech.chatgpt.site/

This is an AI-assisted educational application. It is not instrument-control
software or permission to inject. The student must review the implementation and
provide an accurate authorship / AI-assistance declaration with the submission.

## Run locally

No build or package installation is required. From this repository, run:

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000/ in a browser. Do not open index.html directly as a
file: browser module imports require an HTTP origin.

New users start with an empty session. Original CSVs, selections and session
history are held in the user's browser and can be exported / restored. A copied
HTML file alone is not an experiment-session backup.

## Relationship to the submitted website

The complete tracked `dist/` tree is byte-identical to the final deployed source
at source commit `c6e06d8108b8c848d6f7f01242fa355caefdc9e9`. GitHub commit IDs
may differ because this is a clean, source-only submission snapshot.

The file `dist/audit/build-source.json` contains matching code text, SHA-256
digests and the source fingerprint:

`e246ba35ebfdc49ced1151cf29a4b38f68fb7d9c1a7e364749281fcaa2ba8028`

All 96 recorded application files match those digests. Toolkit artwork and the
illustrative generic CSV templates are also included in `dist/`.

## FC1 boundary and evidence

The Dashboard checks pressure / operating limits before peak count, last-peak
time and resolution. At an evidenced Selectivity-exhaustion declaration, FC1
identifies Efficiency as the next parameter family; it does not invent a column
or flow experiment or mark an unsuccessful measured method as MET.

`tests/fc1-handoff-regression.mjs` contains constructed, labelled test inputs.
With Node.js installed, run:

```sh
node tests/fc1-handoff-regression.mjs
```

The application receipt records the broader unit and isolated-browser checks.
Tests are software evidence, not marks awarded or experimentally validated
predictions. GR37 was used for isolated regression only. No raw GR37 CSVs,
personal session exports or AI conversation PDFs are included in this repository.
Unidentified peaks are not silently assigned chemical identities.

The complete AI conversation and the student's truthful declaration are separate
course submission materials. A scope-selected conversation excerpt must not be
described as the complete pre-web-and-web conversation.

## Included records

- `RUBRIC_IMPLEMENTED_CHECKS.md`: current implementation and evidence limits.
- `CHANGE_RUBRIC_WORKFLOW.md`: relevant development changes.
- `.openai/hosting.json`: existing Sites hosting identity/configuration; not a
  credential. Do not publish to that Site unless you are its authorised owner.

Historical test snapshots containing original laboratory records, credentials,
private classroom archives and full conversation exports are intentionally
excluded. This repository does not claim a new licence over third-party
teaching illustrations; retain the source attributions in the application.
