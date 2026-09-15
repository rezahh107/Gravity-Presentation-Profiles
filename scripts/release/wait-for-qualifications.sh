#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/release-lib.sh"
source_sha="${1:?usage: wait-for-qualifications.sh SOURCE_SHA CI_EVENT}"
ci_event="${2:?missing Repository CI event}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"
max_attempts="${GPP_QUALIFICATION_WAIT_ATTEMPTS:-360}"
interval="${GPP_QUALIFICATION_WAIT_INTERVAL:-10}"
required=("Repository CI" "WU21 Reproducible Evidence Lab" "SRWF Registration Authentic Runtime" "WU18 Entry Detail Runtime" "WU19 A4 Print Runtime")
for ((attempt=1; attempt<=max_attempts; attempt++)); do
  json="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs?head_sha=$source_sha&per_page=100")"
  all_pass=true
  for name in "${required[@]}"; do
    event="workflow_dispatch"; [[ "$name" == "Repository CI" ]] && event="$ci_event"
    record="$(jq -c --arg n "$name" --arg e "$event" --arg s "$source_sha" '[.workflow_runs[] | select(.name==$n and .event==$e and .head_sha==$s)] | sort_by(.created_at) | last // {}' <<<"$json")"
    status="$(jq -r '.status // "missing"' <<<"$record")"
    conclusion="$(jq -r '.conclusion // ""' <<<"$record")"
    if [[ "$status" == "completed" && "$conclusion" != "success" ]]; then
      fail "$name qualification failed: $conclusion"
    fi
    if [[ "$status" != "completed" || "$conclusion" != "success" ]]; then all_pass=false; fi
  done
  if $all_pass; then
    echo GPP_RELEASE_REQUIRED_QUALIFICATION_PASS
    exit 0
  fi
  sleep "$interval"
done
fail "timed out waiting for exact-source qualification"
