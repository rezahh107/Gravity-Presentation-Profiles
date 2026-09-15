#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
ZIP="${2:-}"
VERSION="${3:-}"
EXPECTED_SHA="${4:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=release-lib.sh
source "$SCRIPT_DIR/release-lib.sh"

release_require_command unzip
release_require_command sha256sum
[[ -f "$ZIP" ]] || release_fail "ZIP does not exist: $ZIP"
release_is_production_version "$VERSION" || release_fail "Invalid production release version: $VERSION"

unzip -tqq "$ZIP" >/dev/null || release_fail 'ZIP integrity check failed.'
ACTUAL_SHA="$(sha256sum "$ZIP" | awk '{print $1}')"
if [[ -n "$EXPECTED_SHA" && "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
    release_fail "Checksum mismatch: expected=$EXPECTED_SHA actual=$ACTUAL_SHA"
fi

LIST="$(mktemp)"
EXPECTED="$(mktemp)"
ACTUAL="$(mktemp)"
EXTRACT="$(mktemp -d)"
trap 'rm -f "$LIST" "$EXPECTED" "$ACTUAL"; rm -rf "$EXTRACT"' EXIT
unzip -Z1 "$ZIP" > "$LIST"

[[ -s "$LIST" ]] || release_fail 'ZIP is empty.'
if grep -Eq '(^/|(^|/)\.\.(/|$)|\\)' "$LIST"; then
    release_fail 'ZIP contains an unsafe path.'
fi
if grep -Ev "^${GPP_RELEASE_SLUG}/" "$LIST" | grep -q .; then
    release_fail 'ZIP contains more than the canonical plugin root.'
fi

FORBIDDEN='/(\.git|\.github|tests|docs|scripts|release|vendor|node_modules|build|dist)(/|$)|/(AGENTS\.md|CHANGELOG\.md|README\.md|SECURITY\.md|composer\.(json|lock)|phpcs\.xml\.dist|phpunit\.xml\.dist)$'
if grep -E "$FORBIDDEN" "$LIST" >/dev/null; then
    release_fail 'ZIP contains repository/development-only material.'
fi

while IFS= read -r path; do
    printf '%s/%s\n' "$GPP_RELEASE_SLUG" "$path"
done < <(release_runtime_files "$ROOT") | LC_ALL=C sort -u > "$EXPECTED"
grep -v '/$' "$LIST" | LC_ALL=C sort -u > "$ACTUAL"
if ! diff -u "$EXPECTED" "$ACTUAL"; then
    release_fail 'ZIP file set differs from the canonical runtime allowlist.'
fi

while IFS= read -r path; do
    grep -Fxq "$GPP_RELEASE_SLUG/$path" "$ACTUAL" || release_fail "Required runtime file is absent from ZIP: $path"
done < <(release_required_runtime_files)

unzip -q "$ZIP" -d "$EXTRACT"
PACKAGED_ROOT="$EXTRACT/$GPP_RELEASE_SLUG"
release_assert_version_mirrors "$PACKAGED_ROOT"
[[ "$(release_plugin_version "$PACKAGED_ROOT")" == "$VERSION" ]] || release_fail 'Packaged plugin version does not match candidate version.'

while IFS= read -r path; do
    cmp -s "$ROOT/$path" "$PACKAGED_ROOT/$path" || release_fail "Packaged bytes do not match prepared source: $path"
done < <(release_runtime_files "$ROOT")

if grep -R -I -E --exclude='*.png' --exclude='*.jpg' --exclude='*.jpeg' --exclude='*.webp' \
    '(-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})' \
    "$PACKAGED_ROOT" >/dev/null 2>&1; then
    release_fail 'High-confidence credential/private-key material detected in production ZIP.'
fi

printf 'GPP_RELEASE_ARTIFACT_VALIDATION_PASS version=%s sha256=%s\n' "$VERSION" "$ACTUAL_SHA"
