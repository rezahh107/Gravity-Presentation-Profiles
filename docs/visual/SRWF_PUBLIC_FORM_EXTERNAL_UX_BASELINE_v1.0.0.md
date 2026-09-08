# SRWF Public Form — External UX Baseline v1.0.0

```yaml
document_id: SRWF_PUBLIC_FORM_EXTERNAL_UX_BASELINE
version: 1.0.0
surface: srwf-public-registration
status: ADMITTED_SUPPORTING_EVIDENCE__RUNTIME_CONFORMANCE_NOT_PROVEN
source_work_unit: WU-SRWF-PUBLIC-VISUAL-CONTRACT-02
presentation_product: Gravity Presentation Profiles
profile_family: SRWF
profile: Registration
```

## 1. Purpose

This document records the external UX/accessibility and host-product constraints used to review the SRWF Registration visual contract.

It does **not** choose SRWF brand colors, exact radii, spacing, desktop field pairings, or other project-specific visual decisions.

## 2. Evidence order

```text
Normative WCAG requirements
→ WAI forms guidance
→ official Gravity Forms / Gravity Perks documentation
→ public ISO summaries where applicable
→ peer-reviewed empirical form-UX evidence
→ mature public design-system guidance
→ SRWF applicability filter
```

Search snippets, SEO listicles, AI summaries, inaccessible ISO details, and screenshot-only assumptions are not baseline authority.

## 3. Normative accessibility constraints

| Rule ID | Requirement | Status / applicability |
|---|---|---|
| `EXT-REFLOW-001` | Ordinary form content must reflow at the equivalent of 320 CSS px without unnecessary two-dimensional scrolling or loss of functionality. | Mandatory, direct |
| `EXT-TEXT-CONTRAST-001` | Meaningful normal text requires at least 4.5:1 contrast; large text at least 3:1, subject to WCAG exceptions. | Mandatory, direct |
| `EXT-UI-CONTRAST-001` | Visual information needed to identify an interactive component/state requires at least 3:1 contrast with adjacent colors, subject to criterion scope/exceptions. | Mandatory, direct |
| `EXT-FOCUS-001` | Keyboard focus must remain visible and must not be obscured by author-created content. | Mandatory, direct |
| `EXT-TARGET-001` | Pointer targets should satisfy WCAG 2.2 SC 2.5.8 minimum target size or a valid exception. | Mandatory, direct |
| `EXT-LABEL-001` | Inputs that require user input must have labels or instructions. | Mandatory, direct |
| `EXT-ERROR-001` | Automatically detected errors must identify the field and describe the error in text. | Mandatory, direct |
| `EXT-ERROR-SUGGEST-001` | When a correction suggestion is known, it should be provided unless an applicable exception exists. | Mandatory, direct |
| `EXT-KEYBOARD-001` | Functionality must remain keyboard operable except where a criterion exception applies. | Mandatory, direct |
| `EXT-RESIZE-001` | Text must remain usable at 200% resize without loss of content/functionality. | Mandatory, direct |
| `EXT-COLOR-001` | Color must not be the only means of conveying error, selection, or material status. | Mandatory, direct |
| `EXT-STATUS-001` | Applicable status messages must be programmatically determinable without unnecessarily moving focus. | Mandatory where applicable |

Primary sources:

- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- W3C Reflow understanding: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- W3C Non-text Contrast understanding: https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html
- WAI Forms Instructions: https://www.w3.org/WAI/tutorials/forms/instructions/
- WAI Forms Labels: https://www.w3.org/WAI/tutorials/forms/labels/
- WAI Forms Grouping: https://www.w3.org/WAI/tutorials/forms/grouping/

## 4. Official host constraints

### Gravity Forms

`HOST-GF-THEME-001` — Use the modern Gravity Forms rendering/theme framework rather than replacing the host rendering lifecycle.

`HOST-GF-CSS-001` — Prefer official Gravity Forms CSS API/custom properties where available; use direct scoped selectors only for real gaps.

