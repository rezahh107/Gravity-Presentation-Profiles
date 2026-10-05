# Owner Release Guide

## Current release state

Automated Production Release System V1 is implemented and this repository already has immutable production releases. At the MR-6 baseline, the published history includes `v0.3.2` and `v0.3.3`; do not treat this document as authority for which release is latest at a future publication time. Before any publication decision, verify the current GitHub Release/tag history and let the repository release resolver derive the concrete next version from that live history.

The current Owner-approved product prerequisites remain:

- product context: personal/private use;
- license: `GPL-2.0-or-later`;
- minimum WordPress: `6.8.3`;
- minimum PHP: `8.2`;
- minimum Gravity Forms: `3.1.1.1`;
- minimum Gravity Flow: `3.1.0`.

Normal source must remain at `0.0.0-dev` between releases. Public repository or artifact visibility does not itself create a broad public-support commitment.

## Routine production publication

Future production publication is a separate explicit Owner action. When the Owner authorizes publication, open GitHub Actions → **GPP Production Release** → **Run workflow** on `main` and choose exactly:

- `mode = publish`;
- `release_intent = patch`, `minor`, or `major`, according to the Owner-approved release decision.

The workflow derives the concrete next SemVer from live production tag/release history. Do not manually edit the normal source version, create the production tag, create a changelog release section, build a production candidate, or create a GitHub Release beforehand.

`release_intent = first` exists only for a repository with no production release/tag history. It is no longer the normal valid Owner path for this repository and must not be used for a routine successor release.

Do not hard-code a future release version in this guide unless the Owner has separately authorized that exact publication decision.

## What happens automatically

The workflow binds the release to the exact current integrated source, resolves the next version from release/tag history, prepares only the release metadata/version candidate, runs the canonical required qualification set on that exact candidate SHA, builds one canonical WordPress ZIP, validates and installs that exact ZIP, creates its SHA-256, rechecks conflicts, publishes the GitHub Release, downloads the published asset again, verifies it, and smoke-tests the downloaded consumer artifact.

The canonical exact-candidate qualification waiter includes repository CI plus the admitted runtime lanes for WU21, SRWF Registration, the integrated SRWF Journey host, WU18 Entry Detail, and WU19 A4 Print. The release workflow must not duplicate those Journey assertions in a second release path.

Only after consumer-facing verification succeeds does the workflow create a small development-continuation commit that returns the two source version declarations to `0.0.0-dev`. The completed changelog release section, tag, GitHub Release, and released ZIP remain tied to the exact production candidate.

A release is reported complete only after both the downloaded artifact and the final return of `main` to the locked development version verify successfully.

## Repository prerequisites

The repository publication-prerequisite gate expects and validates:

1. a non-empty `LICENSE` carrying the selected GNU GPL v2 terms;
2. `release/compatibility.json` with the exact Owner-approved numeric dotted floors;
3. WordPress plugin-header `Requires at least` / `Requires PHP` metadata synchronized with that compatibility authority;
4. normal development source at `0.0.0-dev` with `[Unreleased]` still present.

The negative gates remain fail-closed for a missing/empty license, missing compatibility policy, absent required compatibility key, malformed/placeholder floor, metadata mismatch, and invalid source-version state.

## Platform prerequisite still separate

GitHub **Immutable Releases** must be enabled before production publication, and Actions must have the `GPP_RELEASE_ADMIN_READ_TOKEN` repository secret containing a fine-grained token with repository Administration **read-only** permission. The workflow uses it only to prove that Immutable Releases are enabled before any irreversible publication step; it does not use that token to publish releases.

If either platform condition cannot be machine-verified, production publication must stop. Do not work around that gate by weakening the workflow or introducing a second release path.

## Dry-run

`mode = dry-run` is safe and non-production. Pull requests that change the release system also run the dry-run automatically. It verifies the resolved repository prerequisites, confirms normal source is still `0.0.0-dev`, overlays a synthetic production-shaped version such as `9999.0.0`, builds the canonical ZIP, validates its exact allowlist and LICENSE bytes, and smoke-tests the exact ZIP.

The dry-run does **not** create a production tag, GitHub Release, production-versioned commit on `main`, or external production publication.

## What PASS means

A successful production workflow means the exact released ZIP was source-bound, qualified, validated, activated in the pinned WordPress/Gravity runtime, checksum-verified, published, re-downloaded, verified again, smoke-tested after download, and the repository was safely returned to its `0.0.0-dev` development version state without changing release identity.

A successful release dry-run proves only its non-production, synthetic-version path and the exercised release/package/runtime checks. It does **not** prove an actual future publication, GitHub consumer-channel re-download for that future release, target-production equivalence, physical-printer equivalence, or Owner-site acceptance.

## If publication fails

Do not replace a published ZIP or move an existing release tag.

Keep the workflow evidence and identify the last successful step. If no tag/Release was created, correct the cause and start a new explicit Owner run. If a tag, draft Release, or published Release exists, stop and have the Manager/Owner inspect that partial publication before any recovery action.

If the published artifact verified but `main` could not be returned to `0.0.0-dev` because it moved concurrently, do not force the branch and do not rerun normal publication. Preserve the release and use an explicit recovery decision for repository state.

For an already-published immutable release, prefer a corrected new version rather than silent history rewriting. The workflow does not automatically delete releases or tags.
