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

# C-001: five owner-closed decisions must remain exact in both rule authority and manifest.
for file in "$CONTRACT" "$MANIFEST"; do
  require_fixed "$file" 'mobile_horizontal_padding:' 'owner decision missing: mobile_horizontal_padding'
  require_fixed "$file" '16px' 'owner decision mutated: mobile_horizontal_padding must remain 16px'
  require_fixed "$file" 'help_text_placement:' 'owner decision missing: help_text_placement'
  require_fixed "$file" 'below_input' 'owner decision mutated: below_input placement missing'
  require_fixed "$file" 'validation_message_placement:' 'owner decision missing: validation_message_placement'
  require_fixed "$file" 'control_border:' 'owner decision missing: control_border'
  require_fixed "$file" '"#8690A1"' 'owner decision mutated: control_border must remain #8690A1'
  require_fixed "$file" 'desktop_outer_surface:' 'owner decision missing: desktop_outer_surface'
done
require_fixed "$CONTRACT" 'value: white_card' 'owner decision mutated: desktop_outer_surface must remain white_card'
require_fixed "$MANIFEST" 'desktop_outer_surface: white_card' 'owner decision mutated in manifest: desktop_outer_surface must remain white_card'

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

awk '
function validate_ref() {
  if (!in_ref) return
  if (!have_provenance) { print "missing provenance for " ref > "/dev/stderr"; exit 41 }
  if (!have_pstate) { print "missing provenance state for " ref > "/dev/stderr"; exit 42 }
  if (!have_replayable) { print "missing replayable flag for " ref > "/dev/stderr"; exit 43 }
  if (!have_sha) { print "missing sha256 state for " ref > "/dev/stderr"; exit 44 }
  if (!have_role) { print "missing claim_role for " ref > "/dev/stderr"; exit 45 }
  if (pstate == "UNBOUND_EXTERNAL") {
    if (replayable != "false") { print "unbound source marked replayable for " ref > "/dev/stderr"; exit 46 }
    if (sha != "UNCOMPUTED") { print "unbound source has fabricated/non-uncomputed digest for " ref > "/dev/stderr"; exit 47 }
    if (role != "SUPPORTING_ONLY") { print "unsupported canonical source for " ref ": claim_role=" role > "/dev/stderr"; exit 48 }
  }
}
/^[[:space:]]*- reference_id:/ {
  validate_ref()
  in_ref=1
  ref=$0; sub(/^.*reference_id:[[:space:]]*/, "", ref)
  have_provenance=have_pstate=have_replayable=have_sha=have_role=0
  pstate=replayable=sha=role=""
  next
}
in_ref && /^[[:space:]]+provenance:[[:space:]]*$/ { have_provenance=1; next }
in_ref && have_provenance && /^      state:[[:space:]]*/ && !have_pstate {
  line=$0; sub(/^.*state:[[:space:]]*/, "", line); pstate=line; have_pstate=1; next
}
in_ref && have_provenance && /^      replayable:[[:space:]]*/ {
  line=$0; sub(/^.*replayable:[[:space:]]*/, "", line); replayable=line; have_replayable=1; next
}
in_ref && have_provenance && /^      sha256:[[:space:]]*/ {
  line=$0; sub(/^.*sha256:[[:space:]]*/, "", line); sha=line; have_sha=1; next
}
in_ref && have_provenance && /^      claim_role:[[:space:]]*/ {
  line=$0; sub(/^.*claim_role:[[:space:]]*/, "", line); role=line; have_role=1; next
}
END { validate_ref() }
' "$MANIFEST" || fail 'visual-reference provenance invariant failed'

if grep -Eq '^[[:space:]]+canonical_for:' "$MANIFEST"; then
  fail 'unsupported canonical source: unbound reference contains canonical_for'
fi
if grep -Eq 'claim_role:[[:space:]]*CANONICAL' "$MANIFEST"; then
  fail 'unsupported canonical source: unbound visual reference claims canonical authority'
fi

printf 'VISUAL_GOVERNANCE_PASS\n'
