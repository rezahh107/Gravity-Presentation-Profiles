#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
FILES=(
  "$ROOT/tests/release/behavioral-host-fixture.php"
  "$ROOT/tests/release/behavioral-state.php"
  "$ROOT/tests/release/behavioral-http-form.php"
  "$ROOT/tests/release/validate-behavioral-production-reachability.php"
  "$ROOT/tests/release/validate-connected-print.php"
  "$ROOT/tests/release/connected-print-browser.mjs"
  "$ROOT/tests/release/verify-connected-print-output.mjs"
  "$ROOT/tests/release/run-behavioral-production-reachability.sh"
  "$ROOT/tests/release/behavioral-entry-host-state.php"
  "$ROOT/tests/release/behavioral-entry-host-change.php"
  "$ROOT/tests/release/connected-entry-detail-browser.mjs"
  "$ROOT/tests/release/validate-connected-entry-detail.php"
  "$ROOT/tests/release/run-connected-entry-detail.sh"
)
for file in "${FILES[@]}"; do [[ -f "$file" ]] || { echo "Missing behavioral helper: $file" >&2; exit 1; }; done
if grep -En '(^|[^[:alnum:]_])(update_option|add_option|delete_option)[[:space:]]*\(' "${FILES[@]}"; then
  echo 'Behavioral harness must not directly mutate WordPress option state.' >&2
  exit 1
fi
if grep -En 'BindingRepairService|->[[:space:]]*(import|activate|activateIfCurrent|initialize)[[:space:]]*\(' "${FILES[@]}"; then
  echo 'Behavioral harness must not invoke lifecycle/setup/repair mutation services directly.' >&2
  exit 1
fi
if grep -En '\$wpdb|gpp_visual_package_lifecycle_v1|gpp_binding_set_lifecycle_v1' "${FILES[@]}"; then
  echo 'Behavioral harness must not manufacture GPP state through raw storage access.' >&2
  exit 1
fi
RUNNER="$ROOT/tests/release/run-behavioral-production-reachability.sh"
if ! grep -Fq 'EXPECTED_VERSION="${GPP_RELEASE_VERSION:-${GPP_RELEASE_DRY_VERSION:-}}"' "$RUNNER"; then
  echo 'Behavioral release identity must prefer the resolved production version and fall back only to the explicit dry-run version.' >&2
  exit 1
fi
if grep -Fq 'GPP_RELEASE_DRY_VERSION:-9999.0.0' "$RUNNER"; then
  echo 'Behavioral release identity must not silently default production smoke to the synthetic dry-run version.' >&2
  exit 1
fi
# The higher-value gate must not silently degrade back to setup-only evidence.
for marker in 'connected_browser unproven' 'connected_browser invalidated' 'connected_browser final' 'validate-connected-print.php'; do
  grep -Fq "$marker" "$RUNNER" || { echo "Connected Print boundary absent: $marker" >&2; exit 1; }
done
# Both the native Chromium stage and the final report validator must enforce
# the same post-export source-of-truth verifier.
for consumer in "$ROOT/tests/release/connected-print-browser.mjs" "$ROOT/tests/release/validate-connected-print.php"; do
  grep -Fq 'verify-connected-print-output.mjs' "$consumer" || {
    echo "Post-export PDF/raster verifier not connected: $consumer" >&2
    exit 1
  }
done
# Preserve the independent Goal 5 installed-ZIP/native request boundary.
grep -Fq 'run-connected-entry-detail.sh' "$RUNNER" || {
  echo 'Connected Entry Detail is missing from the canonical release runner.' >&2
  exit 1
}
ENTRY_RUNNER="$ROOT/tests/release/run-connected-entry-detail.sh"
for marker in 'behavioral-http-form.php' 'connected-entry-detail-browser.mjs' 'behavioral-entry-host-state.php' 'behavioral-entry-host-change.php' 'validate-connected-entry-detail.php'; do
  grep -Fq "$marker" "$ENTRY_RUNNER" || {
    echo "Connected Entry Detail boundary is missing: $marker" >&2
    exit 1
  }
done
echo 'GPP_BEHAVIORAL_ANTI_BYPASS_GUARDRAIL_PASS'
