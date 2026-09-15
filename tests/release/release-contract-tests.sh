#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

expect_fail() {
    if "$@" >/dev/null 2>&1; then
        echo "Expected command to fail: $*" >&2
        exit 1
    fi
}

require_marker() {
    grep -Fq "$2" "$1" || { echo "Missing marker '$2' in $1" >&2; exit 1; }
}

plugin_version() {
    sed -n 's/^[[:space:]]*\*[[:space:]]*Version:[[:space:]]*//p' "$1/gravity-presentation-profiles.php" | head -n1 | tr -d '\r'
}

addon_version() {
    awk -F"'" '/protected[[:space:]]+\$_version[[:space:]]*=/{print $2; exit}' "$1/src/GravityForms/AddOn.php" | tr -d '\r'
}

mkdir -p "$WORK/dev-source"
git -C "$ROOT" archive HEAD | tar -x -C "$WORK/dev-source"
cp -a "$WORK/dev-source" "$WORK/source"
php "$ROOT/scripts/release/prepare-candidate.php" --root="$WORK/source" --version=9.8.7 --date=2030-01-02 >/dev/null

[[ "$(plugin_version "$WORK/source")" == '9.8.7' ]]
[[ "$(addon_version "$WORK/source")" == '9.8.7' ]]
grep -Fq '## [9.8.7] - 2030-01-02' "$WORK/source/CHANGELOG.md"
expect_fail php "$ROOT/scripts/release/prepare-candidate.php" --root="$WORK/source" --version=9.8.8 --date=2030-01-03
expect_fail php "$ROOT/scripts/release/prepare-candidate.php" --root="$WORK/source" --version=0.0.0 --date=2030-01-03

# Reproduce the original workflow-relative output path. This intentionally runs
# from the prepared repository root with the same relative build/release output.
(
    cd "$WORK/source"
    bash "$ROOT/scripts/release/build-release.sh" . 9.8.7 build/release | head -n1 > "$WORK/relative-zip-path.txt"
)
ZIP_RELATIVE="$(cat "$WORK/relative-zip-path.txt")"
EXPECTED_RELATIVE="$WORK/source/build/release/gravity-presentation-profiles-9.8.7.zip"
[[ "$ZIP_RELATIVE" == "$EXPECTED_RELATIVE" ]] || { echo "Relative output resolved incorrectly: $ZIP_RELATIVE" >&2; exit 1; }
[[ -s "$EXPECTED_RELATIVE" ]]
[[ -s "$EXPECTED_RELATIVE.sha256" ]]

mkdir -p "$WORK/build-absolute-a" "$WORK/build-absolute-b"
ZIP_ABSOLUTE_A="$(bash "$ROOT/scripts/release/build-release.sh" "$WORK/source" 9.8.7 "$WORK/build-absolute-a" | head -n1)"
ZIP_ABSOLUTE_B="$(bash "$ROOT/scripts/release/build-release.sh" "$WORK/source" 9.8.7 "$WORK/build-absolute-b" | head -n1)"
SHA_RELATIVE="$(sha256sum "$ZIP_RELATIVE" | awk '{print $1}')"
SHA_ABSOLUTE_A="$(sha256sum "$ZIP_ABSOLUTE_A" | awk '{print $1}')"
SHA_ABSOLUTE_B="$(sha256sum "$ZIP_ABSOLUTE_B" | awk '{print $1}')"
[[ "$SHA_RELATIVE" == "$SHA_ABSOLUTE_A" && "$SHA_ABSOLUTE_A" == "$SHA_ABSOLUTE_B" ]] || {
    echo 'Relative/absolute canonical builder outputs are not byte-identical.' >&2
    exit 1
}
bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$ZIP_RELATIVE" 9.8.7 "$SHA_RELATIVE" >/dev/null
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$ZIP_RELATIVE" 9.8.7 "$(printf '0%.0s' {1..64})"

MIRROR="$WORK/mirror"
cp -a "$WORK/source" "$MIRROR"
sed -i 's/9\.8\.7/9.8.6/' "$MIRROR/src/GravityForms/AddOn.php"
expect_fail bash "$ROOT/scripts/release/build-release.sh" "$MIRROR" 9.8.7 "$WORK/mirror-build"

