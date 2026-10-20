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

cat > "$TMP/bin/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == 'workflow' && "$2" == 'run' ]]; then
    printf '%s\n' "$3" >> "$MOCK_STATE/dispatches"
    exit 0
fi
if [[ "$1" == 'run' && "$2" == 'list' ]]; then
    wf=''
    while (( $# )); do
        if [[ "$1" == '--workflow' ]]; then wf="$2"; break; fi
        shift
    done
    case "$wf" in
        ci.yml) id=991 ;;
        wu21-repro-evidence-lab.yml) id=992 ;;
        srwf-registration-runtime.yml) id=993 ;;
        srwf-journey-host-qualification.yml) id=994 ;;
        wu18-entry-detail-runtime.yml) id=995 ;;
        wu19-a4-print-runtime.yml) id=996 ;;
        *) exit 91 ;;
    esac
    printf '[{"databaseId":%s,"headSha":"%s","status":"queued","conclusion":null}]\n' "$id" "$MOCK_SHA"
    exit 0
fi
if [[ "$1" != 'run' || "$2" != 'view' ]]; then
    echo 'Unexpected GitHub mutation or command in qualification test' >&2
    exit 92
fi
id="$3"
count_file="$MOCK_STATE/$id"
count=0
if [[ -f "$count_file" ]]; then count="$(cat "$count_file")"; fi
count=$((count + 1))
printf '%s\n' "$count" > "$count_file"
status=completed; conclusion='"success"'
sha="$MOCK_SHA"; branch="$MOCK_BRANCH"; output_id="$id"; event=workflow_dispatch
case "$MOCK_CASE" in
    temporary)
        if (( count == 1 )); then
            echo 'failed to get run: HTTP 503: 503 Service Unavailable' >&2
            exit 1
        fi
        if (( count == 2 )); then status=in_progress; conclusion=null; fi ;;
    parent503)
        if [[ "$id" == '992' && "$count" == '1' ]]; then
            echo 'failed to get run: HTTP 503: 503 Service Unavailable' >&2
            exit 1
        fi ;;
    persistent503)
        echo 'failed to get run: HTTP 503: 503 Service Unavailable' >&2
        exit 1 ;;
    auth403) echo 'HTTP 403: forbidden' >&2; exit 1 ;;
    pending) status=in_progress; conclusion=null ;;
    failed) conclusion='"failure"' ;;
    cancelled) conclusion='"cancelled"' ;;
    premature) status=in_progress ;;
    malformed) echo '{unparseable'; exit 0 ;;
    wrongSha) sha="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" ;;
    wrongBranch) branch="wrong-branch" ;;
    wrongId) output_id=999 ;;
    wrongEvent) event="push" ;;
    stable) ;;
    *) echo 'Unknown mock case' >&2; exit 99 ;;
esac
printf '{"databaseId":%s,"headSha":"%s","headBranch":"%s","event":"%s","status":"%s","conclusion":%s,"workflowName":"Repository CI"}\n' "$output_id" "$sha" "$branch" "$event" "$status" "$conclusion"
MOCK
chmod +x "$TMP/bin/gh"
POLL="$ROOT/scripts/release/poll-qualification-run.sh"

run_good() {
    export MOCK_CASE="$1"
    rm -f "$MOCK_STATE/991"
    bash "$POLL" 991 "$MOCK_SHA" "$MOCK_BRANCH" ci.yml 8 0 > "$TMP/out" 2>"$TMP/err"
    jq -e --arg sha "$MOCK_SHA" 'type=="object" and .databaseId==991 and .headSha==$sha and .conclusion=="success" and (keys|sort)==(["conclusion","databaseId","headSha","workflowName"]|sort)' "$TMP/out" >/dev/null
}
run_bad() {
    export MOCK_CASE="$1"
    rm -f "$MOCK_STATE/991"
    if bash "$POLL" 991 "$MOCK_SHA" "$MOCK_BRANCH" ci.yml 8 0 > "$TMP/out" 2>"$TMP/err"; then
        echo "Rejected case passed unexpectedly: $1" >&2; exit 1
    fi
    [[ ! -s "$TMP/out" ]] || { echo "Rejected case wrote success evidence: $1" >&2; exit 1; }
}
run_good stable
run_good temporary
[[ "$(cat "$MOCK_STATE/991")" == 3 ]] || { echo 'Transient 503 did not recover.' >&2; exit 1; }
for scenario in persistent503 auth403 pending failed cancelled premature malformed wrongSha wrongBranch wrongId wrongEvent; do
    run_bad "$scenario"
done

export MOCK_CASE=parent503
rm -f "$MOCK_STATE"/99? "$MOCK_STATE/dispatches"
bash "$ROOT/scripts/release/wait-qualifications.sh" "$MOCK_BRANCH" "$MOCK_SHA" "$TMP/qualification.json" > "$TMP/parent.out" 2>"$TMP/parent.err"
jq -e --arg sha "$MOCK_SHA" 'length==6 and ([.[].databaseId]|unique|length)==6 and all(.[]; .headSha==$sha and .conclusion=="success")' "$TMP/qualification.json" >/dev/null
[[ "$(wc -l < "$MOCK_STATE/dispatches")" == 6 ]]
[[ "$(cat "$MOCK_STATE/992")" == 2 ]] || { echo 'WU21 503 caused lost/duplicate run.' >&2; exit 1; }
grep -Fq 'GPP_RELEASE_REQUIRED_QUALIFICATION_PASS' "$TMP/parent.out"
echo 'GPP_TRANSIENT_GITHUB_503_WAITER_TESTS_PASS positive=2 negative=11 exact_parent_six=PASS redispatch=NONE'
