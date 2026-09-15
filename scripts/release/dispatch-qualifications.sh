#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/release-lib.sh"
source_sha="${1:?usage: dispatch-qualifications.sh SOURCE_SHA REF}"
ref="${2:?missing ref}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"
command -v gh >/dev/null || fail "gh CLI unavailable"
for workflow in wu21-repro-evidence-lab.yml srwf-registration-runtime.yml wu18-entry-detail-runtime.yml wu19-a4-print-runtime.yml; do
  gh workflow run "$workflow" --repo "$GITHUB_REPOSITORY" --ref "$ref"
done
sleep 3
echo GPP_RELEASE_QUALIFICATION_DISPATCH_PASS