mutate_zip() {
    local source_zip="$1" target_zip="$2" mutation="$3"
    local dir="$WORK/mutation-$mutation"
    rm -rf "$dir" && mkdir -p "$dir"
    unzip -q "$source_zip" -d "$dir"
    case "$mutation" in
        forbidden) mkdir -p "$dir/gravity-presentation-profiles/tests"; echo '<?php' > "$dir/gravity-presentation-profiles/tests/forbidden.php" ;;
        missing) rm -f "$dir/gravity-presentation-profiles/src/Bootstrap.php" ;;
        wrong-version) sed -i 's/Version: 9.8.7/Version: 9.8.6/' "$dir/gravity-presentation-profiles/gravity-presentation-profiles.php" ;;
    esac
    ( cd "$dir" && find gravity-presentation-profiles -type f -print0 | LC_ALL=C sort -z | xargs -0 zip -X -q "$target_zip" )
}

mutate_zip "$ZIP_RELATIVE" "$WORK/forbidden.zip" forbidden
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/forbidden.zip" 9.8.7
mutate_zip "$ZIP_RELATIVE" "$WORK/missing.zip" missing
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/missing.zip" 9.8.7
mutate_zip "$ZIP_RELATIVE" "$WORK/wrong-version.zip" wrong-version
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/wrong-version.zip" 9.8.7
head -c 64 "$ZIP_RELATIVE" > "$WORK/corrupt.zip"
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/corrupt.zip" 9.8.7

php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$ROOT" --mode=dry-run > "$WORK/blockers.json"
require_marker "$WORK/blockers.json" 'missing_license'
require_marker "$WORK/blockers.json" 'missing_compatibility_policy'
require_marker "$WORK/blockers.json" 'development_source_version'
expect_fail php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$ROOT" --mode=publish

# Compatibility values remain Owner-selected. These are test-only synthetic versions.
PREREQ="$WORK/prereq"
cp -a "$WORK/dev-source" "$PREREQ"
echo 'synthetic test license' > "$PREREQ/LICENSE"
mkdir -p "$PREREQ/release"
cp "$ROOT/release/compatibility.example.json" "$PREREQ/release/compatibility.json"
php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=dry-run > "$WORK/compat-example.json"
require_marker "$WORK/compat-example.json" 'invalid_compatibility_policy:wordpress_min'
expect_fail php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=publish

for bad in 'OWNER_DECISION_REQUIRED' 'x' '' '8' '08.2' '3..1' '3.1-beta'; do
    cat > "$PREREQ/release/compatibility.json" <<JSON
{"wordpress_min":"$bad","php_min":"99.2","gravity_forms_min":"99.3.4","gravity_flow_min":"99.4.5.6"}
JSON
    php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=dry-run > "$WORK/compat-invalid.json"
    require_marker "$WORK/compat-invalid.json" 'invalid_compatibility_policy:wordpress_min'
    expect_fail php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=publish
done

cat > "$PREREQ/release/compatibility.json" <<'JSON'
{"wordpress_min":"99.1","php_min":"99.2","gravity_forms_min":"99.3.4","gravity_flow_min":"99.4.5.6"}
JSON
php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=publish > "$WORK/compat-valid.json"
require_marker "$WORK/compat-valid.json" '"publication_ready": true'

rm "$PREREQ/LICENSE"
php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=dry-run > "$WORK/license-blocker.json"
require_marker "$WORK/license-blocker.json" 'missing_license'
echo 'synthetic test license' > "$PREREQ/LICENSE"

PRODUCTION_START="$WORK/production-start"
cp -a "$PREREQ" "$PRODUCTION_START"
php "$ROOT/scripts/release/prepare-candidate.php" --root="$PRODUCTION_START" --version=9.8.7 --date=2030-01-02 >/dev/null
php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PRODUCTION_START" --mode=dry-run > "$WORK/production-start.json"
require_marker "$WORK/production-start.json" 'production_version_already_prepared'
if php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PRODUCTION_START" --mode=publish > "$WORK/production-start-publish.json"; then
    echo 'Production-versioned starting main unexpectedly passed publish prerequisites.' >&2
    exit 1
fi
require_marker "$WORK/production-start-publish.json" 'production_version_source_requires_recovery'

