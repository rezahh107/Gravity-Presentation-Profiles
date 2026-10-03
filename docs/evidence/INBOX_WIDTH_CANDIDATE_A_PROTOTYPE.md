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
