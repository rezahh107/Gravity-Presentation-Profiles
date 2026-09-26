# SRWF Registration Operator Operational UX Target V1

```yaml
document_id: GPP-SRWF-REGISTRATION-OPERATOR-OPERATIONAL-UX-TARGET-V1
status: OWNER_APPROVED_TARGET__IMPLEMENTATION_OPEN
product: Gravity Presentation Profiles
consumer: SRWF Student Registration Workflow
surfaces:
  - gravity_flow.inbox
  - gravity_flow.entry_detail
  - gravity_flow.user_input
  - srwf.daily_management_report_presentation
owner_scope_start: after successful Plato authentication
owner_scope_end: operator daily-work completion and return/continuation guidance
preserves:
  - Gravity Forms data and validation ownership
  - Gravity Flow workflow, assignment, authorization, actions and transitions
  - Plato login/logout ownership
  - SRWF business-rule ownership
  - GNM notification-delivery ownership
out_of_scope:
  - replacing Gravity Flow workflow or Inbox
  - custom login/logout UX
  - automatic next-case routing
  - GPP-owned daily-report counting/business semantics
  - GPP-owned SMS delivery
```

## 1. Purpose

This document records the Owner-approved destination for the **complete registration-operator journey after login**, not merely the visual quality of individual Inbox or Entry Detail pages.

The target user is a qualified registration operator who is **not expected to know WordPress, Gravity Forms, Gravity Flow, repository architecture, internal IDs, hooks or workflow terminology**.

The product must make the following understandable from the interface itself:

```text
Where am I?
→ What am I expected to do?
→ What will this action do?
→ Did it actually succeed?
→ What does the result mean?
→ What should I do next?
```

Visual quality is part of comprehension, not decoration only. Labels, iconography, color, hierarchy, state feedback and navigation must work together so the operator does not have to infer workflow semantics from technical behavior.

## 2. Ownership boundary

### Plato owns

- login UI;
- authentication interaction;
- login success/failure messaging;
- logout UI and behavior.

GPP must not replace or redesign these surfaces for this target.

### Gravity Forms owns

- entry data;
- field values;
- validation;
- form submission;
- canonical data lifecycle.

### Gravity Flow owns

- Inbox membership and assignment;
- Entry Detail permission;
- Approval / Reject / Revert behavior;
- User Input behavior;
- workflow state and transitions;
- nonces, authorization and validation;
- workflow destinations and native operational truth.

### SRWF owns

- registration business meaning;
- what constitutes a valid daily registration/reporting event;
- daily report counting and classification semantics;
- amendment rules at the business level;
- which manager/recipient should receive the report.

### GNM owns

- actual notification/SMS delivery;
- delivery execution/result semantics within its own contract.

### GPP owns

- the coherent presentation of the operator journey on admitted SRWF Gravity Flow surfaces;
- page orientation and contextual guidance;
- visual/semantic presentation of native actions;
- optional confirmation presentation where Owner-authorized;
- authoritative-result feedback presentation;
- return navigation presentation;
- presentation of SRWF-provided daily-report state/actions inside the admitted Inbox experience, without taking ownership of the report's business truth or delivery.

## 3. Complete target journey

The normal operator journey is:

```text
Plato login
  ↓
My Tasks / Gravity Flow Inbox
  ↓
Open a case
  ↓
Read-only Review / Entry Detail
  ↓
Choose one valid action
  ├─ Approve
  ├─ Reject
  └─ Request correction / Revert
       ↓
       User Input correction by the same operator
       ↓
       Complete correction
       ↓
       Return to Review
  ↓
Authoritative result feedback
  ↓
Return to My Tasks — always page 1
  ↓
Repeat as needed
  ↓
End-of-day report card / preview / explicit send
  ↓
If later changes occur: amendment state
```

The current target does **not** include an automatic or explicit `Next case` action.

## 4. Inbox is the operator's operational home

The admitted SRWF Inbox is not only a styled list. It is the operator's daily operational home.

It should make at least these concepts understandable where evidence/runtime state is available:

