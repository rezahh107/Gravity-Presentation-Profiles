# Entry Detail vNext Authority Migration V1

## Scope

This record applies **only** to `gravity_flow.entry_detail` in the SRWF operations presentation package. It does not replace, reinterpret, or migrate the established Inbox A/B authority or Print E/F authority.

The Owner explicitly superseded the Entry Detail portions of the earlier combined visual reference with the exact vNext HTML identified below. The older artifact remains repository history and remains available where unrelated surface qualification still depends on it.

Structural composition and review/correction ownership are now governed by `docs/architecture/ENTRY_DETAIL_REVIEW_CORRECTION_TARGET_V1.md`. This visual record remains authoritative for admitted Entry Detail visual language and semantic grouping, but it no longer authorizes structural reparenting of the native Gravity Flow workflow box into the GPP dossier.

## Authority supersession

| State | Artifact | Exact identity | Scope |
| --- | --- | --- | --- |
| Superseded for Entry Detail | `PersianGravity-Visual-Reference-Final.html` | 115728 bytes; SHA-256 `666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81` | Historical combined reference; retained for unrelated established authority |
| Current Entry Detail authority | `PersianGravity-Visual-Reference-Final-vNext.html` | 119765 bytes; SHA-256 `1934967b81d82ee77c60ffd547dde6fa7c8a310dbde94556686bd3d515d62a69`; Drive file ID `1gBaTnWPIbeyjj89VvWzJvHqRmsHYxhC8` | `gravity_flow.entry_detail` only |
| Unchanged Print authority | `PersianGravity-Final-Print-Sample.pdf` | 321990 bytes; SHA-256 `34d9b4e137667ca103d5c6e7752f7148f0c92e36f0f1d182d7d87a890c55fec5` | Print E/F |

Repository qualification intentionally keeps the legacy combined HTML identity and the vNext Entry Detail identity as separate locks. This is a surface-scoped migration, not a global hash replacement.

## Current Entry Detail structural contract

The exact approved vNext HTML defines the continuous dossier order used by production qualification:

1. compact dossier header;
2. current task;
3. education;
4. candidate personal details;
5. contact;
6. school;
7. documents;
8. registration / financial;
9. secondary history.

Stable production identifiers use `data-gpp-entry-region` rather than visible Persian headings as the structural oracle.

The current semantic grouping is:

- header summary: student photo/avatar, full name, national ID, grade/group, school;
- education: `education.level`, `education.grade_group`;
- candidate details: `student.first_name`, `student.last_name`, `student.father_name`, `student.national_id`, `student.birth_date_jalali`, `student.gender`;
- contact: `student.mobile`, `student.home_phone`, `student.father_mobile`, `student.mother_mobile`;
- school: admitted school semantics represented by `school.name` in the current profile/catalogue;
- documents: existing authenticated `documents.report_card` behavior;
- registration / financial: only admitted vNext/catalogue semantics resolved by the existing semantic machinery;
- history: the original Gravity Flow timeline, never a GPP reconstruction.

Missing, mapped-empty, stale, unsupported, unavailable and host-hidden states continue to use the PR40 semantic/degradation/visibility rules. This authority migration does not create a second mapping or value-resolution system.

## Gravity Flow ownership

The vNext presentation remains presentation-only. Gravity Flow continues to own authorization, assignment, step state, editability, Approval/Reject/Revert availability, action mutation, workflow notes/comments, operational status, history and navigation.

**CURRENT implementation:** repository code may still transactionally recompose original native Gravity Flow regions/nodes in the browser. That remains current implementation reality and historical qualification evidence until a later implementation work unit changes it.

**OWNER-APPROVED TARGET:** the GPP dossier is a primarily read-only semantic projection, while the native Gravity Flow workflow/status/action box remains a separate host-rendered operational region. Native workflow controls are never cloned or recreated and are no longer a target for structural reparenting into the dossier merely for visual composition. Normal review and correction/editing are separate concerns; the preferred correction direction is native Gravity Flow User Input plus native Revert/transition semantics where later host verification proves the required workflow.

The detailed target and supersession boundary are canonical in `docs/architecture/ENTRY_DETAIL_REVIEW_CORRECTION_TARGET_V1.md`.

## Responsive contract

The vNext authority preserves semantic parity between desktop and narrow/mobile views. Personal and financial grids converge from three columns to two and then one; education/contact converge from two columns to one; school remains a single semantic column. Mobile does not remove dossier data.

## Historical relationship

`SRWF_GRAVITY_FLOW_A4_VISUAL_BASELINE_CONTRACT_v1.0.0.md` and `SRWF_GRAVITY_FLOW_DATA_ASSET_BINDING_MATRIX_v1.0.0.md` remain historical authority/evidence records for their admitted runs. Where those documents describe the older combined HTML as the Entry Detail visual baseline, this Owner-approved migration is the later, surface-scoped supersession. Their Inbox/Print authority and semantic-binding history are not rewritten by this record.

Likewise, historical PR/runtime evidence that qualified transactional client-side composition remains preserved as evidence of the implementation it actually tested. It is not retroactively rewritten as the new target architecture.
