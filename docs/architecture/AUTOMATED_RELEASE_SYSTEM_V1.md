# Automated Production Release System V1

## Purpose

This document defines the repository-native release path for Gravity Presentation Profiles. It does not authorize a production release by itself.

The release unit is one installable WordPress plugin ZIP plus its SHA-256 checksum and GitHub Release metadata. GitHub's source archive is not the installable artifact contract.

The current product context is personal/private use. Public repository or downloadable-artifact visibility does not itself create a broad public-support commitment. Compatibility policy is intentionally centered on the Owner-qualified environment.

## Owner path

Routine production publication is one explicit `GPP Production Release` workflow-dispatch action on `main`.

After the first production release, the Owner chooses only release intent (`patch`, `minor`, or `major`). The workflow derives the exact version from immutable production tags. The first release is different because no prior release baseline exists: the Owner must explicitly provide the first production SemVer once. The Owner-approved first production version is `0.1.0`.

The Owner does not manually edit versions, create tags, build ZIPs, calculate checksums, or upload GitHub Release assets.

For the first production publication, the future explicit action is `mode = publish`, `release_intent = first`, and `first_version = 0.1.0`. Repository preparation alone does not execute that action.

## Version authority

The WordPress plugin header `Version` in `gravity-presentation-profiles.php` is the canonical production version declaration. `GravityPresentationProfiles\GravityForms\AddOn::$_version` is a machine-checked mirror.

Normal development stays at `0.0.0-dev`. A production release action deterministically prepares a release-candidate commit by changing only:

- the plugin-header Version;
- the Gravity Forms Add-On version mirror;
- the `[Unreleased]` changelog transition.

The candidate commit is then qualified exactly. No unqualified source is tagged or packaged.

After the published consumer artifact has been re-downloaded, checksum-verified, validated, smoke-tested again, and source identity reverified, the workflow creates one deterministic child continuation commit. That continuation changes only the plugin-header Version and Gravity Forms Add-On mirror back to `0.0.0-dev`; it retains the completed changelog release section. The release tag, GitHub Release and release artifact remain bound to the production-versioned candidate SHA.

A normal publish action must start from `0.0.0-dev`. If `main` is already production-versioned, normal publication fails closed and requires explicit recovery rather than silently treating that state as ready development source.

## Exact source binding

The workflow binds these identities to one exact release-candidate SHA:

`approved candidate = qualified source = artifact source = tag source = GitHub Release source`

The Owner action first records the exact integrated `main` SHA. Candidate preparation creates one child commit containing only deterministic release metadata changes. The candidate is pushed to a dedicated release-candidate branch and all required qualification workflows are dispatched against that exact SHA.

Before publication, the workflow verifies that `main` has not moved. It then fast-forwards `main` to the already-qualified candidate. If `main` moved, publication stops rather than rebasing or silently qualifying a different source.

After successful last-mile verification, the development continuation is pushed to `main` only when remote `main` is still exactly the candidate SHA. The push is a normal non-force fast-forward. Any concurrent movement causes continuation promotion to stop without changing the tag, GitHub Release, or candidate identity.

## Canonical builder

`scripts/release/build-release.sh` is the only production ZIP builder.

It ships only the production allowlist derived by `release_runtime_files()`:

- `gravity-presentation-profiles.php`;
- `LICENSE`;
- `src/**/*.php`;
- runtime `assets` (`css`, `js`, and approved local image formats);
- runtime/declarative `profiles` files (`php`, `css`, `json`).

Repository-only material such as tests, docs, workflows, release tooling/configuration, Composer metadata, governance documents, build output, and profile Markdown remains excluded. Adding `LICENSE` does not turn those source/development files into distribution content.

The builder normalizes ZIP timestamps and sorted input so a second build from identical prepared source produces the same bytes/checksum on the supported runner toolchain. Caller-relative output directories are canonicalized before entering the staging working directory, so CI and local callers use the same output-location semantics.

