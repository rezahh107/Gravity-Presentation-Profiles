#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/release-lib.sh"
version="${1:?usage: render-release-notes.sh VERSION OUTPUT}"
out="${2:?missing output}"
is_stable_version "$version" || fail "release notes require a stable production version"
assert_release_notes_ready
if grep -Fq "## [$version]" "$GPP_RELEASE_ROOT/CHANGELOG.md"; then
  fail "CHANGELOG already contains release version $version"
fi
{
  printf '# Gravity Presentation Profiles %s\n\n' "$version"
  changelog_unreleased_body
} > "$out"
