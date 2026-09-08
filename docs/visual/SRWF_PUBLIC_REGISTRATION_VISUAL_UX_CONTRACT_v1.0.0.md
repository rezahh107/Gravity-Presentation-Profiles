# SRWF Public Registration — Visual / UX Contract v1.0.0

```yaml
document_id: SRWF_PUBLIC_REGISTRATION_VISUAL_UX_CONTRACT
version: 1.0.0
surface: public-registration
status: OWNER_APPROVED_VISUAL_AUTHORITY__RUNTIME_VALIDATION_REQUIRED
source_work_unit: WU-SRWF-PUBLIC-VISUAL-CONTRACT-02
presentation_product: Gravity Presentation Profiles
profile_family: SRWF
profile: Registration
implementation_authorized_by_this_document: false
gallery_runtime_approval: false
```

## 1. Purpose

This contract defines the deterministic visual and responsive rules for the SRWF Public Registration profile of Gravity Presentation Profiles.

It does not define data, validation logic, conditional logic, workflow, upload rules, search algorithms, crop behavior, or other host-owned behavior.

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

This contract incorporates the constraints recorded in:

`SRWF_PUBLIC_FORM_EXTERNAL_UX_BASELINE_v1.0.0.md`

General accessibility/host requirements are not re-invented from screenshots.

## 5. Owner-closed canonicalization bundle

The following owner decisions are closed and canonical for v1.0.0:

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
    reason: replaces context-sensitive low-contrast candidate #8993A4

  desktop_outer_surface:
    value: white_card
    page_background: "#F6F8FB"
    surface: "#FFFFFF"
    radius: 16px
    max_width: 840px
    shadow: none_or_very_subtle
    status: OWNER_APPROVED
```

Historical 18px mobile padding and unresolved direct-surface desktop treatment are no longer canonical alternatives.

## 6. SRWF visual principles

`SRWF-VIS-001 — CONFIRMED`  
Use a calm, light, low-chrome visual language with a blue primary action and red/green semantic accents.

`SRWF-VIS-002 — CONFIRMED`  
Use a mobile-first single-column form with minimal card-in-card decoration.

`SRWF-VIS-003 — CONFIRMED`  
Desktop may enhance selected short field pairs into two columns; school selectors, uploads, and complex states remain full width where needed.

`SRWF-VIS-004 — CONFIRMED`  
Custom presentation must reveal/style authentic host state rather than create a shadow implementation of host behavior.

## 7. Canonical design tokens

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
| `control-border` | `#8690A1` | owner-approved replacement |
| `focus` | primary blue border + translucent ring | visual intent confirmed; runtime test required |
| `radius-control` | `10px` | confirmed |
| `radius-upload` | `12px` | confirmed |
| `radius-card` | `16px` | confirmed and owner-approved for desktop outer surface |
| `control-min-height` | `52px` | confirmed |
| `primary-button-min-height` | `56px` | confirmed |
| `mobile-horizontal-padding` | `16px` | owner-approved |
| `desktop-content-max-width` | `840px` | confirmed |

### Placeholder rule

`#9CA3AF` from the mockups is **not** a canonical color for meaningful instructional text because its contrast on white is too low for normal text.

Placeholder text may remain visually subtle only when redundant/non-material. Required instructions must remain persistent outside placeholder-only presentation and must satisfy applicable text-contrast requirements.

## 8. Typography hierarchy

Current SRWF visual evidence supports:

```text
font family target: Vazirmatn (font delivery external to this plugin)
form title: ~24px / 700 / ~1.5 line-height
section heading: 18px / 700
field label: 15px / 600
control value: 16px / 400
helper text: ~13.5px / 400
field error: ~14px / medium-to-semibold
primary action: 16px / 700
```

A desktop title enhancement around 26px is allowed where the final profile CSS preserves the same hierarchy.

## 9. RTL and directionality

The SRWF profile is Persian/RTL in composition.

Use direction-safe/logical CSS where practical.

Values that are inherently numeric/Latin, such as phone or National ID entry, may render LTR while preserving correct labels, reading order, and host semantics.

## 10. Responsive contract

### 320px

This is a hard acceptance width.

At 320 CSS px:

- ordinary fields are one column;
- no ordinary form content requires horizontal scrolling;
- labels, controls, helper text, and field errors remain readable;
- desktop field pairs must collapse;
- school/upload/photo states must fit available width;
- horizontal content padding is `16px`.

### 360px

Primary mobile visual reference width.

### 390px / 430px

Use the same semantic mobile composition. A dedicated 430px approved reference is not yet required to define a different layout.

### Desktop

- form card max width: `840px`;
- outer surface: white card on `#F6F8FB` page background;
- card radius: `16px`;
- shadow: none or extremely subtle;
- selected short fields may pair in two columns;
- school selector and file/photo upload states remain full width where needed.

### Production breakpoint

```yaml
exact_production_breakpoint: NOT_PROVEN
```

Do not copy a mockup/gallery media-query value merely because it appears in a prototype. Choose the implementation breakpoint only when it reproduces the semantic contract and passes browser/runtime validation.

