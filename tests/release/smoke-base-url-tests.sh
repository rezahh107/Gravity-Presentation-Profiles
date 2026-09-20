#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RESOLVER="$ROOT/scripts/release/resolve-smoke-server-endpoint.php"
SMOKE="$ROOT/scripts/release/smoke-zip.sh"

fail() {
    echo "SMOKE_BASE_URL_TEST_FAIL: $*" >&2
    exit 1
}

[[ -f "$RESOLVER" ]] || fail "missing resolver"
[[ -f "$SMOKE" ]] || fail "missing smoke script"
php -l "$RESOLVER" >/dev/null
bash -n "$SMOKE"

[[ "$(php "$RESOLVER" 'http://127.0.0.1:8090')" == $'127.0.0.1\t8090' ]] || fail "default endpoint mismatch"
[[ "$(php "$RESOLVER" 'http://127.0.0.1:8091')" == $'127.0.0.1\t8091' ]] || fail "alternate endpoint mismatch"
[[ "$(php "$RESOLVER" 'http://localhost:18091')" == $'localhost\t18091' ]] || fail "hostname endpoint mismatch"
[[ "$(php "$RESOLVER" 'http://127.0.0.1')" == $'127.0.0.1\t80' ]] || fail "implicit HTTP port mismatch"

if php "$RESOLVER" 'https://127.0.0.1:8091' >/dev/null 2>&1; then
    fail "HTTPS unexpectedly accepted for wp-cli built-in smoke server"
fi
if php "$RESOLVER" 'not-a-url' >/dev/null 2>&1; then
    fail "invalid URL unexpectedly accepted"
fi

grep -Fq 'resolve-smoke-server-endpoint.php' "$SMOKE" || fail "smoke script does not use endpoint resolver"
if grep -Fq -- '--port=8090' "$SMOKE"; then
    fail "smoke script still hard-codes port 8090"
fi
grep -Fq -- '--port="$SERVER_PORT"' "$SMOKE" || fail "smoke script does not bind resolved port"
grep -Fq -- '--host="$SERVER_HOST"' "$SMOKE" || fail "smoke script does not bind resolved host"

echo 'SMOKE_BASE_URL_TEST_PASS'