- this page is `کارهای من`;
- the listed cases currently require the operator's action;
- opening a case begins review;
- the operator can manually recover/refresh the view where the existing supported control is admitted;
- daily-work/reporting state may be presented above or beside the case list as a distinct operational region, not mixed into each case card.

The daily-report region must remain visually and semantically distinct from case-level actions because it applies to the **day/workset**, not one Entry.

## 5. Entry Detail orientation and navigation

Every admitted SRWF Review surface must provide an obvious, non-technical route:

**`بازگشت به کارهای من`**

This action returns to the canonical **first page** of My Tasks.

Owner decision:

- preserving previous Inbox pagination, search, filter or scroll position is **not required**;
- predictable return to page 1 is the target;
- GPP should prefer a supported/native Gravity Flow back-link/navigation seam where one is available and verified;
- GPP must not invent a parallel Inbox/navigation system merely to implement this target.

The original GPP visual reference already expressed `بازگشت به کارهای من`; the production target now makes that journey requirement explicit rather than leaving it as mockup-only intent.

## 6. Action language and semantics

Operator-facing wording must use the operator's work language, not implementation terminology.

Preferred concepts:

- `تأیید پرونده`
- `رد پرونده`
- `درخواست اصلاح` / equivalent Owner-approved correction wording
- `بازگشت به کارهای من`
- `ارسال گزارش پایان روز`

Terms such as `Entry`, `Approval Step`, `Revert`, `User Input Step`, internal IDs or hook names must not be the primary comprehension path.

Each material action should make its consequence understandable before execution, without duplicating technical implementation detail.

## 7. Approve / Reject confirmation policy

GPP should provide one Owner-facing/admin setting for the admitted SRWF review experience:

**Confirmation before recording case decision**

Target behavior:

- default: **enabled**;
- scope: Approve and Reject;
- the setting may be turned on/off by an authorized administrator;
- Request Correction / Revert is not included by default because it continues the same operator's correction journey rather than finalizing the review decision;
- disabling confirmation removes only the confirmation step;
- disabling confirmation must not weaken Gravity Flow authorization, nonces, validation, workflow truth, result detection, error handling or result feedback.

Confirmation copy must name the action and consequence. A bare `آیا مطمئن هستید؟` is insufficient.

Conceptual examples:

### Approve confirmation

**تأیید این پرونده؟**  
با ادامه، نتیجه تأیید در گردش کار ثبت می‌شود.

Primary: **تأیید و ثبت**  
Secondary: **انصراف**

### Reject confirmation

**رد این پرونده؟**  
با ادامه، نتیجه رد در گردش کار ثبت می‌شود.

Primary: **رد و ثبت**  
Secondary: **انصراف**

The implementation must avoid double-confirmation if Gravity Flow already provides an active native confirmation for the same action. Exact host seam and coexistence behavior require runtime verification before implementation closure.

## 8. Correction path

The same registration operator performs the correction.

Selected topology remains host-native:

```text
Review Approval
  ↓ Request Correction / native Revert
Correction User Input
  ↓ Complete
Review Approval
```

GPP must not create a second editing system.

The correction surface should clearly orient the operator that:

- this case is open for correction;
- the operator should correct only the fields allowed by Gravity Flow configuration;
- completing the correction returns the case to Review according to the configured native route.

The target does not require an additional confirmation before entering correction.

Unsaved-change/leave-page protection is **not assumed** by this document. It may be added only if a supported and verified host-safe implementation is demonstrated.

## 9. Authoritative result feedback

A click is not success.

GPP must show a success/business-result state only after the underlying Gravity Flow operation has actually produced authoritative evidence of that result.

Do not show `پرونده تأیید شد` or `پرونده رد شد` merely because the user clicked the button.

The result layer must distinguish two independent ideas:

1. **technical execution outcome** — did the operation succeed/fail/remain unknown?
2. **business workflow outcome** — approved/rejected/correction/etc.

Therefore:

**Rejected is not a system error.**

Example valid combinations:

- technical success + business approved;
- technical success + business rejected;
- technical success + correction route;
- technical failure + no valid business-result claim;
- unknown/ambiguous execution + no fabricated success/failure claim.

