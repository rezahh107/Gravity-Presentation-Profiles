#!/usr/bin/env bash
set -euo pipefail
test "$WU21_WP_PATH" = /tmp/wu21-wordpress
test "$WU21_BASE_URL" = http://127.0.0.1:8080
test "$(git rev-parse HEAD)" = 2389ce6e82be6f1d3d4add0646860f1505ba2b8a
out="$WU21_ARTIFACT_DIR/discriminator"
mkdir -p "$out"
cp "$WU21_ARTIFACT_DIR/runtime.json" "$out/runtime.json"
work="$(mktemp -d)"
chmod 700 "$work"
trap 'rm -rf "$work"; rm -f "$WU21_WP_PATH/wu21-path-probe.php"' EXIT
plugin="$WU21_WP_PATH/wp-content/plugins/gravity-presentation-profiles"
wp(){ php "$WU21_WP_CLI" --path="$WU21_WP_PATH" "$@"; }
# A direct, disposable loopback-only HTTP witness of the loaded PHP identity.
cat > "$WU21_WP_PATH/wu21-path-probe.php" <<'PHP'
<?php
if (!in_array($_SERVER['REMOTE_ADDR']??'', ['127.0.0.1','::1'], true)) {http_response_code(403);exit;}
require __DIR__.'/wp-load.php';
header('Content-Type: application/json');
$root=WP_PLUGIN_DIR.'/gravity-presentation-profiles';
$file=defined('GPP_PLUGIN_FILE')?GPP_PLUGIN_FILE:null;
echo json_encode(['pid'=>getmypid(),'plugin_path'=>$root,'is_link'=>is_link($root),'realpath'=>realpath($root),'link'=>is_link($root)?readlink($root):null,'loaded'=>$file,'loaded_realpath'=>$file?realpath($file):null,'bootstrap'=>(new ReflectionClass(\GravityPresentationProfiles\Bootstrap::class))->getFileName(),'header'=>get_file_data($root.'/gravity-presentation-profiles.php',['version'=>'Version'])['version'],'asset_url'=>$file?plugins_url('assets/css/gravity-forms-declarative.css',$file):null,'native_css_url'=>$file?plugins_url('assets/css/srwf-gravity-flow-inbox.css',$file):null]);
PHP
capture(){
 local phase="$1"
 local d="$out/$phase"
 mkdir -p "$d"
 {
  date -u +%FT%TZ
  ls -ld "$plugin"
  readlink -f "$plugin"
  if test -L "$plugin"; then readlink "$plugin"; fi
  echo "wrapper_pid=$(cat /tmp/wu21-wp-server.pid)"
  lsof -nP -iTCP:8080 -sTCP:LISTEN
  for pid in $(lsof -tiTCP:8080 -sTCP:LISTEN); do ps -p "$pid" -o pid,ppid,lstart,comm; done
 } > "$d/process-filesystem.txt"
 curl -fsS "$WU21_BASE_URL/wu21-path-probe.php" > "$d/loaded-http.json" || return 1
 python3 - "$d/loaded-http.json" "$GITHUB_WORKSPACE" "$d/direct-assets.json" <<'PY'
import json,sys,urllib.request,urllib.error,hashlib,pathlib
info=json.load(open(sys.argv[1]));root=pathlib.Path(sys.argv[2]);out=[]
paths=['assets/css/gravity-forms-declarative.css','assets/css/srwf-gravity-flow-inbox.css','assets/css/srwf-gravity-flow-inbox-native.css','assets/js/gravity-flow-inbox-manual-refresh.js','assets/css/gpp-inbox2.css','assets/js/gpp-inbox2.js']
for path in paths:
 for url in ['http://127.0.0.1:8080/wp-content/plugins/gravity-presentation-profiles/'+path]+([info['asset_url']] if path==paths[0] and info.get('asset_url') else [])+([info['native_css_url']] if path==paths[1] and info.get('native_css_url') else []):
  if not url.startswith('http://127.0.0.1:8080/'):out.append({'url':url,'expected':path,'notRequested':'outside authorized loopback'});continue
  row={'url':url,'expected':path,'expectedHash':hashlib.sha256((root/path).read_bytes()).hexdigest()}
  try:
   try:r=urllib.request.urlopen(url,timeout=10)
   except urllib.error.HTTPError as e:r=e
   with r:
    b=r.read();row.update(status=r.status,contentType=r.headers.get('Content-Type'),actualHash=hashlib.sha256(b).hexdigest(),bytes=len(b),html=b.lstrip().lower().startswith((b'<!doctype',b'<html')))
   row['parity']=row['actualHash']==row['expectedHash']
  except Exception as e:row['error']=str(e)
  out.append(row)
json.dump(out,open(sys.argv[3],'w'),indent=2)
PY
}
capture before
# Existing ZIP lifecycle is a setup precondition, not renewed SCQ/SLA or WU21.
# Invoke unmodified smoke assertions, adding a read-only snapshot before teardown.
script=tests/repro-evidence-lab/inbox2-installed-zip-smoke.sh
cp "$script" "$work/smoke-original"
export -f capture
export out plugin
python3 - "$script" <<'PY'
import sys,pathlib
p=pathlib.Path(sys.argv[1]);s=p.read_text();old='  if [[ "$changed_plugin" == 1 ]]; then\n'
assert s.count(old)==1
p.write_text(s.replace(old,old+'    capture installed-before-teardown || rc=1\n',1))
PY
export WU21_DIAG_NETWORK="$out/installed-browser-assets.jsonl"
NODE_OPTIONS="--import=/tmp/wu21-server-discriminator.mjs" bash "$script"
cp "$work/smoke-original" "$script"
git diff --exit-code -- "$script"
capture restored-reused
test -L "$plugin" && test "$(readlink -f "$plugin")" = "$GITHUB_WORKSPACE"
# Snapshot synthetic DB and fixture evidence to make the two trials comparable.
wp db export "$work/baseline.sql" --skip-comments --single-transaction --skip-lock-tables >/dev/null
mkdir "$work/artifacts"
find "$WU21_ARTIFACT_DIR" -maxdepth 1 -type f -exec cp {} "$work/artifacts/" \;
sha256sum "$work/baseline.sql" | cut -d' ' -f1 > "$out/baseline-db-sha256.txt"
run_pair(){
 local phase="$1" rcg=0 rcm=0
 local d="$out/$phase"
 mkdir -p "$d"
 export WU21_DIAG_NETWORK="$d/generic-assets.jsonl"
 NODE_OPTIONS="--import=/tmp/wu21-server-discriminator.mjs" node tests/repro-evidence-lab/generic-no-code-form-e2e-browser.mjs > "$d/generic.log" 2>&1 || rcg=$?
 if test -f "$WU21_ARTIFACT_DIR/generic-no-code-form-e2e-results.json"; then cp "$WU21_ARTIFACT_DIR/generic-no-code-form-e2e-results.json" "$d/"; fi
 export WU21_DIAG_NETWORK="$d/mixed-assets.jsonl"
 (wp eval-file tests/repro-evidence-lab/p06-inbox-asset-reachability-runtime.php && wp eval-file tests/repro-evidence-lab/inbox-mixed-readiness-fixture.php && NODE_OPTIONS="--import=/tmp/wu21-server-discriminator.mjs" node tests/repro-evidence-lab/inbox-mixed-readiness-browser.mjs) > "$d/mixed.log" 2>&1 || rcm=$?
 for f in inbox-mixed-readiness-browser.json inbox-mixed-readiness-php.json; do if test -f "$WU21_ARTIFACT_DIR/$f"; then cp "$WU21_ARTIFACT_DIR/$f" "$d/"; fi; done
 printf '{"generic_exit":%s,"mixed_exit":%s}\n' "$rcg" "$rcm" > "$d/results.json"
 capture "$phase-after-tests"
}
run_pair reused
# Preserve original server PID and make one clean process transition.
old="$(lsof -tiTCP:8080 -sTCP:LISTEN)"
test "$(echo "$old" | wc -l)" = 1
wrapper="$(cat /tmp/wu21-wp-server.pid)"
test "$old" != "$$"
case "$(ps -p "$old" -o comm= | tr -d ' ')" in php|php[0-9]*) ;; *) exit 1;; esac
tr '\0' ' ' < "/proc/$old/cmdline" | grep -Fq '127.0.0.1:8080'
kill "$old"
if kill -0 "$wrapper" 2>/dev/null; then kill "$wrapper" 2>/dev/null || :; fi
for i in $(seq 1 30); do if ! lsof -tiTCP:8080 -sTCP:LISTEN >/dev/null; then break; fi; sleep 1; done
! lsof -tiTCP:8080 -sTCP:LISTEN >/dev/null
wp db import "$work/baseline.sql" >/dev/null
# Remove trial-produced top-level evidence only; preserve diagnostic folder.
find "$WU21_ARTIFACT_DIR" -maxdepth 1 -type f -delete
cp "$work/artifacts/"* "$WU21_ARTIFACT_DIR/"
test -L "$plugin" && test "$(readlink -f "$plugin")" = "$GITHUB_WORKSPACE"
php "$WU21_WP_CLI" server --path="$WU21_WP_PATH" --host=127.0.0.1 --port=8080 >/tmp/wu21-wp-server-fresh.log 2>&1 &
echo $! >/tmp/wu21-wp-server.pid
ready=0
for i in $(seq 1 30); do if curl -fsS "$WU21_BASE_URL/wp-login.php" >/dev/null; then ready=1; break; fi; sleep 1; done
test "$ready" = 1
new="$(lsof -tiTCP:8080 -sTCP:LISTEN)"
test "$(echo "$new" | wc -l)" = 1
test "$new" != "$old"
printf '{"old_listener":%s,"new_listener":%s}\n' "$old" "$new" > "$out/process-transition.json"
capture restored-fresh
run_pair fresh
python3 - "$out" <<'PY'
import json,pathlib,sys
d=pathlib.Path(sys.argv[1])
r={p:json.loads((d/p/'results.json').read_text()) for p in ['reused','fresh']}
print('WU21_DISCRIMINATOR_RESULTS',json.dumps(r))
(d/'summary.json').write_text(json.dumps(r,indent=2))
PY
