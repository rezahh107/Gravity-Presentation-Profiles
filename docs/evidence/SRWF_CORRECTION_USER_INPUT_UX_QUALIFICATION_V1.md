# SRWF Correction / User Input UX Qualification V1

Status: **QUALIFICATION COMPLETE — PRODUCTION NOT IMPLEMENTED**

This document records the implementation-ready qualification for the minimal SRWF Correction / Gravity Flow User Input UX repair. It is evidence and repair direction only. It does not authorize merge, release, or production publication.

## Exact target and evidence identity

- Repository: `rezahh107/Gravity-Presentation-Profiles`
- Fresh planning/main baseline: `8d2b066c64ffc0963bdfc45829495ffb4d08cf8d`
- Main drift at qualification start: **none**
- Qualification branch: `qualify/correction-user-input-ux-v1`
- Executed qualification Head: `f4f41c6e65cb0321e34ae0240cc7394e251c9c7e`
- SRWF Journey Host Qualification run: `37474675213` / run `#232`
- Executed result: **PASS**
- Artifact: `srwf-journey-host-qualification-37474675213-1`
- Artifact digest: `sha256:9e833f572d451d057798c533d2d5bc07c1a86742e3edb24a9c49d1b508d9406c`
- Repository CI on the executed qualification Head: run `#1624` — **PASS**

The branch was subsequently cleaned so the canonical MR-4 browser entrypoint is byte-for-byte restored and the temporary canonical-copy wrapper is removed. That cleanup does not change production code or the qualification scripts whose executed evidence is recorded above.

## Runtime identity

Pinned qualification environment:

- WordPress `7.1.1`
- PHP `8.3.35`
- Gravity Forms `3.1.1.1`
- Gravity Flow `3.1.0`
- Hello Elementor `3.5.1`, pinned qualification commit `e86d30a7d64b2ab59373422a14933bba3621ee04`
- GTB SRWF Registration dependency commit `b594d7a87fc904e86dedac5cfd3bd1aa3eb33d15`

Gravity Forms / Gravity Flow remain the behavior owners for editable fields, values, validation, conditional logic, uploads, permissions, User Input authorization, nonces, submission and workflow transition.

## Authentic route and topology

The browser qualification exercised the real journey:

`Review (approval)` → native Gravity Flow `Revert` → native Gravity Flow `User Input` Correction → native completion → return to `Review`.

Observed Correction topology:

```text
.gravityflow_workflow_detail
└─ form#gform_4
   └─ #poststuff
      └─ #post-body.gravityflow-has-sidebar
         ├─ #post-body-content
         │  └─ table.entry-detail-view.gravityflow-step-user_input
         │     └─ td
         │        └─ .gform_wrapper
         │           └─ .gform_fields / .gfield / native controls
         └─ native Gravity Flow sidebar/status region
            └─ #gravityflow_update_button
```

The GPP correction-orientation marker is server-emitted and remains presentation-only. The native completion button is **not inside `.gform_wrapper`**; it remains in the Gravity Flow workflow/status region.

## Viewports and evidence

Raw and candidate evidence was captured at:

- `1920 × 1080`
- `1680 × 1080`
- `390 × 844`

Supporting screenshots were captured for raw and candidate states at all three widths. Screenshots support the computed-style/geometry evidence; they are not the sole proof.

## Q1 — Geometry

### Confirmed reality

At 1920px, before candidate repair:

- `.gravityflow_workflow_detail`: `0..1920`, width `1920`, direction `ltr`
- native form: `0..1920`, width `1920`, direction `ltr`
- `#post-body-content`: `0..1640`, width `1640`, direction `ltr`
- `.gform_wrapper`: `1..1061`, width `1060`, direction `rtl`, `max-width:1060px`
- wrapper physical margins resolve to `0px / 0px`

At 1680px:

- `#post-body-content`: `0..1400`, width `1400`
- `.gform_wrapper`: `1..1061`, width `1060`

At 390px, the existing mobile rule already produces symmetric gutters:

- `.gform_wrapper`: `13.5..376.5`
- left/right viewport distance: `13.5px / 13.5px`

### Root cause

The existing Correction CSS **matches and is effective**. This is not a selector-admission or stylesheet-order failure.

The geometry defect is a boundary mismatch:

1. Gravity Flow's authentic outer Entry Detail/User Input host remains a wide LTR split layout with a native sidebar.
2. GPP bounds the inner `.gform_wrapper` to `1060px`, but its desktop physical margin is effectively left-anchored (`margin: 0 0 24px`).
3. Therefore a bounded card exists but is pinned to the start of the native LTR main column instead of being naturally centered/bounded inside that column.

