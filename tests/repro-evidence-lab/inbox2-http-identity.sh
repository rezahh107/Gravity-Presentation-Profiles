#!/usr/bin/env bash
# WU21-only process and HTTP observation helpers; never included in GPP ZIP.
# No listener is considered owned merely because its port responds.
# Diagnostic only: retain the exact failed observation before taking later samples.
# This never changes the ownership predicate or its failure result.
wu21_observe_pid_unavailable() {
  local port="$1" failed_rows="$2" grep_rc="$3" sample observation observe_rc known_pid
  {
    printf 'WU21_PID_DISCRIMINATOR endpoint=127.0.0.1:%s phase=%s grep_exit=%s\n' "$port" "${FUNCNAME[*]}" "$grep_rc"
    printf 'original_ss_rows=%s\n' "$failed_rows"
    printf 'expected_old_wrapper=%s expected_old_listener=%s current_wrapper=%s previous=%s wrapper=%s\n' "${old_wrapper:-}" "${old_listener:-}" "${current_wrapper:-}" "${previous:-}" "${wrapper:-}"
    for sample in 0 1 2 3 4 5; do
      printf 'sample=%s time=%s\n' "$sample" "$(date -u +%FT%T.%NZ)"
      observe_rc=0
      observation="$(ss -H -ltnpe "sport = :$port" 2>&1)" || observe_rc=$?
      printf 'ss_extended_exit=%s rows=%s\n' "$observe_rc" "$observation"
      observe_rc=0
      observation="$(ss -H -ltn "sport = :$port" 2>&1)" || observe_rc=$?
      printf 'ss_socket_exit=%s rows=%s\n' "$observe_rc" "$observation"
      if command -v lsof >/dev/null; then
        observe_rc=0
        observation="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>&1)" || observe_rc=$?
        printf 'lsof_exit=%s rows=%s\n' "$observe_rc" "$observation"
      fi
      for known_pid in "${old_wrapper:-}" "${old_listener:-}" "${current_wrapper:-}" "${wrapper:-}" "${previous:-}"; do
        [[ "$known_pid" =~ ^[1-9][0-9]*$ ]] || continue
        observe_rc=0
        observation="$(ps -p "$known_pid" -o pid=,ppid=,stat=,comm= 2>&1)" || observe_rc=$?
        printf 'known_pid=%s ps_exit=%s state=%s\n' "$known_pid" "$observe_rc" "$observation"
      done
      if [[ "$sample" != 5 ]]; then sleep 0.2; fi
    done
    printf 'WU21_PID_DISCRIMINATOR_END original_predicate=FAIL\n'
  } >> "$WU21_ARTIFACT_DIR/gpp-inbox2-pid-discriminator.txt" 2>&1
}

wu21_listener_pid() {
  local port="$1" rows state recv send address peer owners pid
  rows="$(ss -H -ltnp "sport = :$port")" || { release_fail 'Listener inventory failed.'; return 1; }
  [[ -n "$rows" ]] || return 0
  if [[ "$rows" == *$'\n'* ]]; then release_fail 'Multiple listeners on the intended port.'; return 1; fi
  read -r state recv send address peer owners <<< "$rows"
  [[ "$state" == LISTEN && "$address" == "127.0.0.1:$port" ]] || { release_fail 'Unexpected listening endpoint.'; return 1; }
  pid="$(grep -oE 'pid=[0-9]+' <<< "$owners")" || {
    local grep_rc=$?
    if ! wu21_observe_pid_unavailable "$port" "$rows" "$grep_rc"; then
      printf 'WU21_PID_DISCRIMINATOR_CAPTURE_FAILED\n' >&2
    fi
    release_fail 'Listener PID unavailable.'; return 1;
  }
  [[ "$pid" =~ ^pid=([0-9]+)$ ]] || { release_fail 'Listener ownership is ambiguous.'; return 1; }
  printf '%s\n' "${BASH_REMATCH[1]}"
}

