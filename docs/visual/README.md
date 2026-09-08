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
