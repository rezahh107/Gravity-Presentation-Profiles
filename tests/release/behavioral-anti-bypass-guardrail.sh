#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
FILES=(
  "$ROOT/tests/release/behavioral-host-fixture.php"
  "$ROOT/tests/release/behavioral-state.php"
  "$ROOT/tests/release/behavioral-http-form.php"
  "$ROOT/tests/release/validate-behavioral-production-reachability.php"
  "$ROOT/tests/release/run-behavioral-production-reachability.sh"
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
echo 'GPP_BEHAVIORAL_ANTI_BYPASS_GUARDRAIL_PASS'
