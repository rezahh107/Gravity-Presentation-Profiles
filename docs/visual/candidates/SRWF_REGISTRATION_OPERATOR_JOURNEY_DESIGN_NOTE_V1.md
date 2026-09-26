# SRWF Registration Operator Journey — Candidate Design Note V1

```yaml
document_id: GPP-SRWF-REGISTRATION-OPERATOR-JOURNEY-DESIGN-NOTE-V1
status: READY_FOR_OWNER_UIUX_REVIEW
artifact: docs/visual/candidates/SRWF_REGISTRATION_OPERATOR_JOURNEY_CANDIDATE_V1.html
scope: DESIGN_ONLY
production_impact: NONE
baseline: e24759ccdb00b36976389cf36ad49f2822dfa226
reviewed_pr_head_before_revision: 521c5a9297673d4d0f9c3deb6078c0b9e678ed8a
revision_rule: EXISTING_APPROVED_DESIGN_PLUS_NEW_PR93_JOURNEY_STATES
```

## Owner lock applied

This revision does **not** redesign the existing Inbox or Entry Detail surfaces. The candidate now treats those surfaces as fixed visual authority and adds only journey states that do not already exist there.

The static HTML is review evidence only. Apparent controls do not create runtime behavior, workflow truth, confirmation ownership, correction logic, navigation behavior, or submission behavior.

## Preserved existing Inbox design

The Inbox specimen is restored to the approved/current visual foundation rather than the PR #94 replacement toolbar interpretation. Preserved elements include:

- `کارهای من` page identity and existing helper copy;
- labelled `جستجوی پرونده` field and its search treatment;
- text-labelled `فیلترها` and `مرتب‌سازی` controls;
- the owner-locked `به‌روزرسانی کارهای من` recovery control as a text-labelled control;
- existing two-column desktop case-card composition and mobile single-column behavior;
- existing card identity, national-ID line, stage/date metadata and `باز کردن پرونده` action treatment;
- existing pagination language and geometry;
- existing typography, spacing, borders, radii, shadows and neutral canvas.

The **only** new Inbox element is a visually subordinate, dashed/inactive structural region for a possible future end-of-day report module. It has no active counts, send behavior, SMS semantics, schedule, amendment logic or delivery truth.

## Preserved existing Entry Detail design

The Review specimen now follows the existing Entry Detail vNext hierarchy and semantic grouping rather than the earlier PR #94 two-column reinterpretation. Preserved elements include:

1. page-level breadcrumb/navigation position;
2. compact student identity header;
3. current-task panel;
4. `مقطع و گروه تحصیلی`;
5. `مشخصات داوطلب`;
6. `راه‌های ارتباطی پشتیبان با داوطلب`;
7. `اطلاعات مدرسه`;
8. `مدارک ارائه‌شده`;
9. `اطلاعات ثبت‌نام و وضعیت مالی`;
10. `روند بررسی پرونده`;
11. existing vNext read-only grouped-field visual grammar;
12. the existing ownership boundary that keeps native Gravity Flow workflow/action presentation separate from the GPP dossier.

The Review page has exactly one canonical `بازگشت به کارهای من` control, at the page-level/top navigation position.

## Additive new UI

Only the following are new PR #93 journey designs:

- future end-of-day report **structural placeholder** in Inbox;
- Approve confirmation presentation candidate;
- Reject confirmation presentation candidate;
- Approved result presentation;
- Rejected result presentation;
- Correction-requested result presentation;
- operator-orientation copy around native Correction / User Input;
- Technical Error presentation;
- Unknown-result fail-safe presentation;
- compact case-context strip on result states;
- responsive/mobile presentation of those new states.

## State model

