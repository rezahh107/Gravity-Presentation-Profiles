# Inbox visual regression diagnostics v1

## Lifecycle modes and image classes

`PREVIEW_DIAGNOSTIC` is active. It records visual differences as evidence and warnings; a visual difference alone does not fail CI while the design converges. A missing fixture/reference, browser or comparator crash, malformed output, or absent manifest is an infrastructure failure and does fail CI.

`APPROVED_VISUAL_CONTRACT` is represented in configuration but is deliberately inactive. It may be enabled only after an explicit Owner decision and the reviewed addition of authentic-runtime images classified `OWNER_APPROVED_GOLDEN`. In that mode a material calibrated difference is a contract failure. Normal CI never writes a tracked reference, copies `actual.png` to expected output, or runs a baseline-update command.

The three authority/baseline classes are deliberately disjoint:

* `OWNER_APPROVED_DESIGN_AUTHORITY`: the approved visual destination. For Inbox this is `tests/fixtures/owner-visual/PersianGravity-Visual-Reference-Final.html` at SHA-256 `666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81`.
* `PREVIEW_RUNTIME_BASELINE`: a reviewed, versioned authentic-runtime capture for cross-commit drift during convergence. None is admitted in v1; same-run `reference.png` is explicitly only a capture-stability control despite the legacy filename.
* `OWNER_APPROVED_RUNTIME_GOLDEN`: an authentic pinned integrated-runtime capture explicitly approved by the Owner after convergence. None exists or is activated.

The already-versioned Owner HTML references and their hashes are recorded in `tests/visual-regression/references/manifest.json`. CI does not access Google Drive. The approved Inbox HTML is authoritative for design convergence, but it is not an authentic-runtime Golden. Different shell, crop, chrome, data, native controls, and document height mean a raw full-page pixel score is not by itself a valid measure of conformity; controlled geometry and style relationships must be extracted from deterministic renders instead.

## Integrated SRWF runtime boundary

The visual contract is the GPP-owned Inbox surface only: from the semantic "کارهای من" heading/helper through search/results/cards and the native pagination area. Header, footer, logo, navigation, Elementor site composition, theme shell, and all page styling outside `[data-gpp-inbox-surface="gravity_flow.inbox"]` are explicitly out of scope. Runtime screenshots used by the comparator are cropped to that GPP Inbox surface rather than the whole page.

The forward test host is pinned Hello Elementor 3.5.1, Elementor 4.3.1, and the Owner-supplied modified Elementor Pro 4.3.0 package, all byte-verified against the explicit host-runtime contract. Host composition is owned by the repository-versioned `tests/visual-regression/fixtures/elementor-host-v1.json` artifact. That artifact carries the reviewed Elementor page export, document/template identity, page settings, explicit site-settings state, and one Inbox mount token. `setup-elementor-visual-host.php` only validates the fixture identity/hash, reconstructs it for both WU21/P06 page families, and binds the authentic Inbox mount; it is not a second composition authority. Elementor Pro is recorded truthfully as `OWNER_SUPPLIED_MODIFIED_PACKAGE`; WordPress outbound HTTP is blocked in this test lane before activation so the modified package cannot make WordPress HTTP requests to external services.

The historical WU21 functional lane remains pinned to WordPress 6.8.3 and PHP 8.2.34 and executes before host activation. A subsequent integrated visual-host stage installs the exact pinned host packages, activates them, reconstructs the deterministic Full Width host, verifies package/template identities and `SRWF-Host-Companion` absence, then runs diagnostics. Thus historical functional observations are not relabeled as proof of the visual host.

The integrated stage records the immutable host-fixture identity/hash, exact host package identities, Gravity versions, theme, browser, repository SHA, capture scope, and design-authority hash. Missing, malformed, tampered, wrong-template, or non-importable fixture state; an active or WordPress-registered `SRWF-Host-Companion`; or failure to render the Inbox DOM inside the exact fixture-declared shortcode mount and its Elementor container is an infrastructure failure. Elementor/theme shell geometry and document-level overflow are not authenticity gates; overflow diagnostics are scoped to the Inbox surface itself. `rezahh107/Vazir` is admitted only in the integrated visual lane as the font-delivery owner, pinned to commit `ad8feae35a4e1c27fb13d646fa18abf05bb4e7b1`. Its packaged WOFF2 blobs for weights 300/400/500/700/900 are verified from the pinned Git source, the plugin is activated with frontend delivery enabled, and the same verified bytes are staged beside the immutable Owner HTML under that HTML's existing relative filenames. The approved HTML bytes/hash are not modified. Browser diagnostics must prove every required Vazir face loaded on both runtime and design-authority pages; `document.fonts.ready` alone is not accepted. PersianGravity and GTB remain unadmitted in this WU21 Inbox fixture, and `SRWF-Host-Companion` remains retired/unregistered.

