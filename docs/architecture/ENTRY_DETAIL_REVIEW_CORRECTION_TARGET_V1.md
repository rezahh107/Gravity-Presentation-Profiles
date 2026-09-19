# Entry Detail Review / Correction Target Architecture V1

```yaml
document_id: GPP-ENTRY-DETAIL-REVIEW-CORRECTION-TARGET-V1
status: OWNER_APPROVED_TARGET__METHOD_SELECTED__NOT_IMPLEMENTED__NOT_RUNTIME_VALIDATED
surface: gravity_flow.entry_detail
scope: SRWF operations Entry Detail presentation architecture
selected_duplicate_suppression_method: server-conditioned GPP-scoped CSS suppression of native read-only Entry Detail table
selected_correction_method: native Gravity Flow Revert -> User Input -> Review
correction_return_route_capability: Gravity Flow User Input explicit Next Step -> Review Approval is host-native and selected
supersedes_forward_target:
  - transactional client-side recomposition of native Gravity Flow read-only/editor/status/timeline regions into the GPP dossier for visual composition
  - changing Gravity Flow field-visibility semantics merely to remove duplicate native read-only rendering
preserves:
  - historical evidence and prior PR records
  - generic Mother Architecture ownership boundaries
  - existing Print architecture
```

## 1. Purpose and authority

This document records closed Owner decisions for the **forward target architecture** and the selected implementation method for the GPP Gravity Flow Entry Detail surface.

It is intentionally narrower than `MOTHER_ARCHITECTURE.md` and does not change the generic product boundary. It governs how the SRWF operations Entry Detail review/correction experience should evolve.

This is a target architecture / method-selection record, not implementation evidence.

### CURRENT implementation

The repository may still contain transactional client-side composition that moves original Gravity Flow regions/nodes into the GPP dossier and uses JavaScript to complete the composed presentation.

That current implementation remains historical/current code reality until a later implementation work unit changes it.

### TARGET architecture

The target is:

```text
Gravity Flow Entry Detail

┌──────────────────────────────────────┐
│        GPP READ-ONLY DOSSIER         │
│                                      │
│ Name / National ID / School / ...    │
│ Documents / Contact / Facts / ...    │
│                                      │
│ Each semantic fact appears once.     │
└──────────────────────────────────────┘

        ┌──────────────────────┐
        │ Native Gravity Flow  │
        │ Workflow / Status    │
        │ Note / Comment       │
        │ Approve / Reject     │
        │ Request Edit/Revert  │
        └──────────────────────┘
```

The dossier and native workflow box are separate but visually coordinated regions. Review and editing are separate concerns.

## 2. Locked Owner decisions

### OD-ENTRY-01 — Review surface is primarily read-only

Normal Entry Detail review is a read-oriented dossier. The operator primarily inspects candidate/student information, documents and workflow context, then uses Gravity Flow-owned review actions when permitted.

Inline editing of dossier fields is not a normal Entry Detail requirement. The expected operational assumption is that most reviews do not require editing.

### OD-ENTRY-02 — GPP semantic data is displayed once

When the GPP Entry Detail dossier is active and ready, admitted semantic dossier values are presented through the GPP dossier **once**.

The native Gravity Flow / Gravity Forms read-only field listing must not appear again as a second presentation of the same information.

Duplicate presentation such as:

```text
native field listing
+
GPP-rendered copy of the same semantic values
```

is an Entry Detail presentation defect.

This does not create a second data source. Gravity Forms remains the canonical data/value owner.

### OD-ENTRY-03 — Native Gravity Flow workflow box remains native

Gravity Flow continues to own and render its workflow/status/action region, including host-owned behavior such as:

- Approve / Reject;
- Revert;
- workflow note/comment;
- workflow status;
- confirmation behavior;
- validation;
- nonces;
- assignment and authorization semantics.

GPP must not rebuild, clone, fake or parallelize these controls.

The target architecture does **not** structurally move/reparent this operational box into the GPP dossier merely to obtain visual composition.

### OD-ENTRY-04 — Workflow box may be visually integrated with scoped CSS