## 10. Result-dialog target

Normal successful case outcomes should use a semantic **result dialog**, not an error alert.

### Approved

Icon family: `circle-check`

**پرونده تأیید شد**  
نتیجه بررسی با موفقیت ثبت شد.

Primary continuation: **بازگشت به کارهای من**

### Rejected

Icon family: contextual rejection such as `file-x`, not a generic system-error glyph.

**پرونده رد شد**  
نتیجه رد با موفقیت ثبت شد.

Primary continuation: **بازگشت به کارهای من**

### Correction

Icon family: `file-pen` / correction semantics.

The correction result/guidance must describe the real native transition and next valid action. Do not claim a destination that runtime evidence does not establish.

### Technical failure

Icon family: `triangle-alert`.

**نتیجه ثبت نشد**  
Plain-language consequence + valid retry/next-step guidance based on real runtime capability.

A technical error must not reuse the normal Reject presentation.

### Unknown / ambiguous result

If the system cannot prove success or failure, do not fabricate either state. Present an honest unknown/ambiguous state and the safest valid next action.

## 11. Dialog accessibility and continuation

Result/confirmation dialogs must preserve usable keyboard and assistive-technology behavior.

At minimum, implementation/acceptance must verify where applicable:

- meaningful accessible name/title;
- focus moves into the opened modal;
- keyboard traversal remains usable within the modal;
- Escape/cancel behavior matches the dialog type and does not trigger the material action;
- focus after closure moves to a logical continuation point;
- color is not the sole carrier of meaning;
- icons are decorative when redundant with visible text, or otherwise receive correct semantics;
- result text remains understandable without the icon/color.

For a completed Approve/Reject action, the logical continuation is the **return to My Tasks** path rather than restoring focus to a now-stale action button merely for mechanical symmetry.

If a result dialog is dismissed, the page must not leave the operator unable to determine whether the operation completed. The result/continuation state must remain truthfully understandable through the resulting page/runtime state.

## 12. Semantic visual language

Owner-approved target operational palette:

| Meaning | Target base color | Icon family |
|---|---:|---|
| navigation / primary continuation | `#1D4ED8` | arrow/navigation |
| approved / positive completion | `#15803D` | `circle-check` |
| rejected business decision | `#BE123C` | `file-x` |
| correction / revision | `#B45309` | `file-pen` |
| technical/system error | `#B91C1C` | `triangle-alert` |
| primary text | `#0F172A` | — |
| secondary text | `#475569` | — |
| page background | `#F8FAFC` | — |
| surface | `#FFFFFF` | — |
| border | `#E2E8F0` | — |
| keyboard focus | `#2563EB` | — |

These values define the current target semantic direction for this operational experience. Implementation must still verify actual contrast in the final rendered state, including text size, background, hover, disabled and focus states.

Semantic meaning must not depend on color alone. Shape/icon + title/text + color should reinforce the same meaning.

## 13. End-of-day report integration target

The daily management report belongs to SRWF business logic and GNM delivery, but the operator-facing entry point belongs naturally in the Inbox operational experience.

GPP target presentation may expose an SRWF-provided **daily status/report card** when the integration contract is available.

Conceptual journey:

```text
My Tasks
  ↓
Daily status/report card
  ↓
Preview today's report
  ↓
Explicit confirm + send
  ↓
GNM delivery
  ↓
Truthful result state
```

Important locks:

- report send is a manual explicit operator action;
- sending the report does **not** lock further case work for that day;
- if later qualifying activity occurs, SRWF may expose an amendment-needed state;
- amendment presentation should show what changed and allow an explicit amendment send;
- previous report versions/history must not be silently rewritten as if the first send never occurred;
- actual counting/classification rules are **not defined by GPP** and must come from SRWF authority;
- actual SMS/provider delivery truth is **not defined by GPP** and must come from GNM authority;
- because report send causes a real external message, a deliberate preview/confirmation step remains required independent of the Approve/Reject confirmation toggle.

No automatic scheduled send is admitted by this GPP target.

