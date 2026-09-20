# Changelog

All notable changes to Gravity Presentation Profiles will be documented here.

The project intends to follow Semantic Versioning once production releases begin.

## [Unreleased]

### Added

- Explicit owner-facing semantics for the existing per-form GPP presentation `enabled` switch, preserving profile configuration while OFF and adding a non-blocking exact-token warning when `srwf-registration-theme` indicates a potential Gravity Theme Builder overlap.
- Explicit production adoption for the shipped SRWF Gravity Flow Inbox profile, reusing the existing EnvironmentBindingSet and conflict-safe VisualPackageLifecycle rather than introducing a second mapping or activation authority.
- Source/version-bound Inbox runtime availability qualification for mapped Gravity Forms fields, authentic `date_created` entry metadata, and Gravity Flow's current-step API, with authorization deliberately left to Gravity Flow on every request.
- Frontend reachability for the existing manual `به‌روزرسانی کارهای من` recovery control on the supported Gravity Flow Inbox, retaining normal same-page reload behavior and native Live Refresh ownership.
- Authentic WU21 PR4 qualification for explicit setup, semantic derivation, mixed-readiness fallback, frontend manual refresh, native search/sort/paging/navigation/Live Refresh preservation, responsive sizing, and Owner A/B evidence capture.
- Production SRWF operations profile package at `profiles/srwf/operations/operations-package-v1.json`, covering the `gravity_flow.inbox`, `gravity_flow.entry_detail`, and `print.dossier` surfaces and shipped in the installable ZIP.
- Bounded operations setup path in Gravity Forms plugin settings that installs the shipped operations package, adopts the Print presentation profile, and creates the environment binding context for one explicitly selected form.
- Compare-and-set visual activation (`VisualPackageLifecycle::activateIfCurrent()`), so an unattended setup path cannot replace a different existing surface activation.
- Environment binding-set schema `1.1.0`, an additive revision whose only change is an optional `print_option_map` on a `print_mapping` runtime claim, letting an environment declare what its own Gravity Forms raw choice values mean for the canonical Print option vocabulary.
- Explicit Print option confirmation (`BindingRepairService::confirmPrintOption()`), now managed beside the bound semantic row. An administrator states what one real host choice value means for one canonical Print option, and the value must already exist in the bound field's own choice list.
- Row-oriented Mapping & Binding Health controls for admitted Gravity Forms-backed semantics, with one exact field selector and explicit Apply action per semantic slot.
- First-class explicit unmap (`BindingRepairService::unmapField()`), producing a new immutable binding-set version with the selected slot `UNBOUND`, its source/evidence cleared, unrelated mappings preserved, and source-tied runtime proof invalidated.
- Explicit per-canonical-option `Not confirmed` handling for Print choice proof without changing the bound host field.
- Configuration-readiness projection in plugin settings, reported strictly as configuration facts and never as a claim that any user may print.
- Per-asset Print asset integrity reporting that distinguishes a missing required asset from one whose bytes no longer match the declared release identity.
- Automated coverage for the operator setup path, seed semantics, activation-conflict handling, rerun preservation, stale Print-proof invalidation, raw-versus-display reads, canonical choice mapping, and the two-page composition.
- Authentic disposable WordPress admin-browser qualification for row-level stale-binding repair, fresh immutable-version rollback availability, and post-rollback health re-evaluation through the real Gravity Forms Add-On settings form.
- Behavioral Production Reachability qualification from the canonical built ZIP through a real WordPress/Gravity Forms/Gravity Flow runtime, authentic operator setup, mapping repair, setup rerun preservation, and production-path runtime resolution without fixture-provisioned GPP state.
- Authentic Inbox production hardening: explicit setup reachability, human-readable Gravity Forms display values, authoritative photo resolution, fail-closed mixed-readiness behavior, content-derived stylesheet cache identities, and retained native Gravity Flow search, sorting, paging, navigation and Live Refresh ownership.
- Full Width Inbox composition with a soft neutral page canvas, centered bounded content axis, semantic `کارهای من` heading/helper, authentic host controls, responsive two-column/one-column card layout, and clearer native AG Grid pagination without introducing a second pager.
- Authentic Entry Detail production reachability and setup qualification against Gravity Forms `3.1.1.1` / Gravity Flow `3.1.0`, including current-step/status sources, read-only review admission, action eligibility separation, runtime decision evidence, and fail-closed native fallback.
- Entry Detail mapping workflow over the existing authoritative EnvironmentBindingSet lifecycle, allowing active-profile field-backed semantics to be reviewed and repaired together without hard-coded target field IDs or a second mapping store.
- Entry Detail resilience hardening for Gravity Flow field visibility, Gravity Forms display formatting, read-only viewer handling, per-semantic degradation, native action ownership, and privacy-safe diagnostic state.
- Owner-approved read-only Entry Detail Review architecture: one semantic GPP dossier, scoped suppression of the duplicate native read-only field table, native Gravity Flow workflow/status/action controls, and native User Input/editor fallback without structural JavaScript dependency.
- Reversible Entry Detail visual variants through the existing VisualPackageLifecycle: the accepted Current / Safe presentation remains selectable while Full Width is a separate presentation identity with no workflow or binding authority change.
- Full Width workflow-panel presentation markup for `اقدام شما`, bounded guidance, authentic current-stage facts, and a Gravity Flow ownership footer while preserving the original native Note field and Approval controls.
- Full Width native Timeline presentation using the authentic Gravity Flow history nodes, with RTL event-card/rail/metadata geometry and responsive reflow while preserving native event order, actor, timestamp and source content.
- Bounded semantic Timeline presentation for proven Approval, workflow-transition and system events, including Persian title/subtitle hierarchy and semantic color/icon reinforcement; unmatched events remain neutral and native rather than being guessed from arbitrary visible text.
- Entry Detail Print utility UX with a semantic `چاپ پرونده` control, immediate truthful `در حال آماده‌سازی چاپ…` Busy feedback, duplicate-activation guard, accessible live/busy state, reduced-motion support, and bounded recovery while Gravity Flow retains fresh Print authorization and actual Print invocation.