| State | Operator sees | Expected operator action | Truth owner | Design status | Later verification |
|---|---|---|---|---|---|
| My Tasks / Inbox | Existing approved Inbox + inactive future report region | Open a case | Gravity Flow Inbox membership/assignment | Existing visual authority + one additive placeholder | Visual + Runtime |
| Entry Detail / Review | Existing vNext dossier + separate host-owned workflow region + one top return control | Review and choose an available native action | Gravity Forms data + Gravity Flow action availability | Existing visual authority; no redesign | Both |
| Approve confirmation | Calm host-owned confirmation presentation | Confirm or cancel | Gravity Flow native confirmation lifecycle | **HOST-SEAM-DEPENDENT** | Runtime primarily; visual after reconciliation |
| Reject confirmation | Host-owned confirmation with rejection semantics distinct from error | Confirm or cancel | Gravity Flow native confirmation lifecycle | **HOST-SEAM-DEPENDENT** | Runtime primarily; visual after reconciliation |
| Approved result | Approved outcome + compact student identity + return action | Return to My Tasks | Authoritative runtime result + workflow outcome | **RUNTIME-RESULT-DEPENDENT** | Both |
| Rejected result | Rejected business outcome + compact student identity + return action | Return to My Tasks | Authoritative runtime result + workflow outcome | **RUNTIME-RESULT-DEPENDENT** | Both |
| Correction requested | Correction-specific result + compact student identity + host-dependent continuation | Continue only through a proven host seam, or return | Gravity Flow native Revert / transition | **RUNTIME-RESULT-DEPENDENT** | Both |
| Correction / User Input | Native-form orientation; no second editor | Edit only host-exposed fields | Gravity Forms + Gravity Flow User Input | **HOST-STRUCTURE-DEPENDENT** | Runtime primarily |
| Technical Error | Technical-problem copy + compact student identity; final case state explicitly unconfirmed | Return and inspect state before retrying | Runtime technical-failure evidence | **RUNTIME-RESULT-DEPENDENT** | Both |
| Unknown result | Ambiguous-result copy + compact student identity + duplicate-action warning | Do not repeat; return and inspect state | Lack of sufficient authoritative evidence | **RUNTIME-RESULT-DEPENDENT** | Both |
| Return to My Tasks | One canonical continuation in Review; one continuation in each result | Return to canonical Inbox page 1 | Qualified supported/native navigation seam | **HOST-SEAM-DEPENDENT** | Runtime + visual presence |
| Mobile equivalents | Real 390 × 844 CSS-pixel reference, approved responsive grammar and additive state layouts | Same semantic actions | Same owners as desktop | Design-only responsive candidate | Visual + targeted interaction |

## Requested review corrections applied

1. **Inbox fidelity restored.** The custom PR #94 icon-only toolbar/display-options interpretation was removed. The approved search, filter, sort, refresh, cards and pagination grammar is represented again. The report region is the only addition.
2. **Entry Detail fidelity restored.** The novel two-column dossier/sidebar interpretation was removed. The approved vNext dossier order/group styling is represented, with native workflow presentation kept outside the dossier ownership boundary.
3. **Duplicate Back-to-My-Tasks removed.** Review now has one canonical page-level/top control only.
4. **Case identity added to results.** Approved, Rejected, Correction requested, Technical Error and Unknown all show a compact `student name + national ID` context strip on desktop and mobile.
5. **Technical Error wording corrected.** Candidate title is now `در ثبت نتیجه مشکلی رخ داد`; supporting copy says the final case state is not confirmed instead of asserting that mutation definitely did not occur.
6. **Primary mobile reference corrected to real target width.** The principal phone screen is explicitly `390 × 844 CSS px`; action stacking, RTL, wrapping, result context, confirmation and correction layouts are reviewed at that width.

## Candidate UX copy

Where wording is not already authoritative, these remain candidate copy for Owner review:

- Approve confirmation: `تأیید این پرونده؟`
- Reject confirmation: `رد این پرونده؟`
- Approved: `پرونده تأیید شد`
- Rejected: `پرونده رد شد`
- Correction: `پرونده برای اصلاح بازگردانده شد`
- Technical Error: `در ثبت نتیجه مشکلی رخ داد`
- Unknown: `نتیجه نهایی هنوز مشخص نیست`

These strings do not create business rules or runtime truth.

## Unresolved host-dependent items

- Exact native Approve/Reject confirmation markup, wording, button order, initial focus, focus trap, Escape/cancel semantics and focus restoration remain unproven and must be reconciled with the real Gravity Flow seam.
- Any direct continuation into correction remains a candidate only and may be admitted only if the native correction topology exposes a supported continuation/destination.
- Exact User Input fields, editability, validation, submit behavior and post-submit route remain Gravity Forms / Gravity Flow owned.
- Production `بازگشت به کارهای من` must later use a qualified supported/native navigation seam and land on canonical Inbox page 1.
- Approved / Rejected / Correction / Technical Error / Unknown may render only from authoritative runtime evidence; a click is never sufficient proof.

## Visual-CI impact — future only

After Owner approval and host reconciliation, suitable `PREVIEW_DIAGNOSTIC` candidates are limited to presentation concerns such as:

- additive result-state geometry and case-context strip;
- reconciled host confirmation presentation;
- real 390px mobile action/result layouts;
- focus-ring presentation and RTL stability;
- presence/geometry of the single canonical Back-to-My-Tasks control.

Existing Inbox and Entry Detail visual authority should continue to be tested by their current coverage rather than being replaced by this candidate. Runtime mutation, authorization, transition truth, confirmation lifecycle and correction topology remain interaction/runtime evidence obligations.

## Production impact

`NONE — design-only revision`

No production PHP, CSS, JavaScript, Gravity Forms/Gravity Flow configuration, workflow behavior, Visual Regression CI, Golden, release, deployment or approved visual authority is changed by this revision.

## Status

`READY_FOR_OWNER_UIUX_REVIEW`
