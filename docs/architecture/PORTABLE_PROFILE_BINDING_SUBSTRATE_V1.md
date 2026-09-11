# Portable Visual-Profile / Semantic-Binding Substrate V1

```yaml
document_id: GPP-PORTABLE-PROFILE-BINDING-SUBSTRATE-V1
work_unit_id: WU-GPP-PROFILE-PACKAGE-09
run_id: RUN-GPP-PROFILE-PACKAGE-09-001
architecture: SHARED_DEFAULTS_PER_SURFACE__SEPARATE_ENVIRONMENT_BINDINGS
runtime_activation: NOT_IMPLEMENTED
persistence_import_lifecycle: OUT_OF_SCOPE_WU10
```

## Boundary

V1 has two independent declarative artifact classes:

1. `gpp.visual_profile_package` — portable presentation identity, shared design tokens, stable semantic slots, and exactly one shared default profile for each admitted operational surface.
2. `gpp.environment_binding_set` — environment/context-specific semantic-source bindings and runtime evidence claims.

Gravity Forms and Gravity Flow retain ownership of data, workflow, assignment, authorization, actions, availability and editability. These contracts do not create a queue, workflow, permission model, target adapter, persistence/import lifecycle, or runtime Inbox/Entry/Print implementation.

## Visual profile package V1

`VisualProfilePackage` is strict and rejects unknown keys. The root keys are exactly:

```text
artifact_type
schema_version
package_id
package_version
provenance
design_tokens
semantic_slots
surface_profiles
reserved_extension_seam
```

The admitted surfaces are exactly:

```text
gravity_flow.inbox
gravity_flow.entry_detail
print.dossier
```

Every package contains exactly one `surface_profiles` record for every admitted surface. `profile_id` is portable. Form, field, step, page, route, user, role and binding-set identity cannot participate in profile identity or profile resolution.

Design tokens are typed scalar maps only. V1 admits hex colors, bounded pixel values, bounded numeric line heights and integer font weights. Arbitrary CSS, selectors, callbacks, HTML/JS/PHP and remote-code payloads are not schema fields.

A semantic slot has:

```yaml
semantic_slot_key: stable.dotted.key
meaning: generic presentation meaning
surface_usage:
  - surface: gravity_flow.inbox
    required: true|false
```

`required` means the shared surface profile must declare that slot. It does not assert that a concrete target source, permission or runtime capability exists.

## Environment binding set V1

`EnvironmentBindingSet` is a separate artifact with exact root keys:

```text
artifact_type
schema_version
binding_set_id
binding_set_version
context
provenance
bindings
runtime_claims
```

Binding context contains host-reported installation/form identity, optional entry specificity, and admitted surfaces. Concrete host identifiers are legal only in this binding artifact and in the typed `source_ref` contract.

Binding state is exactly:

```text
PROVEN
UNBOUND
NOT_PROVEN
NOT_APPLICABLE
```

`PROVEN` requires both a typed source reference and non-empty evidence provenance. `UNBOUND`, `NOT_PROVEN` and `NOT_APPLICABLE` require `source_ref: null`; they cannot carry guessed identifiers.

Admitted V1 source-reference types are bounded host-owned references:

```text
gravity_forms.field
gravity_forms.entry_meta
gravity_flow.state
gravity_flow.region
gravity_flow.action
```

Each type has an exact key shape and bounded identifier/value rules. Raw selectors, hook names, callback names, arbitrary API endpoints, executable payloads and unknown source types are rejected.

`runtime_claims` separately records evidence for `host_seam`, `availability`, `editability`, `authorization`, `action_permission` or `print_mapping`. Structural `BINDING_VALID` therefore never promotes these runtime claims. A runtime claim with evidence state `PROVEN` requires its own evidence refs.

## Independent resolvers

`VisualProfileResolver` accepts an admitted surface and returns the one shared default profile. Supplying environment context is rejected.

`SemanticBindingResolver` accepts host-reported `installation_id`, `form_id`, `entry_id`, `surface` plus a stable slot key. It selects the matching binding set, preferring an exact entry-scoped set over a form-wide set. Missing, ambiguous, unknown, `UNBOUND` and `NOT_PROVEN` cases fail closed for that slot only.

The binding resolver never receives or returns `profile_id`. A form or binding set therefore cannot select or override the visual profile.

## Multi-form Inbox invariant

For a multi-form Inbox, each entry may resolve through a different binding set while every row continues to use the single shared `gravity_flow.inbox` profile. A missing School or Due mapping remains local to that binding context; it cannot fall back to another form, another slot, a guessed ID or another profile.

The sanitized WU09 fixtures under `tests/fixtures/` exercise two distinct mock forms and one shared Inbox profile. They contain no production SRWF IDs or PII.

## Reserved Extension Seam

V1 admits only:

```yaml
reserved_extension_seam:
  version: 1.0.0
  state: INERT
```

No payload, targeting, preference, permission, UI or activation field is accepted. The seam cannot participate in profile or binding resolution.

## Canonical normalization and hashes

Both artifact classes validate before canonicalization. Canonical JSON:

- recursively sorts object keys lexicographically;
- preserves list/array order exactly;
- preserves scalar types and does no coercion;
- uses UTF-8 JSON without escaped Unicode/slashes and preserves zero fractions.

Content identity is SHA-256 of that canonical JSON. Objects that differ only in associative key order hash identically. Ordered-array changes or semantic scalar/type changes do not.

## Validation states

`VisualProfilePackage::validationReport()` returns structural `PACKAGE_VALID` and explicitly leaves target runtime evidence `NOT_PROVEN`.

`EnvironmentBindingSet::validationReport()` returns structural `BINDING_VALID` plus only the binding sources and runtime claims that have explicit `PROVEN` state with required evidence provenance.

Schema validity never proves a target selector/hook/seam, a concrete source, runtime availability/editability, authorization, action permission or print mapping.

## WU09 non-goals

This substrate does not persist, import, activate, roll back or migrate artifacts. It does not discover target SRWF identifiers, add host-specific adapters, style the Gravity Flow Inbox/Entry Detail, render A4 output, alter closed Registration history, or activate the Reserved Extension Seam.
