# Inbox persisted-width Candidate A — qualification only

Baseline: `main@24c29c9dfeda5c38d8ff021526da65ddaa301a6b`.
Gravity Flow source package: `3.1.0`, SHA-256
`ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404`.

The reported production cause (1872px restored into a 1374px viewport) is accepted.
This branch does not re-investigate it and changes no production PHP/CSS/JS.
All instrumentation is under `tests/`, excluded by `.distignore`.

## Phase 1

The ephemeral MU plugin installs an inline observer before `Gravity_Flow::THEME_JS`
at `wp_print_footer_scripts` priority 0. The pinned host localizes at priority -10.
Actual printed script order and pre-mount attachment are asserted in Chromium,
for frontend shortcode and authentic `gravityflow/inbox` Block.

The observer only reads event/public column APIs and geometry. It does not size,
read/write Storage, mutate DOM/config after mount, or keep a Grid API registry.
Existing callable callbacks receive their original receiver, arguments, return
and exception behavior. Any non-null non-callable callback fails closed for
the complete grid before any callback is replaced.

The browser driver provisions synthetic pages, seeds native state **before the
observed mount**, and changes the viewport as an explicit resize test action.
These fixture actions are separate from the observational callback.
The empty fixture sets `rowData=[]` before localization/mount; it does not
replace an already running Inbox. Existing fixtures and production data remain
untouched. The MU file, option and pages are removed in `finally`.

Captured cases: clean, stale-wide, fitting saved state, empty stale, existing
callback composition, meaningful sort/sortIndex/hide/order, native shrink/grow.
Evidence includes exact source/bundle identities, callback presence, event
sequence/source/keys, effective state, displayed widths and minimum constraints,
pinned/flex, center/body/horizontal metrics and printed script order.

`inbox-width-candidate-a-phase1.json` is uploaded in the existing WU21 artifact
(or failure diagnostics). An isolated composition test protects receiver,
argument, return, exception and ambiguous-callback handling; it is explicitly
not browser/runtime evidence.

## Phase boundary and decision

Initial state: `REQUIRES_FURTHER_BOUNDED_PROTOTYPE`.
Phase 2 is not installed or executed until delivery/timing/composition pass and
the captured provenance can support a safe initial-restore discriminator.
`source='api'` alone is never an approved discriminator.

No merge, release, production deployment or host-source modifications are
authorized by this prototype. Candidate D remains the architecture family to
investigate if the surviving event/config seam is demonstrated unreliable.

## Bounded discriminator falsification

The same browser/MU/observer harness now has a focused
`GPP_WIDTH_DISCRIMINATOR_ONLY=1` mode. WU21 runs that mode instead of repeating
the closed broad Phase-1 matrix. Both native routes execute twelve cases:
clean/no restore, stale restore, fitting restore (native default widths), empty
restore, unrelated public state reapplication after startup, synchronous startup
reapplication on clean/stale/fitting/empty fixtures, native mouse resize, and pin/flex
restore followed by an unrelated API call. No production files are changed.

The separate **test-only control** chains the public `getRowHeight` option,
preserving its result/receiver/arguments, to receive public APIs during initial
row construction. It calls public `columnApi.applyColumnState` once for the
explicit unrelated startup control. Later controls reapply the current public
state. It neither replaces the Grid constructor nor intercepts native restore
or storage. Public listeners deliver asynchronously in this pinned host. A
bounded FIFO of explicit control calls and a WeakMap provide separate fixture
ground truth without modifying event keys. Each control emits one event; the
driver drains delivery before another control. The startup listener is installed
before the sole explicit startup call and native ready restore. Empty Inbox has
no row-height callback; its initial surviving column callback binds the public
control before the host's asynchronous ready handler. The fixture
seed labels and control trace are evidence only, never discrimination authority.

Predicates compare API type/source/keys, first API occurrence after initializing
and before first size/data callbacks, then the complete effective column state,
displayed widths/pin/flex/min/max facts, row existence and center geometry.
Raw elapsed milliseconds relative to all three boundaries are retained, but
are not treated as stable provenance. Any equal positive/negative signature
falsifies the tested predicate. No collisions also cannot prove uniqueness in
this bounded test. The regression explicitly prohibits an A outcome when
negative controls are absent. Future predicates outside this finite family
remain NOT_PROVEN.

`inbox-width-candidate-a-discriminator.json` records positive/negative events,
public dispatch/control traces, native drag events and the decision. WU21 uploads
it independently and in the final evidence artifact. Phase 2 remains false;
there is no fit call, repair, state-store implementation, merge or deployment.
For B/C, the next investigation is Candidate D: verify whether an official
after-restore seam exists, otherwise assess an upstream repair. Its existence
is not assumed or investigated in this qualification step.