### Changed

- `workflow.due_at` remains in the SRWF Inbox semantic catalogue but is optional for Card Mode readiness; absent/unproven Due never fabricates a deadline and never makes an otherwise-ready row unready.
- Inbox typography and content-relative spacing use `rem` while the WordPress `782px` breakpoint, avatar/media crop dimensions, AG Grid host-sensitive dimensions, 1px borders/accessibility pattern, and existing radii remain unchanged.
- Inbox Full Width composition now bounds content to a centered responsive axis while the surrounding canvas remains full-width; the pinned Gravity Flow runtime continues to own AG Grid state, and AG Grid `25.2.0` native paging is preserved because that bundled version does not expose the newer `pageNumbers` panel capability.
- WU21 no longer uses a test-only semantic Inbox adapter to create Card data; fixtures now reach positive Inbox state through Operations setup, normal binding repair, explicit Inbox setup, and the production presentation adapter, while the MU-plugin remains diagnostics-only for native polling transport.
- Mapping & Binding Health now uses stable semantic slot keys as row identity and keeps the global control for explicit immutable-version rollback only; ordinary field mapping and unmapping are performed on the exact row being changed.
- Direct-field selectors show the live Gravity Forms Field ID, label, and field type without label guessing or compatibility heuristics; an unchanged exact mapping is a service-level no-op rather than an unnecessary new binding version.
- Derived semantics such as `student.full_name` and host-managed/non-field Gravity Flow semantics are shown as such instead of being offered the arbitrary Gravity Forms field inventory.
- Print choice mapping is shown beside an eligible bound choice semantic, using canonical option identities from the existing Print contract and real raw/text choices from the authoritative Gravity Forms field definition; unchanged confirmations are no-ops.
- SRWF dossier Print typography now selects the admitted `Vazir` family first and reuses the existing Vazir plugin's self-hosted delivery through Gravity Flow's Print stylesheet seam; GPP still owns no font binaries or independent font loader.
- `student.full_name` is now derived read-only from the separately bound `student.first_name` and `student.last_name` slots, matching the authoritative binding matrix. A derived slot can no longer be read as a direct host source, and an unresolved component leaves the field blank instead of printing a half-composed identity.
- `BoundHostValueReader` exposes separate `readRaw()` and `readDisplay()` entry points instead of one ambiguous `read()`. Print option selection compares authoritative raw host values; presentation text uses the host display label.
- `BoundHostValueReader` now passes Gravity Forms' `get_value_entry_detail()` arguments in their documented positions; the entry array was previously passed where the currency code belongs.
- Print option selection is driven by the active binding set's declared option map rather than raw choice values assumed by the adapter.
- Print setup and model-resolution failures report distinct reasons (`print_surface_not_activated`, `activated_package_unresolved`, `semantic_package_unusable`, `required_asset_missing`, `required_asset_modified`, `runtime_exception`) instead of collapsing into `profile_not_active`.
- Explicit binding repair or unmap also drops a Print option map that described the previous source's raw values, alongside the runtime proof it invalidates.
- Inbox and Entry Detail presentation assets use content-derived cache identities where needed so installing new plugin bytes cannot silently retain stale visual CSS under an unchanged development plugin version.
- Entry Detail now separates page-fatal structural admission from per-semantic completeness: ordinary unmapped, stale or mapped-empty facts degrade locally instead of suppressing the whole dossier, while Gravity Flow-hidden facts remain host-governed and omitted.
- Entry Detail presentation is primarily read-only during Review; editing/correction remains a native Gravity Flow concern, with native workflow controls, authorization, validation, transition state and history preserved as host authority.
- Full Width Entry Detail remains presentation-only and keeps Current / Safe as the reversible rollback path; small server-rendered semantic markup is admitted only in bounded presentation seams and does not create workflow state or a second source of truth.
- Timeline semantic styling follows proven event evidence rather than decorative color assignment: Approval uses success semantics, transitions use informational semantics, system events remain neutral, and unknown/unproven event meaning stays neutral.
- The per-form Gravity Forms presentation switch now cleanly supports GTB coexistence: disabling GPP form presentation leaves Inbox, Entry Detail, Print, mappings and diagnostics active.

