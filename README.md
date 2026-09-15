# Gravity Presentation Profiles

A reusable WordPress presentation layer for applying opt-in visual profiles to Gravity Forms and Gravity Flow surfaces while preserving native behavior, data, and workflow ownership.

> **Status:** Core presentation, portable package/binding lifecycle, native Gravity Flow Inbox/Entry Detail/Print presentation, Mapping & Binding Health, local Diagnostics, Manual Inbox Refresh, the Fixed Offline General LLM Authoring Prompt, and Automated Production Release System V1 are implemented with pinned reproducible runtime evidence. The Owner has resolved the first-release product decisions as personal/private use, `GPL-2.0-or-later`, WordPress `6.8.3+`, PHP `8.2+`, Gravity Forms `3.1.1.1+`, Gravity Flow `3.1.0+`, and first production version `0.1.0`. No production release has been published yet.

## Purpose

Gravity Presentation Profiles turns approved Visual/UX Contracts into deterministic presentation rules. It does not design forms at runtime and it does not replace Gravity Forms, Gravity Flow, Gravity Perks, or project-specific business logic.

The core ownership rule is:

```text
Host plugins create behavior and state.
Gravity Presentation Profiles styles that state.
Canonical visual references show what the styled state should look like.
```

The plugin is generic. **SRWF is the first major profile family**, not the identity of the plugin itself.

The current product context is personal/private use. Public repository visibility or a downloadable release artifact does not by itself create a broad public-support or backward-compatibility commitment; compatibility policy is intentionally centered on the Owner-qualified environment.

## What this repository owns

- the canonical plugin source;
- the profile registry and presentation runtime;
- deterministic design tokens and scoped CSS;
- per-form opt-in/profile selection integration;
- portable visual-profile package and semantic-binding lifecycle;
- presentation-only Gravity Flow surface adapters;
- local diagnostics/support evidence;
- plugin tests, CI, changelog, and release packaging;
- plugin-level architecture and implementation documentation.

## What this repository does not own

- Gravity Forms entries or business data;
- Gravity Flow workflow, assignment, authorization, Inbox query, Entry Detail action, or Approval semantics;
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

## Repository layout

```text
.
├── .github/workflows/       # repository, runtime, and release workflows
├── assets/                  # generic/runtime presentation assets
├── docs/
│   ├── architecture/        # governing architecture
│   ├── release/             # Owner-facing release operation
│   └── visual/              # admitted visual contracts/evidence
├── profiles/                # profile-scoped assets/packages
├── release/                 # release compatibility authority/template
├── scripts/                 # repository and canonical release tooling
├── src/                     # namespaced production source
├── tests/                   # automated core/governance/release tests
├── gravity-presentation-profiles.php
├── LICENSE
├── AGENTS.md
├── CHANGELOG.md
├── SECURITY.md
├── composer.json
├── .distignore
└── README.md
```

## Required reading before implementation

1. [`docs/architecture/MOTHER_ARCHITECTURE.md`](docs/architecture/MOTHER_ARCHITECTURE.md)
2. [`AGENTS.md`](AGENTS.md)
3. [`docs/visual/README.md`](docs/visual/README.md)
4. the applicable admitted profile-specific Visual/UX Contract and visual-reference manifest

Release work additionally follows [`docs/architecture/AUTOMATED_RELEASE_SYSTEM_V1.md`](docs/architecture/AUTOMATED_RELEASE_SYSTEM_V1.md).

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

The Git repository is the canonical **source** package, not the installable WordPress artifact. Production distribution uses one canonical builder and produces:

```text
gravity-presentation-profiles-X.Y.Z.zip
└── gravity-presentation-profiles/
    ├── gravity-presentation-profiles.php
    ├── LICENSE
    ├── src/
    ├── assets/
    └── profiles/
```

The ZIP contains only `LICENSE` plus runtime files selected by the release allowlist; `.github/`, tests, docs, scripts, release configuration, Composer metadata, governance files, local output, and profile Markdown remain excluded.

The WordPress plugin-header `Version` is canonical for a prepared production candidate. The Gravity Forms Add-On `_version` declaration is a machine-checked mirror. Normal source development remains `0.0.0-dev`; release automation prepares the production version only after a separate explicit Owner publication action.

The approved first production version is `0.1.0`, but it is intentionally **not** written into normal source. The future first publication path remains the existing `GPP Production Release` workflow with `mode = publish`, `release_intent = first`, and `first_version = 0.1.0`; that action creates and qualifies the exact versioned candidate itself. GitHub Immutable Releases and the read-only Administration token check must also pass before publication.

See [`docs/release/OWNER_RELEASE_GUIDE.md`](docs/release/OWNER_RELEASE_GUIDE.md).

## Development workflow

Material changes use a focused branch and pull request. Each PR should state:

- scope and governing contract;
- files changed;
- behavior explicitly not changed;
- tests/validation actually run;
- runtime-sensitive items not proven;
- release impact, if any.

Do not merge or publish unless explicitly authorized.

## Current evidence boundary

Repository CI and pinned authentic/reproducible WordPress, Gravity Forms, and Gravity Flow workflows provide strong evidence for exercised scenarios, including SRWF Registration, native Inbox, Entry Detail, Print, lifecycle/binding behavior, Diagnostics, Manual Inbox Refresh, and the fixed authoring-prompt/import boundary.

These lanes do not prove target-production equivalence. Target installation IDs, plugin/license configuration, theme/cache/CDN/server behavior, remaining Registration production-specific evidence, and physical-printer equivalence remain separate `NOT_PROVEN` claims until exercised in those environments.

## Security and privacy

This plugin remains presentation-only and offline/local for its diagnostics and authoring-prompt capabilities. It must not weaken WordPress, Gravity Forms, or Gravity Flow authorization boundaries. Test fixtures use synthetic data only.

See [`SECURITY.md`](SECURITY.md).

## License

Gravity Presentation Profiles is licensed under **GNU GPL version 2 or later** (`GPL-2.0-or-later`). The standard GNU GPL version 2 terms are included in [`LICENSE`](LICENSE) and are shipped in the canonical production ZIP.
