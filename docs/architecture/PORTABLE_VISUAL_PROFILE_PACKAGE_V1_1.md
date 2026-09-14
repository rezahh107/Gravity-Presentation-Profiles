# Portable Visual Profile Package Schema 1.1

```yaml
document_id: GPP-PORTABLE-VISUAL-PROFILE-PACKAGE-V1-1
artifact_type: gpp.visual_profile_package
schema_version: 1.1.0
compatibility: ADDITIVE__SCHEMA_1_0_0_FROZEN
runtime_scope_this_change: CONTRACT_AND_LIFECYCLE_ONLY
```

## Purpose

Schema `1.1.0` evolves the portable visual-profile contract without changing the accepted meaning of schema `1.0.0`.

Schema `1.0.0` remains valid exactly as before: it admits `gravity_flow.inbox`, `gravity_flow.entry_detail`, and `print.dossier` and requires one shared default profile for all three. Existing installed artifacts, content hashes, lifecycle state, activation records, and the WU17 Inbox consumer are not migrated or reinterpreted.

Schema `1.1.0` closes two contract gaps:

1. a package can explicitly select the operational surface or subset of surfaces it actually defines instead of inventing profiles for unrelated surfaces;
2. a package can describe bounded presentation preferences for the generic Gravity Forms form surface without carrying arbitrary CSS, selectors, PHP, HTML, or JavaScript.

The lifecycle state format is unchanged. The existing lifecycle can store schema `1.0.0` and `1.1.0` package versions together because schema identity remains inside the immutable stored artifact.

## Surfaces and selected-surface contract

Schema `1.1.0` admits these generic operational surfaces in canonical order:

```text
gravity_forms.form
gravity_flow.entry_detail
gravity_flow.inbox
print.dossier
```

A `1.1.0` package adds the required root field:

```yaml
selected_surfaces:
  - gravity_forms.form
```

`selected_surfaces` must be non-empty, contain only admitted surfaces, contain no duplicates, and use canonical surface order. `surface_profiles` then contains exactly one shared default profile for each selected surface and no implicit profile for an unselected surface.

This preserves the existing **Shared Default per operational surface** model. It does not add per-form, per-user, per-role, or per-entry visual selection.

## Identity firewall

Portable visual identity remains independent of a concrete environment.

The visual package has no field for Form ID, Field ID, Step ID, Page ID, Route ID, User ID, Role ID, or binding-set identity. `package_id` and `profile_id` continue to reject those identities when encoded as identifier segments.

`gpp.environment_binding_set` remains a separate artifact. This change does not evolve its schema and does not let it receive or return a visual `profile_id`. A binding set cannot select or override a visual profile. The binding resolver now obtains its admitted surface set from `EnvironmentBindingSet` itself, so expanding the visual package surface vocabulary cannot silently expand binding semantics.

The new `gravity_forms.form` visual surface does not require a binding artifact merely to describe form presentation. Schema `1.1.0` therefore permits an empty `semantic_slots` list. A future need for Gravity Forms semantic-source binding must evolve the binding contract separately rather than smuggling environment identity into this visual package.

## Controlled declarative presentation vocabulary

Each `1.1.0` surface profile has these exact keys:

```text
surface
profile_id
token_refs
semantic_slots
presentation
```

`presentation` is a typed preference object. Its admitted blocks are bounded to:

```text
composition
typography
controls
labels
descriptions
sections
primary_action
validation
capabilities
```

Unknown blocks and unknown properties fail closed.

Presentation values are either an admitted enum or a reference to a typed `design_tokens` entry. Schema `1.1.0` retains the V1 scalar token families and additionally admits:

```text
sizes_px       # bounded integer physical presentation dimensions
font_families  # one safe family-name target; GPP does not load/bundle the font
```

A referenced token must exist and must also be declared in that surface profile's `token_refs`. Category mismatches fail validation.

The controlled vocabulary currently covers:

- composition direction, maximum inline size, inline padding, surface background/radius, and host-default versus single-column field layout;
- inherited font-family target;
- control background/text/border/focus/error/radius/minimum-height/font metrics;
- label color/required color/font metrics;
- description text color;
- section divider, heading and description presentation;
- primary-action normal/pressed/focus colors, minimum height and font metrics;
- validation error color.

