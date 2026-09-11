# Package Lifecycle V1

WU10 adds lifecycle state around the WU09 portable artifact contracts without changing those contracts.

## Artifact-class separation

Visual-profile packages and environment binding sets use different stores, registries, operations and audit records.

- Visual state is persisted in the WordPress option `gpp_visual_package_lifecycle_v1`.
- Binding state is persisted in the WordPress option `gpp_binding_set_lifecycle_v1`.
- Visual activation is keyed only by the admitted surface and records exactly `package_id`, `package_version` and `profile_id`.
- Binding activation is keyed by the canonical admitted environment/context and records exactly `binding_set_id` and `binding_set_version`.
- Neither registry contains a selector for the other artifact class.

Each class state is replaced as one option value. Lifecycle code computes the complete next state before `StateStore::commit()`. The WordPress store serializes class-specific writers with a deterministic connection-scoped database advisory lock derived from the current database/site/store identity. It acquires that lock non-blockingly through the existing `$wpdb` connection, holds it across revision read, `update_option()` and `get_option()` readback, and releases it in `finally`; database-session termination also recovers an orphaned lock. No persistent coordination option or parallel state authority is created. A failed commit leaves the prior state authoritative. The stores are intentionally separate so a visual operation cannot partially commit binding state, or vice versa.

## Import, validation and immutable versions

`SettingsLifecycleWorkflow` exposes separate JSON validation/import/export entry points for visual and binding artifacts. JSON decoding and the WU09 contract validator run before lifecycle persistence. Import never activates an artifact.

Installed records are immutable by `(identity, version)`:

- same identity + version + canonical hash: idempotent;
- same identity + version + different canonical hash: rejected;
- a new valid version: installed as a new inactive candidate.

Records retain canonical artifact data, canonical SHA-256, and provenance. Export re-validates and emits the WU09 canonical JSON representation.

## Activation, rollback and removal

Visual activation and rollback accept only `surface`, `package_id`, `package_version`, and `profile_id`. Environment/form/user/role/binding targeting keys are rejected. The selected profile must exist for the selected surface in the installed package.

Binding activation and rollback accept only `context`, `binding_set_id`, and `binding_set_version`. The request context must exactly match the context admitted inside the installed binding artifact. Package/profile keys are rejected.

Removal is blocked while an exact installed version is active. Deactivation removes only the requested registry entry and never substitutes another version. Rollback is an explicit activation of an already installed version and uses the same atomic state-commit path.

## Binding evidence gate

WU09 structural `BINDING_VALID` remains separate from source/runtime evidence. Before a binding set containing `PROVEN` bindings can activate, `BindingEvidenceGate` must admit source/adapter evidence for every `PROVEN` binding. `EvidenceReferenceGate` is a deterministic implementation backed by externally admitted evidence references. An empty catalog therefore fails closed for any `PROVEN` binding.

`UNBOUND`, `NOT_PROVEN`, and `NOT_APPLICABLE` remain unchanged and carry no guessed source reference. The lifecycle layer does not infer availability, editability, authorization, action permission, or host state.

## Reserved Extension Seam

The WU09 `reserved_extension_seam` is stored and exported as immutable artifact content, but V1 effective visual resolution reads only the activated surface profile. Seam version changes therefore cannot create form/user/role visual overrides or otherwise affect V1 profile selection.

## Audit data

Each class keeps a bounded lifecycle audit (maximum 200 records). Records contain only lifecycle event/outcome, artifact identity/version/hash, surface or a canonical context fingerprint, and sequencing metadata. Raw artifacts, source references, DOM selectors, executable payloads and host authorization/session state are not copied into audit records.

Invalid JSON or contract-invalid artifacts do not write lifecycle state. Validation methods return a class-specific non-persistent validation evidence record for settings/UI reporting.
