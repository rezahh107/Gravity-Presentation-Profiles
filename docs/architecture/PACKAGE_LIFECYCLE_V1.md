# Package Lifecycle V1

```yaml
document_id: GPP-PACKAGE-LIFECYCLE-V1
origin_work_unit: WU10
status: DESTINATION_SEMANTICS_RETAINED__PRODUCTION_IMPLEMENTATION_DEFERRED
production_runtime: NOT_IMPLEMENTED
production_source: NOT_PRESENT
```

## Current implementation status

This document preserves the lifecycle requirements established by WU10. The earlier lifecycle PHP classes, WordPress state-store implementation, and implementation-only tests were prototypes with no production path from the plugin entrypoint; they were removed by the production-reachability cleanup.

No current production UI or runtime imports, persists, activates, rolls back, removes, or resolves these artifacts. A future implementation must be introduced only when an authorized production consumer exists. The requirements below remain destination constraints, not claims about current runtime behavior.

## Artifact-class separation

Visual-profile packages and environment binding sets must use different stores, registries, operations and audit records.

A future WordPress-backed implementation may use class-specific option state, but visual and binding state must remain independently committed. Visual activation is keyed only by the admitted surface and records exactly `package_id`, `package_version` and `profile_id`. Binding activation is keyed by canonical admitted environment/context and records exactly `binding_set_id` and `binding_set_version`. Neither registry may contain a selector for the other artifact class.

Any state-store implementation must compute complete next state before commit, serialize competing writers for the same logical store, fail closed on nested/re-entrant writes, and leave prior state authoritative after a failed commit. Coordination must not create a second persistent state authority.

## Import, validation and immutable versions

Future settings/lifecycle integration must expose separate validation/import/export paths for visual and binding artifacts. Contract validation occurs before persistence. Import never activates an artifact.

Installed records are immutable by `(identity, version)`:

- same identity + version + canonical hash: idempotent;
- same identity + version + different canonical hash: rejected;
- a new valid version: installed as a new inactive candidate.

Records retain canonical artifact data, canonical SHA-256, and provenance. Export re-validates and emits the canonical representation.

## Activation, rollback and removal

Visual activation and rollback accept only `surface`, `package_id`, `package_version`, and `profile_id`. Environment/form/user/role/binding targeting keys are rejected. The selected profile must exist for the selected surface in the installed package.

Binding activation and rollback accept only `context`, `binding_set_id`, and `binding_set_version`. The request context must exactly match the context admitted inside the installed binding artifact. Package/profile keys are rejected.

Removal is blocked while an exact installed version is active. Deactivation removes only the requested registry entry and never substitutes another version. Rollback is an explicit activation of an already installed version and uses the same atomic commit path.

## Binding evidence gate

Structural binding validity remains separate from source/runtime evidence. Before a binding set containing `PROVEN` bindings can activate, every `PROVEN` binding requires independently admitted source/adapter evidence. An empty evidence catalog therefore fails closed for any `PROVEN` binding.

`UNBOUND`, `NOT_PROVEN`, and `NOT_APPLICABLE` remain unchanged and carry no guessed source reference. The lifecycle layer must not infer availability, editability, authorization, action permission, or host state.

## Reserved Extension Seam

The reserved extension seam is immutable artifact content but remains inert. Effective visual resolution reads only the activated surface profile. Seam version changes cannot create form/user/role visual overrides or otherwise affect V1 profile selection.

## Audit requirements

Each artifact class may keep a bounded lifecycle audit. Records contain only lifecycle event/outcome, artifact identity/version/hash, surface or a canonical context fingerprint, and sequencing metadata. Raw artifacts, source references, DOM selectors, executable payloads and host authorization/session state are not copied into audit records.

Invalid JSON or contract-invalid artifacts do not write lifecycle state. Validation may return class-specific non-persistent evidence for future settings/UI reporting.

## Deferred boundary

The current cleanup does not implement a replacement lifecycle, package-management UI, WU17 Inbox, WU18 Entry Detail, WU19 Print/Dossier, or release machinery. Reintroducing lifecycle code before a real production consumer exists would repeat the reachability defect this cleanup is intended to prevent.