The existing Full Width Correction exception can additionally set the Correction `.gform_wrapper` to `max-width:none` when the Full Width profile marker is present. That specific marker was **not observed in this exact pinned run**, so its activation on the Owner site is `NOT_PROVEN`; however it is inconsistent with the newly locked bounded-Correction UX target and should not control Correction width in the production repair.

### Smallest sufficient seam

The candidate proved that **outer host geometry does not need production restyling** for the minimum repair.

Keep Gravity Flow's `#poststuff`, `#post-body`, workflow sidebar, Timeline and native layout untouched. Repair only the admitted Correction `.gform_wrapper`:

- retain a responsive `width:100%`;
- retain `max-width:1060px` for Correction even under the Full Width Entry Detail profile;
- use logical `margin-inline:auto`.

Candidate result:

- 1920: wrapper moved from `1..1061` to `290..1350` inside the `1640px` native main column;
- 1680: wrapper moved to `170..1230` inside the `1400px` native main column;
- 390: existing symmetric `13.5px` gutter remained unchanged;
- no additional horizontal overflow was introduced.

The pre-existing 30px desktop document overflow in the pinned native host was present before the candidate and was not increased by the candidate. GPP must not claim that host-wide overflow as repaired by this work.

## Q2 — RTL

### Confirmed reality

Raw computed styles show:

- `.gform_wrapper`: `direction:rtl`
- `.gform_fields`: `direction:ltr`
- representative `.gfield`: `direction:ltr`
- `.gfield_label`: `direction:ltr`, `text-align:start`
- representative text input: `direction:ltr`, `text-align:left`

Therefore the existing wrapper-level RTL declaration is insufficient: authentic Gravity Forms descendants resolve back to LTR/left presentation.

### Smallest sufficient correction

The candidate applied Correction-scoped RTL only to the form-presentation descendants:

- `.gform_fields`
- `.gfield`
- `.ginput_container`
- `.gfield_label`
- semantically RTL text controls (`text`, `textarea`, `select`)

At 1920, 1680 and 390 the representative field, label and text input all resolved to `direction:rtl` and right alignment.

Do **not** globally force every value RTL. Preserve LTR/value isolation for at least:

- `input[type="email"]`
- `input[type="url"]`
- `input[type="tel"]`
- `input[type="number"]`
- `input[type="date"]`
- `input[inputmode="numeric"]`
- the existing SRWF semantic exception `.gfield.srwf-ltr-value` for input/textarea values

The exact fixture exposes the representative text field, not every listed value family. The exception set is therefore a production conformance requirement derived from the existing SRWF value-direction contract; each relevant field family must be covered by focused regression tests rather than assumed from the representative text-field run.

## Q3 — Minimum visual polish

Existing Correction presentation already provides and the authentic runtime confirms:

- bounded white form surface;
- border/radius/shadow;
- control width/height normalization;
- label typography;
- input border/radius;
- visible focus styling;
- native validation presentation;
- native completion-button presentation.

These rules are selector-matched and effective. The minimum repair should **not** redesign fields, create field cards, move native nodes, or add JavaScript.

The smallest sufficient visual package is therefore:

1. center/bound the existing Correction form surface;
2. correct descendant RTL/alignment with semantic LTR exceptions;
3. keep all existing surface, focus and validation rules unless a regression test proves a conflict.

No additional outer-host layout system is justified by the evidence.

## Q4 — CTA copy

### Exact native control

The authentic current topology renders:

```text
<input
  id="gravityflow_update_button"
  type="submit"
  name="save"
  value="Submit"
  class="button button-large button-primary"
  onclick="jQuery('#action').val('update'); jQuery('#gform_4').submit(); return false;"
/>
```

The enclosing native form is `form#gform_4`, `method="post"`, and retains Gravity Flow/GF hidden state including:

- `step_id`
- `action`
- `gravityflow_submit`
- `gravityflow_status`
- `_gravityflow_admin_action_nonce`
- GF state/submission fields

### Supported host seam

Pinned Gravity Flow `3.1.0` source in `includes/steps/class-step-user-input.php` proves the text-only filter:

```php
gravityflow_update_button_text_user_input
```

It receives the current button label, form, and User Input step before Gravity Flow constructs the authentic `#gravityflow_update_button` HTML and its native `onclick` submission behavior.

The same pinned source separately exposes `gravityflow_submit_button_text_user_input` for the alternate User Input **Save Progress = Submit Buttons** topology. That alternate topology is not the authentic current SRWF completion control and should not be broadened into the repair without a product/runtime reason.

### Runtime falsification result

A test-only MU-plugin used only the text filter and scoped it to the exact synthetic SRWF form + exact Correction User Input step.

Before/after comparison proved unchanged:

