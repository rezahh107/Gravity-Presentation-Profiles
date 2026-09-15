# Gravity Presentation Profiles

A reusable WordPress presentation layer for applying opt-in visual profiles to Gravity Forms and Gravity Flow surfaces while preserving native behavior, data, and workflow ownership.

> **Status:** The current product includes lifecycle-backed declarative profiles, native Gravity Flow Inbox/Entry Detail/Print presentation, Mapping & Binding Health, local Diagnostics/Support Bundle, manual Inbox reload, and the fixed offline General LLM Authoring Prompt. These paths have pinned reproducible/authentic runtime evidence. No production release has been authorized or published; license, compatibility floors, and the first public release version remain Owner decisions.

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
- package/binding lifecycle and local diagnostics surfaces;
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
│   ├── lifecycle / binding support
│   └── local operational diagnostics
└── Profiles
    └── SRWF
        └── Registration   # admitted key: srwf-registration
```

Additional profile families and visual styles require a concrete admitted contract; they are not inferred from the first profile.

## Repository layout

```text
.
├── .github/workflows/       # repository/runtime/release workflows
├── assets/                  # production presentation assets
├── docs/                    # architecture, visual and release documentation
├── profiles/                # profile-scoped production assets/packages
├── release/                 # release policy; not shipped in the plugin ZIP
├── scripts/                 # repository/release tooling; not shipped
├── src/                     # namespaced production source
├── tests/                   # automated tests/evidence harnesses; not shipped
├── gravity-presentation-profiles.php
├── CHANGELOG.md
└── .distignore
```

## Required reading before implementation

1. [`docs/architecture/MOTHER_ARCHITECTURE.md`](docs/architecture/MOTHER_ARCHITECTURE.md)
2. [`AGENTS.md`](AGENTS.md)
3. [`docs/visual/README.md`](docs/visual/README.md)
4. the applicable admitted profile-specific Visual/UX Contract and visual-reference manifest

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

The Git repository is a **source package**, not the installable WordPress package. Production releases use the repository's single canonical builder, `scripts/release/build-release.sh`, to create:

```text
gravity-presentation-profiles-<version>.zip
└── gravity-presentation-profiles/
    ├── gravity-presentation-profiles.php
    ├── src/
    ├── assets/
    └── profiles/            # production CSS/JSON only
```

The builder uses a strict production allowlist and the validator independently checks the exact file set and byte identity. `.github/`, tests, docs, release tooling, repository governance files and local build/cache output are not shipped.

Routine production publication is designed as one explicit Owner action in **Actions → GPP Production Release**. The release system resolves and locks the exact source SHA, qualifies it, builds/smokes the exact ZIP, calculates SHA-256, checks publication conflicts, publishes only under GitHub immutable-release protection, then re-downloads and verifies the consumer-facing asset. See [`docs/RELEASE_SYSTEM.md`](docs/RELEASE_SYSTEM.md).

The source version remains the explicit development sentinel `0.0.0-dev`; a production version is resolved by the release contract and written only into the staged distribution copy. The WordPress Plugin Header is the canonical version inside the installable artifact and the Gravity Forms Add-On version is a checked mirror.

## Current release blockers

Production publication is intentionally fail-closed until the Owner separately decides and the repository records:

- repository/plugin license;
- supported compatibility floors/policy;
- first public release version/intent.

Release-system dry-runs may build and smoke a clearly non-production prerelease version while these decisions remain pending. A dry-run never creates a production tag or GitHub Release.

## Security and privacy

This plugin remains presentation-only. It must not weaken WordPress, Gravity Forms, or Gravity Flow authorization boundaries. Test fixtures must avoid real student/personally identifiable data.

See [`SECURITY.md`](SECURITY.md).

## License

A repository license has not yet been selected. The production release workflow blocks before irreversible publication until an Owner-approved license file and policy are present.
