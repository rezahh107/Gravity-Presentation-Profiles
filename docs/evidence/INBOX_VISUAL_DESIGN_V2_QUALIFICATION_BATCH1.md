# INBOX_VISUAL_DESIGN_V2 — Qualification Batch 1

## Scope

Evidence-only qualification for `Q1_HTML_CELL_VALUE_PATH`, `Q2_RTL_NATIVE_BEHAVIOR`, and `Q4_PAGE2_POLL_FOCUS` in the existing pinned reproducible host runtime.

No production Inbox row, pagination, upper-page, Card Mode, Grid ownership, query, workflow, or navigation behavior is changed by this batch. `Q3_GEOMETRY_ON_DEMAND` is not executed.

## Evidence ceiling

Maximum positive evidence: `PROVEN_IN_REPRODUCIBLE_RUNTIME`.

This batch does not establish target-production equivalence, final visual approval, implementation approval, or runtime Golden activation.

## Runtime artifact

The exact-head workflow writes `inbox-visual-design-v2-qualification-evidence.json` plus bounded Q1/Q2/Q4 JSON and Q2 screenshots into the existing SRWF Journey Host Qualification artifact.

Qualification outcomes may legitimately be `PASS`, `FAIL`, or `NOT_PROVEN`; the workflow hard-fails only when the bounded evidence cannot be executed/captured or the canonical Toolbox mirror fails its byte-identity SHA-256 gate.