## 14. No Next Case target

The current destination explicitly does **not** require:

- automatic redirect to another case;
- a `پرونده بعدی` button;
- GPP-owned logic for selecting the next assigned Entry.

The stable continuation is `بازگشت به کارهای من`.

A future Next Case capability requires a separate Owner decision plus proof of a host-authoritative, assignment-safe selection seam.

## 15. Empty, loading and failure behavior

The journey must not strand the operator in unexplained states.

Where applicable:

- loading/submission state prevents accidental double-submit;
- success is never shown before server/host confirmation;
- recoverable errors explain what happened and what the operator can safely do next;
- empty Inbox state explains that there is currently no case requiring action rather than presenting a blank/broken screen;
- disabled controls have an understandable reason where that reason is relevant and safe to expose;
- technical references may exist for support/diagnostics but are secondary to operator-facing meaning.

## 16. Implementation principles

Implementation should use the smallest supported host-safe mechanism in this order:

1. native Gravity Flow configuration/capability;
2. documented Gravity Flow seam/filter/action/back-link behavior;
3. GPP-scoped server-rendered presentation;
4. GPP-scoped CSS;
5. bounded JavaScript only when required for proven interaction/presentation behavior.

GPP must not reimplement:

- Approval processing;
- Reject processing;
- Revert/User Input workflow;
- Inbox assignment/query truth;
- authorization;
- daily-report business computation;
- SMS delivery.

## 17. Acceptance requirements

This target is not complete merely because the pages look correct.

Acceptance must prove the operational journey on authentic supported runtime surfaces, including materially relevant paths:

### Navigation

- My Tasks → Entry Detail works;
- `بازگشت به کارهای من` is visible/usable where admitted;
- return lands on canonical Inbox page 1;
- no parallel/custom Inbox state machine is introduced.

### Approve / Reject

- confirmation-enabled path works;
- confirmation-disabled path works;
- no double-confirmation with native host behavior;
- cancel performs no workflow mutation;
- success dialog appears only after authoritative success;
- rejected business result is not styled/announced as technical error;
- system failure does not masquerade as business Reject.

### Correction

- Request Correction enters the native configured User Input path;
- the same operator can perform the correction where workflow configuration grants it;
- Complete returns to Review through the configured native route;
- GPP does not expose a parallel editor.

### Accessibility / responsive

- keyboard/focus behavior is usable;
- semantic names and dialog relationships are correct;
- approved/rejected/correction/error meaning is not color-only;
- desktop and mobile presentation remain understandable and usable;
- RTL presentation is correct for Persian operator UI and any LTR technical fragments remain isolated where needed.

### Daily report integration

When SRWF/GNM integration exists, prove separately that:

- Inbox presentation reflects authoritative SRWF daily-report state;
- preview/confirm does not itself fabricate send success;
- actual success/failure/unknown delivery state comes from the owning integration;
- post-report qualifying activity can surface amendment-needed state without blocking normal case work.

## 18. Evidence ceiling and current status

This document records the **Owner-approved destination**.

It does not claim that the destination is already implemented.

Current known implementation contains substantial Inbox and Entry Detail presentation work, but the complete operational journey described here still requires implementation/runtime qualification.

In particular, the exact Gravity Flow seams for:

- configurable confirmation coexistence;
- authoritative post-action result capture/presentation;
- production-safe return navigation behavior;

must be verified against the supported runtime before implementation is declared closed.

## 19. Relationship to existing authority

This document is narrower than and subordinate to `MOTHER_ARCHITECTURE.md` on generic ownership boundaries.

It complements:

- `ENTRY_DETAIL_REVIEW_CORRECTION_TARGET_V1.md` for Review/Correction architecture;
- admitted Inbox visual/runtime contracts and diagnostics;
- SRWF business authority for registration/report semantics;
- GNM authority for delivery semantics.

Where an older GPP visual reference illustrates a Back-to-Inbox or semantic action pattern without making it a runtime requirement, this document makes the **operational journey requirement** explicit for the forward target.

It does not rewrite historical evidence or claim prior implementation already satisfied this target.
