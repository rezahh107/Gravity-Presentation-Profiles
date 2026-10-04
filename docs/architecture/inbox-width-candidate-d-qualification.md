# Candidate D: host-supported restore completion qualification

Qualification only, from fresh main `24c29c9dfeda5c38d8ff021526da65ddaa301a6b`.
Candidate A PR #130 remains separate and its Phase 2 remains unexecuted.

Required capability: a host-supported notification identifying completion of
native initial persisted column-state application, including an empty Inbox,
which unrelated public API column-state operations cannot produce.

## Source authority

The owner-supplied Gravity Flow 3.1.0 ZIP SHA-256 is
`ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404`.
The read-only package scanner records file hashes, byte-addressed source excerpts,
all 194 literal PHP hook invocations, and relevant JS notification token inventory.
Exact frontend bundle identity is used; AG Grid numeric semver is NOT_PROVEN
(no AG Grid dependency manifest or numeric version declaration established in this
supplied distribution). Version warnings and modern documentation are not evidence
of the bundled dependency's version or contract.

The actual frontend Inbox constructs native Grid after installing host callbacks.
Its `onGridReady` assignment overwrites the configured callback. That host callback
reads its own native saved state, validates matching column IDs, then invokes
`columnApi.applyColumnState({state,applyOrder:true})`. The matching-state branch
returns without invoking a consumer callback or emitting a restore-specific host
notification. The no-state/mismatched-ID paths retain native host sizing.
The qualification neither invokes nor changes those host branches.

| Candidate | Actual location / authority | Restore-completion admission |
| --- | --- | --- |
| `gravityflow_js_config_shared/admin/theme` | PHP `includes/config/class-js-config.php`, lines 64/89/105; before script localization and Grid construction | Configuration seam only; no completed browser restore |
| `gravityflow_enqueue_frontend_scripts`, Inbox args/columns filters | Server enqueue / server data and column construction | Before browser persistence application; empty/clean/stale/fitting have no completion authority |
| Configured `onGridReady` | Public Grid option, overwritten by host `Y` before construction | Consumer callback not composed; native ready dispatch initiates host restore rather than certifying its completion |
| Public `gridReady` listener | Public `api.addEventListener`; early binding through row-height option when rows exist | Grid initialization semantics only. Observing restored state at delivery does not confer a host after-restore contract. Empty has no row-height callback |
| `firstDataRendered` | Bundled Grid guarded by `paginationProxy.isRowsToRender()`, dispatch-once after render | Clean startup also qualifies; empty does not emit; no persistence provenance |
| `gridSizeChanged`, new/displayed columns, row data events | Public generic lifecycle/state/geometry notifications | Independent of native storage restore; state events may arise from unrelated API operations; geometry events do not certify restore |
| `columnEverythingChanged(source="api")` | Public `applyColumnState` hardcodes `api`; generic dispatch | Explicit same-state unrelated API control collides; Candidate A finding remains closed |
| Modern `stateUpdated` / `initialState` | Not present in exact bundled Grid token inventory | Modern documentation does not establish availability here; generic updated state would still require host restore provenance |
| Native restore function return | Host implementation in exact bundle, not an exported consumer seam | Smallest upstream boundary; not currently admissible to a consumer |

Official documentation checked: Gravity Flow Actions and Filters index,
`gravityflow_enqueue_frontend_scripts`, `gravityflow_inbox_args`,
`gravityflow_columns_inbox_table`, and AG Grid Grid Lifecycle. Current AG Grid docs
are supplemental semantic background, never a substitute for the exact bundle.

## Bounded runtime evidence

Extends the established WU21 fixture, browser helpers and pre-mount MU attachment.
The Candidate A observation/control scaffolding is reused with Candidate D event
inventory. No parallel WordPress/Grid lab is created. Execute two native routes:
frontend shortcode and authentic `gravityflow/inbox` Block. For each route:
clean, stale, fitting, empty restore, unrelated API after startup, four unrelated
startup cases (clean/stale/fitting/empty), user resize, pinned, flex, and native
Live Refresh with populated/initially empty rows. Positive/negative ground truth
comes from isolated fixture actions, never a proposed production predicate.

The observer records public state, geometry, event keys/source/sequence, row
presence and frame snapshots. The runtime report records configured-ready delivery,
early public-ready delivery, and Live Refresh HTTP/transaction effects. Source
inspection establishes lifecycle semantics; event arrival order alone cannot
establish an after-restore contract. The empty fixture uses localized rowData=[];
it does not prove every server permission/filter route to an empty Inbox.

Native saves remain on host `onModelUpdated/onColumnResized/onColumnVisible/onDragStopped`
with its 200ms debounce and native `getColumnState()` persistence. Live Refresh
posts native `inbox/changes` and applies a native `api.applyTransaction`; it does
not re-enter the initial saved-column-state restoration routine. Remount starts a
new native lifecycle; no consumer registry/store is introduced.

All changes are under tests, this architecture document and the WU21 workflow.
The exact-head CI/runtime artifacts provide executed results; local mock regression
is explicitly not browser evidence. Production PHP/CSS/JS are unchanged.

## Disposition and next boundary

Source evidence does not prove an admissible public completion seam:
`CANDIDATE_D_PUBLIC_SEAM_NOT_PROVEN` pending exact-head runtime corroboration.
Do not implement a fit or Candidate A Phase 2.

Smallest next action is an upstream contract proposal in Gravity Flow's own initial
restore routine immediately after matching-ID `applyColumnState` returns, with
explicit outcomes for restored/no-state/mismatched IDs and once-per-native-Grid
identity. This proposed seam does not exist yet. Its public notification and
geometry-ready guarantee must be designed and qualified upstream before consumer
implementation. Completion of state application is distinct from stable viewport
layout, particularly for flex. No upstream repair is implemented here.

Still NOT_PROVEN: vendor acceptance/stability, numeric AG Grid semver, guaranteed
geometry readiness at that return, callback composition for a future host seam,
Live Refresh/remount guarantees of a future seam, and any bounded width policy
that preserves manual widths, sort/sortIndex, hide/show, order/IDs, pinning, flex,
native persistence and the PR #126 physical-LTR/Persian-text-RTL boundary.
Native 320/390 minimum-width overflow remains legitimate. No release impact,
merge, deployment or upstream bundle patch is authorized by this qualification.
