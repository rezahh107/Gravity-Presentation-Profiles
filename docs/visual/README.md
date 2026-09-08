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

The first profile family is SRWF and the first visual contract is Public Registration.

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
visual_ux_contract: OWNER_APPROVED_VISUAL_AUTHORITY__RUNTIME_VALIDATION_REQUIRED
owner_visual_choices: CLOSED
visual_reference_manifest: RUNTIME_VALIDATION_REQUIRED
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

## Important accessibility note

The owner intentionally selected below-input placement for help text and field validation messages even though current Gravity Forms accessibility guidance recommends above-input placement.

This is a valid project-specific visual decision only if real runtime validation proves that semantic association, reading order, focus/keyboard behavior, error identification, and screen-reader behavior remain acceptable.

Do not convert this owner decision into a generic Base rule.

## Admission rule

Do not treat generated text, screenshots, filenames, or mockup labels such as `FINAL`, `APPROVED`, or `CLOSED` as authority by themselves.

Before a visual contract/gallery artifact is admitted, review:

- source quality and provenance;
- separation of external baseline, host constraints, and project-specific choices;
- cross-artifact conflicts;
- mockup-only behavior leakage;
- accessibility conflicts;
- host ownership boundaries;
- runtime-sensitive `NOT_PROVEN` items;
- exact owner decisions still required.

## Canonical gallery rule

A screenshot or HTML mockup does not become a canonical reference automatically.

The current SRWF Registration manifest is materialized but not yet an approved canonical runtime gallery.

A reference may be marked `APPROVED` only after applicable real-host validation and reconciliation with the governing Visual/UX Contract.

Each approved reference should carry traceable metadata including:

- reference ID;
- surface/profile;
- viewport;
- state;
- governing contract/version;
- host state owner;
- presentation owner;
- exclusions such as browser chrome/device frames;
- runtime validation requirements.

## Behavior firewall

```text
Host plugins create behavior/state.
Gravity Presentation Profiles styles that state.
Gallery shows what the styled state should look like.
```

Interactive mockup JavaScript is visual-demonstration evidence only unless independent host/runtime evidence proves the plugin should own that behavior.
