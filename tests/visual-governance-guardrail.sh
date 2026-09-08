#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VALIDATOR="$ROOT/scripts/validate-visual-governance.sh"

new_case() {
  local dir
  dir="$(mktemp -d)"
  mkdir -p "$dir/docs/visual"
  cp "$ROOT/docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_UX_CONTRACT_v1.0.0.md" "$dir/docs/visual/"
  cp "$ROOT/docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_REFERENCE_MANIFEST_v1.0.0.yaml" "$dir/docs/visual/"
  printf '%s\n' "$dir"
}

expect_reject() {
  local test_id="$1" case_dir="$2" diagnostic="$3" out
  if out="$(bash "$VALIDATOR" "$case_dir" 2>&1)"; then
    printf '%s FAIL: mutation unexpectedly passed\n' "$test_id" >&2
    rm -rf "$case_dir"
    exit 1
  fi
  if ! grep -Fq "$diagnostic" <<<"$out"; then
    printf '%s FAIL: rejection did not name expected diagnostic\n%s\n' "$test_id" "$out" >&2
    rm -rf "$case_dir"
    exit 1
  fi
  printf '%s PASS (expected REJECT): %s\n' "$test_id" "$diagnostic"
  rm -rf "$case_dir"
}

case1="$(new_case)"
sed -i 's/form_title_font_size: NON_NORMATIVE_REFERENCE/form_title_font_size: CANONICAL/' \
  "$case1/docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_UX_CONTRACT_v1.0.0.md"
expect_reject 'T-001' "$case1" 'determinism/status failure'

bash "$VALIDATOR" "$ROOT" >/dev/null
printf 'T-002 PASS (expected PASS): repaired resolution states accepted\n'

case3="$(new_case)"
awk 'BEGIN{removed=0} { if (!removed && $0 ~ /^[[:space:]]+state: UNBOUND_EXTERNAL$/) { removed=1; next } print }' \
  "$case3/docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_REFERENCE_MANIFEST_v1.0.0.yaml" > "$case3/manifest.tmp"
mv "$case3/manifest.tmp" "$case3/docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_REFERENCE_MANIFEST_v1.0.0.yaml"
expect_reject 'T-003' "$case3" 'missing provenance state'

case4="$(new_case)"
sed -i '0,/claim_role: SUPPORTING_ONLY/s//claim_role: CANONICAL_NUMERIC_AUTHORITY/' \
  "$case4/docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_REFERENCE_MANIFEST_v1.0.0.yaml"
expect_reject 'T-004' "$case4" 'unsupported canonical source'

bash "$VALIDATOR" "$ROOT" >/dev/null
printf 'T-005 PASS (expected PASS): independent owner decisions accepted\n'

bash "$VALIDATOR" "$ROOT" >/dev/null
printf 'T-008 PASS (expected PASS): owner decisions preserved; runtime gaps remain NOT_PROVEN\n'