## Artifact validation

`scripts/release/validate-release.sh` verifies the actual ZIP, not the checkout. It rejects:

- corrupt archives;
- unsafe/archive-traversal paths;
- wrong plugin root;
- missing required runtime files, including `LICENSE`;
- additional files outside the canonical runtime allowlist;
- repository/development directories and files;
- mismatched plugin/Add-On versions;
- packaged files whose bytes differ from the prepared source, including `LICENSE`;
- checksum mismatch;
- high-confidence private-key/GitHub-token/AWS-key patterns.

Release mutation tests prove these controls fail when deliberately violated.

## Exact ZIP smoke

`scripts/release/smoke-zip.sh` reuses the pinned runtime identities from `tests/repro-evidence-lab/lab-config.json` rather than creating another host-version authority. It installs WordPress plus the exact owner-supplied Gravity Forms and Gravity Flow packages, then installs and activates the generated GPP ZIP through WordPress. It verifies plugin activation, GPP bootstrap/Add-On reachability, and the existing SRWF Registration profile registry path.

This proves that production files excluded from the source checkout are not required for that representative runtime path. It does not prove target-production equivalence.

## Qualification

A production candidate must pass exact-source runs of:

- Repository CI;
- WU21 Reproducible Evidence Lab;
- SRWF Registration Authentic Runtime;
- WU18 Entry Detail Runtime;
- WU19 A4 Print Runtime.

`Repository CI` supports `workflow_dispatch` so the release workflow can qualify an exact release-candidate branch, including its DB advisory-lock jobs. The other four existing pinned workflows already support explicit dispatch.

The release workflow starts all five, captures exact run IDs, verifies their `headSha` equals the candidate SHA, and requires `success` before building/publishing.

## Resolved repository compatibility authority

`release/compatibility.json` is the intentional release compatibility authority for the Owner-qualified environment:

- `wordpress_min`: `6.8.3`;
- `php_min`: `8.2`;
- `gravity_forms_min`: `3.1.1.1`;
- `gravity_flow_min`: `3.1.0`.

The WordPress plugin header mirrors the WordPress/PHP floors through `Requires at least` and `Requires PHP`, and the publication-prerequisite check fails closed if those mirrors drift. Gravity Forms and Gravity Flow remain host dependencies governed by the release compatibility authority; this release-readiness work does not add a new runtime hard-block subsystem for them.

`release/compatibility.example.json` remains only the unresolved/template shape. Placeholder/sentinel values such as `OWNER_DECISION_REQUIRED`, arbitrary text, empty values, malformed version strings, or missing required keys do not satisfy publication prerequisites.

## Publication prerequisites

The repository-level product prerequisites are now materialized as:

- `GPL-2.0-or-later`, with the standard GNU GPL version 2 text in `LICENSE`;
- the exact compatibility floors above;
- WordPress/PHP plugin metadata synchronized to those floors;
- normal source beginning the release action in the locked `0.0.0-dev` development state with `[Unreleased]` present;
- Owner-approved first production version intent `0.1.0` for the future first publish action.

Production publication still fails closed unless all applicable release/platform/runtime conditions are true:

- repository immutable releases are enabled and machine-verifiable;
- no conflicting tag, GitHub Release, or production asset filename exists;
- `main` remains at the approved pre-candidate source before promotion;
- all exact candidate qualification succeeds;
- the exact ZIP validates and smoke-tests.

A missing/empty `LICENSE`, missing compatibility file, absent required compatibility key, malformed/placeholder compatibility value, WordPress/PHP metadata mismatch, invalid source-version state, or production-versioned starting source still fails closed.

## Immutable history and least privilege

The workflow default is `contents: read`. The dry-run job has read-only repository permission. Only an explicit `workflow_dispatch` with `mode=publish` enters the publication job, where `contents: write` is needed for candidate/main/tag/Release operations and `actions: write` is needed to dispatch qualification workflows.