- button tag/id/type/name/class;
- native `onclick`;
- `formaction` / `formmethod` absence;
- native form id/method/action;
- hidden-input topology;
- Gravity Flow nonce presence;
- step/action/gravityflow-submit hidden state.

Only the button value changed:

`Submit` → `اصلاح اطلاعات`

A real filtered submission then updated the native editable field and returned the entry to the Review approval step.

**CTA relabel capability: PROVEN** for the authentic current `#gravityflow_update_button` topology on Gravity Flow `3.1.0`.

## Recommended bounded production repair

### Production files expected to change

1. `assets/css/srwf-gravity-flow-entry-detail-journey.css`
2. `src/SRWF/GravityFlow/EntryDetailJourneyPresentationAdapter.php` — only after refreshing/rebasing over the concurrent terminal-management PR, if that remains the accepted journey hook owner.
3. focused tests/evidence for the production patch.

Do not implement the CTA filter through DOM text replacement or JavaScript.

### CSS conformance direction

Use the existing server-admitted Correction selector family:

```css
.gravityflow_workflow_detail form:has(
  .gpp-entry-journey--correction[data-gpp-entry-journey="correction"]
) ...
```

Required properties:

- Correction `.gform_wrapper` remains `max-width:1060px` and uses `margin-inline:auto`;
- remove/neutralize the current Correction-specific Full Width `max-width:none` exception;
- set structural form descendants to RTL/right presentation;
- set normal text/textarea/select values RTL where semantically appropriate;
- preserve explicit LTR exceptions for phone/code/email/URL/numeric/date and `.srwf-ltr-value` values;
- preserve current focus and validation behavior;
- do not style `#post-body`, native workflow sidebar or Timeline merely to obtain the minimum Correction UX.

### CTA hook direction

Register the native text-only filter:

```text
gravityflow_update_button_text_user_input
```

The callback must return `اصلاح اطلاعات` only when the current request is the admitted SRWF Correction context. Scope should reuse existing server-side journey admission/fresh-host truth rather than form title, button text, DOM position, or a broad global form filter.

If the concurrent terminal-management PR changes `EntryDetailJourneyPresentationAdapter.php`, refresh main first and preserve its accepted terminal-management behavior. Do not overwrite or reconstruct that file from this qualification snapshot.

## Regression / falsification requirements for production implementation

Required positive controls:

- Review remains native before Revert.
- Native Revert still enters the same User Input Correction step.
- Only host-authorized editable fields are visible/editable.
- Native conditional logic remains live.
- Native validation remains blocking and visible.
- uploads, if present in the real SRWF correction form, remain host-owned.
- corrected valid submission returns to Review.
- `#gravityflow_update_button` mechanics remain native and only its visible value changes.

Geometry/RTL controls:

- 1920, 1680 and 390 at minimum;
- no GPP-introduced horizontal overflow;
- bounded/centered Correction wrapper;
- useful narrow-width gutter retained;
- field/label text resolves RTL/right where appropriate;
- LTR exception families remain LTR;
- focus remains visible;
- submit remains reachable;
- no native conditional field becomes unintentionally visible/hidden.

Negative/bypass controls:

- non-Correction Review must not receive the CTA relabel;
- unrelated Gravity Forms/Gravity Flow User Input forms must not receive the relabel or Correction CSS;
- a User Input step that is not the authoritative SRWF correction target must remain native;
- Full Width Review behavior must remain unchanged;
- terminal Approved/Rejected presentation from the concurrent repair must remain unchanged;
- Inbox geometry code must remain untouched.

## Planned vs actual deviations

- Planned baseline `8d2b066c64ffc0963bdfc45829495ffb4d08cf8d` matched live main at start; no baseline deviation.
- The task asked for screenshots/evidence; the qualification captured both raw and candidate screenshots plus structured geometry/source evidence.
- The exact pinned fixture did not expose select/textarea/email/URL/tel/number/date controls inside the synthetic Correction field set; only representative text-field RTL was runtime-falsified. Those semantic exception families remain explicit production regression obligations.
- Exact Owner-site Full Width marker activation during Correction is `NOT_PROVEN`; the selected repair does not depend on it because Correction is intentionally bounded independent of read-only Full Width Review.

## Decision

**GREEN for qualification / implementation direction.**

The implementation family is `BOUNDED`: one qualified presentation-boundary cause covers the geometry/RTL manifestations; the host exposes one supported text-only CTA seam; no workflow/data/SSOT/schema/topology migration is required; no JavaScript is needed; and the repair can preserve native Gravity Flow/Gravity Forms ownership.

Production behavior is still unchanged. Implementation, production verification, rereview, merge and release remain separate future stages.
