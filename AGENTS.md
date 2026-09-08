# AGENTS.md — Gravity Presentation Profiles

This file is the operating contract for coding agents and automated contributors working in this repository.

## 1. Repository identity

- **Repository:** `rezahh107/Gravity-Presentation-Profiles`
- **Product:** Gravity Presentation Profiles
- **Type:** WordPress presentation-layer plugin for Gravity ecosystem surfaces
- **Status:** architecture selected; implementation not started
- **Canonical architecture:** `docs/architecture/MOTHER_ARCHITECTURE.md`

The plugin is generic. SRWF is a consumer/profile family, not the identity of the core plugin.

## 2. Authority order

When instructions conflict, use this order:

1. current owner instruction;
2. `docs/architecture/MOTHER_ARCHITECTURE.md`;
3. admitted profile-specific Visual/UX Contract;
4. admitted Canonical Visual Reference Gallery;
5. current official host-product documentation;
6. current repository tests/CI;
7. implementation inference.

A visual reference illustrates a contract; it does not override it.

Do not treat filenames, comments, screenshots, mockup labels such as `FINAL`/`APPROVED`, or historical summaries as authority by themselves.

## 3. Core invariant

Preserve this boundary:

```text
Host plugins create behavior and state.
Gravity Presentation Profiles styles that state.
Canonical visual references show what the styled state should look like.
```

Examples:

- Gravity Forms owns entry data, form behavior, validation, conditional logic, submission, and native field lifecycle.
- Gravity Flow owns workflow, assignment, Inbox, Entry Detail, Approval, and workflow semantics.
- Gravity Perks components own their native interaction/lifecycle.
- Gravity Presentation Profiles owns deterministic presentation only.

Never reimplement host behavior merely to match a mockup.

## 4. Forbidden architectural drift

Do not introduce any of the following without a new owner-approved architecture decision:

- custom database tables for form/workflow truth;
- parallel workflow, assignment, approval, or queue systems;
- a custom operational Desk replacing native Gravity Flow surfaces;
- rewritten Gravity Forms markup as the normal presentation strategy;
- global disabling of Gravity Forms CSS;
- a generic page builder or visual CSS editor;
- arbitrary user-authored CSS execution;
- profile behavior that changes business semantics;
- JavaScript as the default styling mechanism;
- font bundling/loading in generic core;
- SRWF business rules inside generic core;
- a speculative multi-theme/style engine.

UI hiding is never authorization.

## 5. Generic core versus profile code

Generic core must remain consumer-agnostic.

SRWF-specific identifiers, selectors, visual tokens, or composition rules may exist only inside an explicitly SRWF-scoped profile/package or profile documentation.

Do not move genuinely project-specific presentation rules into generic core merely because they are currently the first implementation.

Conversely, do not duplicate a truly generic host-integration primitive inside a profile if it belongs in core.

## 6. Profile model

The intended model is:

```text
Base presentation system
        +
zero or one admitted primary profile per enabled form/surface
```

For Gravity Forms, canonical per-form state is expected to be owned by Gravity Forms Form Settings / Add-On Framework integration, conceptually:

```yaml
enabled: true|false
profile: <registered-profile>
```

Semantic wrapper classes are derived runtime output, not a second source of truth.

Form IDs and Page IDs are not presentation identity.

Do not add a separate visual-style selector until a concrete admitted use case requires more than one visual style for the same functional profile.

## 7. Styling priority

Use the smallest stable mechanism in this order:

1. native host configuration;
2. documented host styling API / CSS custom properties;
3. plugin-owned scoped CSS;
4. limited documented hook/filter where CSS alone cannot express the admitted contract;
5. JavaScript only for a proven residual behavior/presentation gap and only if the Mother Architecture allows it.

JavaScript is zero-by-default.

Do not depend on brittle DOM structure when a documented host API exists.

## 8. Responsive ownership

Distinguish component behavior from visual composition:

- host plugin owns component behavior/lifecycle;
- this plugin owns responsive composition, spacing, hierarchy, widths, stacking, and visual adaptation around native states.

A breakpoint or responsive rule must come from an admitted Visual/UX Contract or be clearly marked `NOT_PROVEN` during design extraction. Do not invent breakpoints from screenshots.

## 9. Accessibility

Accessibility requirements are constraints, not optional polish.

Do not claim WCAG conformance from screenshots or mockups alone.

