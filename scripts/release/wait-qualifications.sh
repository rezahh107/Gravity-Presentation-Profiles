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
  'srwf-journey-host-qualification.yml'
  'wu18-entry-detail-runtime.yml'
  'wu19-a4-print-runtime.yml'
)

# Read-only discovery can tolerate only short-lived GitHub API 5xx responses.
# Retries here NEVER re-dispatch: the six canonical dispatches remain below.
discover_run_id() {
    local workflow="$1" attempt response err selected
    for (( attempt=1; attempt<=6; attempt++ )); do
        err="$(mktemp)"
        if response="$(gh run list --workflow "$workflow" --branch "$BRANCH" --event workflow_dispatch --limit 20 --json databaseId,headSha,headBranch,event,status,conclusion 2>"$err")"; then
            rm -f "$err"
            # A valid discovery is exactly one JSON array; every returned run
            # must have the same source, branch and dispatch event.
            if ! selected="$(printf '%s' "$response" | jq -s -er \
                --arg sha "$SHA" --arg branch "$BRANCH" '
                if length != 1 or (.[0] | type) != "array" then
                    error("Malformed qualification discovery document")
                elif any(.[0][]; (type != "object") or
                    (.databaseId | type) != "number" or
                    (.databaseId <= 0) or
                    (.databaseId | floor) != .databaseId or
                    (.headSha != $sha) or
                    (.headBranch != $branch) or
                    (.event != "workflow_dispatch") or
                    (.status | type) != "string" or
                    ((.conclusion != null) and ((.conclusion | type) != "string"))) then
                    error("Qualification discovery identity or field mismatch")
                elif ([.[0][].databaseId] | unique | length) != (.[0] | length) then
                    error("Duplicate run IDs in qualification discovery")
                else
                    [.[0][] | select(.headSha == $sha) | .databaseId] | sort | last // ""
                end
                ' 2>/dev/null)"; then
                echo "Malformed or mismatched exact-candidate run discovery: $workflow" >&2
                return 1
            fi
            printf '%s\n' "$selected"
            return 0
        fi
        # Only a bounded read-only 5xx is retryable; permission errors stop.
        if ! grep -Eq 'HTTP (500|502|503|504)([^0-9]|$)' "$err" ||
           grep -Eq 'HTTP (401|403)([^0-9]|$)' "$err"; then
            rm -f "$err"
            echo "Non-retryable qualification discovery API error: $workflow" >&2
            return 1
        fi
        rm -f "$err"
        if (( attempt == 6 )); then
            echo "GitHub 5xx discovery retries exhausted: $workflow" >&2
            return 1
        fi
        echo "Transient GitHub API 5xx during discovery; read-only retry $attempt/5: $workflow" >&2
        sleep 2
    done
}

for workflow in "${WORKFLOWS[@]}"; do
    gh workflow run "$workflow" --ref "$BRANCH"
done

printf '[]\n' > "$OUTPUT"
for workflow in "${WORKFLOWS[@]}"; do
    run_id=''
    for _ in $(seq 1 30); do
        run_id="$(discover_run_id "$workflow")"
        [[ -n "$run_id" ]] && break
        sleep 2
    done
    [[ -n "$run_id" ]] || { echo "No exact-source workflow run appeared for $workflow" >&2; exit 1; }
    # Read-only bounded polling survives a transient GitHub API 5xx while
    # preserving exact source, branch and completed-success requirements.
    # No re-dispatch or "success" inferred from a temporary API failure.
    row="$(bash "$(dirname "$0")/poll-qualification-run.sh" "$run_id" "$SHA" "$BRANCH" "$workflow")"
    observed_sha="$(printf '%s' "$row" | jq -r '.headSha')"
    conclusion="$(printf '%s' "$row" | jq -r '.conclusion')"
    [[ "$observed_sha" == "$SHA" ]] || { echo "Workflow $workflow ran a different source: $observed_sha" >&2; exit 1; }
    [[ "$conclusion" == 'success' ]] || { echo "Workflow $workflow did not succeed: $conclusion" >&2; exit 1; }
    tmp="$(mktemp)"
    jq --argjson row "$row" '. + [$row]' "$OUTPUT" > "$tmp"
    mv "$tmp" "$OUTPUT"
done

printf 'GPP_RELEASE_REQUIRED_QUALIFICATION_PASS source=%s\n' "$SHA"
