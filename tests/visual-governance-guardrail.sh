#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VALIDATOR="$ROOT/scripts/validate-visual-governance.sh"
CONTRACT_REL="docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_UX_CONTRACT_v1.0.0.md"
MANIFEST_REL="docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_REFERENCE_MANIFEST_v1.0.0.yaml"

bash -n "$VALIDATOR"
bash -n "${BASH_SOURCE[0]}"
printf 'STATIC PASS: shell syntax valid\n'

new_case() {
  local dir
  dir="$(mktemp -d)"
  mkdir -p "$dir/docs/visual"
  cp "$ROOT/$CONTRACT_REL" "$dir/$CONTRACT_REL"
  cp "$ROOT/$MANIFEST_REL" "$dir/$MANIFEST_REL"
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

mutate_contract_owner() {
  local file="$1" key="$2" value="$3" tmp
  tmp="${file}.tmp"
  awk -v target_key="$key" -v new_value="$value" '
  $0 == "canonicalization_correction_bundle:" { in_block=1 }
  in_block && $0 == "  " target_key ":" { in_target=1; print; next }
  in_target && /^    value:[[:space:]]*/ { print "    value: " new_value; in_target=0; changed=1; next }
  { print }
  END { if (!changed) exit 9 }
  ' "$file" > "$tmp" || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$file"
}

mutate_manifest_owner() {
  local file="$1" key="$2" value="$3" tmp
  tmp="${file}.tmp"
  awk -v target_key="$key" -v new_value="$value" '
  /^  canonical_owner_decisions:[[:space:]]*$/ { in_block=1; print; next }
  in_block && /^  [^[:space:]][^:]*:/ { in_block=0 }
  in_block && $0 ~ "^    " target_key ":[[:space:]]*" {
    print "    " target_key ": " new_value; changed=1; next
  }
  { print }
  END { if (!changed) exit 9 }
  ' "$file" > "$tmp" || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$file"
}

set_first_provenance_field() {
  local file="$1" field="$2" value="$3"
  sed -i "0,/^      ${field}:/s|^      ${field}:.*|      ${field}: ${value}|" "$file"
}

make_first_bound_fixture() {
  local file="$1"
  set_first_provenance_field "$file" state BOUND_REPLAYABLE
  set_first_provenance_field "$file" replayable true
  set_first_provenance_field "$file" repository_path docs/visual/fixtures/source.html
  set_first_provenance_field "$file" immutable_identity blob:0123456789abcdef
  set_first_provenance_field "$file" sha256 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
  set_first_provenance_field "$file" claim_role SUPPORTING_ONLY
}

# Existing accepted protections.
case1="$(new_case)"
sed -i 's/form_title_font_size: NON_NORMATIVE_REFERENCE/form_title_font_size: CANONICAL/' "$case1/$CONTRACT_REL"
expect_reject 'T-001' "$case1" 'determinism/status failure'

bash "$VALIDATOR" "$ROOT" >/dev/null
printf 'T-002 PASS (expected PASS): repaired resolution states accepted\n'

case3="$(new_case)"
awk 'BEGIN{removed=0} { if (!removed && $0 ~ /^[[:space:]]+state: UNBOUND_EXTERNAL$/) { removed=1; next } print }' "$case3/$MANIFEST_REL" > "$case3/manifest.tmp"
mv "$case3/manifest.tmp" "$case3/$MANIFEST_REL"
expect_reject 'T-003' "$case3" 'missing or duplicate provenance state'

case4="$(new_case)"
set_first_provenance_field "$case4/$MANIFEST_REL" claim_role CANONICAL_NUMERIC_AUTHORITY
expect_reject 'T-004' "$case4" 'unsupported canonical source'

bash "$VALIDATOR" "$ROOT" >/dev/null
printf 'T-005 PASS (expected PASS): independent owner decisions accepted\n'

# PRI-FND-003 owner key/value binding controls.
case9="$(new_case)"
mutate_contract_owner "$case9/$CONTRACT_REL" mobile_horizontal_padding 20px
printf '\n<!-- old-global-presence-control: 16px -->\n' >> "$case9/$CONTRACT_REL"
grep -Fq '16px' "$case9/$CONTRACT_REL" || { echo 'T-009 fixture failure: 16px control missing' >&2; exit 1; }
expect_reject 'T-009' "$case9" 'mobile_horizontal_padding expected 16px but found 20px'

case10="$(new_case)"
mutate_contract_owner "$case10/$CONTRACT_REL" help_text_placement above_input
printf '\n<!-- old-global-presence-control: below_input -->\n' >> "$case10/$CONTRACT_REL"
grep -Fq 'below_input' "$case10/$CONTRACT_REL" || { echo 'T-010 fixture failure: below_input control missing' >&2; exit 1; }
expect_reject 'T-010' "$case10" 'help_text_placement expected below_input but found above_input'

case11="$(new_case)"
mutate_contract_owner "$case11/$CONTRACT_REL" validation_message_placement inline_before_input
expect_reject 'T-011' "$case11" 'validation_message_placement expected below_input but found inline_before_input'

case12="$(new_case)"
mutate_contract_owner "$case12/$CONTRACT_REL" control_border '"#778899"'
expect_reject 'T-012' "$case12" 'control_border expected "#8690A1" but found "#778899"'

case13="$(new_case)"
mutate_contract_owner "$case13/$CONTRACT_REL" desktop_outer_surface direct_page_surface
expect_reject 'T-013' "$case13" 'desktop_outer_surface expected white_card but found direct_page_surface'

# Prove the manifest authority surface is independently bound too.
case14="$(new_case)"
mutate_manifest_owner "$case14/$MANIFEST_REL" mobile_horizontal_padding 20px
expect_reject 'T-014' "$case14" 'owner decision binding failure in manifest: mobile_horizontal_padding expected 16px but found 20px'

# Duplicate/ambiguous owner key must fail even if one copy is correct.
case15="$(new_case)"
awk '
{ print }
!done && /^  mobile_horizontal_padding:[[:space:]]*$/ {
  print "  mobile_horizontal_padding:"
  print "    value: 20px"
  print "    status: OWNER_APPROVED"
  done=1
}
' "$case15/$CONTRACT_REL" > "$case15/contract.tmp"
mv "$case15/contract.tmp" "$case15/$CONTRACT_REL"
expect_reject 'T-015' "$case15" 'mobile_horizontal_padding must appear exactly once in authoritative block'

# PRI-FND-003 provenance semantic controls.
case16="$(new_case)"
set_first_provenance_field "$case16/$MANIFEST_REL" replayable true
expect_reject 'T-016' "$case16" 'replayable must be false'

case17="$(new_case)"
set_first_provenance_field "$case17/$MANIFEST_REL" sha256 deadbeef
expect_reject 'T-017' "$case17" 'sha256 must be UNCOMPUTED'

case18="$(new_case)"
set_first_provenance_field "$case18/$MANIFEST_REL" repository_path docs/visual/fake.html
expect_reject 'T-018' "$case18" 'repository_path must be null'

case19="$(new_case)"
make_first_bound_fixture "$case19/$MANIFEST_REL"
set_first_provenance_field "$case19/$MANIFEST_REL" sha256 abc123
expect_reject 'T-019' "$case19" 'bound provenance invalid sha256'

case20="$(new_case)"
make_first_bound_fixture "$case20/$MANIFEST_REL"
set_first_provenance_field "$case20/$MANIFEST_REL" repository_path null
set_first_provenance_field "$case20/$MANIFEST_REL" immutable_identity null
expect_reject 'T-020' "$case20" 'bound provenance missing durable locator'

# Positive controlled bound/replayable path: complete semantics are accepted.
case21="$(new_case)"
make_first_bound_fixture "$case21/$MANIFEST_REL"
bash "$VALIDATOR" "$case21" >/dev/null
printf 'T-021 PASS (expected PASS): complete BOUND_REPLAYABLE fixture accepted\n'
rm -rf "$case21"

bash "$VALIDATOR" "$ROOT" >/dev/null
printf 'T-008 PASS (expected PASS): owner decisions preserved; runtime gaps remain NOT_PROVEN\n'