GitHub's `GITHUB_TOKEN` does not expose repository Administration permission. Because the immutable-releases status endpoint requires Administration(read), production publication also requires a fine-grained `GPP_RELEASE_ADMIN_READ_TOKEN` secret with only that read permission. It is used only to prove immutability before the first irreversible publication step. Publication itself continues to use the GitHub-native `GITHUB_TOKEN`.

The workflow uses one non-cancelling concurrency group. A second release attempt waits instead of cancelling an in-progress publication.

## Dry-run boundary

The release dry-run runs the release contract/mutation suite against normal source, verifies resolved product prerequisites, and confirms both version declarations remain `0.0.0-dev` before creating a synthetic overlay such as `9999.0.0`.

It then builds, validates, and smoke-tests the canonical production-shaped ZIP. Its manifest remains explicitly non-production (`NOT_ATTEMPTED_DRY_RUN`). It does not create a production-versioned commit on `main`, production tag, GitHub Release, or consumer-facing production publication.

## Publication sequence

After successful qualification and artifact smoke:

1. recheck `main` source identity;
2. recheck duplicate tag/Release/asset conflicts;
3. fast-forward `main` to the exact qualified candidate;
4. create the immutable release tag at that SHA;
5. create a **draft** GitHub Release;
6. attach the exact tested ZIP, SHA-256 file, and manifest;
7. publish the draft (GitHub immutable-release protection then locks tag/assets);
8. re-download the public Release ZIP/checksum;
9. verify checksum and ZIP contents again;
10. install/smoke the re-downloaded ZIP in a second clean pinned WordPress database;
11. reverify candidate/tag/GitHub-Release source identity;
12. verify remote `main` is still exactly the candidate SHA;
13. create the two-file `0.0.0-dev` development-continuation child commit while retaining the released changelog section;
14. push that continuation to `main` with a normal non-force fast-forward and verify remote `main` plus both version mirrors;
15. report `GPP_RELEASE_PUBLISHED_AND_VERIFIED` only after the continuation and release identity both verify.

An upload response alone is not release completion.

## Recovery

The workflow never deletes or rewrites an existing production tag/Release automatically.

If failure occurs before a tag is created, preserve logs/evidence and correct the source or release prerequisites before another Owner action. A failed candidate branch is reversible evidence and is not itself a production release.

If a tag, draft Release, or published Release exists when a later step fails, stop promotion. Inspect exactly what was created. Do not move the tag, replace published assets, or silently retry into existing immutable identity. Prefer a corrected new version after the Owner/Manager decides the recovery path.

If the published artifact has already passed last-mile verification but the final development continuation cannot fast-forward because `main` moved, preserve the published release identity and stop. Do not force `main` and do not rewrite the release. Normal publication is deliberately blocked while `main` remains production-versioned; recovery is an explicit Manager/Owner action.

Published immutable Release assets/tags are intentionally not auto-withdrawn. GitHub allows a release to be deleted by an authorized human, but immutable tag names cannot be reused; destructive recovery therefore requires an explicit policy decision outside this workflow.

## Evidence boundary

A successful dry-run and exact-head qualification do not prove an actual `0.1.0` publication, GitHub consumer-channel re-download, target-production equivalence, physical-printer equivalence, or remaining Registration production-specific evidence. Those remain separate claims until their actual boundaries are exercised.

## Supply-chain scope

SHA-256 is mandatory and checks artifact integrity, not trusted origin by itself.

V1 relies on GitHub Immutable Releases rather than adding custom Sigstore/cosign. GitHub automatically generates release attestations for immutable releases; the real attestation/consumer verification path remains `NOT_PROVEN` until an actual authorized production release exists.

An SBOM is not generated in V1 because the production ZIP carries no Composer/npm/vendor dependency payload. Gravity Forms and Gravity Flow are host plugins, not bundled dependencies. Reevaluate this if runtime third-party libraries are ever shipped inside the GPP ZIP.
