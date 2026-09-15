#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
source "$root/scripts/release/release-lib.sh"
fail_test() { echo "RELEASE_SYSTEM_CONTRACT_FAIL: $*" >&2; exit 1; }
expect_fail() { if "$@" >/tmp/gpp-release-neg.out 2>&1; then cat /tmp/gpp-release-neg.out >&2; fail_test "expected failure: $*"; fi; }

assert_source_version_mirrors
[[ "$(source_plugin_version)" == "0.0.0-dev" ]] || fail_test "source development version changed unexpectedly"
is_stable_version 1.2.3 || fail_test "stable version rejected"
! is_stable_version 0.0.0-dev || fail_test "development version admitted as production"
! is_stable_version 01.2.3 || fail_test "leading-zero production version admitted"
[[ "$(next_version 1.2.3 patch)" == "1.2.4" ]]
[[ "$(next_version 1.2.3 minor)" == "1.3.0" ]]
[[ "$(next_version 1.2.3 major)" == "2.0.0" ]]
expect_fail next_version 1.2.3 banana
expect_fail assert_source_identity abc def
expect_fail assert_qualified FAIL
expect_fail env GPP_RELEASE_MODE=dry-run GPP_RELEASE_AUTHORIZED=true "$root/scripts/release/guard-publication.sh"

blockers="$(publication_blockers)"
grep -q 'LICENSE_OWNER_DECISION_PENDING' <<<"$blockers" || fail_test "missing license blocker"
grep -q 'COMPATIBILITY_POLICY_OWNER_DECISION_PENDING' <<<"$blockers" || fail_test "missing compatibility blocker"
grep -q 'FIRST_PUBLIC_VERSION_OWNER_DECISION_PENDING' <<<"$blockers" || fail_test "missing first-public-version blocker"

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
export SOURCE_DATE_EPOCH=1700000000
export GPP_RELEASE_SOURCE_SHA="$(git -C "$root" rev-parse HEAD)"
"$root/scripts/release/build-release.sh" 0.0.0-dryrun.contract "$work/a" >/dev/null
"$root/scripts/release/build-release.sh" 0.0.0-dryrun.contract "$work/b" >/dev/null
zip_a="$work/a/gravity-presentation-profiles-0.0.0-dryrun.contract.zip"
zip_b="$work/b/gravity-presentation-profiles-0.0.0-dryrun.contract.zip"
sha_a="$(sha256sum "$zip_a" | awk '{print $1}')"
sha_b="$(sha256sum "$zip_b" | awk '{print $1}')"
[[ "$sha_a" == "$sha_b" ]] || fail_test "canonical builder is not reproducible"
"$root/scripts/release/validate-release.sh" "$zip_a" 0.0.0-dryrun.contract "$GPP_RELEASE_SOURCE_SHA" >/dev/null
"$root/scripts/release/verify-checksum.sh" "$zip_a" "$work/a/$(basename "$zip_a").sha256" >/dev/null
printf 'deadbeef  %s\n' "$(basename "$zip_a")" > "$work/bad.sha256"
expect_fail "$root/scripts/release/verify-checksum.sh" "$zip_a" "$work/bad.sha256"

mkdir "$work/mut"; unzip -q "$zip_a" -d "$work/mut"
rm "$work/mut/gravity-presentation-profiles/src/Bootstrap.php"
(cd "$work/mut" && zip -X -qr "$work/missing.zip" gravity-presentation-profiles)
expect_fail "$root/scripts/release/validate-release.sh" "$work/missing.zip" 0.0.0-dryrun.contract "$GPP_RELEASE_SOURCE_SHA"

rm -rf "$work/mut"; mkdir "$work/mut"; unzip -q "$zip_a" -d "$work/mut"
mkdir -p "$work/mut/gravity-presentation-profiles/tests"; echo '<?php' > "$work/mut/gravity-presentation-profiles/tests/forbidden.php"
(cd "$work/mut" && zip -X -qr "$work/forbidden.zip" gravity-presentation-profiles)
expect_fail "$root/scripts/release/validate-release.sh" "$work/forbidden.zip" 0.0.0-dryrun.contract "$GPP_RELEASE_SOURCE_SHA"