## [0.1.0] - 2026-09-15

### Added

- Generic product architecture for Gravity Presentation Profiles.
- SRWF defined as the first major profile family rather than the identity of the core plugin.
- Repository agent contract and governance scaffolding.
- Source-versus-distribution release boundary.
- Initial CI/repository guardrails and documentation structure.
- Admitted external UX/accessibility baseline for SRWF Public Registration.
- Owner-approved SRWF Public Registration Visual/UX Contract v1.0.0.
- SRWF Public Registration visual reference manifest with runtime-validation gates.
- Evidence-synthesis review and owner canonicalization closure record.
- Dependency-free visual-governance validator and mutation controls for contract determinism and visual-reference provenance.
- Bounded generic core bootstrap for `WU-GPP-CORE-BOOTSTRAP-01`, including Gravity Forms Add-On integration, per-form profile state, deterministic resolution, conditional assets, and automated tests.
- Portable visual-profile package schema 1.1 with selected-surface support and controlled declarative Gravity Forms presentation preferences.
- Lifecycle-backed declarative package import/validation and immutable package/version activation behavior.
- Native Gravity Flow Inbox presentation with fail-closed semantic-binding readiness and host-owned search, sorting, pagination, navigation, and Live Refresh preserved.
- Native Gravity Flow Entry Detail dossier presentation and direct two-page A4 Print Dossier presentation on existing Gravity Flow authority seams.
- Mapping & Binding Health management with explicit immutable repair/rollback and stale-action concurrency protection.
- Local runtime decision traces, bounded diagnostics, sanitized support-bundle download, and authentic admin-runtime evidence.
- Manual native Inbox reload fallback `به‌روزرسانی کارهای من` without a second polling/refresh subsystem.
- Fixed offline General LLM Authoring Prompt V1 with local copy/download and existing package-import lifecycle reuse.
- Automated Production Release System V1 dry-run, canonical ZIP builder/validator, exact-ZIP smoke path, release identity controls, and Owner-facing release operation documentation.
- `GPL-2.0-or-later` repository/plugin licensing, with the standard GNU GPL v2 text included in the canonical installable ZIP.
- Materialized release compatibility authority for WordPress `6.8.3`, PHP `8.2`, Gravity Forms `3.1.1.1`, and Gravity Flow `3.1.0` minimums.

### Changed

- Closed SRWF Registration visual choices at `16px` mobile padding, below-input help text, below-input field validation messages, `#8690A1` control border, and a white desktop outer form surface.
- Reclassified approximate implementation-driving typography, focus-ring, spacing, shadow, and desktop-pairing observations as explicit `NON_NORMATIVE_REFERENCE` or `NOT_PROVEN` states instead of implicit canonical values.
- Added explicit fail-closed provenance state to every current visual reference; external visual material cannot independently establish canonical numeric rules without admitted evidence.
- Repository CI can now be dispatched against an exact release-candidate branch so production release qualification reuses the same repository guardrails and DB advisory-lock contracts.
- Release-facing status now records the resolved personal/private-use context, license, compatibility floors, and Owner-approved first production version `0.1.0` while normal source remains `0.0.0-dev` and actual publication remains a separate explicit Owner action.
- Release dry-run and contract/mutation tests now prove the resolved prerequisite state, WordPress/PHP metadata synchronization, LICENSE packaging/byte identity, and the existing negative fail-closed cases without creating a production candidate, tag, or GitHub Release.