cat > "$WORK/tags-empty.json" <<'JSON'
[]
JSON
[[ "$(php "$ROOT/scripts/release/resolve-version.php" --intent=first --first-version=1.2.3 --tags-json="$WORK/tags-empty.json")" == '1.2.3' ]]
expect_fail php "$ROOT/scripts/release/resolve-version.php" --intent=patch --tags-json="$WORK/tags-empty.json"
cat > "$WORK/tags.json" <<'JSON'
[{"name":"v1.4.2"},{"name":"v1.3.9"}]
JSON
[[ "$(php "$ROOT/scripts/release/resolve-version.php" --intent=patch --tags-json="$WORK/tags.json")" == '1.4.3' ]]
[[ "$(php "$ROOT/scripts/release/resolve-version.php" --intent=minor --tags-json="$WORK/tags.json")" == '1.5.0' ]]
[[ "$(php "$ROOT/scripts/release/resolve-version.php" --intent=major --tags-json="$WORK/tags.json")" == '2.0.0' ]]
expect_fail php "$ROOT/scripts/release/resolve-version.php" --intent=first --first-version=2.0.0 --tags-json="$WORK/tags.json"

SOURCE_SHA='1111111111111111111111111111111111111111'
cat > "$WORK/conflict-tags.json" <<'JSON'
[{"name":"v9.8.7","commit":{"sha":"1111111111111111111111111111111111111111"}}]
JSON
cat > "$WORK/no-releases.json" <<'JSON'
[]
JSON
expect_fail php "$ROOT/scripts/release/check-conflicts.php" --version=9.8.7 --source-sha="$SOURCE_SHA" --tags-json="$WORK/conflict-tags.json" --releases-json="$WORK/no-releases.json"
cat > "$WORK/no-tags.json" <<'JSON'
[]
JSON
cat > "$WORK/conflict-releases.json" <<'JSON'
[{"tag_name":"v9.8.7","assets":[]}]
JSON
expect_fail php "$ROOT/scripts/release/check-conflicts.php" --version=9.8.7 --source-sha="$SOURCE_SHA" --tags-json="$WORK/no-tags.json" --releases-json="$WORK/conflict-releases.json"
php "$ROOT/scripts/release/check-conflicts.php" --version=9.8.7 --source-sha="$SOURCE_SHA" --tags-json="$WORK/no-tags.json" --releases-json="$WORK/no-releases.json" >/dev/null

php "$ROOT/scripts/release/check-identity.php" --approved="$SOURCE_SHA" --qualified="$SOURCE_SHA" --artifact="$SOURCE_SHA" --tag="$SOURCE_SHA" --release="$SOURCE_SHA" >/dev/null
expect_fail php "$ROOT/scripts/release/check-identity.php" --approved="$SOURCE_SHA" --qualified="$SOURCE_SHA" --artifact="$SOURCE_SHA" --tag='2222222222222222222222222222222222222222' --release="$SOURCE_SHA"

# Model successful release identity followed by deterministic dev continuation.
LIFECYCLE="$WORK/lifecycle"
cp -a "$WORK/dev-source" "$LIFECYCLE"
php "$ROOT/scripts/release/prepare-candidate.php" --root="$LIFECYCLE" --version=9.8.7 --date=2030-01-02 >/dev/null
git -C "$LIFECYCLE" init -q
git -C "$LIFECYCLE" config user.name release-test
git -C "$LIFECYCLE" config user.email release-test@example.invalid
git -C "$LIFECYCLE" add .
git -C "$LIFECYCLE" commit -q -m candidate
CANDIDATE_SHA="$(git -C "$LIFECYCLE" rev-parse HEAD)"
git -C "$LIFECYCLE" tag v9.8.7 "$CANDIDATE_SHA"
CHANGELOG_SHA="$(sha256sum "$LIFECYCLE/CHANGELOG.md" | awk '{print $1}')"
php "$ROOT/scripts/release/prepare-development-continuation.php" --root="$LIFECYCLE" --released-version=9.8.7 >/dev/null
[[ "$(plugin_version "$LIFECYCLE")" == '0.0.0-dev' ]]
[[ "$(addon_version "$LIFECYCLE")" == '0.0.0-dev' ]]
[[ "$(sha256sum "$LIFECYCLE/CHANGELOG.md" | awk '{print $1}')" == "$CHANGELOG_SHA" ]]
grep -Fq '## [9.8.7] - 2030-01-02' "$LIFECYCLE/CHANGELOG.md"
git -C "$LIFECYCLE" diff --name-only | sort > "$WORK/continuation-files.txt"
printf '%s\n' gravity-presentation-profiles.php src/GravityForms/AddOn.php | sort > "$WORK/expected-continuation-files.txt"
diff -u "$WORK/expected-continuation-files.txt" "$WORK/continuation-files.txt"
git -C "$LIFECYCLE" add gravity-presentation-profiles.php src/GravityForms/AddOn.php
git -C "$LIFECYCLE" commit -q -m continuation
CONTINUATION_SHA="$(git -C "$LIFECYCLE" rev-parse HEAD)"
[[ "$(git -C "$LIFECYCLE" rev-parse HEAD^)" == "$CANDIDATE_SHA" ]]
[[ "$(git -C "$LIFECYCLE" rev-parse v9.8.7)" == "$CANDIDATE_SHA" ]]

