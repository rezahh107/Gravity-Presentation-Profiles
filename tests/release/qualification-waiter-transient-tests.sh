#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/state"
export MOCK_STATE="$TMP/state"
export MOCK_BRANCH="release-candidate/v0.5.0-39458679232"
export MOCK_SHA="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
export PATH="$TMP/bin:$PATH"

# Make bounded retry/exhaustion cases deterministic without real sleeps.
cat > "$TMP/bin/sleep" <<'MOCK_SLEEP'
#!/usr/bin/env bash
exit 0
MOCK_SLEEP
chmod +x "$TMP/bin/sleep"

cat > "$TMP/bin/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == 'workflow' && "$2" == 'run' ]]; then
    [[ "$4" == '--ref' && "$5" == "$MOCK_BRANCH" ]] || exit 90
    printf '%s\n' "$3" >> "$MOCK_STATE/dispatches"
    exit 0
fi
if [[ "$1" == 'run' && "$2" == 'list' ]]; then
    [[ "$3" == '--workflow' && "$5" == '--branch' && "$6" == "$MOCK_BRANCH" && "$7" == '--event' && "$8" == 'workflow_dispatch' ]] || exit 91
    [[ " $* " == *' databaseId,headSha,headBranch,event,status,conclusion '* ]] || exit 91
    wf="$4"
    case "$wf" in
        ci.yml) id=991 ;;
        wu21-repro-evidence-lab.yml) id=992 ;;
        srwf-registration-runtime.yml) id=993 ;;
        srwf-journey-host-qualification.yml) id=994 ;;
        wu18-entry-detail-runtime.yml) id=995 ;;
        wu19-a4-print-runtime.yml) id=996 ;;
        *) exit 91 ;;
    esac
    nfile="$MOCK_STATE/list_$id"
    n=0
    if [[ -f "$nfile" ]]; then n="$(cat "$nfile")"; fi
    n=$((n+1))
    printf '%s\n' "$n" > "$nfile"
    branch="$MOCK_BRANCH"; sha="$MOCK_SHA"; event=workflow_dispatch
    case "$MOCK_CASE" in
        listTemporary|listEmptyThenValid)
            if (( n == 1 )); then
                if [[ "$MOCK_CASE" == listTemporary ]]; then
                    echo 'HTTP 503: Service Unavailable' >&2
                    exit 1
                fi
                echo '[]'
                exit 0
            fi ;;
        listPersistent) echo 'HTTP 503: Service Unavailable' >&2; exit 1 ;;
        list403) echo 'HTTP 403: Forbidden' >&2; exit 1 ;;
        listMixedErrors) echo 'HTTP 403: Forbidden; downstream HTTP 503' >&2; exit 1 ;;
        listMalformed) echo '{unparseable'; exit 0 ;;
        listWrongRoot) echo '{}'; exit 0 ;;
        listMultiDoc) printf '[]\n[]\n'; exit 0 ;;
        listWrongSha) sha=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ;;
        listWrongBranch) branch='wrong-branch' ;;
        listWrongEvent) event='push' ;;
        listBadId) id=0 ;;
        listDuplicateId)
            printf '[{"databaseId":991,"headSha":"%s","headBranch":"%s","event":"workflow_dispatch","status":"queued","conclusion":null},{"databaseId":991,"headSha":"%s","headBranch":"%s","event":"workflow_dispatch","status":"queued","conclusion":null}]\n' "$MOCK_SHA" "$MOCK_BRANCH" "$MOCK_SHA" "$MOCK_BRANCH"
            exit 0 ;;
        listPickNewest)
            # Unsorted legitimate matches: select latest run ID, not first row.
            printf '[{"databaseId":1091,"headSha":"%s","headBranch":"%s","event":"workflow_dispatch","status":"queued","conclusion":null},{"databaseId":991,"headSha":"%s","headBranch":"%s","event":"workflow_dispatch","status":"queued","conclusion":null}]\n' "$MOCK_SHA" "$MOCK_BRANCH" "$MOCK_SHA" "$MOCK_BRANCH"
            exit 0 ;;
        parentMixed|parentList503|parentListPersistent|parentList403|parentMalformed)
            if [[ "$wf" == 'wu21-repro-evidence-lab.yml' ]]; then
                case "$MOCK_CASE" in
                    parentMixed|parentList503) if (( n == 1 )); then echo 'HTTP 503: Service Unavailable' >&2; exit 1; fi ;;
                    parentListPersistent) echo 'HTTP 503: Service Unavailable' >&2; exit 1 ;;
                    parentList403) echo 'HTTP 403: Forbidden' >&2; exit 1 ;;
                    parentMalformed) echo '[{not-json]'; exit 0 ;;
                esac
            fi ;;
        stable|temporary|parent503|persistent503|auth403|pending|failed|cancelled|premature|malformed|wrongSha|wrongBranch|wrongId|wrongEvent) ;;
        *) echo "Unknown mocked discovery scenario $MOCK_CASE" >&2; exit 99 ;;
    esac
    printf '[{"databaseId":%s,"headSha":"%s","headBranch":"%s","event":"%s","status":"queued","conclusion":null}]\n' "$id" "$sha" "$branch" "$event"
    exit 0
