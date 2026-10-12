#!/usr/bin/env bash
set -euo pipefail

gpp_wu21_fixture_archive_allowed() {
  case "$1" in
    tests/fixtures/wu21-packages/gravityforms-3.1.1.1-owner-supplied-source-package.zip|tests/fixtures/wu21-packages/gravityflow-3.1.0-owner-supplied-source-package.zip|tests/fixtures/wu21-packages/elementor-4.3.1-owner-supplied-source-package.zip|tests/fixtures/wu21-packages/elementor-pro-4.3.0-owner-supplied-modified-package.zip)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

gpp_validate_archive_paths() {
  local path
  local rejected=0
  for path in "$@"; do
    if ! gpp_wu21_fixture_archive_allowed "$path"; then
      echo "Committed ZIP archive is outside the explicit WU21 fixture allowlist: $path" >&2
      rejected=1
    fi
  done
  return "$rejected"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  # Process substitution does not propagate a failed git ls-files command.
  # The archive policy must fail closed when tracked files cannot be enumerated.
  if ! tracked_list="$(git ls-files -- '*.zip')"; then
    echo 'COMMITTED_ARCHIVE_POLICY_FAIL: cannot enumerate tracked ZIP archives from Git.' >&2
    exit 1
  fi
  tracked=()
  if [[ -n "$tracked_list" ]]; then
    mapfile -t tracked <<< "$tracked_list"
  fi
  gpp_validate_archive_paths "${tracked[@]}"
  echo "COMMITTED_ARCHIVE_POLICY_PASS tracked_zip_count=${#tracked[@]}"
fi