GPP may visually adapt the native workflow box so it belongs to the same admitted Entry Detail visual system while remaining a separate native region.

Exact future values must be derived from the admitted Entry Detail visual authority / existing GPP tokens, including applicable radius, border, background/surface, spacing, typography, shadow and control rhythm.

No new visual tokens are admitted by this architecture record.

The workflow region should be laid out so it does not overlap or collide with the dossier. The Owner's current visual direction is that the native workflow box remain separate and be shifted/aligned toward the left side where appropriate.

Future implementation should prefer robust scoped layout/CSS and avoid brittle absolute positioning or cosmetic transforms unless runtime evidence proves another method necessary.

### OD-ENTRY-05 — No structural JavaScript composition by default

The target Entry Detail architecture must not depend on JavaScript structural recomposition merely to:

- move the native workflow box;
- move native read-only fields into the dossier;
- reproduce the dossier field layout;
- eliminate duplicate read-only information.

JavaScript remains zero-by-default under the Mother Architecture.

JavaScript may remain for a separately proven residual progressive-enhancement need, for example bounded image preview, provided it does not take ownership of Gravity Flow workflow behavior.

This decision does not itself delete or modify current JavaScript.

### OD-ENTRY-06 — Editing is separated from review

The normal dossier review page should not expose the complete native editable field interface merely because fields are technically editable.

If correction is required, editing should happen in a distinct edit/correction experience.

Conceptual flow:

```text
Review
  ↓
Request Edit / Revert
  ↓
Dedicated editable step
  ↓
Save / Complete
  ↓
Return to review workflow
```

This separation prevents the normal state from showing an editable/native copy and a GPP read-only copy of the same data at the same time.

### OD-ENTRY-07 — Native Gravity Flow User Input owns correction editing

The selected host-native correction mechanism is a dedicated Gravity Flow **User Input Step**.

Only explicitly permitted fields should be editable in that step.

Gravity Flow / Gravity Forms continue to own editable-field behavior, validation, conditional logic, file handling, submission/save, permissions and workflow transition.

The exact editable field set, correction assignee, required correction note, notifications and Save Progress behavior remain implementation/configuration decisions.

No User Input configuration is admitted as implemented by this record.

### OD-ENTRY-08 — Native Revert is the selected Request Edit transition

The selected basis of the future Request Edit interaction is Gravity Flow's native **Revert** transition from the Review Approval Step to the dedicated User Input correction step.

A later implementation may adapt the user-facing label, for example `درخواست اصلاح`, through a host-supported label mechanism without changing host ownership.

No custom endpoint, custom workflow state or duplicate action system is authorized by this record.

### OD-ENTRY-09 — Print remains independent

The existing Print function remains an independent Entry Detail utility.

Review/edit separation does not authorize a change to Print architecture.

### OD-ENTRY-10 — Preserve host ownership

These decisions preserve the Mother Architecture ownership boundary:

**Gravity Forms owns:**

- fields;
- entries;
- values;
- validation;
- submission.

**Gravity Flow owns:**

- workflow;
- assignment;
- authorization;
- Approval / Reject / Revert;
- User Input behavior;
- workflow transitions;
- operational status/actions.

**Gravity Presentation Profiles owns:**

- dossier presentation;
- visual hierarchy;
- scoped visual adaptation;
- semantic read-only projection of admitted data.

## 3. Owner-approved implementation method

Decision status for this section:

```text
OWNER-APPROVED / METHOD_SELECTED
NOT_IMPLEMENTED
NOT_RUNTIME_VALIDATED
NOT_PRODUCTION_ACCEPTED
```

### 3.1 Duplicate native read-only field suppression

The selected method is:

**server-conditioned, GPP-scoped CSS suppression of the native Gravity Flow read-only Entry Detail table.**

The native field listing must **not** be suppressed by changing Gravity Flow field-visibility semantics merely to eliminate duplicate presentation.

Specifically, these are not the primary suppression mechanism:

- configuring Approval Step Display Fields to hide everything;
- forcing `gravityflow_workflow_detail_display_field` to false for GPP duplication control;
- client-side JavaScript DOM removal or relocation.

