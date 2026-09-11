# Visual Contract Admission Area

This directory contains admitted profile-specific visual evidence, contracts, and gallery manifests.

## Governing order

```text
Mother Architecture
        ↓
Applicable standards / accessibility requirements
        ↓
Visual / UX Contract
        ↓
Canonical Visual Reference Gallery
        ↓
Implementation
        ↓
Real runtime validation
```

A visual reference illustrates the contract; it does not override it.

## Current SRWF Registration state

Current files:

```text
SRWF_PUBLIC_FORM_EXTERNAL_UX_BASELINE_v1.0.0.md
SRWF_PUBLIC_REGISTRATION_VISUAL_UX_CONTRACT_v1.0.0.md
SRWF_PUBLIC_REGISTRATION_VISUAL_REFERENCE_MANIFEST_v1.0.0.yaml
SRWF_PUBLIC_VISUAL_EVIDENCE_SYNTHESIS_REVIEW.md
```

Current status:

```yaml
external_baseline: ADMITTED_SUPPORTING_EVIDENCE__RUNTIME_CONFORMANCE_NOT_PROVEN
visual_ux_contract: OWNER_APPROVED_WITH_EXPLICIT_RESOLUTION_STATES
owner_visual_choices: CLOSED
visual_reference_manifest: MATERIALIZED_WITH_EXPLICIT_PROVENANCE__RUNTIME_VALIDATION_REQUIRED
canonical_gallery_approved: false
production_implementation: NOT_STARTED
```

The owner-closed canonicalization bundle is:

```yaml
mobile_horizontal_padding: 16px
help_text_placement: below_input
validation_message_placement: below_input
control_border: "#8690A1"
desktop_outer_surface: white_card
```

## Current SRWF Gravity Flow / A4 operational baseline

The owner-selected six-surface Gravity Flow/A4 presentation authority admitted by `WU-GPP-GF-FINAL-VISUAL-BASELINE-15` is:

- [`SRWF_GRAVITY_FLOW_A4_VISUAL_BASELINE_CONTRACT_v1.0.0.md`](SRWF_GRAVITY_FLOW_A4_VISUAL_BASELINE_CONTRACT_v1.0.0.md)

Current status:

```yaml
gravity_flow_a4_visual_baseline: OWNER_LOCKED__ADMITTED_BY_WU15
runtime_implementation: NOT_IMPLEMENTED_BY_WU15
runtime_selectors_hooks_permissions: NOT_PROVEN_BY_WU15
canonical_surface_count: 6
canonical_print_path: DIRECT_BROWSER_HTML_CSS__A4_PORTRAIT__TWO_PAGES
surface_profile_resolution_v1: SHARED_DEFAULTS_PER_SURFACE
reserved_extension_seam_v1: INERT
```

This contract binds the corrected owner Handoff plus the immutable final HTML/PDF evidence identities, records the scoped D-17 print-path supersession, preserves `OD-001..OD-034`, and remains the locked visual/print authority for later operational-surface work.

The admitted HTML/PDF remain visual/behavior evidence, not production runtime architecture. WU15 adds no Gravity Flow adapter, print renderer, selector/hook/API claim, field-permission claim, workflow behavior, or production surface implementation.

### WU16 semantic-binding / data / asset evidence

The current WU16 evidence artifact is:

- [`SRWF_GRAVITY_FLOW_DATA_ASSET_BINDING_MATRIX_v1.0.0.md`](SRWF_GRAVITY_FLOW_DATA_ASSET_BINDING_MATRIX_v1.0.0.md)

Run001 remains historical evidence on PR #6. Its old conclusion that missing concrete target IDs and unavailable logo assets blocked WU16 was superseded by the admitted semantic-binding architecture and the Owner-approved logo identities supplied to Run002. History is not rewritten; current authority is explicit.

Current WU16 contract state:

```yaml
work_unit: WU-GPP-GF-BINDING-MATRIX-16
current_run: RUN-GPP-GF-BINDING-MATRIX-16-002
semantic_binding_architecture: SHARED_DEFAULTS_PER_SURFACE__SEPARATE_ENVIRONMENT_BINDINGS
portable_semantic_slots: MATERIALIZED
target_binding_state_vocabulary:
  - PROVEN
  - UNBOUND
  - NOT_PROVEN
  - NOT_APPLICABLE
runtime_availability_editability_authorization: SEPARATE_EVIDENCE_DIMENSIONS
multi_form_inbox_binding_selection: PER_ENTRY_HOST_CONTEXT__NO_PROFILE_SWITCH
target_gravity_forms_version: NOT_PROVEN
target_gravity_flow_version: NOT_PROVEN
target_form_field_step_route_bindings: UNBOUND
school_filter: OMIT_UNTIL_TARGET_INBOX_EXPOSURE_PROVEN
due_overdue: OMIT_WITHOUT_PROVEN_AUTHORITATIVE_DUE
inbox_search: NATIVE_GLOBAL_INBOX_SEARCH_ADMITTED__TARGET_CONFIGURATION_NOT_PROVEN
approved_razavi_logo_asset: PROVEN
approved_kanoon_logo_asset: PROVEN
vazir_source_authority: PROVEN
current_definition_acceptance: AC_WU16_001_THROUGH_011_PASS
runtime_implementation: NONE
```

Concrete target Form/Field/Step/Page/route identifiers are environment binding evidence, not portable visual-profile identity. `UNBOUND`/`NOT_PROVEN` values fail closed only for dependent successor behavior and do not authorize guesswork, semantic fallback, cross-form substitution, a replacement search/data path, or a form-specific visual profile.

## Determinism rule

Every implementation-driving visual item must have an explicit truth state inside the Visual/UX Contract.

- exact canonical values/rules may drive implementation;
- `NON_NORMATIVE_REFERENCE` is context only;
- `NOT_PROVEN` must fail closed and must not be guessed;
- approximate prose never silently becomes a production value.

The Visual/UX Contract remains the single visual-rule authority; do not create a parallel token/rule registry.

## Visual provenance rule

The visual-reference manifest is the provenance SSOT for Gallery references.

Every reference must declare provenance state. A replayable source requires a durable locator/identity plus a SHA-256 computed from the exact inspected bytes. When exact bytes are not durably available, use an explicit unbound state and keep the digest uncomputed.

A non-replayable/unbound visual source may not independently establish a canonical or confirmed numeric rule. An owner-approved or higher-authority rule may remain canonical when its independent authority basis is explicitly stated.

Do not fabricate hashes, locators, repository paths, or approval state. Do not commit raw visual artifacts merely to make provenance look complete.

## Important accessibility note

The owner intentionally selected below-input placement for help text and field validation messages even though current Gravity Forms accessibility guidance recommends above-input placement.

This is a valid project-specific visual decision only if real runtime validation proves that semantic association, reading order, focus/keyboard behavior, error identification, and screen-reader behavior remain acceptable.

Do not convert this owner decision into a generic Base rule.

## Canonical gallery rule

A screenshot or HTML mockup does not become a canonical reference automatically.

The current SRWF Registration manifest is materialized but not an approved canonical runtime gallery. A reference may be marked `APPROVED` only after applicable real-host validation and reconciliation with the governing Visual/UX Contract.

## Behavior firewall

```text
Host plugins create behavior/state.
Gravity Presentation Profiles styles that state.
Gallery shows what the styled state should look like.
```

Interactive mockup JavaScript is visual-demonstration evidence only unless independent host/runtime evidence proves the plugin should own that behavior.