rm -rf "$work/mut"; mkdir "$work/mut"; unzip -q "$zip_a" -d "$work/mut"
sed -i 's/Version: 0.0.0-dryrun.contract/Version: 9.9.9/' "$work/mut/gravity-presentation-profiles/gravity-presentation-profiles.php"
(cd "$work/mut" && zip -X -qr ""work/wrong-version.zip" gravity-presentation-profiles)
expect_fail "$root/scripts/release/validate-release.sh" "$work/wrong-version.zip" 0.0.0-dryrun.contract "$GPP_RELEASE_SOURCE_SHA"
printf 'not a zip' > "$work/corrupt.zip"
expect_fail "$root/scripts/release/validate-release.sh" "$work/corrupt.zip" 0.0.0-dryrun.contract "$GPP_RELEASE_SOURCE_SHA"

printf '[{"name":"v1.2.3"}]' > "$work/tags-conflict.json"
printf '[]' > "$work/releases-empty.json"
expect_fail php "$root/scripts/release/check-release-conflicts.php" 1.2.3 "$work/tags-conflict.json" "$work/releases-empty.json" gravity-presentation-profiles-1.2.3.zip
printf '[]' > "$work/tags-empty.json"
printf '[{"tag_name":"v1.2.3","assets":[]}]' > "$work/releases-conflict.json"
expect_fail php "$root/scripts/release/check-release-conflicts.php" 1.2.3 "$work/tags-empty.json" "$work/releases-conflict.json" gravity-presentation-profiles-1.2.3.zip
printf '[{"tag_name":"v9.9.9","assets":[{"name":"gravity-presentation-profiles-1.2.3.zip"}]}]' > "$work/releases-asset.json"
expect_fail php "$root/scripts/release/check-release-conflicts.php" 1.2.3 "$work/tags-empty.json" "$work/releases-asset.json" gravity-presentation-profiles-1.2.3.zip
php "$root/scripts/release/check-release-conflicts.php" 1.2.3 "$work/tags-empty.json" "$work/releases-empty.json" gravity-presentation-profiles-1.2.3.zip >/dev/null


# Source mirror mismatch must fail closed.
mirror_root="$work/mirror-root"
mkdir -p "$mirror_root/src/GravityForms" "$mirror_root/release"
cp "$root/release/release-policy.json" "$mirror_root/release/release-policy.json"
cp "$root/gravity-presentation-profiles.php" "$mirror_root/gravity-presentation-profiles.php"
cp "$root/src/GravityForms/AddOn.php" "$mirror_root/src/GravityForms/AddOn.php"
sed -i "0,/0.0.0-dev/s//9.9.9/" "$mirror_root/src/GravityForms/AddOn.php"
expect_fail env GPP_RELEASE_ROOT="$mirror_root" bash -c 'source "$1/scripts/release/release-lib.sh"; assert_source_version_mirrors' _ "$root"
expect_fail bash -c 'source "$1/scripts/release/release-lib.sh"; resolve_release_version "" patch' _ "$root"

# Changelog duplicate/stale target identity must fail.
changelog_root="$work/changelog-root"
mkdir -p "$changelog_root/release"
cp "$root/release/release-policy.json" "$changelog_root/release/release-policy.json"
cp "$root/CHANGELOG.md" "$changelog_root/CHANGELOG.md"
printf '\n## [9.9.9]\n\n- prior release\n' >> "$changelog_root/CHANGELOG.md"
expect_fail env GPP_RELEASE_ROOT="$changelog_root" "$root/scripts/release/render-release-notes.sh" 9.9.9 "$work/stale-notes.md"

notes="$work/notes.md"
"$root/scripts/release/render-release-notes.sh" 9.9.9 "$notes"
grep -q '^# Gravity Presentation Profiles 9.9.9$' "$notes" || fail_test "release notes heading missing"
grep -q 'Generic product architecture' "$notes" || fail_test "unreleased changelog body missing"

# Static workflow safety: dry-run and publication are explicitly separated and production mutations are guarded.
grep -q 'GPP_RELEASE_MODE: publish' "$root/.github/workflows/release.yml"
grep -q 'guard-publication.sh' "$root/.github/workflows/release.yml"
grep -q 'cancel-in-progress: false' "$root/.github/workflows/release.yml"
grep -q 'contents: write' "$root/.github/workflows/release.yml"

echo RELEASE_SYSTEM_CONTRACT_TESTS_PASS
