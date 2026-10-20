#!/usr/bin/env bash
# Full, isolated exact-ZIP smoke with only the parent Goal 5 invocation disabled.
# Executed after the healthy smoke, against a separate WP tree and database.
set -euo pipefail
ROOT="$(cd "${1:?Repository root required}" && pwd -P)"
ZIP="$(realpath "${2:?Canonical ZIP required}")"
[[ -f "$ZIP" && -d "$ROOT/tests/release" ]] || exit 1

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
MROOT="$WORK/source"
mkdir -p "$MROOT/tests/release" "$MROOT/build/release"
for directory in scripts src profiles; do
  ln -s "$ROOT/$directory" "$MROOT/$directory"
done
for directory in fixtures repro-evidence-lab; do
  ln -s "$ROOT/tests/$directory" "$MROOT/tests/$directory"
done
for original in "$ROOT/tests/release/"*; do
  ln -s "$original" "$MROOT/tests/release/$(basename "$original")"
done
PARENT="$MROOT/tests/release/run-behavioral-production-reachability.sh"
rm "$PARENT"
cp "$ROOT/tests/release/run-behavioral-production-reachability.sh" "$PARENT"

# Mutate exactly the executable Goal 5 call. Its literal marker remains in a
# comment, so the old grep guard's false acceptance is actually exercised.
python3 - "$PARENT" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()
call='bash "$ROOT/tests/release/run-connected-entry-detail.sh" "$ROOT" "$WPCLI" "$WP_PATH" "$BASE_URL" "$EVIDENCE_DIR"'
if s.count(call)!=1: raise SystemExit("Expected precisely one live Goal 5 parent invocation")
p.write_text(s.replace(call,'# '+call))
PY
if ! bash "$ROOT/tests/release/behavioral-anti-bypass-guardrail.sh" "$MROOT" >"$WORK/static-guard.log" 2>&1; then
  cat "$WORK/static-guard.log" >&2
  echo 'Expected original literal-marker guard to accept the commented call.' >&2
  exit 1
fi
grep -Fq GPP_BEHAVIORAL_ANTI_BYPASS_GUARDRAIL_PASS "$WORK/static-guard.log"
echo 'GPP_GOAL5_OLD_STATIC_GUARD_FALSE_ACCEPT_REPRODUCED'

# Plant complete previous successful evidence in the isolated destination.
# smoke-zip.sh MUST erase this directory before the new run, so old files
# cannot accidentally make the independent parent acceptance succeed.
EVIDENCE="$MROOT/build/release/behavioral-production-reachability"
mkdir -p "$EVIDENCE"
cp -a "$ROOT/build/release/behavioral-production-reachability/." "$EVIDENCE/"
test -s "$EVIDENCE/connected-entry-acceptance.json"
echo 'GPP_GOAL5_STALE_POSITIVE_EVIDENCE_PRESEEDED'

# A second truly installed ZIP + native WP/GF/Flow runtime, independent of the
# preceding healthy smoke, with a separately created database and WP tree.
DB_NAME="gpp_goal5_mutant_$$"
export GPP_GOAL5_MUTANT_DB="$DB_NAME"
php -r '
  $db=new mysqli("127.0.0.1",getenv("GPP_RELEASE_DB_USER") ?: "root",
    getenv("GPP_RELEASE_DB_PASS") ?: "gpp-release-root","",3306);
  if ($db->connect_errno || !preg_match("/^gpp_goal5_mutant_[0-9]+$/",getenv("GPP_GOAL5_MUTANT_DB"))
      || !$db->query("CREATE DATABASE `" . getenv("GPP_GOAL5_MUTANT_DB") . "`")) exit(1);
'
RESULT=0
GPP_RELEASE_DB_NAME="$DB_NAME" GPP_RELEASE_BASE_URL="http://127.0.0.1:8091" \
  bash "$ROOT/scripts/release/smoke-zip.sh" "$MROOT" "$ZIP" "$WORK/wordpress" \
  >"$WORK/mutant-smoke.log" 2>&1 || RESULT=$?

if [[ "$RESULT" -eq 0 ]] ||
    grep -Fq 'GPP_RELEASE_ZIP_SMOKE_PASS' "$WORK/mutant-smoke.log" ||
    ! grep -Fq 'GPP_CONNECTED_PRINT_FINAL_PASS' "$WORK/mutant-smoke.log" ||
    ! grep -Fq 'GPP_CONNECTED_ENTRY_FAIL missing before-entry-setup' "$WORK/mutant-smoke.log"; then
  tail -n 90 "$WORK/mutant-smoke.log" >&2
  echo "GPP_GOAL5_PARENT_MUTANT_FAILED_EXPECTED_REJECTION actual_status=$RESULT" >&2
  exit 1
fi
test ! -e "$EVIDENCE/connected-entry-acceptance.json"
echo "GPP_GOAL5_PARENT_MUTANT_REJECTED exit=$RESULT after_print=1 zip_smoke_success=0"
echo 'GPP_GOAL5_STALE_EVIDENCE_ERASED_AND_REJECTED'
cat > "$ROOT/build/release/goal5-parent-invocation-regression.txt" <<EOF
source_head=${GPP_RELEASE_SOURCE_SHA:-NOT_BOUND}
old_marker_guard_accepted_commented_runner=true
mutation=comment_exact_goal5_call
full_isolated_installed_zip_smoke_executed=true
preseeded_stale_positive_evidence_erased=true
print_final_stage_passed=true
independent_goal5_validator_rejected_missing_before_entry_setup=true
mutant_exit_status=$RESULT
zip_smoke_success_marker_emitted=false
EOF
