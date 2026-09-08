# SRWF Public Visual Evidence — Synthesis Review

```yaml
source_prompt_id: SRWF-PUBLIC-VISUAL-CONTRACT-EVIDENCE-SYNTHESIS-02
source_work_unit_id: WU-SRWF-PUBLIC-VISUAL-CONTRACT-02
review_status: OWNER_CANONICALIZATION_COMPLETE
visual_contract_status: OWNER_APPROVED
canonical_gallery_status: RUNTIME_VALIDATION_REQUIRED
implementation_authorized: false
```

## Executive verdict

The evidence synthesis was accepted as sufficient to establish the SRWF Public Registration Visual/UX Contract, subject to real host/runtime validation for accessibility- and markup-sensitive behavior.

The owner then closed the remaining visual-choice bundle.

## Owner-closed decisions

```yaml
mobile_horizontal_padding: 16px
help_text_placement: below_input
validation_message_placement: below_input
control_border: "#8690A1"
desktop_outer_surface:
  type: white_card
  page_background: "#F6F8FB"
  surface: "#FFFFFF"
  radius: 16px
  max_width: 840px
  shadow: none_or_very_subtle
```

These decisions supersede the previously open project-specific alternatives.

## Important nuance: help/error placement

Current Gravity Forms accessibility guidance recommends above-input placement for descriptions and validation messages.

The owner intentionally selected below-input placement for the SRWF visual profile.

This is recorded as a project-specific visual decision, **not** as a claim that Gravity Forms guidance is wrong and not as proof of WCAG conformance.

The decision is acceptable only if real runtime validation confirms that descriptions/errors remain correctly associated, discoverable, readable, keyboard-safe, and screen-reader-safe.

## Evidence-derived SRWF visual system

The admitted draft established a stable visual family including:

- page background `#F6F8FB`;
- white surface `#FFFFFF`;
- primary text `#172033`;
- primary action `#1D4ED8`;
- pressed primary `#1E40AF`;
- error `#B42318`;
- success `#18794E`;
- control radius `10px`;
- upload radius `12px`;
- card radius `16px`;
- control min-height `52px`;
- primary button min-height `56px`;
- mobile single-column composition;
- desktop form width around `840px`;
- selected short-field pairing only;
- school/upload/complex states remaining full width where needed.

The owner-approved control border is now `#8690A1`, replacing the earlier `#8993A4` candidate.

## Host behavior firewall

The synthesis correctly kept these behaviors outside Gravity Presentation Profiles ownership:

```text
Gravity Forms validation / conditional logic / submission
GP Advanced Select search / selection / keyboard lifecycle
GP File Upload Pro upload / crop / re-crop lifecycle
PersianGravity Jalali/Persian field behavior
```

Mockup scripts remain presentation evidence only.

## Runtime-sensitive gaps still open

```yaml
actual_gravity_forms_markup: NOT_PROVEN
actual_persiangravity_jalali_widget: NOT_PROVEN
actual_gpas_markup_and_configuration: NOT_PROVEN
actual_gpfup_markup_and_crop_configuration: NOT_PROVEN
keyboard_order: NOT_PROVEN
focus_management: NOT_PROVEN
aria_relations: NOT_PROVEN
screen_reader_output: NOT_PROVEN
exact_production_breakpoint: NOT_PROVEN
runtime_control_contrast: NOT_PROVEN
```

These are evidence/validation gaps, not open owner visual choices.

## Closure

```yaml
owner_visual_choice_bundle: CLOSED
visual_ux_contract: OWNER_APPROVED
external_baseline: ADMITTED_SUPPORTING_EVIDENCE
gallery_manifest: MATERIALIZED_BUT_NOT_APPROVED
runtime_validation: REQUIRED
production_implementation: NOT_STARTED
```

The next architectural boundary is runtime/implementation planning against the approved contract; no Gallery reference should be marked `APPROVED` before real host validation.
