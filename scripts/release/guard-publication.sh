#!/usr/bin/env bash
set -euo pipefail
[[ "${GPP_RELEASE_MODE:-}" == "publish" ]] || { echo "Production publication is disabled in mode=${GPP_RELEASE_MODE:-unset}." >&2; exit 1; }
[[ "${GPP_RELEASE_AUTHORIZED:-}" == "true" ]] || { echo "Explicit production authorization is missing." >&2; exit 1; }
echo GPP_RELEASE_PUBLICATION_GUARD_PASS
