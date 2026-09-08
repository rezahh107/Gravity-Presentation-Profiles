# Gravity Presentation Profiles

A reusable WordPress presentation layer for applying opt-in visual profiles to Gravity Forms and Gravity Flow surfaces while preserving native behavior, data, and workflow ownership.

> **Status:** Architecture selected · implementation not started.

## Purpose

Gravity Presentation Profiles turns approved Visual/UX Contracts into deterministic presentation rules. It does not design forms at runtime and it does not replace Gravity Forms, Gravity Flow, Gravity Perks, or project-specific business logic.

The core ownership rule is:

```text
Host plugins create behavior and state.
Gravity Presentation Profiles styles that state.
Canonical visual references show what the styled state should look like.
```

## Architecture at a glance

```text
Gravity Forms / Gravity Flow / supported host components
                         ↓
             Gravity Presentation Profiles
                         ↓
              Base presentation system
                         +
                opt-in profile rules
                         ↓
                 WordPress front end
```

The plugin is generic. **SRWF is the first major profile family**, not the identity of the plugin itself.

## What this repository owns

- the canonical plugin source;
- the profile registry and presentation runtime;
- deterministic design tokens and scoped CSS;
- per-form opt-in/profile selection integration;
- plugin tests, CI, changelog, and release packaging;
- plugin-level architecture and implementation documentation.

## What this repository does not own

- Gravity Forms entries or business data;
- Gravity Flow workflow, assignment, Inbox, Entry Detail, or Approval semantics;
- host-component search/upload/validation behavior;
- project-specific business logic;
- a parallel database, workflow engine, queue, or custom operational desk;
- font delivery by default;
- project/runtime governance for consumers such as SRWF.

For SRWF specifically, `rezahh107/SRWF` remains the project/runtime/governance source of truth and binds the exact plugin release used by that project.

## Authority model

```text
Mother Architecture
        ↓
Applicable standards / accessibility requirements
        ↓
Visual / UX Contract
        ↓
Canonical Visual Reference Gallery
        ↓
Implementation
        ↓
Real runtime validation
```

A gallery illustrates the contract; it does not override it. Mockup behavior is not automatically implementation behavior.

## Current profile plan

```text
Gravity Presentation Profiles
├── Core
│   ├── profile registry
│   ├── scoped asset loading
│   ├── host integration
│   └── base presentation rules
└── Profiles
    └── SRWF
        └── Registration   # first planned profile
```

Officer, Accountant, additional profile families, and alternate visual styles are deferred until a concrete, approved use case exists.

## Repository layout

```text
.
├── .github/workflows/       # repository CI guardrails
├── docs/
│   ├── architecture/        # governing architecture
│   └── visual/              # visual-contract/gallery admission area
├── profiles/                # profile-family documentation now; code later
├── AGENTS.md                 # agent operating contract
├── CHANGELOG.md
├── SECURITY.md
├── composer.json
├── .distignore
└── README.md
```

Production code directories are intentionally not created until the first implementation work unit is admitted.

## Required reading before implementation

1. [`docs/architecture/MOTHER_ARCHITECTURE.md`](docs/architecture/MOTHER_ARCHITECTURE.md)
2. [`AGENTS.md`](AGENTS.md)
3. [`docs/visual/README.md`](docs/visual/README.md)
4. the approved profile-specific Visual/UX Contract and Canonical Visual Reference Gallery, once admitted

## Implementation policy

The normal priority is:

```text
Native host capability/configuration
        ↓
Documented host styling API
        ↓
Scoped CSS owned by this plugin
        ↓
Limited documented hook
        ↓
JavaScript only for a proven residual gap
```

JavaScript is zero-by-default. UI hiding is never authorization. Host behavior must not be reimplemented merely to match a mockup.

## Release model

The Git repository is a **source package**, not the installable WordPress package.

A release workflow will produce a clean distribution artifact such as:

```text
gravity-presentation-profiles-0.1.0.zip
└── gravity-presentation-profiles/
    ├── gravity-presentation-profiles.php
    ├── src/
    ├── assets/
    ├── profiles/
    └── readme.txt
```

Development-only content such as `.github/`, `tests/`, `docs/`, local tooling, and agent instructions must not be shipped in the production ZIP unless explicitly required at build time.

## Development workflow

After this initial repository bootstrap, material changes should use a focused branch and pull request. Each PR should state:

- scope and governing contract;
- files changed;
- behavior explicitly not changed;
- tests/validation actually run;
- runtime-sensitive items not proven;
- release impact, if any.

## Current gates

Implementation of the first SRWF Registration presentation profile is waiting for review/admission of:

- the external UX/accessibility evidence baseline;
- the SRWF Public Registration Visual/UX Contract;
- the Canonical Visual Reference Gallery manifest;
- any named runtime-sensitive host states that require staging validation.

The repository bootstrap itself does not claim those artifacts are approved.

## Security and privacy

This plugin should remain presentation-only. It must not weaken WordPress, Gravity Forms, or Gravity Flow authorization boundaries. Test fixtures must avoid real student/personally identifiable data.

See [`SECURITY.md`](SECURITY.md).

## License

A repository license has not yet been selected. Do not publish a production release until the owner explicitly selects a compatible license and the repository contains the corresponding license file.
