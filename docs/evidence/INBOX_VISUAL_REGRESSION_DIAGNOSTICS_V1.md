# Inbox visual regression diagnostics v1

## Lifecycle modes and image classes

`PREVIEW_DIAGNOSTIC` is active. It records visual differences as evidence and warnings; a visual difference alone does not fail CI while the design converges. A missing fixture/reference, browser or comparator crash, malformed output, or absent manifest is an infrastructure failure and does fail CI.

`APPROVED_VISUAL_CONTRACT` is represented in configuration but is deliberately inactive. It may be enabled only after an explicit Owner decision and the reviewed addition of authentic-runtime images classified `OWNER_APPROVED_GOLDEN`. In that mode a material calibrated difference is a contract failure. Normal CI never writes a tracked reference, copies `actual.png` to expected output, or runs a baseline-update command.

The three image classes are deliberately disjoint:

* `DESIGN_REFERENCE_ONLY`: intended appearance; useful for convergence or side-by-side review, not automatically pixel-comparable.
* `PREVIEW_RUNTIME_BASELINE`: a reviewed, versioned authentic-runtime capture for cross-commit drift during convergence. None is admitted in v1; same-run `reference.png` is explicitly only a stability control.
* `OWNER_APPROVED_GOLDEN`: an authentic pinned-runtime capture explicitly approved by the Owner. None exists or is activated.

The already-versioned Owner HTML references and their hashes are recorded in `tests/visual-regression/references/manifest.json`. CI does not access Google Drive. Different shell, crop, chrome, and data make those references side-by-side evidence rather than an artificially normalized pixel contract.

## Visual Convergence Matrix

Scenario configuration maps evidence to: **A** TT25 shell; **B** content axis/spacing; **C** search/results; **D** cards; **E** media; **F** empty state/native empty-grid height; **G** native pagination; **H** mobile; **I** desktop; **J** 200% zoom/no overflow; **K** RTL; **L** accessibility-visible focus/reflow; and **M** manual refresh. The manifest reports each scenario's letters. Existing WU17/WU21 controls remain authoritative for live refresh, mixed readiness, RTL behavior, accessibility, and host semantics. A genuine browser-zoom scenario is reserved: root-font scaling is explicitly not accepted as browser zoom.

The first capture set covers shortcode and authentic block independently at desktop/mobile, plus search result, no result, native pagination, and focus/reflow. Host-native no-task height remains accepted host state; its dedicated authentic fixture adapter is listed as pending rather than simulated.

## Reading evidence

The screenshot is the alarm. `geometry.json`, `computed-styles.json`, and `dom-summary.json` are the diagnosis instruments. Geometry includes anchor rectangles and the critical Card Mode/native AG Grid relationships: visual card-flow height, native body viewport height, their delta, last-card-to-pager gap, pager overlap, card width/columns, and document overflow. Native pagination capability is accepted; broken card-to-pagination geometry is observable. AG Grid internal clipping is not page overflow.

Each scenario contains `reference.png`, `actual.png`, `diff.png`, `metrics.json`, `geometry.json`, `computed-styles.json`, `dom-summary.json`, and `environment.json`. Root files contain the final `manifest.json` and PR `changed-files.json`. Changed files are correlation evidence, never an automatic claim of cause. Pixelmatch ignores minor anti-aliasing classification (`includeAA: false`) and uses a calibrated per-pixel threshold; it is intentionally not byte equality.

The v1 cross-commit evidence ceiling is explicit: no runtime baseline is admitted. Repeated same-runtime captures calibrate self-noise and exercise all diagnostics, while the synthetic comparator falsification proves that a meaningful mutation alarms. A future reviewed preview baseline can replace the same-run stability reference without changing the bundle schema. Missing configured references must fail; they never silently fall back.

## Investigation workflow

1. Read `manifest.json`.
2. Inspect reference, actual, and diff images.
3. Find the first meaningful geometry/style/DOM divergence, especially last-card-to-pager gap and visual versus native height.
4. Inspect `changed-files.json`.
5. Form the smallest root-cause hypothesis.
6. Run a targeted falsification; do not claim causation before this step.
7. Propose the smallest bounded repair.
8. Rerun visual and functional gates.

## Baseline admission and intentional non-gaps

A Golden update is an explicit reviewed repository change: capture from the pinned authentic runtime, record runtime SHA and image hash, add truthful approval identity/date only after Owner approval, and review the binary and metadata diff. CI offers no update switch. Failed output can never approve itself.

Diagnostics do not redefine Gravity Flow ownership of query, assignment, authorization, search, sort, pagination, Live Refresh, navigation, or workflow state. Native Gravity Flow 3.1.0/AG Grid 25.2.0 pagination, accepted card content, clipped internal grid widths, and authentic empty-grid height are not defects merely because a design reference differs. The instrument reports composition and relationships without blessing current geometry or inferring a CSS cause.

## CI operation

The diagnostics extend the existing WU21 exact-Head lab and reuse its pinned WordPress, PHP, database, Gravity packages, fixture data, Playwright, Chromium, and TT25 runtime. WU21's path filter avoids documentation-only execution. Artifacts are uploaded with normal immutable evidence on success and with bounded failure diagnostics on infrastructure failure. Preview warnings leave the browser command successful; absent or invalid evidence fails it.