wu21_server_wrapper_owned() {
  local wrapper="$1" port="$2" cli="$3" docroot="$4" args
  [[ "$wrapper" =~ ^[1-9][0-9]*$ && "$wrapper" != "$$" ]] || return 1
  [[ -r "/proc/$wrapper/cmdline" ]] || return 1
  # Match the exact existing WP-CLI launch arguments, not a substring of the port.
  mapfile -d '' -t args < "/proc/$wrapper/cmdline" || return 1
  [[ ${#args[@]} == 6 && "${args[0]##*/}" == php* && "${args[1]}" == "$cli" && "${args[2]}" == server &&
     "${args[3]}" == "--path=$docroot" && "${args[4]}" == --host=127.0.0.1 && "${args[5]}" == "--port=$port" ]]
}

wu21_listener_owned() {
  local listener="$1" wrapper="$2" port="$3" cli="$4" docroot="$5" comm parent current args i
  wu21_server_wrapper_owned "$wrapper" "$port" "$cli" "$docroot" || return 1
  [[ "$listener" =~ ^[1-9][0-9]*$ && "$listener" != "$$" && "$listener" != "$wrapper" ]] || return 1
  comm="$(ps -p "$listener" -o comm=)" || return 1
  case "${comm//[[:space:]]/}" in php|php[0-9]*) ;; *) return 1;; esac
  mapfile -d '' -t args < "/proc/$listener/cmdline" || return 1
  # WP-CLI server launches the built-in server with -S HOST:PORT -t DOCROOT.
  local host_found=0 root_found=0
  for ((i=1;i<${#args[@]};i++)); do
    if [[ "${args[i-1]}" == -S && "${args[i]}" == "127.0.0.1:$port" ]]; then host_found=1; fi
    if [[ "${args[i-1]}" == -t && "${args[i]}" == "$docroot" ]]; then root_found=1; fi
  done
  [[ "$host_found" == 1 && "$root_found" == 1 ]] || return 1
  current="$listener"
  # proc_open can place a shell between the WP-CLI wrapper and PHP child.
  for ((i=0;i<16;i++)); do
    parent="$(ps -p "$current" -o ppid=)" || return 1
    parent="${parent//[[:space:]]/}"
    [[ "$parent" =~ ^[1-9][0-9]*$ ]] || return 1
    [[ "$parent" != "$current" && "$parent" != 1 ]] || return 1
    if [[ "$parent" == "$wrapper" ]]; then return 0; fi
    current="$parent"
  done
  return 1
}

wu21_assert_owned_listener() {
  local wrapper="$1" port="$2" cli="$3" docroot="$4" observed
  observed="$(wu21_listener_pid "$port")" || return 1
  if [[ -z "$observed" ]] || ! wu21_listener_owned "$observed" "$wrapper" "$port" "$cli" "$docroot"; then
    release_fail 'Endpoint is not owned by the intended WP-CLI server.'; return 1
  fi
  printf '%s\n' "$observed"
}

wu21_wait_for_free_endpoint() {
  local port="$1" previous="$2" observed i
  for ((i=0;i<30;i++)); do
    observed="$(wu21_listener_pid "$port")" || return 1
    [[ -n "$observed" ]] || return 0
    if [[ "$observed" != "$previous" ]]; then release_fail 'Port occupied by a different listener.'; return 1; fi
    sleep 1
  done
  release_fail 'Owned prior listener did not release the endpoint.'
}

wu21_wait_for_owned_http() {
  local wrapper="$1" port="$2" cli="$3" docroot="$4" observed i
  for ((i=0;i<30;i++)); do
    observed="$(wu21_listener_pid "$port")" || return 1
    if [[ -n "$observed" ]]; then
      if ! wu21_listener_owned "$observed" "$wrapper" "$port" "$cli" "$docroot"; then
        release_fail 'Replacement endpoint belongs to another process.'; return 1
      fi
      if curl --noproxy '*' -fsS --max-time 3 "http://127.0.0.1:$port/wp-login.php" >/dev/null; then
        printf '%s\n' "$observed"; return 0
      fi
    fi
    local wrapper_state
    wrapper_state="$(ps -p "$wrapper" -o stat=)" || { release_fail 'Replacement WP-CLI startup failed.'; return 1; }
    [[ -n "$wrapper_state" && "$wrapper_state" != *Z* ]] || { release_fail 'Replacement WP-CLI startup failed.'; return 1; }
    sleep 1
  done
  release_fail 'Replacement HTTP server did not become ready.'
}

wu21_assert_http_identity() {
  local url="$1" expected_pid="$2" expected_version="$3" installed="$4" report="$5"
  local response
  response="$(curl --noproxy '*' -fsS --max-time 10 -o "$report" -w '%{http_code}' "$url")" || return 1
  [[ "$response" == 200 ]] || { release_fail "HTTP identity probe status=$response"; return 1; }
  # Compare execution-derived values (PID, loaded __FILE__, reflected class and
  # instantiated Add-On version) against independently selected expectations.
  # A realpath or reread header by itself cannot satisfy this predicate.
  jq -e --argjson pid "$expected_pid" --arg version "$expected_version" --arg root "$installed" '
    .pid == $pid and .header == $version and .addon_version == $version and
    .plugin_file == ($root + "/gravity-presentation-profiles.php") and
    .addon_class_file == ($root + "/src/GravityForms/AddOn.php") and
    .bootstrap_class_file == ($root + "/src/Bootstrap.php") and
    .inbox_class_file == ($root + "/src/SRWF/GravityFlow/Inbox2Shortcode.php")
  ' "$report" >/dev/null || { release_fail 'HTTP loaded runtime identity differs from selected installed ZIP.'; return 1; }
}

wu21_assert_installed_http_assets() {
  local base="$1" source="$2" work="$3" report="$4" file result status content_type expected actual
  : > "$report" || return 1
  for file in assets/css/gpp-inbox2.css assets/js/gpp-inbox2.js; do
    result="$(curl --noproxy '*' -fsS --max-time 10 -o "$work/http-asset" -w '%{http_code}\t%{content_type}' "$base/wp-content/plugins/gravity-presentation-profiles/$file")" || return 1
    IFS=$'\t' read -r status content_type <<< "$result"
    [[ "$status" == 200 ]] || { release_fail "HTTP asset status=$status path=$file"; return 1; }
    case "$file:$content_type" in
      *.css:text/css*|*.js:application/javascript*|*.js:text/javascript*) ;;
      *) release_fail "Unexpected HTTP asset Content-Type: $file $content_type"; return 1;;
    esac
    expected="$(sha256sum "$source/$file")" || return 1
    actual="$(sha256sum "$work/http-asset")" || return 1
    printf '%s\t%s\t%s\t%s\t%s\n' "$file" "$status" "$content_type" "${expected%% *}" "${actual%% *}" >> "$report" || return 1
    cmp -s "$source/$file" "$work/http-asset" || { release_fail "HTTP asset bytes differ: $file"; return 1; }
  done
}
