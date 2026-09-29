# INBOX_VISUAL_DESIGN_V2 — Qualification Batch 1

## Scope

Evidence-only qualification for `Q1_HTML_CELL_VALUE_PATH`, `Q2_RTL_NATIVE_BEHAVIOR`, and `Q4_PAGE2_POLL_FOCUS` in the existing WU21 reproducible browser/runtime lab.

No production Inbox row, pagination, upper-page, Card Mode, Grid ownership, query, workflow, or navigation behavior is changed by this batch. `Q3_GEOMETRY_ON_DEMAND` is not executed.

## Evidence ceiling

Maximum positive evidence: `PROVEN_IN_REPRODUCIBLE_RUNTIME`.

This batch does not establish target-production equivalence, final visual approval, implementation approval, or runtime Golden activation.

## Current disposition source

The canonical Toolbox v1.1 is the pre-qualification design baseline, not the current runtime-disposition ledger. Current Q1/Q2/Q4 dispositions are the exact-Head `inbox-visual-design-v2-qualification-evidence.json` inside the immutable WU21 artifact, with the semantically identical `browser-results.json.inbox_visual_design_v2_qualification` adjunct. Consumers must use that exact-Head evidence rather than infer execution state from pre-qualification wording in the Toolbox. `Q3_GEOMETRY_ON_DEMAND` remains `NOT_EXECUTED_BY_CONTRACT`.

## Runtime artifact

The exact-head `WU21 Reproducible Evidence Lab` captures bounded Q1/Q2/Q4 JSON, polling evidence, and the Q2 1440px/360px screenshots in its existing artifact directory. The compact `inbox-visual-design-v2-qualification-evidence.json` is also embedded as the top-level `inbox_visual_design_v2_qualification` adjunct in the uploaded `browser-results.json`; the canonical WU21 `results` ID set remains unchanged.

Qualification outcomes may legitimately be `PASS`, `FAIL`, or `NOT_PROVEN`; the workflow hard-fails only when the bounded evidence cannot be executed/captured, cleanup cannot restore the synthetic fixture, or the canonical Toolbox mirror fails its byte-identity SHA-256 gate.
