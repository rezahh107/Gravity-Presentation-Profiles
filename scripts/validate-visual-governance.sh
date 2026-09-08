#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
CONTRACT="$ROOT/docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_UX_CONTRACT_v1.0.0.md"
MANIFEST="$ROOT/docs/visual/SRWF_PUBLIC_REGISTRATION_VISUAL_REFERENCE_MANIFEST_v1.0.0.yaml"

fail() {
  printf 'VISUAL_GOVERNANCE_FAIL: %s\n' "$1" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "missing required file: $1"
}

require_fixed() {
  local file="$1" text="$2" diagnostic="$3"
  grep -Fq -- "$text" "$file" || fail "$diagnostic"
}

require_file "$CONTRACT"
require_file "$MANIFEST"

# C-001 / PRI-FND-003: bind each owner key to its exact value inside the
# authoritative owner-decision block. Correct values elsewhere do not count.
awk '
function trim(s) { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }
function die(msg) { print "owner decision binding failure in contract: " msg > "/dev/stderr"; exit 31 }
BEGIN {
  expected["mobile_horizontal_padding"]="16px"
  expected["help_text_placement"]="below_input"
  expected["validation_message_placement"]="below_input"
  expected["control_border"]="\"#8690A1\""
  expected["desktop_outer_surface"]="white_card"
}
$0 == "canonicalization_correction_bundle:" {
  block_count++
  if (block_count > 1) die("authoritative block duplicated")
  in_block=1
  current=""
  next
}
in_block && /^```[[:space:]]*$/ { in_block=0; current=""; next }
in_block && /^  [A-Za-z0-9_]+:[[:space:]]*$/ {
  line=trim($0); sub(/:[[:space:]]*$/, "", line); current=line
  if (current in expected) key_count[current]++
  next
}
in_block && current != "" && /^    value:[[:space:]]*/ {
  line=$0; sub(/^    value:[[:space:]]*/, "", line); line=trim(line)
  if (current in expected) { value_count[current]++; actual[current]=line }
  next
}
END {
  if (block_count != 1) die("canonicalization_correction_bundle must appear exactly once")
  for (key in expected) {
    if (key_count[key] != 1) die(key " must appear exactly once in authoritative block")
    if (value_count[key] != 1) die(key " must have exactly one value in authoritative block")
    if (actual[key] != expected[key]) die(key " expected " expected[key] " but found " actual[key])
  }
}
' "$CONTRACT" || fail 'owner decision key/value invariant failed in contract'

awk '
function trim(s) { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }
function die(msg) { print "owner decision binding failure in manifest: " msg > "/dev/stderr"; exit 32 }
BEGIN {
  expected["mobile_horizontal_padding"]="16px"
  expected["help_text_placement"]="below_input"
  expected["validation_message_placement"]="below_input"
  expected["control_border"]="\"#8690A1\""
  expected["desktop_outer_surface"]="white_card"
}
/^  canonical_owner_decisions:[[:space:]]*$/ {
  block_count++
  if (block_count > 1) die("authoritative block duplicated")
  in_block=1
  next
}
in_block && /^  [^[:space:]][^:]*:/ { in_block=0 }
in_block && /^    [A-Za-z0-9_]+:[[:space:]]*/ {
  line=trim($0)
  key=line; sub(/:.*/, "", key)
  value=line; sub(/^[^:]+:[[:space:]]*/, "", value); value=trim(value)
  if (key in expected) { key_count[key]++; actual[key]=value }
}
END {
  if (block_count != 1) die("canonical_owner_decisions must appear exactly once")
  for (key in expected) {
    if (key_count[key] != 1) die(key " must appear exactly once in authoritative block")
    if (actual[key] != expected[key]) die(key " expected " expected[key] " but found " actual[key])
  }
}
' "$MANIFEST" || fail 'owner decision key/value invariant failed in manifest'

resolution_expected=(
  'form_title_font_size: NON_NORMATIVE_REFERENCE'
  'form_title_line_height: NON_NORMATIVE_REFERENCE'
  'helper_text_font_size: NON_NORMATIVE_REFERENCE'
  'field_error_font_size: NON_NORMATIVE_REFERENCE'
  'desktop_title_enhancement: NON_NORMATIVE_REFERENCE'
  'focus_ring_exact_geometry: NOT_PROVEN'
  'focus_ring_exact_alpha: NOT_PROVEN'
  'field_vertical_rhythm: NON_NORMATIVE_REFERENCE'
  'major_section_rhythm: NON_NORMATIVE_REFERENCE'
  'desktop_short_field_pairings: NOT_PROVEN'
  'desktop_shadow_exact_value: NOT_PROVEN'
)
for expected in "${resolution_expected[@]}"; do
  require_fixed "$CONTRACT" "$expected" "determinism/status failure: expected '$expected'"
done

runtime_expected=(
  'actual_gravity_forms_markup: NOT_PROVEN'
  'actual_persiangravity_date_widget: NOT_PROVEN'
  'gpas_populate_anything_configuration: NOT_PROVEN'
  'gpfup_crop_ratio_dimensions: NOT_PROVEN'
  'keyboard_order: NOT_PROVEN'
  'focus_management: NOT_PROVEN'
  'aria_relations: NOT_PROVEN'
  'screen_reader_output: NOT_PROVEN'
  'exact_production_breakpoint: NOT_PROVEN'
  'runtime_contrast_after_host_css: NOT_PROVEN'
)
for expected in "${runtime_expected[@]}"; do
  require_fixed "$CONTRACT" "$expected" "runtime gap promotion/removal: expected '$expected'"
done

if grep -Eq '^[[:space:]]*status:[[:space:]]*APPROVED([[:space:]]|$)' "$MANIFEST"; then
  fail 'gallery/reference approval is forbidden before runtime validation'
fi

# PRI-FND-003 provenance enforcement. The currently admitted source state is
# UNBOUND_EXTERNAL. BOUND_REPLAYABLE is accepted only when a future/fixture
# reference supplies the complete replayable semantics required by policy.
awk '
function trim(s) { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }
function value_after_colon(line) { sub(/^[^:]*:[[:space:]]*/, "", line); return trim(line) }
function die(msg, code) { print msg > "/dev/stderr"; exit code }
function reset_ref() {
  have_provenance=provenance_count=0
  have_pstate=have_replayable=have_repo=have_identity=have_locator=have_sha=have_role=0
  pstate=replayable=repo=identity=locator=sha=role=""
  in_prov=0
}
function validate_ref() {
  if (!in_ref) return
  if (provenance_count != 1) die("provenance block count invalid for " ref, 40)
  if (have_pstate != 1) die("missing or duplicate provenance state for " ref, 41)
  if (have_replayable != 1) die("missing or duplicate replayable flag for " ref, 42)
  if (have_repo != 1) die("missing or duplicate repository_path for " ref, 43)
  if (have_identity != 1) die("missing or duplicate immutable_identity for " ref, 44)
  if (have_sha != 1) die("missing or duplicate sha256 state for " ref, 45)
  if (have_role != 1) die("missing or duplicate claim_role for " ref, 46)

  if (pstate == "UNBOUND_EXTERNAL") {
    if (replayable != "false") die("unbound provenance contradiction for " ref ": replayable must be false", 47)
    if (repo != "null") die("unbound provenance contradiction for " ref ": repository_path must be null", 48)
    if (identity != "null") die("unbound provenance contradiction for " ref ": immutable_identity must be null", 49)
    if (have_locator == 1 && locator != "null") die("unbound provenance contradiction for " ref ": immutable_locator must be null", 50)
    if (sha != "UNCOMPUTED") die("unbound provenance contradiction for " ref ": sha256 must be UNCOMPUTED", 51)
    if (role != "SUPPORTING_ONLY") die("unsupported canonical source for " ref ": claim_role=" role, 52)
    return
  }

  if (pstate != "BOUND_REPLAYABLE") die("unsupported provenance state for " ref ": " pstate, 53)
  if (replayable != "true") die("bound provenance contradiction for " ref ": replayable must be true", 54)
  if (repo == "null" && (have_locator != 1 || locator == "null")) die("bound provenance missing durable locator for " ref, 55)
  if (identity == "null") die("bound provenance missing immutable identity for " ref, 56)
  if (length(sha) != 64 || sha !~ /^[0-9A-Fa-f]+$/) die("bound provenance invalid sha256 for " ref, 57)
  if (role != "SUPPORTING_ONLY") die("bound provenance disallowed claim_role for " ref ": " role, 58)
}
/^[[:space:]]*- reference_id:/ {
  validate_ref()
  in_ref=1
  ref=$0; sub(/^.*reference_id:[[:space:]]*/, "", ref); ref=trim(ref)
  reset_ref()
  in_ref=1
  next
}
in_ref && /^    provenance:[[:space:]]*$/ {
  provenance_count++
  have_provenance=1
  in_prov=1
  next
}
in_ref && in_prov && /^    [^[:space:]][^:]*:/ { in_prov=0 }
in_ref && in_prov && /^      state:[[:space:]]*/ {
  have_pstate++; pstate=value_after_colon($0); next
}
in_ref && in_prov && /^      replayable:[[:space:]]*/ {
  have_replayable++; replayable=value_after_colon($0); next
}
in_ref && in_prov && /^      repository_path:[[:space:]]*/ {
  have_repo++; repo=value_after_colon($0); next
}
in_ref && in_prov && /^      immutable_identity:[[:space:]]*/ {
  have_identity++; identity=value_after_colon($0); next
}
in_ref && in_prov && /^      immutable_locator:[[:space:]]*/ {
  have_locator++; locator=value_after_colon($0); next
}
in_ref && in_prov && /^      sha256:[[:space:]]*/ {
  have_sha++; sha=value_after_colon($0); next
}
in_ref && in_prov && /^      claim_role:[[:space:]]*/ {
  have_role++; role=value_after_colon($0); next
}
END { validate_ref() }
' "$MANIFEST" || fail 'visual-reference provenance invariant failed'

if grep -Eq '^[[:space:]]+canonical_for:' "$MANIFEST"; then
  fail 'unsupported canonical source: visual reference contains canonical_for'
fi
if grep -Eq 'claim_role:[[:space:]]*CANONICAL' "$MANIFEST"; then
  fail 'unsupported canonical source: visual reference claims canonical authority'
fi

printf 'VISUAL_GOVERNANCE_PASS\n'
