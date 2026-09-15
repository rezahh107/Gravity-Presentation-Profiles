#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

APPROVED_LICENSE_SHA256='8272fab389a03e9ab3531c5f8d6f64ab711b91e82b2a1b145018dde314a26873'
CHECKER="$ROOT/scripts/release/check-publication-prerequisites.php"

expect_fail() {
    if "$@" >/dev/null 2>&1; then
        echo "Expected command to fail: $*" >&2
        exit 1
    fi
}

assert_ready() {
    php -r '
        $p=json_decode(file_get_contents($argv[1]),true);
        if (($p["publication_ready"]??null)!==true || ($p["blockers"]??null)!==array()) exit(1);
    ' "$1"
}

assert_blocker() {
    php -r '
        $p=json_decode(file_get_contents($argv[1]),true);
        if (($p["publication_ready"]??null)!==false) exit(1);
        if (!in_array($argv[2],$p["blockers"]??array(),true)) exit(1);
    ' "$1" "$2"
}

# Positive control: the exact approved source resolves all repository publication prerequisites.
[[ "$(sha256sum "$ROOT/LICENSE" | awk '{print $1}')" == "$APPROVED_LICENSE_SHA256" ]]
php "$CHECKER" --root="$ROOT" --mode=dry-run > "$WORK/approved.json"
assert_ready "$WORK/approved.json"
php "$CHECKER" --root="$ROOT" --mode=publish > "$WORK/approved-publish.json"
assert_ready "$WORK/approved-publish.json"

SOURCE="$WORK/source"
mkdir -p "$SOURCE"
git -C "$ROOT" archive HEAD | tar -x -C "$SOURCE"

# PRI-FND-001 original defect: arbitrary non-empty LICENSE bytes must now fail closed.
printf '%s\n' 'arbitrary non-empty license bytes' > "$SOURCE/LICENSE"
php "$CHECKER" --root="$SOURCE" --mode=dry-run > "$WORK/wrong-source-license.json"
assert_blocker "$WORK/wrong-source-license.json" 'license_identity_mismatch:source_bytes'
expect_fail php "$CHECKER" --root="$SOURCE" --mode=publish
cp "$ROOT/LICENSE" "$SOURCE/LICENSE"

# Composer is a checked SPDX mirror of the same Owner-approved license decision.
php -r '$d=json_decode(file_get_contents($argv[1]),true); $d["license"]="MIT"; file_put_contents($argv[1],json_encode($d,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES).PHP_EOL);' "$SOURCE/composer.json"
php "$CHECKER" --root="$SOURCE" --mode=dry-run > "$WORK/wrong-composer-license.json"
assert_blocker "$WORK/wrong-composer-license.json" 'license_identity_mismatch:composer'
expect_fail php "$CHECKER" --root="$SOURCE" --mode=publish
cp "$ROOT/composer.json" "$SOURCE/composer.json"

rm "$SOURCE/composer.json"
php "$CHECKER" --root="$SOURCE" --mode=dry-run > "$WORK/missing-composer.json"
assert_blocker "$WORK/missing-composer.json" 'license_identity_mismatch:composer'
expect_fail php "$CHECKER" --root="$SOURCE" --mode=publish
cp "$ROOT/composer.json" "$SOURCE/composer.json"

printf '%s\n' '{not-json' > "$SOURCE/composer.json"
php "$CHECKER" --root="$SOURCE" --mode=dry-run > "$WORK/malformed-composer.json"
assert_blocker "$WORK/malformed-composer.json" 'license_identity_mismatch:composer'
expect_fail php "$CHECKER" --root="$SOURCE" --mode=publish
cp "$ROOT/composer.json" "$SOURCE/composer.json"

# WordPress plugin metadata is a checked human-readable mirror of the same identity.
sed -i 's/License: GPL v2 or later/License: GPL v3 or later/' "$SOURCE/gravity-presentation-profiles.php"
php "$CHECKER" --root="$SOURCE" --mode=dry-run > "$WORK/wrong-plugin-license.json"
assert_blocker "$WORK/wrong-plugin-license.json" 'license_identity_mismatch:plugin_header'
expect_fail php "$CHECKER" --root="$SOURCE" --mode=publish
cp "$ROOT/gravity-presentation-profiles.php" "$SOURCE/gravity-presentation-profiles.php"

sed -i '/^[[:space:]]*\*[[:space:]]*License:/d' "$SOURCE/gravity-presentation-profiles.php"
php "$CHECKER" --root="$SOURCE" --mode=dry-run > "$WORK/missing-plugin-license.json"
assert_blocker "$WORK/missing-plugin-license.json" 'license_identity_mismatch:plugin_header'
expect_fail php "$CHECKER" --root="$SOURCE" --mode=publish

# Release dry-run must be triggered whenever Composer release-license metadata changes.
grep -Fxq "      - 'composer.json'" "$ROOT/.github/workflows/release.yml"

printf '%s\n' 'GPP_RELEASE_LICENSE_IDENTITY_TESTS_PASS'
