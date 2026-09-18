# Entry Detail Mapping Workflow V1 — Owner-Test Handoff

This document is a non-production handoff for the Entry Detail mapping workflow implemented on the shared `EnvironmentBindingSet` lifecycle.

## Release boundary

The installable Owner-test artifact for this change must be built only by the repository's existing release dry-run path from one exact PR Head. This handoff does not authorize a tag, GitHub Release, production publication, merge, or deployment.

The release dry-run uses its normal synthetic candidate overlay and exact-ZIP validation/smoke. Its result is qualification evidence for the repository artifact shape only; it does not establish the authentic Owner-site Entry Detail outcome.

## Owner target exercise

After a qualified exact-head ZIP is available, the Owner should:

1. install that exact ZIP on the target;
2. open the GPP Mapping & Binding Health settings surface for the active Form 11 operations context;
3. review every Entry Detail field-backed semantic shown by the active profile workflow;
4. preserve valid existing mappings and explicitly select actual Form 11 fields/inputs for unresolved or stale mappings;
5. save the mapping set once;
6. download a fresh sanitized GPP Support Bundle;
7. open one real authorized Gravity Flow Approval Entry Detail through the normal host route;
8. capture the first remaining readiness blocker, if any, without forcing later stages to pass.

Entry Detail-only optional visibility is not part of the artifact in this handoff because the current repository has no admitted active surface-scoped persistence seam for that preference.

`ENTRY_DETAIL_MAPPING_TARGET_ACCEPTANCE` and `ENTRY_DETAIL_TARGET_PRESENTATION` remain `NOT_PROVEN` until the exact artifact is exercised on the authentic Owner target.