Runtime-sensitive items such as keyboard behavior, focus order, accessible names, semantic relationships, and screen-reader behavior require real runtime evidence.

Never remove native semantics for visual convenience.

## 10. Fonts and localization

Generic core should inherit typography by default and must not bundle a font without a separately admitted requirement.

For SRWF, Vazir owns font delivery in the current project environment. This plugin may own type scale, weight, line-height, spacing, and hierarchy defined by the profile contract, but not the font-delivery mechanism.

PersianGravity owns reusable Persian/Iranian Gravity behavior within its own scope. An SRWF profile may style those rendered fields/states but must not copy their behavior into this plugin.

## 11. Gravity Flow surfaces

Gravity Flow presentation is more markup-sensitive than Gravity Forms Theme Framework styling. Treat selectors/hooks as runtime-sensitive unless officially documented.

Do not implement Officer, Accountant, Inbox, Entry Detail, or dossier styling until the corresponding Visual/UX Contract is admitted.

## 12. Repository workflow

The initial repository bootstrap may land on `main`. After bootstrap, use focused branches and pull requests for material changes.

Recommended branch prefixes:

- `feat/`
- `fix/`
- `docs/`
- `test/`
- `chore/`

Each material PR must state:

- governing work unit / contract;
- exact scope;
- behavior explicitly unchanged;
- files changed;
- tests and validations actually executed;
- unexecuted/runtime-sensitive checks;
- release impact.

Do not merge unless explicitly authorized by the owner or an applicable repository automation policy.

## 13. Source versus distribution

This repository is the canonical **source** package.

A production WordPress release must be built as a clean distribution ZIP. GitHub's source ZIP is not the installable artifact contract.

Use `.distignore` and the release build to exclude development-only files. Never assume a file is excluded without inspecting the produced artifact.

After a release build, validate the actual ZIP contents before claiming release readiness.

## 14. Tests and validation

Do not claim validation that was not executed.

As implementation appears, tests should cover at minimum:

- profile registration/resolution;
- per-form opt-in state;
- conditional asset enqueue;
- absence of styling leakage to non-enabled forms;
- deterministic class derivation;
- compatibility fallbacks/failure behavior;
- build artifact contents;
- lint/static analysis appropriate to the implementation;
- browser/runtime visual regression for admitted profiles where practical.

A mockup rendering is not runtime validation against Gravity Forms/Gravity Flow.

## 15. Data/privacy constraints

Do not commit real student, customer, payment, or personally identifiable data to fixtures, screenshots, test logs, or documentation.

Use synthetic fixtures only.

## 16. Dependency policy

Prefer no runtime dependency when WordPress/Gravity APIs already provide the needed primitive.

Do not add a Composer/npm/runtime library without documenting:

- the concrete gap it solves;
- why native APIs are insufficient;
- runtime/bundle impact;
- maintenance/security implications.

Dependency versions and minimum platform versions must be evidence-based and intentionally selected; do not guess them during unrelated work.

## 17. Documentation discipline

Architecture decisions belong in `docs/architecture/`.

Profile-specific visual contracts and gallery manifests belong under `docs/visual/` until a more specific admitted structure is established.

Do not silently rewrite a governing contract while implementing code. If implementation evidence invalidates a contract assumption, stop at the smallest affected decision and report the conflict.

## 18. First implementation boundary

Until the first profile Visual/UX Contract is admitted, repository work should remain limited to architecture, scaffolding, tooling, research artifacts, and non-visual core preparation that does not prejudge the pending visual contract.

The first planned functional implementation is expected to include only:

- plugin bootstrap;
- Gravity Forms Add-On integration;
- profile registry;
- per-form enable/profile selection;
- Base presentation layer;
- first admitted SRWF Registration profile;
- conditional asset loading;
- tests/documentation;
- reproducible clean release packaging.

Officer/Accountant/Gravity Flow visual work, visual editors, custom REST APIs, speculative style systems, and unrelated behavior are outside that first work unit.

## 19. Stop conditions

Stop and report instead of guessing when:

- a required contract is missing;
- two authoritative sources conflict;
- host behavior is not proven and implementation would depend on it;
- a change would cross from presentation into business/workflow ownership;
- an exact selector/API is not documented and cannot be validated;
- a requested release would ship with an undeclared license or unvalidated distribution artifact.

Prefer an explicit `NOT_PROVEN` or `INCOMPLETE` over false closure.
