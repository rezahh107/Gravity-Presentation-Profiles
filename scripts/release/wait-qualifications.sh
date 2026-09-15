#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-}"
SHA="${2:-}"
OUTPUT="${3:-qualification.json}"
[[ -n "$BRANCH" && "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Usage: wait-qualifications.sh <branch> <sha> <output>' >&2; exit 2; }
command -v gh >/dev/null
command -v jq >/dev/null

WORKFLOWS=(
  'ci.yml'
  'wu21-repro-evidence-lab.yml'
  'srwf-registration-runtime.yml'
  'wu18-entry-detail-runtime.yml'
  'wu19-a4-print-runtime.yml'
)

for workflow in "${WORKFLOWS[@]}"; do
    gh workflow run "$workflow" --ref "$BRANCH"
done

printf '[]\n' > "$OUTPUT"
for workflow in "${WORKFLOWS[@]}"; do
    run_id=''
    for _ in $(seq 1 30); do
        runs="$(gh run list --workflow "$workflow" --branch "$BRANCH" --event workflow_dispatch --limit 20 --json databaseId,headSha,status,conclusion)"
        run_id="$(printf '%s' "$runs" | jq -r --arg sha "$SHA" '[.[] | select(.headSha == $sha)] | sort_by(.databaseId) | last | .databaseId // empty')"
        [[ -n "$run_id" ]] && break
        sleep 2
    done
    [[ -n "$run_id" ]] || { echo "No exact-source workflow run appeared for $workflow" >&2; exit 1; }
    gh run watch "$run_id" --exit-status
    row="$(gh run view "$run_id" --json databaseId,headSha,conclusion,workflowName)"
    observed_sha="$(printf '%s' "$row" | jq -r '.headSha')"
    conclusion="$(printf '%s' "$row" | jq -r '.conclusion')"
    [[ "$observed_sha" == "$SHA" ]] || { echo "Workflow $workflow ran a different source: $observed_sha" >&2; exit 1; }
    [[ "$conclusion" == 'success' ]] || { echo "Workflow $workflow did not succeed: $conclusion" >&2; exit 1; }
    tmp="$(mktemp)"
    jq --argjson row "$row" '. + [$row]' "$OUTPUT" > "$tmp"
    mv "$tmp" "$OUTPUT"
done

printf 'GPP_RELEASE_REQUIRED_QUALIFICATION_PASS source=%s\n' "$SHA"