`HOST-GF-A11Y-001` — Gravity Forms accessibility guidance favors visible top-aligned labels, validation summaries, and above-input description/validation placement. These are host recommendations/guidance; they do not independently prove a WCAG failure for every below-input presentation.

Sources:

- Theme Framework: https://docs.gravityforms.com/theme-framework/
- CSS API: https://docs.gravityforms.com/css-api/
- Design Overview: https://docs.gravityforms.com/design-overview/
- Accessibility warning: https://docs.gravityforms.com/field-accessibility-warning/
- Accessibility checklist: https://docs.gravityforms.com/accessibility-checklist-for-gravity-forms/

### GP Advanced Select

`HOST-GPAS-001` — Search, selection, mobile, keyboard, and screen-reader lifecycle belong to GP Advanced Select. Lazy-loading / Populate Anything-specific behavior is not assumed unless that field configuration is proven.

Source:

- https://gravitywiz.com/documentation/gravity-forms-advanced-select/

### GP File Upload Pro

`HOST-GPFUP-001` — Preview, crop/re-crop, zoom, upload lifecycle, and real-time validation remain host-owned. Gravity Presentation Profiles may style those states but must not recreate the engine.

Source:

- https://gravitywiz.com/documentation/gravity-forms-file-upload-pro/

## 5. Empirical form-UX evidence

`EMP-FORMAT-001` — A controlled online-form study (`n=166`) found that communicating format restrictions before entry reduced errors/trials. Applicable to National ID, phone, date, and file constraints; it does not prescribe SRWF copy wording.

Source:

- Bargas-Avila et al., Interacting with Computers (2011): https://academic.oup.com/iwc/article-abstract/23/1/33/696080

`EMP-ERROR-PLACE-001` — A study (`n=303`) found field-near errors more useful than summary-only errors. The study's right-side preference is LTR/context-specific and is not generalized to Persian RTL or used to override host/runtime constraints.

Source:

- Bargas-Avila et al., Interacting with Computers (2012): https://academic.oup.com/iwc/article-abstract/24/3/107/688803

## 6. Strong practice guidance

GOV.UK patterns are admitted only as supporting practice, not as SRWF brand/design authority.

Useful patterns include validation summaries plus field-local errors and clear file-upload error copy.

Sources:

- Error Summary: https://design-system.service.gov.uk/components/error-summary/
- Radios: https://design-system.service.gov.uk/components/radios/
- File Upload: https://design-system.service.gov.uk/components/file-upload/

## 7. Owner-approved deviation from host guidance

The SRWF owner explicitly selected:

```yaml
help_text_placement: below_input
validation_message_placement: below_input
```

This is a deliberate project-specific visual decision that differs from current Gravity Forms accessibility recommendations for `Above Inputs` placement.

This deviation does **not** authorize broken semantics. The following remain runtime gates:

- programmatic association of descriptions/errors;
- reading order;
- keyboard/focus behavior;
- visible and textual error identification;
- usable 320px reflow;
- actual contrast after host/theme composition.

The placement choice may remain canonical only while those higher-authority accessibility outcomes are preserved in real runtime.

## 8. Non-applicable / rejected generalizations

The following are not admitted as SRWF rules:

- GOV.UK palette or component appearance;
- universal right-side error placement;
- mandatory multi-page conversion of the existing single-page form;
- inaccessible detailed ISO requirements not actually inspected;
- placeholder-only labels or instructions;
- Apple/Material platform conventions as web-form authority.

## 9. Evidence ceiling

This baseline does not prove:

```text
actual Gravity Forms DOM semantics
aria-describedby / accessible-name wiring
screen-reader output
keyboard order / focus restoration
GP Advanced Select exact field configuration
GP File Upload Pro exact crop configuration
PersianGravity Jalali runtime markup/lifecycle
production breakpoint
final runtime contrast after host/theme composition
```

Those remain `RUNTIME_VALIDATION_REQUIRED`.
