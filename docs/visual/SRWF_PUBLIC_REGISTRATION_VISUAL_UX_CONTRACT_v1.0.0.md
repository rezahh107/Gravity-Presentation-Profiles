# SRWF Public Registration — Visual / UX Contract v1.0.0

```yaml
document_id: SRWF_PUBLIC_REGISTRATION_VISUAL_UX_CONTRACT
version: 1.0.0
surface: public-registration
status: OWNER_APPROVED_VISUAL_AUTHORITY__EXPLICIT_RESOLUTION_STATES__RUNTIME_VALIDATION_REQUIRED
source_work_unit: WU-SRWF-PUBLIC-VISUAL-CONTRACT-02
repair_work_unit: WU-GPP-PR1-COORDINATED-DOC-REPAIR-01
presentation_product: Gravity Presentation Profiles
profile_family: SRWF
profile: Registration
implementation_authorized_by_this_document: false
gallery_runtime_approval: false
```

## 1. Purpose

This contract defines the visual and responsive rule authority for the SRWF Public Registration profile of Gravity Presentation Profiles.

It does not define data, validation logic, conditional logic, workflow, upload rules, search algorithms, crop behavior, or other host-owned behavior.

A rule is implementation-driving only when this contract gives it an exact canonical value/rule or a separately identified higher-authority basis. Approximate visual observations remain reference-only until explicitly resolved.

## 2. Authority order

```text
Gravity Presentation Profiles Mother Architecture
> applicable mandatory accessibility requirements
> this Visual / UX Contract
> Canonical Visual Reference Gallery
> implementation
> runtime visual/accessibility validation
```

The Gallery illustrates this contract; it does not override it.

## 3. Ownership boundary

```text
Gravity Forms
→ form lifecycle, validation, conditional logic, submission, native field semantics

GP Advanced Select
→ enhanced-select search, selection, keyboard, mobile, screen-reader lifecycle

GP File Upload Pro
→ upload, preview, crop/re-crop/zoom, upload validation lifecycle

PersianGravity
→ Persian/Iranian field behavior where applicable

Vazir
→ font delivery in the current SRWF environment

Gravity Presentation Profiles / SRWF Registration profile
→ visual composition, spacing, tokens, state appearance, responsive presentation
```

Host plugins create behavior/state; Gravity Presentation Profiles styles that state.

## 4. External baseline

This contract incorporates the constraints recorded in `SRWF_PUBLIC_FORM_EXTERNAL_UX_BASELINE_v1.0.0.md`.

General accessibility/host requirements are not re-invented from screenshots.

## 5. Owner-closed canonicalization bundle

The following five owner decisions are closed and canonical for v1.0.0:

```yaml
canonicalization_correction_bundle:
  mobile_horizontal_padding:
    value: 16px
    status: OWNER_APPROVED

  help_text_placement:
    value: below_input
    status: OWNER_APPROVED
    note: deliberate deviation from current Gravity Forms accessibility recommendation; runtime semantics remain mandatory

  validation_message_placement:
    value: below_input
    status: OWNER_APPROVED
    note: deliberate deviation from current Gravity Forms accessibility recommendation; runtime semantics remain mandatory

  control_border:
    value: "#8690A1"
    status: OWNER_APPROVED

  desktop_outer_surface:
    value: white_card
    status: OWNER_APPROVED
```

The white-card decision is independently owner-authorized. Existing supporting values `page-bg: #F6F8FB`, `surface: #FFFFFF`, `radius-card: 16px`, and `desktop-content-max-width: 840px` remain separately canonical where listed in the token table below.

Historical `18px` mobile padding and direct-page-surface treatment are no longer canonical alternatives.

## 6. SRWF visual principles

`SRWF-VIS-001 — CONFIRMED`  
Use a calm, light, low-chrome visual language with a blue primary action and red/green semantic accents.

`SRWF-VIS-002 — CONFIRMED`  
Use a mobile-first single-column form with minimal card-in-card decoration.

`SRWF-VIS-003 — BOUNDED`  
Desktop two-column enhancement is permitted only for an exact pairing set admitted by this contract. The exact pairing set is currently `NOT_PROVEN`; therefore no implementation may infer pairings from screenshots or labels.

`SRWF-VIS-004 — CONFIRMED`  
Custom presentation must reveal/style authentic host state rather than create a shadow implementation of host behavior.

## 7. Deterministic implementation resolution states

