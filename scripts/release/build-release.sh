#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
VERSION="${2:-}"
REQUESTED_OUT_DIR="${3:-$ROOT/build/release}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=release-lib.sh
source "$SCRIPT_DIR/release-lib.sh"

release_require_command zip
release_require_command sha256sum
release_is_production_version "$VERSION" || release_fail "Invalid production release version: $VERSION"
release_assert_version_mirrors "$ROOT"
[[ "$(release_plugin_version "$ROOT")" == "$VERSION" ]] || release_fail 'Requested version does not match prepared source version.'

# Resolve the caller-requested output location before entering the staging cwd.
# This keeps workflow-relative paths (for example build/release) anchored to the
# invocation directory instead of accidentally resolving them under STAGE.
mkdir -p "$REQUESTED_OUT_DIR"
OUT_DIR="$(cd "$REQUESTED_OUT_DIR" && pwd -P)"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
PLUGIN_ROOT="$STAGE/$GPP_RELEASE_SLUG"
mkdir -p "$PLUGIN_ROOT"

while IFS= read -r path; do
    [[ -f "$ROOT/$path" ]] || release_fail "Runtime source file is missing: $path"
    mkdir -p "$PLUGIN_ROOT/$(dirname "$path")"
    cp "$ROOT/$path" "$PLUGIN_ROOT/$path"
done < <(release_runtime_files "$ROOT")

# A deterministic ZIP is materially useful for checksum continuity and mutation tests.
# ZIP timestamps cannot predate 1980; normalize every shipped file and use sorted input.
find "$PLUGIN_ROOT" -type f -exec touch -t 198001010000.00 {} +
ZIP="$OUT_DIR/$GPP_RELEASE_SLUG-$VERSION.zip"
rm -f "$ZIP" "$ZIP.sha256"
(
    cd "$STAGE"
    find "$GPP_RELEASE_SLUG" -type f -print0 | LC_ALL=C sort -z | xargs -0 zip -X -q "$ZIP"
)

SHA256="$(sha256sum "$ZIP" | awk '{print $1}')"
printf '%s  %s\n' "$SHA256" "$(basename "$ZIP")" > "$ZIP.sha256"
printf '%s\n' "$ZIP"
printf 'GPP_RELEASE_ZIP_SHA256=%s\n' "$SHA256"
