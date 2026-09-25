#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

source scripts/validate-ci-package-sources.sh

gpp_validate_ci_package_sources "$root"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/.github/workflows" "$tmp/scripts"

cat > "$tmp/.github/workflows/bad.yml" <<'YAML'
steps:
  - run: curl -L -o "$GF_ZIP" "https://drive.usercontent.google.com/download?id=forbidden"
YAML
if gpp_reject_google_drive_ci_package_sources "$tmp" >/dev/null 2>&1; then
  echo "Injected Google Drive package acquisition unexpectedly passed repository-wide policy." >&2
  exit 1
fi

cat > "$tmp/scripts/network-fallback.sh" <<'SH'
curl -L --fail -o "$FLOW_ZIP" "https://example.invalid/gravityflow.zip"
SH
if gpp_reject_package_network_fallback_file "$tmp/scripts/network-fallback.sh" >/dev/null 2>&1; then
  echo "Injected network package fallback unexpectedly passed consumer policy." >&2
  exit 1
fi

echo "REPOSITORY_PACKAGE_SOURCE_FALSIFICATION_PASS google_drive_injection_rejected=true network_fallback_rejected=true migrated_consumers_verified=true"
