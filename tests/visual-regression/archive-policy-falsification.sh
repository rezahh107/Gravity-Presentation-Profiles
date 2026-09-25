#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

source scripts/validate-committed-archives.sh

allowed=(
  tests/fixtures/wu21-packages/gravityforms-3.1.1.1-owner-supplied-source-package.zip
  tests/fixtures/wu21-packages/gravityflow-3.1.0-owner-supplied-source-package.zip
  tests/fixtures/wu21-packages/elementor-4.3.1-owner-supplied-source-package.zip
  tests/fixtures/wu21-packages/elementor-pro-4.3.0-owner-supplied-modified-package.zip
)

gpp_validate_archive_paths "${allowed[@]}"

if gpp_validate_archive_paths "${allowed[@]}" gravity-presentation-profiles-release.zip >/dev/null 2>&1; then
  echo "Unrelated release archive unexpectedly passed the committed-archive guard." >&2
  exit 1
fi

echo "ARCHIVE_POLICY_FALSIFICATION_PASS explicit_wu21_fixtures_allowed=true unrelated_release_zip_rejected=true"
