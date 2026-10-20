#!/usr/bin/env bash
set -euo pipefail

# Test exact versioned candidate contracts, without a remote branch, tag or Release.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
CANDIDATE="$WORK/release-candidate"
mkdir -p "$CANDIDATE"
git -C "$ROOT" archive HEAD | tar -x -C "$CANDIDATE"

# [Unreleased] may be empty after a release. Add only a synthetic fixture note.
php -r '
$path=$argv[1];
$text=file_get_contents($path);
$needle="## [Unreleased]\n";
if ($text===false || substr_count($text,$needle)!==1) exit(1);
$fixture=$needle . "\n### Fixed\n\n- Synthetic candidate source regression fixture.\n";
if (file_put_contents($path,str_replace($needle,$fixture,$text))===false) exit(1);
' "$CANDIDATE/CHANGELOG.md"

php "$CANDIDATE/scripts/release/prepare-candidate.php" \
    --root="$CANDIDATE" --version=8.6.5 --date=2030-01-02 >/dev/null
git -C "$CANDIDATE" init -q
git -C "$CANDIDATE" config user.name 'gpp-contract-fixture'
git -C "$CANDIDATE" config user.email 'gpp-contract-fixture@example.invalid'
git -C "$CANDIDATE" add -A
git -C "$CANDIDATE" commit -qm 'test fixture: synthetic prepared candidate'
[[ "$(git -C "$CANDIDATE" status --porcelain)" == '' ]]

# Candidate MUST still be blocked as a new publish-start.
php "$CANDIDATE/scripts/release/check-publication-prerequisites.php" \
    --root="$CANDIDATE" --mode=dry-run > "$WORK/candidate-prerequisites.json"
grep -Fq 'production_version_already_prepared' "$WORK/candidate-prerequisites.json"
if php "$CANDIDATE/scripts/release/check-publication-prerequisites.php" \
    --root="$CANDIDATE" --mode=publish > "$WORK/candidate-publish.json" 2>/dev/null; then
    echo 'Synthetic prepared candidate wrongly admitted as new publish-start.' >&2
    exit 1
fi
grep -Fq 'production_version_source_requires_recovery' "$WORK/candidate-publish.json"

# Re-enter the affected suites against a real staged, committed candidate.
bash "$CANDIDATE/tests/release/release-contract-tests.sh"
bash "$CANDIDATE/tests/release/license-identity-tests.sh"

echo 'GPP_PREPARED_CANDIDATE_SOURCE_CONTRACT_PASS version=8.6.5 publish_start=REJECTED'