REMOTE="$WORK/release-remote.git"
git init --bare -q "$REMOTE"
git -C "$LIFECYCLE" remote add origin "$REMOTE"
git -C "$LIFECYCLE" push -q origin "$CANDIDATE_SHA:refs/heads/main"
[[ "$(git --git-dir="$REMOTE" rev-parse refs/heads/main)" == "$CANDIDATE_SHA" ]]
git -C "$LIFECYCLE" push -q origin "$CONTINUATION_SHA:refs/heads/main"
[[ "$(git --git-dir="$REMOTE" rev-parse refs/heads/main)" == "$CONTINUATION_SHA" ]]
[[ "$(git -C "$LIFECYCLE" rev-parse v9.8.7)" == "$CANDIDATE_SHA" ]]

# A moved main must reject the normal non-force continuation push.
RACE="$WORK/race"
cp -a "$WORK/dev-source" "$RACE"
php "$ROOT/scripts/release/prepare-candidate.php" --root="$RACE" --version=9.8.7 --date=2030-01-02 >/dev/null
git -C "$RACE" init -q
git -C "$RACE" config user.name release-test
git -C "$RACE" config user.email release-test@example.invalid
git -C "$RACE" add .
git -C "$RACE" commit -q -m candidate
RACE_CANDIDATE="$(git -C "$RACE" rev-parse HEAD)"
git -C "$RACE" tag v9.8.7 "$RACE_CANDIDATE"
RACE_REMOTE="$WORK/race-remote.git"
git init --bare -q "$RACE_REMOTE"
git -C "$RACE" remote add origin "$RACE_REMOTE"
git -C "$RACE" push -q origin "$RACE_CANDIDATE:refs/heads/main"
php "$ROOT/scripts/release/prepare-development-continuation.php" --root="$RACE" --released-version=9.8.7 >/dev/null
git -C "$RACE" add gravity-presentation-profiles.php src/GravityForms/AddOn.php
git -C "$RACE" commit -q -m continuation
RACE_CONTINUATION="$(git -C "$RACE" rev-parse HEAD)"
git -C "$RACE" branch continuation "$RACE_CONTINUATION"
git -C "$RACE" checkout -q -b concurrent "$RACE_CANDIDATE"
echo concurrent > "$RACE/concurrent-main-move.txt"
git -C "$RACE" add concurrent-main-move.txt
git -C "$RACE" commit -q -m concurrent-main-move
MOVED_MAIN="$(git -C "$RACE" rev-parse HEAD)"
git -C "$RACE" push -q origin HEAD:refs/heads/main
expect_fail git -C "$RACE" push origin "$RACE_CONTINUATION:refs/heads/main"
[[ "$(git --git-dir="$RACE_REMOTE" rev-parse refs/heads/main)" == "$MOVED_MAIN" ]]
[[ "$(git -C "$RACE" rev-parse v9.8.7)" == "$RACE_CANDIDATE" ]]

WORKFLOW="$ROOT/.github/workflows/release.yml"
grep -Fq 'cancel-in-progress: false' "$WORKFLOW"
grep -Fq "github.event_name == 'workflow_dispatch' && inputs.mode == 'publish'" "$WORKFLOW"
grep -Fq 'GPP_RELEASE_ADMIN_READ_TOKEN' "$WORKFLOW"
grep -Fq 'ref: ${{ github.sha }}' "$WORKFLOW"
grep -Fq 'prepare-development-continuation.php' "$WORKFLOW"
grep -Fq 'GPP_RELEASE_PUBLISHED_AND_VERIFIED' "$WORKFLOW"
if grep -Fq 'pull_request_target:' "$WORKFLOW"; then
    echo 'Release workflow must not use pull_request_target.' >&2
    exit 1
fi

grep -Fq 'workflow_dispatch:' "$ROOT/.github/workflows/ci.yml"
printf 'GPP_RELEASE_CONTRACT_TESTS_PASS zip_sha256=%s candidate=%s continuation=%s\n' "$SHA_RELATIVE" "$CANDIDATE_SHA" "$CONTINUATION_SHA"
