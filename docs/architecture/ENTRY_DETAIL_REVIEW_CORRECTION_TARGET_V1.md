# Entry Detail Review / Correction Target Architecture V1

```yaml
document_id: GPP-ENTRY-DETAIL-REVIEW-CORRECTION-TARGET-V1
status: OWNER_APPROVED_TARGET__NOT_IMPLEMENTED
surface: gravity_flow.entry_detail
scope: SRWF operations Entry Detail presentation architecture
supersedes_forward_target:
  - transactional client-side recomposition of native Gravity Flow read-only/editor/status/timeline regions into the GPP dossier for visual composition
preserves:
  - historical evidence and prior PR records
  - generic Mother Architecture ownership boundaries
  - existing Print architecture
```

## 1. Purpose and authority

This document records closed Owner decisions for the **forward target architecture** of the GPP Gravity Flow Entry Detail surface.

It is intentionally narrower than `MOTHER_ARCHITECTURE.md` and does not change the generic product boundary. It governs how the SRWF operations Entry Detail review/correction experience should evolve.

This is a target architecture record, not implementation evidence.

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
Save
  ↓
Return to review workflow
```

This separation prevents the normal state from showing an editable/native copy and a GPP read-only copy of the same data at the same time.

### OD-ENTRY-07 — Prefer native Gravity Flow User Input for correction

The preferred host-native correction mechanism is a dedicated Gravity Flow **User Input Step**, subject to later verification that the supported host capabilities satisfy the required workflow.

Only explicitly permitted fields should be editable in that step.

Gravity Flow / Gravity Forms continue to own editable-field behavior, validation, conditional logic, submission, permissions and workflow transition.

No User Input configuration is admitted as implemented by this record.

### OD-ENTRY-08 — Prefer native Request Edit / Revert semantics

Where supported safely by the actual Gravity Flow version/capabilities, prefer Gravity Flow's native **Revert / workflow transition** semantics as the basis of the future Request Edit interaction rather than introducing a custom parallel action.

A later implementation may adapt the user-facing label, for example `درخواست ویرایش`, without changing host ownership.

The exact transition configuration and placement remain implementation details requiring runtime verification.

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

## 3. Target correction mental model

```text
Review
   ↓
Request Edit / Revert
   ↓
Native Gravity Flow User Input Step
   ↓
Only allowed fields are editable
   ↓
Workflow returns to review as configured
```

The exact User Input step, allowed-field set, Revert/transition semantics and return path must be validated in the later implementation work unit. This architecture record does not assert that a particular configuration has already been proven.

## 4. Supersession boundary

This decision supersedes the **forward target direction** in which native Gravity Flow read-only/editor/status/timeline regions were structurally recomposed into the GPP dossier merely to realize the approved visual composition.

It does **not** rewrite historical evidence or claim that previous implementation/qualification never existed.

Historical PRs, runtime qualification and evidence remain valid descriptions of the code/runtime they actually tested.

Where another current forward-looking Entry Detail document conflicts on structural composition, this architecture record controls that narrow question.

## 5. Relationship to visual authority

The admitted Entry Detail vNext visual authority remains the source for dossier visual language and exact tokens where already admitted.

This architecture changes **ownership and structural composition direction**, not the visual language itself:

- GPP dossier keeps the admitted read-only hierarchy;
- native workflow box remains native and separate;
- GPP may visually coordinate that box with scoped CSS using admitted tokens;
- duplicate native read-only dossier values are forbidden.

The visual authority must not be interpreted as authorization to reparent native workflow controls into the dossier.

## 6. Implementation boundary

This document authorizes **no implementation by itself**.

A later implementation work unit must prove the host-native seams needed to achieve the target, including at minimum:

- how the duplicate native read-only field listing can be suppressed/avoided without taking over Gravity Forms data behavior;
- how the native Gravity Flow workflow/status/action box remains available and authoritative;
- whether Gravity Flow User Input and Revert/transition semantics support the intended correction flow on the supported host versions;
- how scoped layout/CSS can coordinate the dossier and native workflow box without brittle positioning;
- what residual JavaScript, if any, remains justified as progressive enhancement only.

Until that work is completed, implementation/validation/migration/production acceptance remain **NOT_PROVEN**.

## 7. Non-goals

This decision does not authorize:

- a parallel workflow system;
- custom Approval/Reject/Revert semantics;
- custom field persistence;
- duplicate data stores;
- reconstruction of native Gravity Flow controls;
- changes to Print architecture;
- rewriting historical evidence;
- a generic change to all future GPP surfaces without separate admission.
