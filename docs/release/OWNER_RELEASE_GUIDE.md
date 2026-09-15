# Owner Release Guide

## Current first-release state

Automated Production Release System V1 is implemented. The Owner-approved first production version is `0.1.0`, and the repository now materializes these product prerequisites:

- product context: personal/private use;
- license: `GPL-2.0-or-later`;
- minimum WordPress: `6.8.3`;
- minimum PHP: `8.2`;
- minimum Gravity Forms: `3.1.1.1`;
- minimum Gravity Flow: `3.1.0`.

No production release has been published yet. Normal source must remain at `0.0.0-dev` until the separate explicit Owner publication action. Public repository or artifact visibility does not itself create a broad public-support commitment.

## First production release

When the Owner separately authorizes the first production publication, open GitHub Actions → **GPP Production Release** → **Run workflow** on `main` and choose exactly:

- `mode = publish`;
- `release_intent = first`;
- `first_version = 0.1.0`.

Do not manually edit the normal source version, create `v0.1.0`, create a `[0.1.0]` changelog section, build a production candidate, or create a GitHub Release beforehand. The publication workflow creates and qualifies the exact versioned candidate only after that explicit Owner action.

## Routine releases after the first release

For later releases, choose:

- `mode = publish`;
- `release_intent = patch`, `minor`, or `major`.

The workflow derives the exact next version from production release history. You do not need to edit version files, create a Git tag, build a ZIP, calculate a checksum, or upload Release assets.

## What happens automatically

The workflow binds the release to the exact current integrated source, prepares only the release metadata/version candidate, runs the required repository/runtime qualification on that exact candidate, builds one canonical WordPress ZIP, validates and installs that exact ZIP, creates its SHA-256, rechecks conflicts, publishes the GitHub Release, downloads the published asset again, verifies it, and smoke-tests the downloaded consumer artifact.

Only after that consumer-facing verification succeeds does the workflow create a small development-continuation commit that returns the two source version declarations to `0.0.0-dev`. The completed changelog release section, tag, GitHub Release, and released ZIP remain tied to the exact production candidate.

A release is reported complete only after both the downloaded artifact and the final return of `main` to the locked development version verify successfully.

## Repository prerequisites now resolved

The repository publication-prerequisite gate now expects and validates:

1. a non-empty `LICENSE` carrying the selected GNU GPL v2 terms;
2. `release/compatibility.json` with the exact Owner-approved numeric dotted floors;
3. WordPress plugin-header `Requires at least` / `Requires PHP` metadata synchronized with that compatibility authority;
4. normal development source at `0.0.0-dev` with `[Unreleased]` still present.

The negative gates remain fail-closed for a missing/empty license, missing compatibility policy, absent required compatibility key, malformed/placeholder floor, metadata mismatch, and invalid source-version state.

The first production version `0.1.0` is an approved publication input, not a normal-development source version.

## Platform prerequisite still separate

GitHub **Immutable Releases** must be enabled before production publication, and Actions must have the `GPP_RELEASE_ADMIN_READ_TOKEN` repository secret containing a fine-grained token with repository Administration **read-only** permission. The workflow uses it only to prove that Immutable Releases are enabled before any irreversible publication step; it does not use that token to publish releases.

If either platform condition cannot be machine-verified, production publication must stop. Do not work around that gate by weakening the workflow or introducing a second release path.

## Dry-run

`mode = dry-run` is safe and non-production. Pull requests that change the release system also run the dry-run automatically. It verifies the resolved repository prerequisites, confirms normal source is still `0.0.0-dev`, overlays a synthetic production-shaped version such as `9999.0.0`, builds the canonical ZIP, validates its exact allowlist and LICENSE bytes, and smoke-tests the exact ZIP.

The dry-run does **not** create a production tag, GitHub Release, production-versioned commit on `main`, or external production publication.

## What PASS means

A successful production workflow means the exact released ZIP was source-bound, qualified, validated, activated in the pinned WordPress/Gravity runtime, checksum-verified, published, re-downloaded, verified again, smoke-tested after download, and the repository was safely returned to its `0.0.0-dev` development version state without changing release identity.

A successful release dry-run proves only its non-production, synthetic-version path and the exercised release/package/runtime checks. It does **not** prove an actual `0.1.0` publication, GitHub consumer-channel re-download, target-production equivalence, physical-printer equivalence, or remaining Registration production-specific evidence.

## If publication fails

Do not replace a published ZIP or move an existing release tag.

Keep the workflow evidence and identify the last successful step. If no tag/Release was created, correct the cause and start a new explicit Owner run. If a tag, draft Release, or published Release exists, stop and have the Manager/Owner inspect that partial publication before any recovery action.

If the published artifact verified but `main` could not be returned to `0.0.0-dev` because it moved concurrently, do not force the branch and do not rerun normal publication. Preserve the release and use an explicit recovery decision for repository state.

For an already-published immutable release, prefer a corrected new version rather than silent history rewriting. The workflow does not automatically delete releases or tags.