This block is the deterministically inspectable resolution register inside the existing Visual/UX Contract. It is not a second visual SSOT.

<!-- GPP_RESOLUTION_STATE_BEGIN -->
```yaml
implementation_resolution_states:
  form_title_font_size: NON_NORMATIVE_REFERENCE
  form_title_line_height: NON_NORMATIVE_REFERENCE
  helper_text_font_size: NON_NORMATIVE_REFERENCE
  field_error_font_size: NON_NORMATIVE_REFERENCE
  desktop_title_enhancement: NON_NORMATIVE_REFERENCE
  focus_ring_exact_geometry: NOT_PROVEN
  focus_ring_exact_alpha: NOT_PROVEN
  field_vertical_rhythm: NON_NORMATIVE_REFERENCE
  major_section_rhythm: NON_NORMATIVE_REFERENCE
  desktop_short_field_pairings: NOT_PROVEN
  desktop_shadow_exact_value: NOT_PROVEN
```
<!-- GPP_RESOLUTION_STATE_END -->

Interpretation:

- `NON_NORMATIVE_REFERENCE`: useful visual observation, but not an implementation value.
- `NOT_PROVEN`: no exact value/rule may be chosen without new evidence or owner authority.
- exact canonical values live in explicit canonical tables/rules in this document.

Reference-only observations retained for provenance/context, not for implementation:

```text
form title size observed around 24px
form title line-height observed around 1.5
helper text observed around 13.5px
field error observed around 14px
desktop title enhancement observed around 26px
field rhythm observed around 24px
major-section rhythm observed around 32px
owner visual intent for desktop shadow: none or very subtle
```

No consumer may round, normalize, or guess these observations into production values.

## 8. Canonical design tokens

| Token | Canonical value | Status |
|---|---:|---|
| `page-bg` | `#F6F8FB` | confirmed |
| `surface` | `#FFFFFF` | confirmed |
| `text-primary` | `#172033` | confirmed |
| `text-secondary` | `#475467` | confirmed |
| `text-muted` | `#667085` | confirmed |
| `primary` | `#1D4ED8` | confirmed |
| `primary-pressed` | `#1E40AF` | confirmed |
| `error` | `#B42318` | confirmed |
| `success` | `#18794E` | confirmed |
| `divider` | `#E4E7EC` | confirmed as decorative divider |
| `control-border` | `#8690A1` | owner-approved |
| `radius-control` | `10px` | confirmed |
| `radius-upload` | `12px` | confirmed |
| `radius-card` | `16px` | confirmed |
| `control-min-height` | `52px` | confirmed |
| `primary-button-min-height` | `56px` | confirmed |
| `mobile-horizontal-padding` | `16px` | owner-approved |
| `desktop-content-max-width` | `840px` | confirmed |

Focus presentation has an exact canonical color basis (`primary: #1D4ED8`) but the ring geometry and alpha remain `NOT_PROVEN`; the earlier phrase “translucent ring” is visual intent only, not a CSS value.

### Placeholder rule

`#9CA3AF` from the mockups is not a canonical color for meaningful instructional text because its contrast on white is too low for normal text.

Placeholder text may remain visually subtle only when redundant/non-material. Required instructions must remain persistent outside placeholder-only presentation and must satisfy applicable text-contrast requirements.

## 9. Typography hierarchy

Exact canonical typography values currently supported by admitted evidence are:

```yaml
section_heading:
  font_size: 18px
  font_weight: 700
field_label:
  font_size: 15px
  font_weight: 600
control_value:
  font_size: 16px
  font_weight: 400
primary_action:
  font_size: 16px
  font_weight: 700
font_family_target:
  value: Vazirmatn
  delivery_owner: Vazir
```

Form-title size/line-height, helper-text size, field-error size, and desktop-title enhancement are reference-only until resolved in Section 7. Their observed approximate values must not drive CSS.

## 10. RTL and directionality

The SRWF profile is Persian/RTL in composition. Use direction-safe/logical CSS where practical.

Values that are inherently numeric/Latin, such as phone or National ID entry, may render LTR while preserving correct labels, reading order, and host semantics.

## 11. Responsive contract

### 320px

This is a hard acceptance width.

At 320 CSS px:

- ordinary fields are one column;
- no ordinary form content requires horizontal scrolling;
- labels, controls, helper text, and field errors remain readable;
- any future admitted desktop field pairs must collapse;
- school/upload/photo states must fit available width;
- horizontal content padding is exactly `16px`.

