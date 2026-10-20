#!/usr/bin/env bash
set -euo pipefail

# Only observe a previously dispatched run; never re-dispatch, tag or publish.
RUN_ID="$1"; SHA="$2"; BRANCH="$3"; WORKFLOW="$4"
MAX_POLLS=360; POLL_SECONDS=20
if (( $# >= 5 )); then MAX_POLLS="$5"; fi
if (( $# >= 6 )); then POLL_SECONDS="$6"; fi
[[ "$RUN_ID" =~ ^[1-9][0-9]*$ && "$SHA" =~ ^[0-9a-f]{40}$ && -n "$BRANCH" && -n "$WORKFLOW" ]] || exit 2
[[ "$MAX_POLLS" =~ ^[1-9][0-9]*$ ]] && (( MAX_POLLS <= 360 )) || exit 2
[[ "$POLL_SECONDS" =~ ^[0-9]+$ ]] && (( POLL_SECONDS <= 60 )) || exit 2
command -v gh >/dev/null
command -v jq >/dev/null

consecutive=0
for (( attempt=1; attempt<=MAX_POLLS; attempt++ )); do
    err="$(mktemp)"
    if row="$(gh run view "$RUN_ID" --json databaseId,headSha,headBranch,event,status,conclusion,workflowName 2>"$err")"; then
        rm -f "$err"
        consecutive=0
        if ! printf '%s' "$row" | jq -e --argjson id "$RUN_ID" --arg sha "$SHA" --arg branch "$BRANCH" \
            'type == "object" and .databaseId == $id and .headSha == $sha and .headBranch == $branch and .event == "workflow_dispatch" and (.workflowName | type == "string" and length > 0) and (.status | IN("queued", "requested", "waiting", "pending", "in_progress", "completed"))' >/dev/null; then
            echo "Qualification identity/response invalid: $WORKFLOW run=$RUN_ID" >&2
            exit 1
        fi
        status="$(printf '%s' "$row" | jq -r '.status')"
        conclusion="$(printf '%s' "$row" | jq -r '.conclusion // empty')"
        if [[ "$status" == 'completed' ]]; then
            if [[ "$conclusion" != 'success' ]]; then
                echo "Qualification failed: $WORKFLOW run=$RUN_ID conclusion=$conclusion" >&2
                exit 1
            fi
            # Preserve the prior qualification.json evidence shape.
            printf '%s' "$row" | jq -c '{databaseId,headSha,conclusion,workflowName}'
            exit 0
        fi
        if [[ -n "$conclusion" ]]; then
            echo "Uncompleted qualification carries a conclusion: $WORKFLOW run=$RUN_ID" >&2
            exit 1
        fi
    else
        # Retry only a bounded transient 5xx; never retry an auth or integrity failure.
        if ! grep -Eq 'HTTP (500|502|503|504)([^0-9]|$)' "$err"; then
            rm -f "$err"
            echo "Non-retryable GitHub qualification lookup error: $WORKFLOW run=$RUN_ID" >&2
            exit 1
        fi
        rm -f "$err"
        consecutive=$(( consecutive + 1 ))
        if (( consecutive > 5 )); then
            echo "GitHub 5xx qualification retry limit exceeded: $WORKFLOW run=$RUN_ID" >&2
            exit 1
        fi
        echo "Transient GitHub API 5xx, retry $consecutive/5: $WORKFLOW run=$RUN_ID" >&2
    fi
    if (( attempt < MAX_POLLS )); then sleep "$POLL_SECONDS"; fi
done
echo "Qualification poll limit reached without verified success: $WORKFLOW run=$RUN_ID" >&2
exit 1
