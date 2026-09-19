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
cmp -s "$WORK/dev-source/LICENSE" "$WORK/source/LICENSE"
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

unzip -Z1 "$ZIP_RELATIVE" > "$WORK/zip-files.txt"
grep -Fxq 'gravity-presentation-profiles/LICENSE' "$WORK/zip-files.txt"
# The selectable Full Width variant is production runtime, not test/reference
# material. The canonical ZIP must contain its isolated stylesheet and runtime
# adapters while continuing to exclude the browser/contract test sources.
grep -Fxq 'gravity-presentation-profiles/assets/css/srwf-gravity-flow-entry-detail-full-width.css' "$WORK/zip-files.txt"
grep -Fxq 'gravity-presentation-profiles/src/SRWF/GravityFlow/EntryDetailFullWidthPresentationAdapter.php' "$WORK/zip-files.txt"
grep -Fxq 'gravity-presentation-profiles/src/GravityForms/EntryDetailVisualVariantService.php' "$WORK/zip-files.txt"
unzip -p "$ZIP_RELATIVE" gravity-presentation-profiles/LICENSE > "$WORK/packaged-license"
cmp -s "$WORK/source/LICENSE" "$WORK/packaged-license"
for forbidden_file in README.md AGENTS.md CHANGELOG.md SECURITY.md composer.json; do
    if grep -Fxq "gravity-presentation-profiles/$forbidden_file" "$WORK/zip-files.txt"; then
        echo "Development-only file unexpectedly shipped: $forbidden_file" >&2
        exit 1
    fi
done
if grep -Eq '^gravity-presentation-profiles/(\.github|tests|docs|scripts|release)/' "$WORK/zip-files.txt"; then
    echo 'Development-only directory unexpectedly shipped.' >&2
    exit 1
fi

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
        missing-license) rm -f "$dir/gravity-presentation-profiles/LICENSE" ;;
        wrong-license) printf '%s\n' 'mutated license bytes' > "$dir/gravity-presentation-profiles/LICENSE" ;;
    esac
    ( cd "$dir" && find gravity-presentation-profiles -type f -print0 | LC_ALL=C sort -z | xargs -0 zip -X -q "$target_zip" )
}

mutate_zip "$ZIP_RELATIVE" "$WORK/forbidden.zip" forbidden
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/forbidden.zip" 9.8.7
mutate_zip "$ZIP_RELATIVE" "$WORK/missing.zip" missing
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/missing.zip" 9.8.7
mutate_zip "$ZIP_RELATIVE" "$WORK/wrong-version.zip" wrong-version
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/wrong-version.zip" 9.8.7
mutate_zip "$ZIP_RELATIVE" "$WORK/missing-license.zip" missing-license
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/missing-license.zip" 9.8.7
mutate_zip "$ZIP_RELATIVE" "$WORK/wrong-license.zip" wrong-license
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/wrong-license.zip" 9.8.7
head -c 64 "$ZIP_RELATIVE" > "$WORK/corrupt.zip"
expect_fail bash "$ROOT/scripts/release/validate-release.sh" "$WORK/source" "$WORK/corrupt.zip" 9.8.7

php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$ROOT" --mode=dry-run > "$WORK/prerequisites.json"
require_marker "$WORK/prerequisites.json" '"publication_ready": true'
require_marker "$WORK/prerequisites.json" '"blockers": []'
require_marker "$WORK/prerequisites.json" 'development_source_version'
require_marker "$WORK/prerequisites.json" '"wordpress_min": "6.8.3"'
require_marker "$WORK/prerequisites.json" '"php_min": "8.2"'
require_marker "$WORK/prerequisites.json" '"gravity_forms_min": "3.1.1.1"'
require_marker "$WORK/prerequisites.json" '"gravity_flow_min": "3.1.0"'
if grep -Fq 'missing_license' "$WORK/prerequisites.json" || grep -Fq 'missing_compatibility_policy' "$WORK/prerequisites.json"; then
    echo 'Resolved release prerequisites unexpectedly report an implementation-time blocker.' >&2
    exit 1
fi
php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$ROOT" --mode=publish > "$WORK/prerequisites-publish.json"
require_marker "$WORK/prerequisites-publish.json" '"publication_ready": true'

PREREQ="$WORK/prereq"
cp -a "$WORK/dev-source" "$PREREQ"

# The unresolved example remains a template and must continue to fail closed.
cp "$ROOT/release/compatibility.example.json" "$PREREQ/release/compatibility.json"
php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=dry-run > "$WORK/compat-example.json"
require_marker "$WORK/compat-example.json" 'invalid_compatibility_policy:wordpress_min'
expect_fail php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=publish
cp "$ROOT/release/compatibility.json" "$PREREQ/release/compatibility.json"

