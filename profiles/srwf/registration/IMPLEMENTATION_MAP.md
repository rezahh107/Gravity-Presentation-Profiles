# SRWF Registration WU2 Implementation Map

Work Unit: `WU-GPP-SRWF-PROFILE-02`

Governing visual authority: `docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_UX_CONTRACT_v1.0.0.md`.
Supporting references remain non-normative as declared by `docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_REFERENCE_MANIFEST_v1.0.0.yaml`.

## Scope boundary

Runtime selection from WU1 adds `gpp-enabled` / `gpp-profile-srwf-registration` to the native Gravity Forms form and derives the corresponding `_wrapper` identity on the authentic Gravity Forms wrapper. Every production selector remains anchored to:

```css
.gpp-enabled_wrapper.gpp-profile-srwf-registration_wrapper
```

No Form ID, Page ID, broad page selector, `body`, `html`, unscoped Gravity Forms selector, or `:has()` selector is used.

## Implemented exact-contract mappings

| Contract rule/token | Production mapping | Mechanism |
|---|---|---|
| surface `#FFFFFF` | wrapper surface and `--gf-ctrl-bg-color` | selected-profile CSS + GF CSS API |
| primary text `#172033` | form/control/primary-label text; section heading | GF CSS API + section-title selector gap |
| secondary text `#475467` | section description text | section-description selector gap |
| muted text `#667085` | `--gf-ctrl-desc-color` | GF CSS API |
| primary `#1D4ED8` | global primary + RGB companion; control focus basis; primary-button background | GF CSS API projected to the authentic local control/button scopes; Orbital retains focus transition ownership |
| primary pressed `#1E40AF` | authentic submit `:active` background | documented submit selector; no active-state API variable |
| error `#B42318` | danger + RGB companion; error border, required indicator, field error text, validation-summary text | GF CSS API |
| success `#18794E` | success + RGB companion | GF CSS API |
| decorative divider `#E4E7EC` | `--gf-field-section-border-color` | GF CSS API |
| resting control border `#8690A1` | `--gf-ctrl-border-color` | GF CSS API |
| control radius `10px` | `--gf-ctrl-radius` | GF CSS API |
| control minimum height `52px` | wrapper source token plus runtime-proven projection of `--gf-ctrl-size` onto authentic text/select/Jalali control scopes | GF CSS API; no direct `height` authored |
| primary button minimum height `56px` | wrapper source token plus runtime-proven projection of `--gf-ctrl-btn-size` onto the authentic submit surface | GF CSS API; no direct `height` authored |
| mobile horizontal padding `16px` | `padding-inline` on selected wrapper | direct selected-profile rule |
| desktop content maximum width `840px` | `max-inline-size` on selected wrapper | direct selected-profile rule |
| card radius `16px` | `border-radius` on selected wrapper | direct selected-profile rule |
| field label `15px / 600` | label CSS API values | GF CSS API |
| control value `16px / 400` | control CSS API values | GF CSS API |
| primary action `16px / 700` | button CSS API values | GF CSS API |
| section heading `18px / 700` | `.gfield--type-section .gsection_title` | direct CSS because no section-title CSS API variable exists |
| font-family target `Vazirmatn` | selected wrapper inheritance plus GF control/label/description/button variables | no font loading/bundling |
| RTL composition | `direction: rtl` plus logical sizing/margin/padding properties | selected-profile CSS |
| single-column composition | direct `.gfield` children span full host grid | documented GF selectors |
| Jalali validation message below input | existing host-generated `.gfield_validation_message` visually ordered after the field content for the authentic invalid PersianGravity field | profile-scoped CSS-only flex adapter; DOM/validation/ARIA unchanged |

The primary, danger/error, and success RGB companions are alternate representations of the same canonical hex color bases, not a second source of truth. Gravity Forms and PersianGravity continue to own lifecycle, markup, keyboard semantics, validation, ARIA/state, and persistence.

## Runtime-proven closures from PR #10

Authentic Gravity Forms `3.1.1.1` + PersianGravity `4.2.0` evidence established the following facts:

