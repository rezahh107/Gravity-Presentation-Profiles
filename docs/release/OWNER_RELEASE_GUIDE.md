# Owner Release Guide

## Routine release

When the release prerequisites have been intentionally completed, open GitHub Actions → **Production Release System** → **Run workflow** on `main`.

Choose:

- `mode = publish`;
- `release_intent = patch`, `minor`, or `major`.

That is the routine Owner action. You do not need to edit version files, create a Git tag, build a ZIP, calculate a checksum, or upload Release assets.

For the **first** public release only, choose `release_intent = first` and provide the exact first public version approved by the Owner. The system will not invent that decision.

## What happens automatically

The workflow binds the release to the exact current integrated source, prepares only the release metadata/version candidate, runs the required repository/runtime qualification on that exact candidate, builds one canonical WordPress ZIP, validates and installs that exact ZIP, creates its SHA-256, rechecks conflicts, publishes the GitHub Release, downloads the published asset again, verifies it, and smoke-tests the downloaded consumer artifact.

Only after that consumer-facing verification succeeds does the workflow create a small development-continuation commit that returns the two source version declarations to `0.0.0-dev`. The completed changelog release section, tag, GitHub Release and released ZIP remain tied to the exact production candidate.

A release is reported complete only after both the downloaded artifact and the final return of `main` to the locked development version verify successfully.

## What currently blocks publication

Production publication is intentionally blocked until all Owner-level product decisions are present in the repository:

1. a selected `LICENSE` file;
2. an intentional compatibility policy in `release/compatibility.json` covering resolved numeric dotted minimum WordPress, PHP, Gravity Forms, and Gravity Flow versions;
3. the first public version when there is no earlier production release.

Placeholder values such as `OWNER_DECISION_REQUIRED`, arbitrary text, empty values, or malformed versions do not satisfy the compatibility gate.

There is also one platform setup prerequisite: GitHub **Immutable Releases** must be enabled, and the Actions repository must have the `GPP_RELEASE_ADMIN_READ_TOKEN` secret containing a fine-grained token with repository Administration **read-only** permission so the workflow can prove that setting before publication. The token does not publish releases.

Normal release execution must begin while `main` is at `0.0.0-dev`. If a partial prior publication leaves `main` production-versioned, the normal workflow stops and requires explicit recovery rather than guessing what happened.

## Dry-run

`mode = dry-run` is safe and non-production. Pull requests that change the release system also run the dry-run automatically. It builds and validates a synthetic production-shaped ZIP and smoke-tests it, but does not create a production tag or GitHub Release.

## What PASS means

A successful production workflow means the exact released ZIP was source-bound, qualified, validated, activated in the pinned WordPress/Gravity runtime, checksum-verified, published, re-downloaded, verified again, smoke-tested after download, and the repository was safely returned to its `0.0.0-dev` development version state without changing release identity.

It does **not** prove that every target-production server, cache/CDN, theme, license configuration, form identity, workflow identity, or printer environment matches the pinned evidence runtime.

## If publication fails

Do not replace a published ZIP or move an existing release tag.

Keep the workflow evidence and identify the last successful step. If no tag/Release was created, correct the cause and start a new explicit Owner run. If a tag, draft Release, or published Release exists, stop and have the Manager/Owner inspect that partial publication before any recovery action.

If the published artifact verified but `main` could not be returned to `0.0.0-dev` because it moved concurrently, do not force the branch and do not rerun normal publication. Preserve the release and use an explicit recovery decision for repository state.

For an already-published immutable release, prefer a corrected new version rather than silent history rewriting. The workflow does not automatically delete releases or tags.
