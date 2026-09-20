#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SMOKE="$ROOT/scripts/release/smoke-zip.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

source "$ROOT/scripts/release/release-lib.sh"

fail() {
    echo "GPP_SMOKE_ENDPOINT_CONTRACT_FAIL: $*" >&2
    exit 1
}

assert_endpoint() {
    local base_url="$1" expected_host="$2" expected_port="$3"
    local resolved host port
    resolved="$(release_parse_smoke_endpoint "$base_url")" || fail "Expected endpoint to resolve: $base_url"
    IFS=$'\t' read -r host port <<<"$resolved"
    [[ "$host" == "$expected_host" ]] || fail "Unexpected bind host for $base_url: $host"
    [[ "$port" == "$expected_port" ]] || fail "Unexpected bind port for $base_url: $port"
}

assert_endpoint_fails() {
    local base_url="$1" expected_message="$2"
    local stdout="$WORK/endpoint.out" stderr="$WORK/endpoint.err"
    if release_parse_smoke_endpoint "$base_url" >"$stdout" 2>"$stderr"; then
        fail "Invalid endpoint was accepted: $base_url"
    fi
    grep -Fq "$expected_message" "$stderr" || {
        cat "$stderr" >&2
        fail "Missing endpoint failure diagnostic '$expected_message' for: $base_url"
    }
}

assert_smoke_launch_uses_resolved_endpoint() {
    local smoke_file="$1"
    grep -Fq 'BASE_URL="${GPP_RELEASE_BASE_URL-http://127.0.0.1:8090}"' "$smoke_file" || return 1
    grep -Fq 'SMOKE_ENDPOINT="$(release_parse_smoke_endpoint "$BASE_URL")"' "$smoke_file" || return 1
    grep -Fq 'IFS=$'"'"'\t'"'"' read -r SERVER_HOST SERVER_PORT <<<"$SMOKE_ENDPOINT"' "$smoke_file" || return 1
    grep -Fq -- '--host="$SERVER_HOST" --port="$SERVER_PORT"' "$smoke_file" || return 1
    if grep -Fq -- '--port=8090' "$smoke_file"; then
        return 1
    fi
    grep -Fq 'curl -fsS "$BASE_URL/wp-login.php"' "$smoke_file" || return 1
    grep -Fq '"$ROOT" "$ZIP" "$WPCLI" "$WP_PATH" "$BASE_URL" "$BEHAVIOR_DIR"' "$smoke_file" || return 1
}

bash -n "$SMOKE"

# Default release endpoint.
assert_endpoint 'http://127.0.0.1:8090' '127.0.0.1' '8090'

# Historical post-publication endpoint that exposed the old split authority.
assert_endpoint 'http://127.0.0.1:8091' '127.0.0.1' '8091'

# The other already-admitted local loopback form remains supported.
assert_endpoint 'http://localhost:8091' 'localhost' '8091'

# Explicit invalid configuration must fail closed; no fallback to 8090.
assert_endpoint_fails '' 'Smoke BASE_URL is required.'
assert_endpoint_fails 'http://127.0.0.1:not-a-port' 'unable to parse URL'
assert_endpoint_fails 'http://127.0.0.1:70000' 'unable to parse URL'
assert_endpoint_fails 'http://127.0.0.1' 'explicit numeric port 1..65535 is required'
assert_endpoint_fails 'https://127.0.0.1:8091' 'scheme must be http'
assert_endpoint_fails 'http://example.com:8091' 'host must be local loopback'
assert_endpoint_fails 'http://user:secret@127.0.0.1:8091' 'userinfo is not allowed'

# The real launch path must consume the derived bind values while readiness and
# behavioral reachability continue consuming the exact configured BASE_URL.
assert_smoke_launch_uses_resolved_endpoint "$SMOKE" || fail 'Smoke launch/client endpoint contract is not wired to one authority.'

# Falsification: recreating the historical hard-coded launch must be rejected.
MUTATED="$WORK/smoke-hardcoded-port.sh"
cp "$SMOKE" "$MUTATED"
sed -i 's/--host="$SERVER_HOST" --port="$SERVER_PORT"/--host=127.0.0.1 --port=8090/' "$MUTATED"
if assert_smoke_launch_uses_resolved_endpoint "$MUTATED"; then
    fail 'Historical hard-coded 8090 server launch was not rejected by the regression guard.'
fi

echo 'GPP_SMOKE_ENDPOINT_CONTRACT_PASS default=8090 alternate=8091 invalid=fail_closed launch=derived'