## Visual Convergence Matrix

Scenario configuration maps executed evidence to: **A** host composition; **B** content axis/spacing; **C** search/results; **D** cards; **E** media; **F** empty state/native empty-grid height; **G** native pagination; **H** mobile; **I** desktop; **K** RTL; **L** accessibility-visible focus/reflow; and **M** manual refresh. **J** remains reserved for genuine 200% browser zoom and is explicitly absent from executed scenario matrices while that scenario is `NOT_EXECUTED`; root-font scaling is not accepted as browser zoom.

The composed-surface capture set covers the authentic frontend shortcode route at desktop/mobile, plus search result, no result, native pagination, and focus/reflow. The exact current `gravityflow/inbox` Block route remains covered by WU06/P06 for Card Mode, assets, native search/sort/pagination/Live Refresh and behavior, but it is not fed into the heading-to-pagination A/B comparator because production does not emit the GPP Full Width wrapper, `کارهای من` heading, or helper on that route. That is recorded as `NOT_PROVEN_PRODUCT_COMPOSITION_GAP`; this infrastructure PR does not fabricate a wrapper or repair production presentation. Host-native no-task height remains accepted host state; its dedicated authentic fixture adapter is listed as pending rather than simulated.

## Reading evidence

The screenshot-stability comparison is only a capture control. `design-vs-runtime.json` is the design-convergence channel and is evaluated against the versioned per-relation policy in `inbox-visual-contract.json`. Required geometry/style relations are classified PASS/WARNING/INVALID_EVIDENCE; PREVIEW warnings are non-blocking but project into scenario/manifest warning state, while missing/unclassifiable required evidence is an infrastructure failure. The versioned policy also maps every stateful action to required action-specific visual relations: search-result summary/control styling, authentic empty-state visibility/presentation, native pager current/disabled-state visuals, and focused-search outline/border/geometry. A stateful scenario cannot claim visual coverage unless all relations required by its action are serialized and evaluated. Geometry includes anchor rectangles and Card Mode/native AG Grid relationships. Two-card horizontal gap uses physical left/right ordering, independent of DOM/RTL order, and preserves negative overlap rather than applying absolute-value normalization.

Each scenario contains the Inbox-surface-only stability trio `reference.png`, `actual.png`, `diff.png`, plus `design-authority.png`, `design-authority-state.json`, `design-geometry.json`, `design-vs-runtime.json`, `host-integration.json`, `metrics.json`, `scenario-state.json`, `geometry.json`, `computed-styles.json`, `dom-summary.json`, and `environment.json`. `environment.json` additionally binds the exact Vazir source commit/blob identities and executable browser load evidence for runtime and design-authority pages, including the compared semantic elements' resolved family/weight. Action-bearing scenarios may proceed to capture only after `scenario-state.json` proves their native target state: the unique filtered row, zero-row native Grid, second page, or focused search input. Root files contain the final `manifest.json` and PR `changed-files.json`. Changed files are correlation evidence, never an automatic claim of cause. Pixelmatch ignores minor anti-aliasing classification (`includeAA: false`) and uses a calibrated per-pixel threshold; it is intentionally not byte equality.

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

The workflow first completes the unchanged WU21 functional/browser lane, then establishes the deterministic Hello/Elementor/Elementor Pro Full Width host and runs Inbox-surface design convergence. Every composed-surface scenario explicitly maps to Owner surface A (`inbox-desktop`) or B (`inbox-mobile`) and to a supported reference action; viewport width never chooses authority implicitly. Authentic Block functional parity remains a separate P06/WU06 control rather than being misreported as composed-surface visual parity. Reference actions use the HTML's own search, empty, pagination, and focus controls. Unknown surfaces/actions and swapped desktop/mobile mappings fail closed. Design comparison uses explicit versioned geometry/style relation tolerances because differing host DOM, native controls, and fixture text make full-region pixel equality semantically invalid. Same-run capture stability may PASS while design convergence reports `VISUAL_REGRESSION_WARNING`; that warning remains non-blocking in `PREVIEW_DIAGNOSTIC`. Absent, malformed, or unclassified required design evidence fails closed. `APPROVED_VISUAL_CONTRACT` remains inactive until the Owner separately approves authentic integrated-runtime Goldens.
