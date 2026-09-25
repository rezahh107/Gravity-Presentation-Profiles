#!/usr/bin/env bash
set -euo pipefail

gpp_reject_google_drive_ci_package_sources() {
  local root="${1:-.}"
  local matches
  matches="$(
    grep -RInE \
      --exclude='validate-ci-package-sources.sh' \
      --include='*.yml' --include='*.yaml' --include='*.sh' --include='*.php' --include='*.mjs' --include='*.js' \
      'drive\.usercontent\.google\.com|drive\.google\.com|10pDROZVyqELKzSzIiJrOyEWKjxS8r22Q|1Y90nvrxEEfVZqpmxXkQvwJfw4pvKCoPf' \
      "$root/.github/workflows" "$root/scripts" 2>/dev/null || true
  )"
  if [[ -n "$matches" ]]; then
    echo "Google Drive package acquisition remains in CI/runtime-owned sources:" >&2
    echo "$matches" >&2
    return 1
  fi
}

gpp_reject_package_network_fallback_file() {
  local file="$1"
  local matches
  matches="$(grep -En "(curl|wget|gh[[:space:]]+release[[:space:]]+download).*(GF_ZIP|FLOW_ZIP|gravityforms[^[:space:]\"']*\\.zip|gravityflow[^[:space:]\"']*\\.zip)" "$file" || true)"
  if [[ -n "$matches" ]]; then
    echo "Network package fallback/acquisition is forbidden in $file:" >&2
    echo "$matches" >&2
    return 1
  fi
}

gpp_require_fixture_consumer() {
  local root="$1"
  local rel="$2"
  local mode="$3"
  local file="$root/$rel"

  [[ -f "$file" ]] || { echo "Missing CI package consumer: $rel" >&2; return 1; }
  grep -Fq 'tests/fixtures/wu21-packages' "$file" || { echo "$rel does not bind repository package fixtures." >&2; return 1; }
  grep -Fq 'verify-wu21-package-fixtures.php' "$file" || { echo "$rel does not execute the repository package verifier." >&2; return 1; }
  gpp_reject_package_network_fallback_file "$file"

  if [[ "$rel" == .github/workflows/* ]]; then
    grep -Fq -- "- 'tests/fixtures/wu21-packages/**'" "$file" || { echo "$rel does not trigger on package-fixture changes." >&2; return 1; }
  fi

  grep -Fq 'gravityforms-3.1.1.1-owner-supplied-source-package.zip' "$file" || { echo "$rel does not consume the admitted Gravity Forms fixture." >&2; return 1; }
  if [[ "$mode" == "gf-flow" ]]; then
    grep -Fq 'gravityflow-3.1.0-owner-supplied-source-package.zip' "$file" || { echo "$rel does not consume the admitted Gravity Flow fixture." >&2; return 1; }
  fi
  grep -Fq 'sha256sum -c -' "$file" || { echo "$rel does not preserve SHA-256 verification." >&2; return 1; }
  grep -Fq "stat -c '%s'" "$file" || { echo "$rel does not preserve exact-size verification." >&2; return 1; }
}

gpp_validate_ci_package_sources() {
  local root="${1:-.}"
  gpp_reject_google_drive_ci_package_sources "$root"

  gpp_require_fixture_consumer "$root" '.github/workflows/print-utility-ux.yml' 'gf-flow'
  gpp_require_fixture_consumer "$root" '.github/workflows/wu10-entry-constrained-geometry.yml' 'gf-flow'
  gpp_require_fixture_consumer "$root" '.github/workflows/wu18-entry-detail-runtime.yml' 'gf-flow'
  gpp_require_fixture_consumer "$root" '.github/workflows/wu19-a4-print-runtime.yml' 'gf-flow'
  gpp_require_fixture_consumer "$root" '.github/workflows/srwf-registration-runtime.yml' 'gf-only'
  gpp_require_fixture_consumer "$root" '.github/workflows/wu21-repro-evidence-lab.yml' 'gf-flow'
  gpp_require_fixture_consumer "$root" 'scripts/release/smoke-zip.sh' 'gf-flow'

  grep -Fq -- "- 'tests/fixtures/wu21-packages/**'" "$root/.github/workflows/release.yml" || {
    echo ".github/workflows/release.yml does not trigger release smoke on package-fixture changes." >&2
    return 1
  }

  local config="$root/tests/repro-evidence-lab/lab-config.json"
  [[ -f "$config" ]] || { echo "Missing WU21 lab config." >&2; return 1; }
  if grep -Eq 'drive_file_id|GOOGLE_DRIVE_PUBLIC_LINK|drive\.google\.com|drive\.usercontent\.google\.com' "$config"; then
    echo "WU21 lab config still declares Google Drive package authority." >&2
    return 1
  fi
  [[ "$(grep -Fc '"acquisition": "REPOSITORY_TRACKED_FIXTURE"' "$config")" -eq 2 ]] || {
    echo "WU21 lab config does not truthfully record repository-tracked Gravity package acquisition." >&2
    return 1
  }

  php "$root/tests/repro-evidence-lab/verify-wu21-package-fixtures.php" "$root/tests/fixtures/wu21-packages"
  echo "CI_PACKAGE_SOURCE_POLICY_PASS consumers=7 google_drive=0 network_fallback=0 authority=tests/fixtures/wu21-packages/manifest.json"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  gpp_validate_ci_package_sources "${1:-.}"
fi