Reason: GPP relies on Gravity Flow's display/visibility decision to determine whether a field-backed semantic is allowed to appear in the GPP dossier. Changing that host predicate for cosmetic duplicate suppression can incorrectly turn an otherwise permitted GPP semantic into `HOST_HIDDEN`.

The selected method therefore preserves the host visibility/privacy decision and suppresses only the duplicate visual presentation.

### 3.2 Server-side suppression admission contract

Suppression may activate only when the server has positively established the bounded GPP review state, including:

- the GPP Entry Detail profile is active;
- Gravity Flow Entry Detail permission has already been granted;
- structural/page readiness is valid;
- the GPP dossier was successfully emitted;
- the current surface is a read-only review state;
- the request is not an active User Input editing state;
- no native editable editor is required for the current request.

When those conditions hold:

```text
GPP read-only dossier                  visible
native read-only Entry Detail table   suppressed by scoped CSS
native Gravity Flow workflow box      visible and untouched
Print / Timeline / Admin Actions       remain native unless separately governed
```

The activation marker/condition must be derived server-side. Structural JavaScript composition must not be required to activate suppression.

### 3.3 Degraded semantic slots do not cancel suppression

The previous graceful-degradation decision remains controlling.

A dossier can be structurally valid and successfully emitted while individual semantic slots are legitimately:

- `UNMAPPED`;
- stale;
- mapped but empty;
- source-unavailable;
- otherwise represented by the admitted per-slot degraded state.

Those slot-level presentation states do **not** by themselves require the duplicate native field table to reappear.

Therefore the phrase "partially unavailable" must not be interpreted to mean that one unmapped/stale/empty presentation semantic disables suppression.

Suppression must remain tied to **structural/read-only dossier admission and successful dossier emission**, not to perfect semantic completeness.

Host-hidden fields remain different: GPP must not expose them, and CSS suppression is never a substitute for the host privacy/visibility decision.

### 3.4 Safe fallback

If structural GPP review admission cannot be proven, including cases such as:

- GPP profile inactive;
- structural readiness failure;
- dossier emission failure;
- unknown/unsafe editability state;
- active User Input editing state;
- a native editable editor is required;

then duplicate-field suppression must not activate.

Fallback is intentionally conservative:

```text
native Gravity Flow field display remains available
+
native workflow controls remain usable
```

Failure should prefer duplication over information loss or workflow breakage.

### 3.5 CSS suppression is presentation only

This suppression mechanism is not:

- authorization;
- privacy enforcement;
- data filtering;
- workflow logic.

The duplicate native values may still exist in generated HTML.

Gravity Flow remains authoritative for whether a field may be displayed. GPP must never use CSS suppression to justify exposing a host-hidden value.

## 4. Selected correction workflow topology

The selected correction topology is:

```text
Review Approval Step [R]
        ↓ native Revert / Request Edit
Correction User Input Step [U]
        ↓ Complete
Review Approval Step [R]
```

The Approval Step's native Revert mechanism is the selected transition into correction.

The User Input Step owns editing and exposes only explicitly Owner-approved editable fields.

The target workflow configuration must make destinations explicit so an Approved review cannot accidentally fall through into the correction step.

Conceptually:

```text
Review Approval [R]

Revert:
    destination = Correction User Input [U]

User Input [U]:
    editable_fields = only Owner-approved correction fields
    on complete = Review Approval [R]

Approved in [R]:
    explicit success destination

Rejected in [R]:
    explicit rejection destination
```

The host-capability question for the User Input completion route back to Review is **closed**: Gravity Flow natively supports selecting the Review Approval Step [R] as the User Input Step [U]'s explicit **Next Step**.

Therefore `User Input Complete -> Review Approval` is no longer an architectural or host-capability unknown. The implementation work unit must configure and verify the selected native route; it does not need to discover or invent a return mechanism.

The remaining open items are Owner/configuration choices:

- editable field set;
- correction assignee;
- required correction note;
- notifications;
- Save Progress behavior;
- Approved destination;
- Rejected destination.