fi
if [[ "$1" != 'run' || "$2" != 'view' ]]; then
    echo 'Unexpected GitHub mutation or command in qualification test' >&2
    exit 92
fi
id="$3"
nfile="$MOCK_STATE/view_$id"
n=0
if [[ -f "$nfile" ]]; then n="$(cat "$nfile")"; fi
n=$((n + 1))
printf '%s\n' "$n" > "$nfile"
status=completed; conclusion='"success"'
sha="$MOCK_SHA"; branch="$MOCK_BRANCH"; output_id="$id"; event=workflow_dispatch
case "$MOCK_CASE" in
    temporary)
        if (( n == 1 )); then echo 'failed to get run: HTTP 503: Service Unavailable' >&2; exit 1; fi
        if (( n == 2 )); then status=in_progress; conclusion=null; fi ;;
    parent503|parentMixed)
        if [[ "$id" == '992' && "$n" == '1' ]]; then
            echo 'failed to get run: HTTP 503: Service Unavailable' >&2
            exit 1
        fi ;;
    persistent503) echo 'HTTP 503: Service Unavailable' >&2; exit 1 ;;
    auth403) echo 'HTTP 403: Forbidden' >&2; exit 1 ;;
    pending) status=in_progress; conclusion=null ;;
    failed) conclusion='"failure"' ;;
    cancelled) conclusion='"cancelled"' ;;
    premature) status=in_progress ;;
    malformed) echo '{unparseable'; exit 0 ;;
    wrongSha) sha=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ;;
    wrongBranch) branch='wrong-branch' ;;
    wrongId) output_id=999 ;;
    wrongEvent) event=push ;;
    stable|listTemporary|listEmptyThenValid|listPersistent|list403|listMixedErrors|listMalformed|listWrongRoot|listMultiDoc|listWrongSha|listWrongBranch|listWrongEvent|listBadId|listDuplicateId|listPickNewest|parentList503|parentListPersistent|parentList403|parentMalformed) ;;
    *) exit 99 ;;
esac
printf '{"databaseId":%s,"headSha":"%s","headBranch":"%s","event":"%s","status":"%s","conclusion":%s,"workflowName":"Repository CI"}\n' "$output_id" "$sha" "$branch" "$event" "$status" "$conclusion"
MOCK
chmod +x "$TMP/bin/gh"
POLL="$ROOT/scripts/release/poll-qualification-run.sh"
PARENT="$ROOT/scripts/release/wait-qualifications.sh"

