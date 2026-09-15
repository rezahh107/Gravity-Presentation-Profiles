# Gravity Presentation Profiles Release System V1

## Owner workflow

Routine production release is one explicit GitHub Actions action:

1. Open **Actions → GPP Production Release → Run workflow** on `main`.
2. Choose `patch`, `minor`, or `major`.
3. Run it once.

The workflow resolves the exact current `main` commit, qualifies that exact source, derives the next version, builds one canonical WordPress ZIP, validates and smoke-tests that exact ZIP, publishes only after all prerequisites pass, then re-downloads and verifies the published asset. The Owner does not edit version declarations, create tags, calculate checksums, upload assets, or reason about commit SHAs.

For the first public release, `release/release-policy.json:first_public_version` must first be set by an Owner-authorized repository change. V1 intentionally does not guess a first version.

## What blocks production publication

Publication fails closed when any release-critical prerequisite is unresolved or inconsistent, including:

- Owner-selected license is not approved/present;
- compatibility policy or WordPress/PHP metadata is not approved/matched;
- first public version is unresolved when no prior release exists;
- `[Unreleased]` changelog content is empty or conflicts with the target version;
- exact-source Repository CI or any required pinned runtime workflow is not successful;
- `main` moves after approval/qualification;
- candidate ZIP validation, checksum, or exact-ZIP smoke fails;
- tag, GitHub Release, or release asset identity already exists;
- GitHub immutable releases cannot be proven enabled before publication.

The immutable-release preflight uses a narrowly scoped repository Administration-read credential named `GPP_RELEASE_ADMIN_READ_TOKEN`. Release/tag creation itself uses the job-scoped `GITHUB_TOKEN` with `contents: write`; other jobs are read-only except the qualification job's `actions: write` permission used solely to dispatch existing workflows.

## Version model

Source stays in the explicit development state `0.0.0-dev`. The source Plugin Header and Gravity Forms Add-On version mirror must match before any build.

For a production candidate, the release workflow resolves one stable semantic version. The canonical builder creates a staged distribution copy and writes that version into the WordPress Plugin Header and its Add-On mirror. The validator independently reconstructs those two expected transformations and byte-compares every other shipped file with the exact source commit. The source commit itself is never silently rewritten by the release workflow.

First release comes from the Owner-authorized `first_public_version`; later versions are derived from the latest stable `vX.Y.Z` release plus the Owner's `patch`/`minor`/`major` intent.

## Candidate and artifact identity

The release evidence manifest records:

- exact source commit;
- resolved release version;
- ZIP filename;
- ZIP SHA-256;
- canonical builder identity;
- structure-validation result;
- exact-ZIP smoke result;
- required-qualification result;
- publication blockers.

`approved source = qualified source = artifact source = tag source` is enforced by exact SHA checks before qualification and again immediately before tag creation. If `main` changes, publication stops.

## Canonical distribution

`scripts/release/build-release.sh` is the only production ZIP builder. It uses a strict runtime allowlist rather than trusting `.distignore` alone. The ZIP contains the plugin entrypoint plus runtime `src/`, `assets/`, and profile CSS/JSON resources. Repository/CI/tests/docs/release tooling are excluded.

`scripts/release/validate-release.sh` checks archive integrity, root directory, required runtime files/assets, exact file set, transformed version declarations, byte parity with source, forbidden development material, secret-like material, and checksum identity.

The exact generated ZIP is installed into pinned WordPress with the approved Gravity Forms/Gravity Flow packages and activated through WP-CLI. This proves installability/bootstrap in that reproducible environment, not target-production equivalence.

## Publication and last-mile verification

Production publication is draft-first:

1. verify no identity conflict;
2. verify immutable releases are enabled;
3. create the exact `vX.Y.Z` tag at the qualified source SHA;
4. create a draft GitHub Release;
5. upload the tested ZIP and checksum;
6. publish the draft;
7. use GitHub release verification;
8. re-download ZIP/checksum as a consumer would;
9. verify SHA-256 and structure again;
10. install/smoke the re-downloaded ZIP.

Only completion of step 10 permits `PUBLISHED_AND_VERIFIED`. Upload success alone is not success.

GitHub immutable releases lock the release assets and tag after publication and automatically create GitHub's release attestation. V1 therefore does not add custom Sigstore/cosign machinery. SHA-256 remains required and is an integrity check, not by itself proof of trusted origin.

## Changelog

`CHANGELOG.md` keeps the repository's `[Unreleased]` model. Publication snapshots that section deterministically into the GitHub Release notes; the workflow does not mutate approved source after qualification merely to rename a heading. Before a later release, ordinary reviewed development changes must advance `[Unreleased]`; stale/duplicate target release state is rejected.

## Failure recovery

If qualification or candidate validation fails, fix the source through the normal PR path and run the Owner action again after integration.

If an irreversible publication step has already occurred, do **not** move the tag, replace assets, or silently reuse the version. Preserve the workflow/release evidence, identify exactly what was published, stop further promotion, and prepare a corrected new release/version. Do not automate destructive withdrawal. GitHub documents that deleting an immutable release may permit tag deletion but its tag name cannot be reused; any such destructive action requires a separate explicit Owner decision.

A run that published but failed last-mile verification must be reported as `PUBLISHED_BUT_VERIFICATION_FAILED`, never as complete.

## Evidence boundary

Dry-run qualification proves release-system logic, deterministic packaging, candidate validation, exact-ZIP installation and source-bound CI/runtime gates without producing a tag or GitHub Release. It cannot prove the first real GitHub publication/immutability/consumer download path until production publication is separately authorized.