These are configuration decisions for the later implementation work unit, not architecture gaps.

## 5. Locked Entry Detail mental model

### Review

```text
1. GPP read-only dossier
   - semantic data shown once

2. Native Gravity Flow workflow box
   - Approve
   - Reject
   - Request Edit / Revert
   - Note
   - Status

3. Native supporting utilities
   - Print
   - Timeline
   - Admin Actions where authorized
```

### Editing

```text
Review
→ Request Edit / Revert
→ User Input
→ edit only allowed fields
→ Complete
→ Review
```

## 6. Supersession boundary

This decision supersedes the **forward target direction** in which native Gravity Flow read-only/editor/status/timeline regions were structurally recomposed into the GPP dossier merely to realize the approved visual composition.

It also closes the previously open implementation-method question for duplicate read-only field suppression: the selected target is server-conditioned GPP-scoped CSS suppression, not mutation of Gravity Flow field visibility semantics and not JavaScript structural removal.

It further closes the previously open host-capability question for the correction return route: User Input may explicitly select the Review Approval Step as its native Next Step.

It does **not** rewrite historical evidence or claim that previous implementation/qualification never existed.

Historical PRs, runtime qualification and evidence remain valid descriptions of the code/runtime they actually tested.

Where another current forward-looking Entry Detail document conflicts on structural composition, duplicate-field suppression method, or whether the User Input return route is a host-capability unknown, this architecture record controls that narrow question.

## 7. Relationship to visual authority

The admitted Entry Detail vNext visual authority remains the source for dossier visual language and exact tokens where already admitted.

This architecture changes **ownership, structural composition direction and duplicate-field suppression method**, not the visual language itself:

- GPP dossier keeps the admitted read-only hierarchy;
- native workflow box remains native and separate;
- GPP may visually coordinate that box with scoped CSS using admitted tokens;
- duplicate native read-only dossier values are suppressed only under the server-admitted GPP review state.

The visual authority must not be interpreted as authorization to reparent native workflow controls into the dossier.

## 8. Implementation boundary and remaining work unit

This document authorizes **no implementation by itself**.

The next implementation work unit must implement and prove the selected method, including at minimum:

- a server-side condition/marker that activates duplicate native table suppression only for successfully emitted, structurally valid, read-only GPP Entry Detail review;
- scoped CSS that suppresses only the duplicate native `.entry-detail-view` read-only table and does not hide the native workflow/status/action box;
- preservation of Gravity Flow field visibility/privacy semantics for GPP semantic admission;
- removal/retirement of structural JavaScript composition as a requirement for duplicate-field elimination or workflow-box placement, while retaining only separately justified progressive enhancement if needed;
- safe fallback where the native field listing remains visible whenever structural/read-only admission is not proven;
- validation that slot-level `UNMAPPED` / stale / mapped-empty degradation does not reintroduce the duplicate native table;
- native Revert from Review Approval to the dedicated User Input correction step;
- User Input restricted to the Owner-approved editable field set;
- explicit Review Approved / Rejected destinations that cannot accidentally enter correction;
- configuration and verification of the already-selected native User Input explicit Next Step back to Review Approval;
- scoped visual coordination of the native workflow box using admitted Entry Detail visual tokens;
- regression proof for Print, Timeline, host actions, authorization and non-GPP/native fallback behavior.

The return-route mechanism itself is not an implementation discovery item; only its concrete workflow configuration and runtime verification remain.

Until that work is completed, implementation/validation/migration/production acceptance remain **NOT_PROVEN**.

## 9. Non-goals

This decision does not authorize:

- a parallel workflow system;
- custom Approval/Reject/Revert semantics;
- a custom Request Edit endpoint;
- custom field persistence;
- duplicate data stores;
- reconstruction of native Gravity Flow controls;
- changes to Print architecture;
- rewriting historical evidence;
- changing Gravity Flow field visibility rules merely to remove duplicate presentation;
- JavaScript structural recomposition as a required path for duplicate suppression;
- a generic change to all future GPP surfaces without separate admission.