# Missing and empty LICENSE remain hard blockers.
rm "$PREREQ/LICENSE"
php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=dry-run > "$WORK/license-missing.json"
require_marker "$WORK/license-missing.json" 'missing_license'
expect_fail php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=publish
: > "$PREREQ/LICENSE"
php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=dry-run > "$WORK/license-empty.json"
require_marker "$WORK/license-empty.json" 'missing_license'
expect_fail php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=publish
cp "$ROOT/LICENSE" "$PREREQ/LICENSE"

# Missing compatibility policy remains a hard blocker.
rm "$PREREQ/release/compatibility.json"
php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=dry-run > "$WORK/compat-missing.json"
require_marker "$WORK/compat-missing.json" 'missing_compatibility_policy'
expect_fail php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=publish
cp "$ROOT/release/compatibility.json" "$PREREQ/release/compatibility.json"

# Every required compatibility key is independently fail-closed when absent.
for key in wordpress_min php_min gravity_forms_min gravity_flow_min; do
    php -r '$d=json_decode(file_get_contents($argv[1]),true); unset($d[$argv[2]]); file_put_contents($argv[3],json_encode($d));' \
        "$ROOT/release/compatibility.json" "$key" "$PREREQ/release/compatibility.json"
    php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=dry-run > "$WORK/compat-key-missing.json"
    require_marker "$WORK/compat-key-missing.json" "invalid_compatibility_policy:$key"
    expect_fail php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=publish
done

# Placeholder/malformed values remain rejected for every compatibility authority key.
for key in wordpress_min php_min gravity_forms_min gravity_flow_min; do
    for bad in 'OWNER_DECISION_REQUIRED' 'x' '' '8' '08.2' '3..1' '3.1-beta'; do
        php -r '$d=json_decode(file_get_contents($argv[1]),true); $d[$argv[2]]=$argv[3]; file_put_contents($argv[4],json_encode($d));' \
            "$ROOT/release/compatibility.json" "$key" "$bad" "$PREREQ/release/compatibility.json"
        php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=dry-run > "$WORK/compat-invalid.json"
        require_marker "$WORK/compat-invalid.json" "invalid_compatibility_policy:$key"
        expect_fail php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=publish
    done
done
cp "$ROOT/release/compatibility.json" "$PREREQ/release/compatibility.json"

# WordPress/PHP plugin metadata is a checked mirror of compatibility authority.
sed -i 's/Requires PHP: 8\.2/Requires PHP: 8.3/' "$PREREQ/gravity-presentation-profiles.php"
php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=dry-run > "$WORK/metadata-mismatch.json"
require_marker "$WORK/metadata-mismatch.json" 'compatibility_metadata_mismatch:php_min'
expect_fail php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=publish
cp "$ROOT/gravity-presentation-profiles.php" "$PREREQ/gravity-presentation-profiles.php"

php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$PREREQ" --mode=publish > "$WORK/compat-valid.json"
require_marker "$WORK/compat-valid.json" '"publication_ready": true'

# Invalid development source state remains fail-closed.
INVALID_SOURCE="$WORK/invalid-source"
cp -a "$PREREQ" "$INVALID_SOURCE"
sed -i 's/Version: 0\.0\.0-dev/Version: invalid-version/' "$INVALID_SOURCE/gravity-presentation-profiles.php"
php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$INVALID_SOURCE" --mode=dry-run > "$WORK/invalid-source.json"
require_marker "$WORK/invalid-source.json" 'invalid_source_version_state'
expect_fail php "$ROOT/scripts/release/check-publication-prerequisites.php" --root="$INVALID_SOURCE" --mode=publish

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
[{"name":"v2.0.0"}]
JSON
cat > "$WORK/conflict-releases.json" <<'JSON'
[]
JSON
expect_fail php "$ROOT/scripts/release/check-conflicts.php" --version=2.0.0 --source-sha="$SOURCE_SHA" --tags-json="$WORK/conflict-tags.json" --releases-json="$WORK/conflict-releases.json"

cat > "$WORK/conflict-tags.json" <<'JSON'
[]
JSON
cat > "$WORK/conflict-releases.json" <<'JSON'
[{"tag_name":"v2.0.0"}]
JSON
expect_fail php "$ROOT/scripts/release/check-conflicts.php" --version=2.0.0 --source-sha="$SOURCE_SHA" --tags-json="$WORK/conflict-tags.json" --releases-json="$WORK/conflict-releases.json"

cat > "$WORK/foreign-commit.json" <<'JSON'
{"sha":"2222222222222222222222222222222222222222"}
JSON
expect_fail php "$ROOT/scripts/release/check-conflicts.php" --version=2.0.0 --source-sha="$SOURCE_SHA" --tags-json="$WORK/tags-empty.json" --releases-json="$WORK/conflict-releases.json" --tag-commit-json="$WORK/foreign-commit.json"

echo 'RELEASE_CONTRACT_TESTS_PASS'