### 360px

Primary mobile visual reference width.

### 390px / 430px

Use the same semantic mobile composition. A dedicated 430px approved reference is not required to define a different layout.

### Desktop

- outer surface is `white_card`;
- page background is canonical token `#F6F8FB`;
- form surface is canonical token `#FFFFFF`;
- form max width is canonical token `840px`;
- outer radius is canonical token `16px`;
- exact shadow CSS value is `NOT_PROVEN`;
- exact two-column short-field pairing set is `NOT_PROVEN`;
- school selector and file/photo upload states remain full width where needed.

Until the pairing set is admitted, implementation must fail closed to no inferred two-column pairing.

### Production breakpoint

```yaml
exact_production_breakpoint: NOT_PROVEN
```

Do not copy a mockup/gallery media-query value merely because it appears in a prototype.

## 12. Form and section composition

- Keep the form visually continuous and restrained.
- Use section headings plus subtle dividers for grouping.
- Field and major-section rhythm observations remain `NON_NORMATIVE_REFERENCE` in Section 7 and must not be implemented as guessed exact spacing.
- Decorative dividers must not be the sole means of conveying grouping/meaning.
- Avoid unnecessary nested cards around ordinary fields.

## 13. Component contract matrix

| Component | Behavior owner | Gravity Presentation Profiles visual responsibility | Runtime-sensitive |
|---|---|---|---|
| Text/numeric input | Gravity Forms / PersianGravity where applicable | 52px min height, 10px radius, white fill, `#8690A1` border, SRWF focus/error language | actual host markup/semantics; exact focus ring geometry |
| National ID / phone | Host | same control family, clear persistent format instruction, LTR value where appropriate | validation behavior |
| Jalali date | PersianGravity / Gravity Forms | visually integrate real runtime control into SRWF control language | exact widget/picker UI not proven |
| Radio / choice | Gravity Forms | clear selected state with shape/text + color, not color only | fieldset/keyboard semantics |
| Native select | Gravity Forms | same visual family | browser/host behavior |
| School selector | GP Advanced Select | resting/open/results/no-results/selected/error appearance | actual GPAS DOM/config/search behavior |
| Other-school conditional field | Gravity Forms | same field family when host reveals it | trigger logic |
| Report-card upload | Gravity Forms / GPFUP if enabled | initial/uploading/uploaded/error/replace visual states | actual constraints/upload lifecycle |
| Student photo | GP File Upload Pro | upload/preview/crop/re-crop state styling | crop ratio/dimensions/config |
| Primary action | Gravity Forms | primary blue, 56px min height, responsive width | submit lifecycle |
| Validation summary | Gravity Forms | SRWF red semantic surface | focus/ARIA runtime |
| Field error | Gravity Forms | textual red error + border/icon where appropriate; below input | accessible association/runtime order; exact font size unresolved |
| Helper text | Gravity Forms | muted persistent text; below input | accessible association/runtime order; exact font size unresolved |
| Required indicator | Gravity Forms | visible red semantic styling | underlying required semantics |

## 14. Help/instruction presentation

Owner decision: `help_text_placement: below_input`.

This is canonical for the SRWF visual profile. Material format instructions must remain persistent and not placeholder-only; host semantic association must remain intact; runtime screen-reader/reading-order validation is mandatory because this differs from current Gravity Forms recommended placement.

## 15. Validation/error presentation

The host detects and exposes validation state. Gravity Presentation Profiles maps that state visually to:

```text
textual field error below the affected input
+ red semantic border/state styling
+ additional non-color cue where needed
+ Gravity Forms validation summary
+ preservation of user-entered values
```

Owner decision: `validation_message_placement: below_input`.

This visual placement must not break programmatic error association or focus/reading behavior. The plugin must not implement its own validation engine.

## 16. Control border / contrast rule

Canonical resting border is `#8690A1`, replacing the earlier `#8993A4` candidate.

Final implementation must still verify actual contrast against the rendered adjacent background after Gravity Forms/theme composition. Runtime contrast remains `NOT_PROVEN` until executed.

## 17. Desktop outer surface

Owner-selected canonical surface type is `white_card`.

The supporting exact tokens are:

```yaml
page_background: "#F6F8FB"
surface: "#FFFFFF"
max_width: 840px
outer_radius: 16px
shadow_exact_value: NOT_PROVEN
```

