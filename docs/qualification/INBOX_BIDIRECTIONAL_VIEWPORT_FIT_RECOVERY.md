# SRWF Inbox bidirectional viewport-fit recovery

Production repair qualification note for the post-v0.4.0 SRWF Inbox geometry defect.

Fresh baseline: `main@8d2b066c64ffc0963bdfc45829495ffb4d08cf8d`.

## Confirmed root mechanism

The released one-shot guard normalizes only fit-capable initial overflow. After a narrow fit is persisted by native Gravity Flow state, a later wider mount can restore that fitting-but-underfilled width state indefinitely because `displayedWidth <= usableWidth` is intentionally inert.

Pinned Gravity Flow 3.1.0 evidence shows native column persistence stores `getColumnState()` and restores matching identities through `applyColumnState()`. The persisted state contains widths but no reliable provenance that distinguishes a previous `sizeColumnsToFit()` result from a manual width choice. Earlier Candidate A/D qualification already falsified a general restore-origin discriminator/public after-restore completion seam.

Public AG Grid runtime evidence does expose `columnResized` sources including `sizeColumnsToFit`, `uiColumnDragged`, `api`, and `flex`. The repair therefore does not infer origin from restored width geometry. It records only a small GPP-owned presentation provenance signature when GPP actually executes/observes an admitted `sizeColumnsToFit` result, and invalidates that signature after completed non-fit width mutation.

## Repair boundary

- native Gravity Flow / AG Grid remain authoritative for Grid construction, row/query/workflow behavior, native column state and persistence;
- the existing first-mount overflow normalization remains unchanged;
- GPP stores only namespaced, disposable fit provenance (`gpp:srwf-inbox-fit:v1:<form>:<grid>`), never native Grid state;
- provenance is self-validating against the admitted form/Grid/column identities and fitted displayed widths;
- unknown fitting underfill without provenance remains untouched;
- a materially wider viewport may trigger one bounded grow recovery per mount after a short settle window;
- completed manual/API width mutation revokes provenance, so later live/reload grow does not undo the user-selected width state;
- minimum-impossible narrow overflow, pin/flex/unsupported sizing modes, unrelated Grids and malformed provenance fail closed;
- no ResizeObserver, polling/interval loop, private AG Grid API, native state rewrite, CSS overflow hiding, second Grid, or vendor patch is introduced.

## Required runtime evidence

The pinned WU21 browser regression exercises both authentic frontend shortcode and `gravityflow/inbox` Block routes and includes:

1. fresh ~1920 baseline;
2. ~1920 -> ~1680 live shrink with temporary native overflow;
3. ~1680 reload -> existing one-shot fit and native persistence;
4. narrow-fitted -> ~1920 live grow -> exactly one bounded recovery;
5. narrow-fitted -> ~1920 direct reload -> provenance-gated recovery;
6. authentic mouse column resize -> provenance revoked, manual widths preserved live and after reload;
7. row count, pager text, column identity/order and native scrollbar topology preserved;
8. an executable v0.4.0 production-asset negative control that reproduces the stranded wider blank region.

Exact-head CI/WU21 results are required before this repair can be reported verified. No merge/release/deployment is authorized by this document.
