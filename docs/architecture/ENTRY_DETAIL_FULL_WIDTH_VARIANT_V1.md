# Entry Detail Full Width Visual Variant V1

## Status

Owner-authorized implementation target. Browser/runtime qualification and Owner-site visual acceptance remain separate evidence gates.

## Purpose

`gravity_flow.entry_detail` has two Owner-selectable presentation identities:

- **Current / Safe** — the merged PR47 Entry Detail presentation, preserved as the stable rollback design.
- **Full Width** — an optional presentation-only variant that uses the available page canvas more fully and visually converges on the Owner-approved Full Width mockup.

Exactly one Entry Detail visual identity is active at a time.

## Selection authority

Selection remains owned by the existing `VisualPackageLifecycle`. The settings selector submits a transient compare-and-set activation command and is discarded after save; it is not a second persisted visual-state store.

The Current / Safe identity remains the Entry Detail profile from the shipped Operations package. Full Width is represented by a distinct Entry-Detail-only schema-1.1 visual package/profile. The package contract remains one profile per selected surface.

Switching variants must not change Inbox activation, Print activation, EnvironmentBindingSet state, workflow configuration, semantic mappings, authorization, assignment or Gravity Flow actions.

## CSS-only runtime boundary

Full Width runtime composition is CSS-only. It uses the authentic Gravity Flow 3.1.0 Entry Detail structure where these native regions are direct siblings under `#post-body`:

- `#post-body-content` — main Entry Detail/GPP dossier region;
- `#postbox-container-1` — native workflow/status/action region;
- `#postbox-container-2` — native Timeline region.

This permits a normal-flow CSS Grid desktop composition without DOM reparenting, structural JavaScript, cloned controls, absolute/fixed positioning, transform relocation, large negative margins or `display: contents`.

On narrow viewports the same native source order collapses to one column.

## Native ownership

Gravity Flow remains authoritative for workflow status, assignment, Approval/Reject/Revert actions, notes, nonces, transitions, current-assignee behavior, Timeline data and Timeline order.

GPP styles only existing native nodes and the existing server-rendered GPP dossier/Print utility. The duplicate native read-only field listing and redundant native Print control retain the existing PR44/PR47 suppression contract.

## Timeline limitation

Gravity Flow 3.1.0 exposes stable per-event wrappers such as `.gravityflow-note` and native avatar/title/meta/body elements. Full Width may therefore present each existing event wrapper as a neutral card and add a decorative spine/marker with CSS pseudo-elements.

No proven machine-readable event outcome state is currently available for semantic success/error/warning tinting. Full Width must not classify events from visible Persian or English text. Event cards therefore remain neutral unless future authoritative host state is separately proven.

A Timeline count badge must not be fabricated when the host DOM exposes no truthful count.

## Workflow-panel content limitation

Only authentic currently rendered native content may be styled. Current step/status, assignee, note textarea and available native actions are eligible when present. Instruction content remains in its authentic native location if the host renders it there.

A due date or other mockup-only workflow fact must not be manufactured when it is absent from the current DOM/API boundary.

## GeneratePress boundary

GeneratePress supplies the page canvas. Full Width does not globally rewrite `.grid-container`, `.site-content`, `.inside-article`, `.site-main` or other theme-wide containers. Full Width selectors are rooted in the admitted Entry Detail Review and exact Full Width profile identity.

## Rollback

The Owner can select **Current / Safe** from the same GPP settings surface. The transition uses lifecycle compare-and-set semantics so a stale settings page cannot silently overwrite a newer Entry Detail activation.

Real browser qualification must prove that rollback restores the exact Current / Safe activation and that its desktop, narrow, Timeline, workflow, Print and no-JS presentation remain equivalent before this implementation is treated as release-ready.

## Acceptance boundary

CI/browser evidence may prove architecture, switching, responsive behavior, no-JS behavior, native ownership and visual-contract facts. It does not by itself prove final Owner-site visual acceptance. That remains `NOT_PROVEN` until the Owner evaluates the installable exact-Head artifact in the real target environment.