1. Orbital computes `--gf-ctrl-size`, `--gf-ctrl-size-md`, and the consumed local control height as `38px` at the authentic text, select, and PersianGravity Jalali controls even though the SRWF wrapper source declaration is `52px`.
2. The authentic submit similarly computes `--gf-ctrl-btn-size: 38px`.
3. During real keyboard focus, `:focus-visible` is true and Orbital changes its local focus-color variable to the SRWF primary basis immediately. The first sampled animation frame still reports the resting border color because Orbital owns a CSS transition; browser evidence therefore records the host transition duration/delay and validates the settled focus state after that declared transition. No direct focus border, outline width/offset, shadow spread/blur, or alpha is authored.
4. The invalid PersianGravity field is a block-layout `.gfield--type-pgr_jalali_date.gfield_error`. Its existing host-generated validation node is a direct child placed in DOM before the input container, while helper text is already below the input. The admitted adapter keeps the DOM untouched and creates a vertical flex stack only for this selected-profile invalid Jalali field, then visually orders the existing error node after the other field children.

These closures are specific to the authentic runtime surfaces above and do not admit global or form-ID styling.

## Direct-selector gaps and justification

1. `.gform_fields > .gfield { grid-column: 1 / -1; }` — enforces the authorized fail-closed single-column composition.
2. `.gfield--type-section .gsection_title` / `.gsection_description` — direct CSS remains required where the GF CSS API does not expose the necessary section-title/description mapping.
3. `.gform_button:active` and the authentic submit-button active selector — only the canonical pressed color is applied.
4. Authentic text/select/Jalali control descendants — runtime proved wrapper-level control-size authority is insufficient for Orbital `3.1.1.1`; the same canonical `--gf-ctrl-size: 52px` is projected to the actual control scopes.
5. Authentic submit descendant — runtime proved `--gf-ctrl-btn-size` is locally consumed as `38px`; the same canonical `56px` value is projected to the submit surface.
6. Focus rendering — no direct production focus selector is required. The canonical Gravity Forms focus-color variables are projected locally, while the authentic browser harness waits only for the duration/delay declared by the focused host control before asserting the final visible state and unchanged border geometry.
7. PersianGravity invalid-field flex adapter — runtime proved the parent is block layout and the existing error node precedes the input in DOM. A profile-scoped column flex stack plus `order` is the minimum CSS-only adapter that visually places the existing message below the input without DOM or host-validation changes.

## Deliberately deferred / unapplied

- Page background `#F6F8FB`: not authored because the current profile identity is not a proven outer page/context container.
- Upload radius `12px`: deferred until real GP File Upload Pro runtime markup identifies the authentic component surface.
- Form-title size/line-height, helper-text size, field-error size, desktop title enhancement, field rhythm, major-section rhythm: unresolved/reference-only values are not authored.
- Desktop short-field pairing and exact production breakpoint: not authored; the baseline remains one column at every width.
- Shadow: no SRWF `box-shadow` declaration is authored.
- Focus ring geometry remains deferred: no outline/ring width, offset, spread, blur, alpha, direct focus border, or new shadow geometry is authored. Orbital renders the canonical focus color through its own transition after the profile projects the documented focus-color variables locally.
- GP Advanced Select and GP File Upload Pro adapters remain deferred until authentic packages/runtime are available.
- PersianGravity validation-layout adapter: runtime-proven and admitted only for the existing Jalali field/error presentation. PersianGravity behavior, validation, ARIA, markup, and persistence remain host-owned.
- Numeric/Latin per-value LTR overrides remain deferred until separately proven.
- Gallery approval and release readiness are not claimed by this implementation map.

## Official Gravity Forms evidence used

- Gravity Forms CSS API: global and local custom properties must be overridden at the scope where they are consumed.
- Controls - Base: `--gf-ctrl-size` defaults to `--gf-ctrl-size-md` (`38px`), `--gf-ctrl-border-color-focus` is the focus-border color basis, and host border geometry is separate.
- Controls - Button: `--gf-ctrl-btn-size` defaults to the medium control size and primary-button focus border uses its dedicated focus-color property.
- Core Concepts: authentic field-type/control/button classes and wrapper theme scopes define bounded targeting surfaces.
- Validation Errors: `.gfield_validation_message` is the authentic host-produced field-level validation element.

Runtime completion remains gated on the exact-head authentic browser lane and Repository CI.
