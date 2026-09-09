# SRWF Registration WU2 Implementation Map

Work Unit: `WU-GPP-SRWF-PROFILE-02`

Governing visual authority: `docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_UX_CONTRACT_v1.0.0.md`.
Supporting references remain non-normative as declared by `docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_REFERENCE_MANIFEST_v1.0.0.yaml`.

## Scope boundary

Runtime selection from WU1 adds `gpp-enabled` and `gpp-profile-srwf-registration` to the native Gravity Forms `<form>` tag. Every WU2 production selector starts from the combined selected-profile selector:

```css
.gpp-enabled.gpp-profile-srwf-registration
```

No Form ID, Page ID, broad page selector, or unscoped Gravity Forms selector is used.

## Implemented exact-contract mappings

| Contract rule/token | Production mapping | Mechanism |
|---|---|---|
| surface `#FFFFFF` | form surface and `--gf-ctrl-bg-color` | selected-profile CSS + documented GF CSS API |
| primary text `#172033` | form/control/primary-label text; section heading | GF CSS API + documented section-title selector gap |
| secondary text `#475467` | section description text | documented section-description selector gap |
| muted text `#667085` | `--gf-ctrl-desc-color` | documented GF CSS API |
| primary `#1D4ED8` | `--gf-color-primary`, control focus-border color basis, primary-button background | documented GF CSS API |
| primary pressed `#1E40AF` | authentic submit `:active` background | documented submit selector; no active-state API variable exists |
| error `#B42318` | GF danger basis, error border, required indicator, field error text, validation-summary text | documented GF CSS API |
| success `#18794E` | `--gf-color-success` only; authentic host success consumers remain host-owned | documented GF CSS API |
| decorative divider `#E4E7EC` | `--gf-field-section-border-color` | documented GF CSS API |
| resting control border `#8690A1` | `--gf-ctrl-border-color` | documented GF CSS API |
| control radius `10px` | `--gf-ctrl-radius` | documented GF CSS API |
| control minimum height `52px` | `--gf-ctrl-size` | documented GF CSS API |
| primary button minimum height `56px` | `--gf-ctrl-btn-size` | documented GF CSS API |
| mobile horizontal padding `16px` | `padding-inline` on the selected form | direct selected-profile rule; outer form padding has no applicable descendant CSS API mapping at this scope |
| desktop content maximum width `840px` | `max-inline-size` on the selected form | direct selected-profile rule |
| card radius `16px` | `border-radius` on the selected form | direct selected-profile rule |
| field label `15px / 600` | `--gf-ctrl-label-font-size-primary` / `--gf-ctrl-label-font-weight-primary` | documented GF CSS API |
| control value `16px / 400` | `--gf-ctrl-font-size` / `--gf-ctrl-font-weight` | documented GF CSS API |
| primary action `16px / 700` | `--gf-ctrl-btn-font-size` / `--gf-ctrl-btn-font-weight` | documented GF CSS API |
| section heading `18px / 700` | `.gfield--type-section .gsection_title` | direct CSS because Gravity Forms documents no CSS API variable for the section title |
| font-family target `Vazirmatn` | selected form inheritance plus GF control/label/description/button font-family variables | no font loading/bundling; delivery remains external |
| RTL composition | `direction: rtl` plus logical sizing/margin/padding properties | selected-profile CSS |
| single-column composition | every direct child `.gfield` of documented `.gform_fields` spans the full host grid | documented GF selectors; no breakpoint or pairing inference |

## Direct-selector gaps and justification

1. `.gform_fields > .gfield { grid-column: 1 / -1; }` — Gravity Forms documents both selectors, but the CSS API exposes spacing rather than a profile-level variable that forces all editor-configured field widths to one row. This rule enforces the authorized fail-closed single-column composition without choosing pairings or a breakpoint.
2. `.gfield--type-section .gsection_title` — Gravity Forms explicitly documents that Section Break titles do not receive CSS API variables; direct CSS is the documented mechanism.
3. `.gfield--type-section .gsection_description` — same documented Section Break API gap; only canonical color/font-family are applied, with no unresolved font size or rhythm.
4. `.gform_button:active` and `.gfield--type-submit button[type="submit"].button:active` — Gravity Forms documents these submit surfaces and states that direct properties are appropriate when no active-state variable exists. Only the canonical pressed color is applied.
5. Selected-form card geometry (`max-inline-size`, `padding-inline`, `border-radius`, `background-color`) — WU1 exposes the selected profile on the `<form>` element, not on the Gravity Forms outer wrapper. These direct properties remain anchored to that proven semantic boundary.

## Deliberately deferred / unapplied

- Page background `#F6F8FB`: not authored because the current profile identity is on the form, not a proven outer page/context container. No `body`, `html`, Page ID, broad ancestor, or `:has()` workaround is used.
- Upload radius `12px`: deferred until real Gravity Forms / GP File Upload Pro runtime markup identifies the authentic component surface.
- Help text and field-validation message placement: contract says below input, but placement/semantic association remains host/runtime-owned; WU2 does not reorder markup.
- Form-title size/line-height, helper-text size, field-error size, desktop title enhancement, field rhythm, major-section rhythm: unresolved/reference-only values are not authored.
- Desktop short-field pairing and exact production breakpoint: not authored; the baseline is one column at every width.
- Shadow: no SRWF `box-shadow` declaration is authored.
- Focus ring: no outline/ring width, offset, spread, blur, alpha, or other geometry is authored. Only the canonical primary color basis is mapped to the documented control focus-border color; host focus rendering remains intact.
- GP Advanced Select, GP File Upload Pro, PersianGravity date-widget adapters: deferred to runtime evidence/WU3.
- Numeric/Latin per-value LTR overrides: deferred until the relevant runtime field/component selectors are proven; labels/order remain untouched.
- Runtime accessibility, 320px browser reflow, composed contrast, keyboard/focus/ARIA/screen-reader behavior, gallery approval, release readiness: not claimed by WU2 static implementation.

## Official Gravity Forms evidence used

- Gravity Forms CSS API and CSS API Reference: global custom properties are the preferred customization surface and may be overridden at a narrower scope.
- CSS API: Controls - Base, Button, Description, Label; Fields - Section; Form - Validation.
- Form Body CSS Selectors: `.gform_fields` and `.gfield` are documented Orbital selectors.
- Section Break CSS Selectors: `.gsection_title` and `.gsection_description` are documented; the title has no CSS API variable.
- Submit Button CSS Selectors: primary button variables are preferred; direct `:active` properties are documented when no variable exists.

Runtime-sensitive applicability remains subject to `WU-GPP-RUNTIME-INTEGRATION-03`.