## 11. Form and section composition

- Keep the form visually continuous and restrained.
- Use section headings plus subtle dividers for grouping.
- Preserve a roughly 24px field rhythm and approximately 32px major-section rhythm where supported by the approved references.
- Decorative dividers must not be the sole means of conveying grouping/meaning.
- Avoid unnecessary nested cards around ordinary fields.

## 12. Component contract matrix

| Component | Behavior owner | Gravity Presentation Profiles visual responsibility | Runtime-sensitive |
|---|---|---|---|
| Text/numeric input | Gravity Forms / PersianGravity where applicable | 52px min height, 10px radius, white fill, `#8690A1` border, SRWF focus/error language | actual host markup/semantics |
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
| Field error | Gravity Forms | textual red error + border/icon where appropriate; below input | accessible association/runtime order |
| Helper text | Gravity Forms | muted persistent text; below input | accessible association/runtime order |
| Required indicator | Gravity Forms | visible red semantic styling | underlying required semantics |

## 13. Help/instruction presentation

Owner decision:

```yaml
help_text_placement: below_input
```

This is canonical for the SRWF visual profile.

However:

- material format instructions must remain persistent and not placeholder-only;
- host semantic association must remain intact;
- runtime screen-reader/reading-order validation is mandatory because this differs from current Gravity Forms recommended placement.

## 14. Validation/error presentation

The host detects and exposes validation state.

Gravity Presentation Profiles maps that state visually to:

```text
textual field error below the affected input
+ red semantic border/state styling
+ additional non-color cue where needed
+ Gravity Forms validation summary
+ preservation of user-entered values
```

Owner decision:

```yaml
validation_message_placement: below_input
```

This visual placement must not break programmatic error association or focus/reading behavior.

The plugin must not implement its own validation engine.

## 15. Control border / contrast rule

Canonical resting border:

```css
#8690A1
```

This replaces the earlier `#8993A4` candidate.

Final implementation must still verify actual contrast against the rendered adjacent background after Gravity Forms/theme composition.

If runtime composition causes the necessary component boundary to fall below applicable contrast requirements, the implementation value must be minimally corrected and the contract version updated rather than silently shipping a known failure.

## 16. Desktop outer surface

Owner-selected canonical composition:

```text
page background: #F6F8FB
form surface: #FFFFFF
form max width: 840px
outer radius: 16px
shadow: none or very subtle
```

The intent is a distinct but quiet white form card, not a heavy dashboard-style panel.

## 17. School selector presentation

Allowed visual states include:

```text
resting
focused/open
searching/results
no results
selected
selected: other
error
```

GP Advanced Select owns the actual search/filter/keyboard lifecycle.

Do not contract lazy loading, a specific query threshold, infinite scrolling, or Populate Anything behavior unless the real field configuration proves it.

## 18. Upload and student-photo presentation

Allowed visual states may include:

```text
initial
uploading
uploaded
preview
invalid file
remove/replace
crop / re-crop where host provides it
```

GP File Upload Pro owns upload/crop/re-crop/zoom behavior.

Exact crop ratio/dimensions remain runtime/configuration evidence, not mockup authority.

## 19. Accessibility design requirements

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

## 20. Host-owned behavior firewall

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

## 21. Runtime-sensitive items

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

These are validation gaps, not open owner visual choices.

## 22. Non-goals

This contract does not authorize:

- field/ID changes;
- business validation changes;
- conditional-logic changes;
- stored-value changes;
- Gravity Flow changes;
- upload constraint changes;
- Officer/Accountant UI;
- multiple visual themes;
- visual editor;
- production JavaScript by default;
- PDF presentation;
- implementation of the plugin itself.

## 23. Visual acceptance

A future implementation is visually conformant only when all of the following are true:

```text
canonical contract tokens/rules applied
+ correct mobile/desktop composition
+ authentic host states styled rather than reimplemented
+ approved reference-gallery match where applicable
+ no higher-authority accessibility conflict
+ real browser/runtime validation completed
```

## 24. Change control

- Gallery references cannot override this contract.
- Screenshot-only differences do not silently change canonical tokens/rules.
- A design-rule change requires an explicit contract revision.
- A runtime accessibility correction that materially changes the approved appearance must be recorded as a contract revision, not hidden in CSS.

## 25. Evidence map

```text
EXTERNAL_BASELINE
→ W3C / WAI / empirical evidence

HOST_CONSTRAINT
→ Gravity Forms / Gravity Wiz official documentation

SRWF_PROJECT_SPECIFIC
→ approved HTML/CSS/screenshots + explicit owner decisions

DERIVED_INTEGRATION_RULE
→ combinations of the above
```

## 26. Closure state

```yaml
owner_visual_choices:
  state: CLOSED

visual_contract:
  state: OWNER_APPROVED

canonical_gallery:
  state: NOT_APPROVED_UNTIL_RUNTIME_VALIDATION

runtime_accessibility_conformance:
  state: NOT_PROVEN

implementation:
  state: NOT_STARTED
```