The non-normative visual intent is a distinct but quiet white form card, with no heavy dashboard-style panel. The exact shadow must not be guessed from “none or very subtle.”

## 18. School selector presentation

Allowed visual states include resting, focused/open, searching/results, no results, selected, selected-other, and error.

GP Advanced Select owns the actual search/filter/keyboard lifecycle. Do not contract lazy loading, a specific query threshold, infinite scrolling, or Populate Anything behavior unless the real field configuration proves it.

## 19. Upload and student-photo presentation

Allowed visual states may include initial, uploading, uploaded, preview, invalid file, remove/replace, and crop/re-crop where the host provides it.

GP File Upload Pro owns upload/crop/re-crop/zoom behavior. Exact crop ratio/dimensions remain runtime/configuration evidence, not mockup authority.

## 20. Accessibility design requirements

The profile must preserve at least these outcomes:

```text
visible persistent labels
persistent material instructions
textual errors
error/selection not color-only
applicable 3:1 UI visual cues
applicable 4.5:1 normal meaningful text
visible keyboard focus
320px reflow
WCAG target-size outcome or valid exception
native host semantics and keyboard behavior
```

The contract supports accessibility; it does not itself prove WCAG conformance.

## 21. Host-owned behavior firewall

The following prototype behavior is not implementation authority:

```text
school query/filter algorithms
lazy loading
infinite scroll
conditional logic
validation engine
Jalali calculations
file acceptance rules
crop engine
submission lifecycle
success transition logic
```

Interactive mockup scripts remain `MOCKUP_ONLY_SIMULATION` unless independently supported by the real host/runtime contract.

## 22. Runtime-sensitive items

<!-- GPP_RUNTIME_GAPS_BEGIN -->
```yaml
actual_gravity_forms_markup: NOT_PROVEN
actual_persiangravity_date_widget: NOT_PROVEN
gpas_populate_anything_configuration: NOT_PROVEN
gpfup_crop_ratio_dimensions: NOT_PROVEN
keyboard_order: NOT_PROVEN
focus_management: NOT_PROVEN
aria_relations: NOT_PROVEN
screen_reader_output: NOT_PROVEN
exact_production_breakpoint: NOT_PROVEN
runtime_contrast_after_host_css: NOT_PROVEN
```
<!-- GPP_RUNTIME_GAPS_END -->

These are validation gaps, not open owner visual choices.

## 23. Non-goals

This contract does not authorize field/ID changes, business validation changes, conditional-logic changes, stored-value changes, Gravity Flow changes, upload constraint changes, Officer/Accountant UI, multiple visual themes, a visual editor, production JavaScript by default, PDF presentation, or production plugin implementation.

## 24. Visual acceptance

A future implementation is visually conformant only when all of the following are true:

```text
exact canonical contract tokens/rules applied
+ unresolved items remain fail-closed rather than guessed
+ correct mobile/desktop composition
+ authentic host states styled rather than reimplemented
+ approved reference-gallery match where applicable
+ no higher-authority accessibility conflict
+ real browser/runtime validation completed
```

## 25. Change control

- Gallery references cannot override this contract.
- Screenshot-only differences do not silently change canonical tokens/rules.
- A design-rule change requires an explicit contract revision.
- A `NOT_PROVEN` or `NON_NORMATIVE_REFERENCE` item may become canonical only after exact authority/evidence is recorded in this contract.
- A runtime accessibility correction that materially changes the approved appearance must be recorded as a contract revision, not hidden in CSS.

## 26. Evidence map and closure state

```text
EXTERNAL_BASELINE → W3C / WAI / empirical evidence
HOST_CONSTRAINT → Gravity Forms / Gravity Wiz official documentation
SRWF_PROJECT_SPECIFIC → explicit owner decisions + replayable admitted evidence where available
VISUAL_REFERENCE_ONLY → non-replayable/unbound mockups; supporting evidence only
DERIVED_INTEGRATION_RULE → combinations of the above
```

```yaml
owner_visual_choices:
  state: CLOSED
visual_contract:
  state: OWNER_APPROVED_WITH_EXPLICIT_RESOLUTION_STATES
canonical_gallery:
  state: NOT_APPROVED_UNTIL_RUNTIME_VALIDATION
runtime_accessibility_conformance:
  state: NOT_PROVEN
implementation:
  state: NOT_STARTED
```