There is no selector property, CSS declaration channel, raw style object, callback, hook, HTML fragment, script, remote URL, or executable payload field.

## Bounded host-adapter capabilities

Some admitted presentation rules need a runtime-proven host-specific projection even though the preference itself remains generic presentation data. Schema `1.1.0` therefore has a closed capability enum rather than arbitrary adapter names.

The only currently admitted capability values are:

```text
gravity_forms.orbital_control_metric_projection
persian_gravity.jalali_validation_message_after_control
```

They are admitted only for `gravity_forms.form` and reflect already-proven Registration runtime corrections:

- Gravity Forms Orbital consumes control/button size at local scopes, requiring projection of the same canonical size token to those authentic host scopes;
- the existing PersianGravity Jalali validation node requires the already-proven CSS-only visual ordering adapter while preserving host DOM, validation, ARIA, and persistence ownership.

Unknown capability names fail closed. GP Advanced Select and GP File Upload Pro capabilities are intentionally absent because their required runtime evidence has not been established.

## SRWF Registration representation proof

`profiles/srwf/registration/profile-package-v1.1.json` is the canonical declarative representation of the currently admitted Registration presentation. Tests validate this artifact directly rather than maintaining a second test-only copy.

It selects only `gravity_forms.form` and captures the current implementation-driving values, including:

```text
surface #FFFFFF
text #172033 / #475467 / #667085
primary #1D4ED8
primary pressed #1E40AF
error #B42318
success #18794E
divider #E4E7EC
control border #8690A1
mobile inline padding 16px
control radius 10px
surface radius 16px
control minimum height 52px
primary-action minimum height 56px
content maximum width 840px
label 15px / 600
control value 16px / 400
primary action 16px / 700
section heading 18px / 700
font-family target Vazirmatn
RTL composition
single-column field layout
```

The artifact also requests only the two proven bounded capabilities above.

It intentionally does **not** promote unresolved or unproven Registration values into the schema instance: page-background targeting, upload adapter/radius application, exact breakpoint, desktop short-field pairings, shadow, focus-ring geometry/alpha, GP Advanced Select behavior, GP File Upload Pro behavior, and other runtime-sensitive gaps remain outside the package instance until separately admitted.

This artifact is a declarative contract representation consumed by validation/lifecycle tests. This change does not replace the current Registration runtime CSS with a generic renderer; doing so would be a separate runtime-consumer change requiring its own host mapping and regression evidence.

## Compatibility and lifecycle behavior

`VisualProfilePackage` dispatches by explicit `schema_version`:

- `1.0.0` uses the frozen V1 validator and retains its historical all-three-surface requirement;
- `1.1.0` uses the new selected-surface and presentation validator;
- unknown schema versions fail closed.

Canonical JSON and SHA-256 content identity remain the same repository-wide mechanism. Object-key ordering is normalized; ordered lists and semantic values remain significant.

The existing `VisualPackageLifecycle` continues to provide:

- immutable identity/version install records;
- idempotent same-hash imports;
- identity/version conflict rejection for different content;
- inactive import by default;
- explicit per-surface activation and rollback;
- atomic state commits and fail-closed corruption handling;
- canonical export of the stored validated artifact.

No lifecycle database/state migration is introduced.

## Reserved Extension Seam

The Reserved Extension Seam remains exact and inert:

```yaml
reserved_extension_seam:
  version: 1.0.0
  state: INERT
```

It cannot contain targeting, preferences, executable payloads, permissions, or activation data.

## Explicit non-goals

This schema evolution does not implement:

- the General LLM Authoring Prompt UI/download/import workflow;
- a generic runtime renderer/compiler for `presentation` preferences;
- WU18 Entry Detail presentation;
- WU19 Print presentation;
- GP Advanced Select or GP File Upload Pro guessed adapters;
- new authorization/editability/workflow behavior;
- release or final product acceptance.

Gravity Forms and Gravity Flow remain owners of behavior, state, validation, workflow, authorization, editability, actions, and persistence. Schema validity proves only structural package validity; it does not prove a host runtime seam or visual/accessibility runtime result.
