#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD_REL="scripts/validate-production-reachability.sh"
EXTRACTOR_REL="scripts/extract-production-references.php"
TMP="$(mktemp -d)"
# Every mutation below is applied only to a copied fixture tree; repository production source is never edited.
trap 'rm -rf "$TMP"' EXIT

php -l "$ROOT/$EXTRACTOR_REL" >/dev/null

fixture() {
  local name="$1"
  local dir="$TMP/$name"
  mkdir -p "$dir/scripts"
  cp "$ROOT/gravity-presentation-profiles.php" "$dir/"
  cp -R "$ROOT/src" "$dir/"
  cp "$ROOT/$GUARD_REL" "$dir/$GUARD_REL"
  cp "$ROOT/$EXTRACTOR_REL" "$dir/$EXTRACTOR_REL"
  printf '%s\n' "$dir"
}

synthetic_class() {
  local dir="$1"
  local name="$2"
  mkdir -p "$dir/src/Synthetic"
  printf '%s\n' "<?php namespace GravityPresentationProfiles\\Synthetic; final class $name {}" > "$dir/src/Synthetic/$name.php"
}

expect_pass() {
  local dir="$1"
  local output
  if ! output="$(bash "$dir/$GUARD_REL" "$dir" 2>&1)"; then
    echo "$output" >&2
    echo "Expected reachability guard PASS for fixture: $dir" >&2
    exit 1
  fi
  printf '%s\n' "$output"
}

expect_fail_with() {
  local dir="$1"
  local needle="$2"
  local output
  if output="$(bash "$dir/$GUARD_REL" "$dir" 2>&1)"; then
    echo "$output" >&2
    echo "Expected reachability guard FAIL for fixture: $dir" >&2
    exit 1
  fi
  grep -Fq -- "$needle" <<<"$output" || {
    echo "$output" >&2
    echo "Guard failed, but expected diagnostic was absent: $needle" >&2
    exit 1
  }
}

baseline="$(fixture baseline)"
baseline_output="$(expect_pass "$baseline")"
for required in \
  'src/SRWF/GravityFlow/InboxPresentationAdapter.php' \
  'src/SRWF/GravityFlow/InboxPresentationModel.php' \
  'src/Core/Lifecycle/VisualPackageLifecycle.php' \
  'src/Core/Lifecycle/BindingSetLifecycle.php' \
  'src/Core/Lifecycle/EvidenceReferenceGate.php' \
  'src/Core/Lifecycle/WordPressOptionStateStore.php' \
  'src/Core/Portable/SemanticBindingResolver.php' \
  'src/Core/Portable/VisualProfilePackage.php' \
  'src/Core/Portable/EnvironmentBindingSet.php'; do
  grep -Fq "REACHABLE_PRODUCTION $required" <<<"$baseline_output" || {
    echo "$baseline_output" >&2
    echo "Expected post-WU17 production path to reach: $required" >&2
    exit 1
  }
done

grep -Fq 'DEFERRED_UNREACHABLE src/Core/Lifecycle/SettingsLifecycleWorkflow.php' <<<"$baseline_output"
grep -Fq 'DEFERRED_UNREACHABLE src/Core/Portable/VisualProfileResolver.php' <<<"$baseline_output"

missing_required="$(fixture missing-required)"
rm "$missing_required/src/Core/Lifecycle/VisualPackageLifecycle.php"
expect_fail_with "$missing_required" 'required post-WU17 production file is missing: src/Core/Lifecycle/VisualPackageLifecycle.php'

unreachable="$(fixture unreachable)"
synthetic_class "$unreachable" 'Unreachable'
expect_fail_with "$unreachable" 'src/Synthetic/Unreachable.php'

comment_only="$(fixture comment-only)"
synthetic_class "$comment_only" 'CommentOnly'
printf '%s\n' '// GravityPresentationProfiles\Synthetic\CommentOnly::touch();' >> "$comment_only/src/Bootstrap.php"
expect_fail_with "$comment_only" 'src/Synthetic/CommentOnly.php'

