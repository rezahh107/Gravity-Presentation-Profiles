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

mkdir -p "$WORK/source"
git -C "$ROOT" archive HEAD | tar -x -C "$WORK/source"
php "$ROOT/scripts/release/prepare-candidate.php" --root="$WORK/source" --version=9.8.7 --date=2030-01-02 >/dev/null

[[ "$(sed -n 's/^[[:space:]]*\*[[:space:]]*Version:[[:space:]]*//p' "$WORK/source/gravity-presentation-profiles.php" | head -n1)" == '9.8.7' ]]
grep -Fq "protected \$_version     = '9.8.7';" "$WORK/source/src/GravityForms/AddOn.php"
grep -Fq '## [9.8.7] - 2030-01-02' "$WORK/source/CHANGELOG.md"
expect_fail php "$ROOT/scripts/release/prepare-candidate.php" --root="$WORK/source" --version=9.8.8 --date=2030-01-03
expect_fail php "$ROOT/scripts/release/prepare-candidate.php" --root="$WORK/source" --version=0.0.0 --date=2030-01-03

mkdir -p "$WORK/build-a" "$WORK/build-b"
ZIP_A="$(bash "$ROOT/scripts/release/build-release.sh" "$WORK/source" 9.8.7 "$WORK/build-a" | head -n1)"
ZIP_B="$(bash "$ROOT/scripts/release/build-release.sh" "$WORK/source" 9.8.7 "$WORK/build-b" | head -n1)"
SHA_A="$(sha256sum "$ZIP_A" | awk '{print $1}')"
SHA_B="$(sha256sum "$ZIP_B" | awk '{print $1}')"
[[ "$SHA_A" == "$SHA_B" ]] || { echo 'Canonical builder is not reproducible.' >&2; exit 1; }
bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$ZIP_A" 9.8.7 "$SHA_A" >/dev/null
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$ZIP_A" 9.8.7 "$(printf '0%.0s' {1..64})"

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

mutate_zip "$ZIP_A" "$WORK/forbidden.zip" forbidden
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/forbidden.zip" 9.8.7
mutate_zip "$ZIP_A" "$WORK/missing.zip" missing
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/missing.zip" 9.8.7
mutate_zip "$ZIP_A" "$WORK/wrong-version.zip" wrong-version
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/wrong-version.zip" 9.8.7
head -c 64 "$ZIP_A" > "$WORK/corrupt.zip"
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/corrupt.zip" 9.8.7

php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$ROOT" --mode=dry-run > "$WORK/blockers.json"
require_marker "$WORK/blockers.json" 'missing_license'
require_marker "$WORK/blockers.json" 'missing_compatibility_policy'
require_marker "$WORK/blockers.json" 'development_source_version'
expect_fail php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$ROOT" --mode=publish

PREREQ="$WORK/prereq"
cp -a "$WORK/source" "$PREREQ"
echo 'synthetic test license' > "$PREREQ/LICENSE"
php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=dry-run > "$WORK/compat-blocker.json"
require_marker "$WORK/compat-blocker.json" 'missing_compatibility_policy'
mkdir -p "$PREREQ/release"
cat > "$PREREQ/release/compatibility.json" <<'JSON'
{"wordpress_min":"x","php_min":"x","gravity_forms_min":"x","gravity_flow_min":"x"}
JSON
rm "$PREREQ/LICENSE"
php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=dry-run > "$WORK/license-blocker.json"
require_marker "$WORK/license-blocker.json" 'missing_license'

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

WORKFLOW="$ROOT/.github/workflows/release.yml"
grep -Fq 'cancel-in-progress: false' "$WORKFLOW"
grep -Fq "github.event_name == 'workflow_dispatch' && inputs.mode == 'publish'" "$WORKFLOW"
grep -Fq 'GPP_RELEASE_ADMIN_READ_TOKEN' "$WORKFLOW"
grep -Fq 'ref: ${{ github.sha }}' "$WORKFLOW"
if grep -Fq 'pull_request_target:' "$WORKFLOW"; then
    echo 'Release workflow must not use pull_request_target.' >&2
    exit 1
fi

grep -Fq 'workflow_dispatch:' "$ROOT/.github/workflows/ci.yml"
printf 'GPP_RELEASE_CONTRACT_TESTS_PASS zip_sha256=%s\n' "$SHA_A"
