# SRWF Registration Operator Journey — Candidate Design Note V1

```yaml
document_id: GPP-SRWF-REGISTRATION-OPERATOR-JOURNEY-DESIGN-NOTE-V1
status: READY_FOR_OWNER_UIUX_REVIEW
artifact: docs/visual/candidates/SRWF_REGISTRATION_OPERATOR_JOURNEY_CANDIDATE_V1.html
scope: DESIGN_ONLY
production_impact: NONE
baseline: e24759ccdb00b36976389cf36ad49f2822dfa226
```

## Design basis

This candidate extends, rather than replaces, the existing SRWF/GPP visual language. Inbox retains its current operational-home composition and card language. Entry Detail follows the admitted vNext visual authority: neutral page canvas, white dossier surface, 14px-class radii, restrained shadow, `#172033` primary text, `#475467` supporting text, `#1D4ED8` primary action, 44px minimum action targets, visible focus rings, and a separate host-owned workflow/action region.

The artifact is intentionally static. Any apparent action, confirmation, result, navigation, correction transition, or form submission is a visual/UX state only.

## State model

| State | Operator sees | Expected operator action | State truth owner | Design status | Later verification |
|---|---|---|---|---|---|
| My Tasks / Inbox | Page identity, guidance, search/refresh area, case cards, future report region | Open one case | Gravity Flow Inbox membership/assignment | Existing visual foundation + design extension | Visual Regression + Runtime/Interaction |
| Entry Detail / Review | Case identity, readable dossier, separate action area, return path | Review then choose an available native action | Gravity Forms data + Gravity Flow action availability | Existing vNext visual foundation + design extension | Both |
| Approve confirmation | Calm confirmation dialog over Review context | Confirm or cancel | Gravity Flow native confirmation lifecycle | **HOST-SEAM-DEPENDENT** | Runtime/Interaction primarily; visual after host reconciliation |
| Reject confirmation | Equivalent native-host confirmation with rejection semantics distinct from error | Confirm or cancel | Gravity Flow native confirmation lifecycle | **HOST-SEAM-DEPENDENT** | Runtime/Interaction primarily; visual after host reconciliation |
| Approved result | Explicit approved title, completion icon, explanatory text, return action | Return to My Tasks | Authoritative runtime result + workflow outcome | **RUNTIME-RESULT-DEPENDENT** | Both |
| Rejected result | Explicit rejected title; execution success is visually distinct from technical error | Return to My Tasks | Authoritative runtime result + workflow outcome | **RUNTIME-RESULT-DEPENDENT** | Both |
| Correction requested | Correction-specific success state and next-step guidance | Continue only through a proven host continuation, or return to My Tasks | Gravity Flow native Revert / workflow transition | **RUNTIME-RESULT-DEPENDENT** | Both |
| Correction / User Input | Clear correction orientation around representative native form composition | Edit only host-exposed fields and complete native submission | Gravity Forms + Gravity Flow User Input | **HOST-STRUCTURE-DEPENDENT** | Runtime/Interaction primarily; visual for layout |
| Technical Error | Explicit technical-failure title, no business-result claim | Return to My Tasks and re-check state before retrying anything | Runtime failure evidence | **RUNTIME-RESULT-DEPENDENT** | Both |
| Unknown result | Explicit ambiguity, duplicate-action prevention, safe continuation | Do not repeat action; return to My Tasks and inspect state | Absence of sufficient authoritative result evidence | **RUNTIME-RESULT-DEPENDENT** | Both |
| Return to My Tasks | Visible continuation from Review/result states | Return to canonical Inbox page 1 | Supported/native navigation seam + target contract | **HOST-SEAM-DEPENDENT** until qualified | Runtime/Interaction + visual presence |
| Mobile equivalents | Stacked actions, touch-safe targets, single-column dossier/results, bottom-sheet-like host confirmation candidate | Same semantic actions as desktop | Same owners as corresponding desktop state | Design-only responsive candidate | Visual Regression + targeted interaction |

## Key design decisions

1. **No visual reset.** Existing Inbox and Entry Detail tokens and component grammar remain recognizable throughout the journey.
2. **Action hierarchy is explicit.** Approve is the primary filled action; Reject and Request Correction are distinct outlined actions. On mobile they stack vertically so wrapping cannot scramble priority.
3. **Business rejection is not technical failure.** Rejected uses a file/outcome semantic; Technical Error uses warning/technical-failure semantics and different explanatory copy.
4. **Unknown is its own state.** It uses neutral/uncertain semantics and explicitly tells the operator not to repeat the action based on false certainty.
5. **Every terminal result has a visible continuation.** `بازگشت به کارهای من` is the stable next step; no `پرونده بعدی` control is introduced.
6. **Correction stays native.** The User Input mockup demonstrates orientation and responsive composition only; it does not define which fields are editable or introduce a second editor.
7. **Future daily report is location-only.** Inbox shows a dashed, clearly inactive structural region; no count, classification, scheduling, SMS, amendment, or delivery truth is designed as active behavior.
8. **Accessibility is visible in the candidate.** Focus rings, 44px-class targets, semantic titles, text+icon status signals, RTL layout, and LTR isolation for numeric fragments are demonstrated.

## Candidate UX copy

The following wording is proposed for Owner review where exact business wording is not already authoritative:

- Approve confirmation: `پرونده تأیید شود؟`
- Reject confirmation: `پرونده رد شود؟`
- Approved: `پرونده تأیید شد`
- Rejected: `پرونده رد شد`
- Correction: `پرونده برای اصلاح باز شد`
- Technical Error: `نتیجه ثبت نشد`
- Unknown: `نتیجه هنوز مشخص نیست`

These strings are candidate copy, not new business rules.

## Host-dependent assumptions

- Exact native Approve/Reject confirmation markup, button order, copy, initial focus, focus trap, Escape behavior, and focus restoration are not claimed as proven. Desired presentation is marked `HOST-SEAM-DEPENDENT — to be reconciled during qualification`.
- `ادامه به اصلاح پرونده` is shown only as a candidate continuation. It may be admitted later only if Gravity Flow exposes a supported destination/continuation seam for the actual correction topology.
- Exact User Input fields, validation messages, editability, and submit behavior remain host-owned and must be taken from the real Gravity Forms / Gravity Flow configuration.
- `بازگشت به کارهای من` is the target UX. Exact production navigation must later use a supported/native seam and land on canonical Inbox page 1.
- Result states may render only after authoritative evidence establishes the technical and business outcome. Button click alone is never sufficient.

## Visual-CI impact — future only

Good future `PREVIEW_DIAGNOSTIC` candidates after Owner approval and host reconciliation:

- Entry Detail Review layout and action hierarchy;
- native-confirmation presentation geometry after its real host seam is proven;
- Approved / Rejected / Correction / Error / Unknown result presentations;
- mobile action ordering and minimum target geometry;
- visible focus treatment and RTL layout stability;
- Back-to-My-Tasks control presence and geometry.

Do **not** use screenshots to prove workflow mutation, authorization, native confirmation lifecycle, authoritative result truth, correction topology, assignment, or navigation destination. Those remain runtime/interaction evidence obligations.

## Production impact

`NONE — design-only task`

No production PHP, CSS, JavaScript, Gravity Forms/Gravity Flow configuration, workflow behavior, Visual Regression CI, Golden, runtime reference, release, or deployment is changed by this design batch.

## Status

`READY_FOR_OWNER_UIUX_REVIEW`