docblock_only="$(fixture docblock-only)"
synthetic_class "$docblock_only" 'DocblockOnly'
cat >> "$docblock_only/src/Bootstrap.php" <<'PHP'
/** GravityPresentationProfiles\Synthetic\DocblockOnly::touch(); */
PHP
expect_fail_with "$docblock_only" 'src/Synthetic/DocblockOnly.php'

string_only="$(fixture string-only)"
synthetic_class "$string_only" 'StringOnly'
cat >> "$string_only/src/Bootstrap.php" <<'PHP'
$not_a_dependency = 'GravityPresentationProfiles\Synthetic\StringOnly';
PHP
expect_fail_with "$string_only" 'src/Synthetic/StringOnly.php'

unused_import="$(fixture unused-import)"
synthetic_class "$unused_import" 'UnusedImport'
sed -i '/^namespace GravityPresentationProfiles;$/a use GravityPresentationProfiles\\Synthetic\\UnusedImport;' "$unused_import/src/Bootstrap.php"
expect_fail_with "$unused_import" 'src/Synthetic/UnusedImport.php'

static_reference="$(fixture static-reference)"
synthetic_class "$static_reference" 'StaticReference'
sed -i '/^namespace GravityPresentationProfiles;$/a use GravityPresentationProfiles\\Synthetic\\StaticReference as SyntheticStaticReference;' "$static_reference/src/Bootstrap.php"
printf '%s\n' 'SyntheticStaticReference::touch();' >> "$static_reference/src/Bootstrap.php"
expect_pass "$static_reference" >/dev/null

dynamic="$(fixture dynamic)"
synthetic_class "$dynamic" 'Dynamic'
cat >> "$dynamic/src/Bootstrap.php" <<'PHP'
$synthetic_class = 'GravityPresentationProfiles\Synthetic\Dynamic';
if ( class_exists( $synthetic_class ) ) {
    \GFAddOn::register( $synthetic_class );
}
PHP
expect_pass "$dynamic" >/dev/null

unsupported_dynamic="$(fixture unsupported-dynamic)"
synthetic_class "$unsupported_dynamic" 'UnsupportedDynamic'
cat >> "$unsupported_dynamic/src/Bootstrap.php" <<'PHP'
$synthetic_prefix = "GravityPresentationProfiles\\Synthetic\\";
$unsupported_class = $synthetic_prefix . 'UnsupportedDynamic';
class_exists( $unsupported_class );
PHP
expect_fail_with "$unsupported_dynamic" 'GPP_PRODUCTION_REACHABILITY_UNSUPPORTED_DYNAMIC:'

deferred="$(fixture deferred)"
synthetic_class "$deferred" 'Allowed'
sed -i '/^DEFERRED_UNREACHABLE=(/a\  "src/Synthetic/Allowed.php"' "$deferred/$GUARD_REL"
expect_pass "$deferred" >/dev/null
synthetic_class "$deferred" 'StillOrphan'
expect_fail_with "$deferred" 'src/Synthetic/StillOrphan.php'

test_only="$(fixture test-only)"
synthetic_class "$test_only" 'TestOnly'
mkdir -p "$test_only/tests"
printf '%s\n' '<?php new \GravityPresentationProfiles\Synthetic\TestOnly();' > "$test_only/tests/test-only-reference.php"
expect_fail_with "$test_only" 'src/Synthetic/TestOnly.php'

deferred_reachable="$(fixture deferred-reachable)"
synthetic_class "$deferred_reachable" 'NowReachable'
sed -i '/^DEFERRED_UNREACHABLE=(/a\  "src/Synthetic/NowReachable.php"' "$deferred_reachable/$GUARD_REL"
printf '%s\n' '\GravityPresentationProfiles\Synthetic\NowReachable::touch();' >> "$deferred_reachable/src/Bootstrap.php"
expect_fail_with "$deferred_reachable" 'deferred allowlist entry is now production-reachable and should be removed: src/Synthetic/NowReachable.php'

echo 'GPP_PRODUCTION_REACHABILITY_GUARDRAIL_PASS'