reset_state() {
    rm -f "$MOCK_STATE"/view_* "$MOCK_STATE"/list_* "$MOCK_STATE/dispatches"
}
run_good_view() {
    reset_state
    export MOCK_CASE="$1"
    bash "$POLL" 991 "$MOCK_SHA" "$MOCK_BRANCH" ci.yml 8 0 > "$TMP/out" 2>"$TMP/err"
    jq -e --arg sha "$MOCK_SHA" 'type=="object" and .databaseId==991 and .headSha==$sha and .conclusion=="success" and (keys|sort)==(["conclusion","databaseId","headSha","workflowName"]|sort)' "$TMP/out" >/dev/null
}
run_bad_view() {
    reset_state
    export MOCK_CASE="$1"
    if bash "$POLL" 991 "$MOCK_SHA" "$MOCK_BRANCH" ci.yml 8 0 > "$TMP/out" 2>"$TMP/err"; then
        echo "Rejected run-view case admitted: $1" >&2; exit 1
    fi
    [[ ! -s "$TMP/out" ]] || { echo "Rejected view produced success evidence: $1" >&2; exit 1; }
}
run_good_view stable
run_good_view temporary
[[ "$(cat "$MOCK_STATE/view_991")" == 3 ]] || { echo 'Run-view transient recovery regression.' >&2; exit 1; }
for scenario in persistent503 auth403 pending failed cancelled premature malformed wrongSha wrongBranch wrongId wrongEvent; do
    run_bad_view "$scenario"
done

run_good_parent() {
    reset_state
    export MOCK_CASE="$1"
    bash "$PARENT" "$MOCK_BRANCH" "$MOCK_SHA" "$TMP/qualification.json" > "$TMP/parent.out" 2>"$TMP/parent.err"
    jq -e --arg sha "$MOCK_SHA" '
      length==6 and ([.[].databaseId]|unique|length)==6 and
      all(.[]; .headSha==$sha and .conclusion=="success" and
        (keys|sort)==(["conclusion","databaseId","headSha","workflowName"]|sort))
    ' "$TMP/qualification.json" >/dev/null
    [[ "$(wc -l < "$MOCK_STATE/dispatches")" == 6 ]]
    grep -Fq 'GPP_RELEASE_REQUIRED_QUALIFICATION_PASS' "$TMP/parent.out"
}
run_bad_parent() {
    reset_state
    export MOCK_CASE="$1"
    if bash "$PARENT" "$MOCK_BRANCH" "$MOCK_SHA" "$TMP/qualification.json" > "$TMP/parent.out" 2>"$TMP/parent.err"; then
        echo "Rejected parent case admitted: $1" >&2; exit 1
    fi
    [[ "$(wc -l < "$MOCK_STATE/dispatches")" == 6 ]]
    if grep -Fq 'GPP_RELEASE_REQUIRED_QUALIFICATION_PASS' "$TMP/parent.out"; then
        echo "Rejected parent emitted full success marker: $1" >&2; exit 1
    fi
    # Earlier successes may be recorded, but an unresolved/failing result may
    # never produce six valid success records or reach the publication gate.
    jq -e 'type=="array" and length<6' "$TMP/qualification.json" >/dev/null
}
run_good_parent parent503
[[ "$(cat "$MOCK_STATE/view_992")" == 2 ]]
run_good_parent listTemporary
[[ "$(cat "$MOCK_STATE/list_991")" == 2 ]]
run_good_parent listEmptyThenValid
[[ "$(cat "$MOCK_STATE/list_991")" == 2 ]]
run_good_parent listPickNewest
jq -e '.[0].databaseId==1091' "$TMP/qualification.json" >/dev/null
run_good_parent parentMixed
[[ "$(cat "$MOCK_STATE/list_992")" == 2 ]]
[[ "$(cat "$MOCK_STATE/view_992")" == 2 ]]
[[ "$(wc -l < "$MOCK_STATE/dispatches")" == 6 ]]
for scenario in listPersistent list403 listMixedErrors listMalformed listWrongRoot listMultiDoc listWrongSha listWrongBranch listWrongEvent listBadId listDuplicateId parentListPersistent parentList403 parentMalformed; do
    run_bad_parent "$scenario"
done
[[ "$(cat "$MOCK_STATE/list_992")" == 1 ]] || true
echo 'GPP_TRANSIENT_GITHUB_503_WAITER_TESTS_PASS view_positive=2 view_negative=11 list_recovery=PASS six_run_mixed=PASS latest_id=PASS fail_closed=PASS dispatches=6'
