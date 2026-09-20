# Entry Detail Full Width Visual Variant V1

## Status

Implemented and merged by PR #49 (`Add reversible Full Width Entry Detail visual variant`). Exact qualified PR Head: `0879d71646c140b2b0b26d00bcad1b5fc749af2b`. Merge commit/current integrated main at the synchronization checkpoint: `272c07f781f8afc9f1c416a935aef67cf200a9b8`.

Exact-head repository/pinned-runtime qualification passed. Final Owner-site Full Width visual acceptance remains a separate evidence gate and is still `NOT_PROVEN`.

## Purpose

`gravity_flow.entry_detail` has two Owner-selectable presentation identities:

- **Current / Safe** — the merged PR47 Entry Detail presentation, preserved as the stable rollback design.
- **Full Width** — an optional presentation-only variant that uses the available page canvas more fully and visually converges on the Owner-approved Full Width mockup.

Exactly one Entry Detail visual identity is active at a time.

## Selection authority

Selection remains owned by the existing `VisualPackageLifecycle`. The settings selector submits a transient compare-and-set activation command and is discarded after save; it is not a second persisted visual-state store.

The Current / Safe identity remains the Entry Detail profile from the shipped Operations package. Full Width is represented by a distinct Entry-Detail-only schema-1.1 visual package/profile. The package contract remains one profile per selected surface.

Switching variants must not change Inbox activation, Print activation, EnvironmentBindingSet state, workflow configuration, semantic mappings, authorization, assignment or Gravity Flow actions.

## Runtime composition boundary

Full Width page composition remains CSS-only. It uses the authentic Gravity Flow 3.1.0 Entry Detail structure where these native regions are direct siblings under `#post-body`:

- `#post-body-content` — main Entry Detail/GPP dossier region;
- `#postbox-container-1` — native workflow/status/action region;
- `#postbox-container-2` — native Timeline region.

This permits a normal-flow CSS Grid desktop composition without DOM reparenting, structural JavaScript, cloned controls, absolute/fixed positioning, transform relocation, large negative margins or `display: contents`.

On narrow viewports the same native source order collapses to one column.

### Owner-approved workflow-panel presentation-markup exception

The Owner has approved one narrow exception inside the Full Width admitted read-only Review workflow/action panel. GPP may render a small amount of server-side presentation markup through the native Gravity Flow Approval render seam for:

- the Owner-facing panel heading and static guidance copy;
- a current-stage presentation section that re-presents only authentic values already available on the current native Gravity Flow step/assignee context;
- a static informational footer clarifying that workflow operations remain Gravity Flow-owned.

The exception does **not** authorize workflow behavior. It must not add or clone workflow controls, persist workflow data, issue network requests, perform client-side state management, add JavaScript, alter mappings, alter workflow configuration, change authorization, or change action/transition ownership. Missing host facts are omitted rather than inferred from rendered strings or replaced with synthetic placeholders.

The native Gravity Flow Note textarea and native Approval/Reject/Revert controls remain the original host controls. A Revert control is styled only if Gravity Flow itself emits one.

## Native ownership

Gravity Flow remains authoritative for workflow status, assignment, Approval/Reject/Revert actions, notes, nonces, transitions, current-assignee behavior, Timeline data and Timeline order.

GPP styles existing native nodes, the existing server-rendered GPP dossier/Print utility, and the bounded presentation markup described above. The duplicate native read-only field listing and redundant native Print control retain the existing PR44/PR47 suppression contract.

## Timeline limitation

Gravity Flow 3.1.0 exposes stable per-event wrappers such as `.gravityflow-note` and native avatar/title/meta/body elements. Full Width may therefore present each existing event wrapper as a neutral card and add a decorative spine/marker with CSS pseudo-elements.

No proven machine-readable event outcome state is currently available for semantic success/error/warning tinting. Full Width must not classify events from visible Persian or English text. Event cards therefore remain neutral unless future authoritative host state is separately proven.

A Timeline count badge must not be fabricated when the host DOM exposes no truthful count.

## Workflow-panel content limitation

The bounded server-rendered presentation layer may use only authentic values already available from the current native Gravity Flow server context. Current step name, assignee display name, and a genuine due timestamp are eligible when their host APIs provide a value. Missing facts are omitted.

Static Owner-approved explanatory copy is presentation guidance, not workflow state. It must be real HTML text rather than CSS-generated content.

No due date, remaining-days badge, assignee, status or other workflow fact may be manufactured from visible text or from a parallel data source.

## GeneratePress boundary

GeneratePress supplies the page canvas. Full Width does not globally rewrite `.grid-container`, `.site-content`, `.inside-article`, `.site-main` or other theme-wide containers. Full Width selectors are rooted in the admitted Entry Detail Review and exact Full Width profile identity.

## Rollback

The Owner can select **Current / Safe** from the same GPP settings surface. The transition uses lifecycle compare-and-set semantics so a stale settings page cannot silently overwrite a newer Entry Detail activation.

Exact-head WU18 browser qualification proved the lifecycle-backed Full Width selection and rollback path in the pinned runtime, including desktop/narrow behavior and restoration of Current / Safe. That evidence does not substitute for Owner-site acceptance on the real GeneratePress page.

## Qualification recorded for PR49

Exact Head `0879d71646c140b2b0b26d00bcad1b5fc749af2b` passed the repository validation set exercised for this change, including Repository CI, WU18 Entry Detail Runtime, WU19 Print/Core Spine/C-D-E-F qualification, WU21 Reproducible Evidence Lab, Print Utility UX regression, GF/PersianGravity runtime, and Release dry-run + exact ZIP smoke. Merge-result/push validation also passed after merge.

These results prove the exercised repository/pinned-runtime behavior. They do not prove target-production visual equivalence.

## Acceptance boundary

Final Owner-site Full Width visual acceptance remains `NOT_PROVEN` until the merged implementation is exercised in the real target environment. Acceptance should confirm the selected Full Width design, responsive behavior, native workflow box, Timeline, Print utility, and Current / Safe rollback while preserving the host-ownership boundaries above.
