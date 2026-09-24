# Inbox visual regression diagnostics v1

## Lifecycle modes and image classes

`PREVIEW_DIAGNOSTIC` is active. It records visual differences as evidence and warnings; a visual difference alone does not fail CI while the design converges. A missing fixture/reference, browser or comparator crash, malformed output, or absent manifest is an infrastructure failure and does fail CI.

`APPROVED_VISUAL_CONTRACT` is represented in configuration but is deliberately inactive. It may be enabled only after an explicit Owner decision and the reviewed addition of authentic-runtime images classified `OWNER_APPROVED_GOLDEN`. In that mode a material calibrated difference is a contract failure. Normal CI never writes a tracked reference, copies `actual.png` to expected output, or runs a baseline-update command.

The three authority/baseline classes are deliberately disjoint:

* `OWNER_APPROVED_DESIGN_AUTHORITY`: the approved visual destination. For Inbox this is `tests/fixtures/owner-visual/PersianGravity-Visual-Reference-Final.html` at SHA-256 `666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81`.
* `PREVIEW_RUNTIME_BASELINE`: a reviewed, versioned authentic-runtime capture for cross-commit drift during convergence. None is admitted in v1; same-run `reference.png` is explicitly only a stability control.
* `OWNER_APPROVED_RUNTIME_GOLDEN`: an authentic pinned integrated-runtime capture explicitly approved by the Owner after convergence. None exists or is activated.

The already-versioned Owner HTML references and their hashes are recorded in `tests/visual-regression/references/manifest.json`. CI does not access Google Drive. The approved Inbox HTML is authoritative for design convergence, but it is not an authentic-runtime Golden. Different shell, crop, chrome, data, native controls, and document height mean a raw full-page pixel score is not by itself a valid measure of conformity; controlled geometry and style relationships must be extracted from deterministic renders instead.

## Integrated SRWF runtime boundary

The thing to measure for design convergence is the final integrated SRWF Inbox: target theme shell, SRWF Host Companion's supported Inbox Page role and canonical Full Width canvas, Gravity Forms, Gravity Flow, the exact GPP revision, applicable PersianGravity behavior, the approved Vazir/Vazirmatn provider, and authoritative coexistence plugins such as GTB where deployed. Merely activating Host Companion is insufficient: its Inbox role must select the captured Page, its supported apply path must assign the canonical template, and runtime evidence must prove that WordPress resolved that template before capture.

The historical WU21 functional lane is pinned to WordPress 6.8.3 and PHP 8.2.34. Current SRWF Host Companion 0.2.0 declares WordPress 7.1 and PHP 8.3 minimums and is qualified on WordPress 7.1.1, PHP 8.3.33, and Twenty Twenty-Five 1.5. Therefore the minimal WU21 runtime is not evidence of the integrated design destination and its platform tuple must not be silently changed. A separate Integrated SRWF Visual Runtime is required unless later compatibility evidence proves a shared tuple safe.

That integrated lane must record immutable identities for Host Companion, PersianGravity, Vazir/Vazirmatn, GTB when required, Gravity packages, theme, browser, and design authority. Missing required identities or a Full Width assignment mismatch is an infrastructure failure, never a fallback to the minimal WU21 screenshot path. PersianGravity's optional Jalali presentation must remain honestly disabled unless this exact Inbox scenario admits and configures it. GTB may be present for coexistence detection without acquiring Inbox ownership.

## Visual Convergence Matrix

Scenario configuration maps evidence to: **A** TT25 shell; **B** content axis/spacing; **C** search/results; **D** cards; **E** media; **F** empty state/native empty-grid height; **G** native pagination; **H** mobile; **I** desktop; **J** 200% zoom/no overflow; **K** RTL; **L** accessibility-visible focus/reflow; and **M** manual refresh. The manifest reports each scenario's letters. Existing WU17/WU21 controls remain authoritative for live refresh, mixed readiness, RTL behavior, accessibility, and host semantics. A genuine browser-zoom scenario is reserved: root-font scaling is explicitly not accepted as browser zoom.

The first capture set covers shortcode and authentic block independently at desktop/mobile, plus search result, no result, native pagination, and focus/reflow. Host-native no-task height remains accepted host state; its dedicated authentic fixture adapter is listed as pending rather than simulated.

## Reading evidence

The screenshot is the alarm. `geometry.json`, `computed-styles.json`, and `dom-summary.json` are the diagnosis instruments. Geometry includes anchor rectangles and the critical Card Mode/native AG Grid relationships: visual card-flow height, native body viewport height, their delta, last-card-to-pager gap, pager overlap, card width/columns, and document overflow. Native pagination capability is accepted; broken card-to-pagination geometry is observable. AG Grid internal clipping is not page overflow.

Each scenario contains `reference.png`, `actual.png`, `diff.png`, `metrics.json`, `geometry.json`, `computed-styles.json`, `dom-summary.json`, and `environment.json`. Root files contain the final `manifest.json` and PR `changed-files.json`. Changed files are correlation evidence, never an automatic claim of cause. Pixelmatch ignores minor anti-aliasing classification (`includeAA: false`) and uses a calibrated per-pixel threshold; it is intentionally not byte equality.

The v1 cross-commit evidence ceiling is explicit: no runtime baseline is admitted. Repeated same-runtime captures calibrate self-noise and exercise diagnostics, while the synthetic comparator falsification proves that a meaningful mutation alarms. These controls do not prove integrated design convergence. A future reviewed preview baseline can replace the same-run stability reference without changing the bundle schema. Missing configured references must fail; they never silently fall back.

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

The current diagnostics code extends the existing WU21 exact-Head lab for capture-mechanism qualification, but that minimal tuple is not the Owner-clarified Integrated SRWF Visual Runtime and must not be presented as design-convergence evidence. WU21's path filter avoids documentation-only execution. Artifacts are uploaded with normal immutable evidence on success and with bounded failure diagnostics on infrastructure failure. Preview warnings leave the browser command successful; absent or invalid evidence fails it. `APPROVED_VISUAL_CONTRACT` remains inactive until the Owner separately approves authentic integrated-runtime Goldens.
