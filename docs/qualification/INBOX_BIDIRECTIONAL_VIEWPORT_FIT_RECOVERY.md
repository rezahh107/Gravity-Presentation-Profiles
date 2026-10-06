# SRWF Inbox bidirectional viewport-fit recovery

Production repair qualification note for the post-v0.4.0 SRWF Inbox geometry defect.

Fresh baseline: `main@8d2b066c64ffc0963bdfc45829495ffb4d08cf8d`.

## Confirmed root mechanism

The released one-shot guard normalizes only fit-capable initial overflow. After a narrow fit is persisted by native Gravity Flow state, a later wider mount can restore that fitting-but-underfilled width state indefinitely because `displayedWidth <= usableWidth` is intentionally inert.

Pinned Gravity Flow 3.1.0 evidence shows native column persistence stores `getColumnState()` and restores matching identities through `applyColumnState()`. The persisted state contains widths but no reliable provenance that distinguishes a previous `sizeColumnsToFit()` result from a manual width choice. Earlier Candidate A/D qualification already falsified a general restore-origin discriminator/public after-restore completion seam.

Public AG Grid runtime evidence does expose `columnResized` sources including `sizeColumnsToFit`, `uiColumnDragged`, `api`, and `flex`. The repair therefore does not infer origin from restored width geometry. It records only a small GPP-owned presentation provenance signature when GPP executes/observes an admitted `sizeColumnsToFit` result, and invalidates that signature after completed non-fit width mutation.

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

## Runtime-regression precondition

The Owner defect requires a previously persisted wider native column state. In the pinned WU21 host, a clean AG Grid startup fit visually fills the wide viewport but does not by itself write that clean startup geometry to Gravity Flow's local-storage column-state key. The first regression attempt therefore correctly failed before reaching the defect sequence: a 1680 reload had no wider state to restore, so native startup sizing handled the clean mount and the released GPP one-shot had nothing to normalize.

The final browser regression establishes the same required persisted-state precondition without manufacturing a parallel product state: it reapplies the already-rendered 1920 native `getColumnState()` through the public test-only `columnApi.applyColumnState()` control, then requires read-back from Gravity Flow's own local-storage key to equal that current state. Only after native persistence is mechanically proven does the test execute the Owner sequence. This fixture operation is test-only; production GPP never calls `applyColumnState()`.

## Required runtime evidence

The pinned WU21 browser regression exercises both authentic frontend shortcode and `gravityflow/inbox` Block routes and includes:

1. fresh ~1920 baseline;
2. public current-state reapplication plus Gravity Flow native persistence read-back for the Owner-required wider-state precondition;
3. ~1920 -> ~1680 live shrink with temporary native overflow;
4. ~1680 reload -> existing one-shot fit and native persistence;
5. narrow-fitted -> ~1920 live grow -> exactly one bounded recovery;
6. narrow-fitted -> ~1920 direct reload -> provenance-gated recovery;
7. authentic mouse column resize -> provenance revoked, manual widths preserved live and after reload;
8. 390/320 minimum-impossible overflow remains native horizontal-scroll territory;
9. row count, pager text, column identity/order and native scrollbar topology preserved;
10. an executable v0.4.0 production-asset negative control that reproduces the stranded wider blank region under the same persisted-state precondition.

Exact-head CI/WU21 results are required before this repair can be reported verified. No merge/release/deployment is authorized by this document.
