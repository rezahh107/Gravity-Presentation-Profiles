# Changelog

All notable changes to Gravity Presentation Profiles will be documented here.

The project intends to follow Semantic Versioning once production releases begin.

## [Unreleased]

### Added

- Production SRWF operations profile package at `profiles/srwf/operations/operations-package-v1.json`, covering the `gravity_flow.inbox`, `gravity_flow.entry_detail`, and `print.dossier` surfaces and shipped in the installable ZIP.
- Bounded operations setup path in Gravity Forms plugin settings that installs the shipped operations package, adopts the Print presentation profile, and creates the environment binding context for one explicitly selected form.
- Compare-and-set visual activation (`VisualPackageLifecycle::activateIfCurrent()`), so an unattended setup path cannot replace a different existing surface activation.
- Environment binding-set schema `1.1.0`, an additive revision whose only change is an optional `print_option_map` on a `print_mapping` runtime claim, letting an environment declare what its own Gravity Forms raw choice values mean for the canonical Print option vocabulary.
- Configuration-readiness projection in plugin settings, reported strictly as configuration facts and never as a claim that any user may print.
- Per-asset Print asset integrity reporting that distinguishes a missing required asset from one whose bytes no longer match the declared release identity.
- Automated coverage for the operator setup path, seed semantics, activation-conflict handling, rerun preservation, stale Print-proof invalidation, raw-versus-display reads, canonical choice mapping, and the two-page composition.

### Changed

- `student.full_name` is now derived read-only from the separately bound `student.first_name` and `student.last_name` slots, matching the authoritative binding matrix. A derived slot can no longer be read as a direct host source, and an unresolved component leaves the field blank instead of printing a half-composed identity.
- `BoundHostValueReader` exposes separate `readRaw()` and `readDisplay()` entry points instead of one ambiguous `read()`. Print option selection compares authoritative raw host values; presentation text uses the host display label.
- `BoundHostValueReader` now passes Gravity Forms' `get_value_entry_detail()` arguments in their documented positions; the entry array was previously passed where the currency code belongs.
- Print option selection is driven by the active binding set's declared option map rather than raw choice values assumed by the adapter.
- Print setup and model-resolution failures report distinct reasons (`print_surface_not_activated`, `activated_package_unresolved`, `semantic_package_unusable`, `required_asset_missing`, `required_asset_modified`, `runtime_exception`) instead of collapsing into `profile_not_active`.
- Explicit binding repair now also drops a Print option map that described the previous source's raw values, alongside the runtime proof it invalidates.

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
