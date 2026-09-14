#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD_REL="scripts/validate-production-reachability.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fixture() {
  local name="$1"
  local dir="$TMP/$name"
  mkdir -p "$dir/scripts"
  cp "$ROOT/gravity-presentation-profiles.php" "$dir/"
  cp -R "$ROOT/src" "$dir/"
  cp "$ROOT/$GUARD_REL" "$dir/$GUARD_REL"
  printf '%s\n' "$dir"
}

expect_pass() {
  local dir="$1"
  local output
  if ! output="$(bash "$dir/$GUARD_REL" "$dir" 2>&1)"; then
    echo "$output" >&2
    echo "Expected reachability guard PASS for fixture: $dir" >&2
    exit 1
  fi
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
    echo "Guard failed, but not for expected path: $needle" >&2
    exit 1
  }
}

baseline="$(fixture baseline)"
expect_pass "$baseline"

unreachable="$(fixture unreachable)"
mkdir -p "$unreachable/src/Synthetic"
printf '%s\n' '<?php namespace GravityPresentationProfiles\Synthetic; final class Unreachable {}' > "$unreachable/src/Synthetic/Unreachable.php"
expect_fail_with "$unreachable" 'src/Synthetic/Unreachable.php'

deferred="$(fixture deferred)"
mkdir -p "$deferred/src/Synthetic"
printf '%s\n' '<?php namespace GravityPresentationProfiles\Synthetic; final class Allowed {}' > "$deferred/src/Synthetic/Allowed.php"
sed -i '/^DEFERRED_UNREACHABLE=(/a\  "src/Synthetic/Allowed.php"' "$deferred/$GUARD_REL"
expect_pass "$deferred"
printf '%s\n' '<?php namespace GravityPresentationProfiles\Synthetic; final class StillOrphan {}' > "$deferred/src/Synthetic/StillOrphan.php"
expect_fail_with "$deferred" 'src/Synthetic/StillOrphan.php'

dynamic="$(fixture dynamic)"
mkdir -p "$dynamic/src/Synthetic"
printf '%s\n' '<?php namespace GravityPresentationProfiles\Synthetic; final class Dynamic {}' > "$dynamic/src/Synthetic/Dynamic.php"
cat >> "$dynamic/src/Bootstrap.php" <<'PHP'
<?php
$synthetic_class = 'GravityPresentationProfiles\\Synthetic\\Dynamic';
class_exists( $synthetic_class );
PHP
expect_pass "$dynamic"

test_only="$(fixture test-only)"
mkdir -p "$test_only/src/Synthetic" "$test_only/tests"
printf '%s\n' '<?php namespace GravityPresentationProfiles\Synthetic; final class TestOnly {}' > "$test_only/src/Synthetic/TestOnly.php"
printf '%s\n' '<?php new \GravityPresentationProfiles\Synthetic\TestOnly();' > "$test_only/tests/test-only-reference.php"
expect_fail_with "$test_only" 'src/Synthetic/TestOnly.php'

echo 'GPP_PRODUCTION_REACHABILITY_GUARDRAIL_PASS'
