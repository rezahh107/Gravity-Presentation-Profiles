#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKFLOW="$ROOT/.github/workflows/release-recovery.yml"
RELEASE_WORKFLOW="$ROOT/.github/workflows/release.yml"
RUNNER="$ROOT/tests/release/run-behavioral-production-reachability.sh"
GUARDRAIL="$ROOT/tests/release/behavioral-anti-bypass-guardrail.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
    echo "$1" >&2
    exit 1
}

[[ -f "$WORKFLOW" ]] || fail "Missing Recovery workflow: $WORKFLOW"
[[ -f "$RELEASE_WORKFLOW" ]] || fail "Missing release workflow: $RELEASE_WORKFLOW"
[[ -f "$RUNNER" ]] || fail "Missing behavioral runner: $RUNNER"
[[ -f "$GUARDRAIL" ]] || fail "Missing behavioral anti-bypass guardrail: $GUARDRAIL"

STEP_SCRIPT="$WORK/recovery-smoke-step.sh"
awk '
    $0 == "      - name: Re-run clean last-mile smoke against the already-published ZIP" { in_step=1; next }
    in_step && $0 == "        run: |" { in_run=1; next }
    in_run && $0 ~ /^      - name:/ { exit }
    in_run {
        sub(/^          /, "")
        print
    }
' "$WORKFLOW" > "$STEP_SCRIPT"

[[ -s "$STEP_SCRIPT" ]] || fail 'Could not extract the Recovery smoke call boundary.'
grep -Fqx 'test -n "$GPP_RECOVERY_VERSION"' "$STEP_SCRIPT" || fail 'Recovery smoke boundary must assert a non-empty GPP_RECOVERY_VERSION.'
grep -Fqx 'export GPP_RELEASE_VERSION="$GPP_RECOVERY_VERSION"' "$STEP_SCRIPT" || fail 'Recovery smoke boundary must adapt GPP_RECOVERY_VERSION to GPP_RELEASE_VERSION.'
grep -Fqx 'bash scripts/release/smoke-zip.sh . "$GPP_RECOVERY_ZIP" /tmp/gpp-release-recovery-wordpress' "$STEP_SCRIPT" || fail 'Recovery smoke boundary must invoke smoke-zip.sh unchanged after the version adapter.'

SMOKE_CALLS="$(grep -Fc 'scripts/release/smoke-zip.sh' "$WORKFLOW")"
[[ "$SMOKE_CALLS" == '1' ]] || fail "Expected exactly one Recovery smoke-zip.sh invocation, found $SMOKE_CALLS. Audit every Recovery behavioral entry point."
if grep -Fq 'tests/release/run-behavioral-production-reachability.sh' "$WORKFLOW"; then
    fail 'Recovery must not bypass smoke-zip.sh with a direct behavioral runner invocation.'
fi
if grep -Fq 'echo "GPP_RELEASE_VERSION=' "$WORKFLOW"; then
    fail 'Recovery must keep GPP_RELEASE_VERSION process-local to the smoke call boundary, not write it to GITHUB_ENV.'
fi
if grep -Fq 'GPP_RECOVERY_VERSION' "$RUNNER"; then
    fail 'Shared behavioral runner must not gain a Recovery-specific version fallback.'
fi
grep -Fqx 'EXPECTED_VERSION="${GPP_RELEASE_VERSION:-${GPP_RELEASE_DRY_VERSION:-}}"' "$RUNNER" || fail 'Shared behavioral runner canonical release/dry-run identity expression changed.'

FAKE_ROOT="$WORK/fake-root"
mkdir -p "$FAKE_ROOT/scripts/release"
cat > "$FAKE_ROOT/scripts/release/smoke-zip.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "${GPP_RELEASE_VERSION:-}" > "$GPP_RECOVERY_CAPTURE"
printf '%s\n' "$*" > "$GPP_RECOVERY_ARGS_CAPTURE"
SH
chmod +x "$FAKE_ROOT/scripts/release/smoke-zip.sh"

run_propagation_control() {
    local recovery_version="$1"
    local capture="$WORK/canonical-$recovery_version.txt"
    local args="$WORK/args-$recovery_version.txt"
    (
        cd "$FAKE_ROOT"
        GPP_RECOVERY_VERSION="$recovery_version" \
        GPP_RECOVERY_ZIP="/tmp/gravity-presentation-profiles-$recovery_version.zip" \
        GPP_RECOVERY_CAPTURE="$capture" \
        GPP_RECOVERY_ARGS_CAPTURE="$args" \
        bash "$STEP_SCRIPT"
    )
    [[ "$(cat "$capture")" == "$recovery_version" ]] || fail "Recovery version $recovery_version did not propagate as GPP_RELEASE_VERSION."
    grep -Fqx ". /tmp/gravity-presentation-profiles-$recovery_version.zip /tmp/gpp-release-recovery-wordpress" "$args" || fail "Recovery smoke arguments changed for $recovery_version."
}

run_propagation_control '0.2.0'
run_propagation_control '0.2.1'

MISSING_CAPTURE="$WORK/missing-canonical.txt"
MISSING_ARGS="$WORK/missing-args.txt"
if (
    cd "$FAKE_ROOT"
    GPP_RECOVERY_VERSION='' \
    GPP_RECOVERY_ZIP='/tmp/gravity-presentation-profiles-missing.zip' \
    GPP_RECOVERY_CAPTURE="$MISSING_CAPTURE" \
    GPP_RECOVERY_ARGS_CAPTURE="$MISSING_ARGS" \
    bash "$STEP_SCRIPT"
) >/dev/null 2>&1; then
    fail 'Recovery smoke boundary accepted an empty GPP_RECOVERY_VERSION.'
fi
[[ ! -e "$MISSING_CAPTURE" ]] || fail 'Recovery smoke executed even though GPP_RECOVERY_VERSION was empty.'

NEG_ZIP="$WORK/negative.zip"
NEG_WPCLI="$WORK/wp-cli.phar"
NEG_WP_PATH="$WORK/wp"
NEG_EVIDENCE="$WORK/evidence"
touch "$NEG_ZIP" "$NEG_WPCLI"
mkdir -p "$NEG_WP_PATH"
NEG_ERR="$WORK/missing-version.err"
if env -u GPP_RELEASE_VERSION -u GPP_RELEASE_DRY_VERSION \
    bash "$RUNNER" "$ROOT" "$NEG_ZIP" "$NEG_WPCLI" "$NEG_WP_PATH" 'http://127.0.0.1:8090' "$NEG_EVIDENCE" \
    >"$WORK/missing-version.out" 2>"$NEG_ERR"; then
    fail 'Behavioral runner accepted missing production and dry-run release identity.'
fi
grep -Fq 'Expected release version is required for behavioral reachability identity.' "$NEG_ERR" || fail 'Behavioral runner missing-version failure semantics changed.'

bash "$GUARDRAIL" "$ROOT" >/dev/null

grep -Fq 'echo "GPP_RELEASE_VERSION=$version" >> "$GITHUB_ENV"' "$RELEASE_WORKFLOW" || fail 'Normal publish path no longer resolves GPP_RELEASE_VERSION through its established contract.'
grep -Fq 'echo '\''GPP_RELEASE_DRY_VERSION=9999.0.0'\'' >> "$GITHUB_ENV"' "$RELEASE_WORKFLOW" || fail 'Explicit dry-run identity contract changed.'

printf '%s\n' 'GPP_RECOVERY_VERSION_CONTRACT_TESTS_PASS versions=0.2.0,0.2.1 missing_version=fail_closed anti_bypass=pass'
