#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
ZIP="${2:-}"
WPCLI="${3:-}"
WP_PATH="${4:-}"
BASE_URL="${5:-}"
EVIDENCE_DIR="${6:-}"
EXPECTED_VERSION="${GPP_RELEASE_VERSION:-${GPP_RELEASE_DRY_VERSION:-}}"

[[ -f "$ZIP" && -f "$WPCLI" && -d "$WP_PATH" && -n "$BASE_URL" && -n "$EVIDENCE_DIR" ]] || {
  echo 'Incomplete behavioral reachability runtime arguments.' >&2
  exit 1
}
[[ -n "$EXPECTED_VERSION" ]] || {
  echo 'Expected release version is required for behavioral reachability identity.' >&2
  exit 1
}
mkdir -p "$EVIDENCE_DIR"
EVIDENCE_DIR="$(cd "$EVIDENCE_DIR" && pwd -P)"
SETTINGS_URL="$BASE_URL/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles"
FIXTURE="$EVIDENCE_DIR/behavioral-host-fixture.json"
COOKIES="$EVIDENCE_DIR/admin-cookies.txt"

export GPP_BEHAVIOR_ARTIFACT_DIR="$EVIDENCE_DIR"

bash "$ROOT/tests/release/behavioral-anti-bypass-guardrail.sh" "$ROOT"
bash "$ROOT/tests/release/assert-behavioral-artifact.sh" "$ZIP"

# Negative A: a temporary artifact with the shipped Operations Package removed
# must be rejected by the artifact guard and is never installed or treated as a
# release candidate.
NEG_DIR="$EVIDENCE_DIR/negative-artifact"
NEG_ZIP="$NEG_DIR/negative.zip"
rm -rf "$NEG_DIR"
mkdir -p "$NEG_DIR"
unzip -q "$ZIP" -d "$NEG_DIR/tree"
rm -f "$NEG_DIR/tree/gravity-presentation-profiles/profiles/srwf/operations/operations-package-v1.json"
(
  cd "$NEG_DIR/tree"
  zip -qr "$NEG_ZIP" gravity-presentation-profiles
)
if bash "$ROOT/tests/release/assert-behavioral-artifact.sh" "$NEG_ZIP" >/dev/null 2>&1; then
  echo 'Negative artifact without Operations Package was incorrectly accepted.' >&2
  exit 1
fi
echo 'GPP_BEHAVIORAL_NEGATIVE_A_PASS operations_package_absence_rejected'
rm -rf "$NEG_DIR"

INSTALLED_DIR="$WP_PATH/wp-content/plugins/gravity-presentation-profiles"
[[ -d "$INSTALLED_DIR" && ! -L "$INSTALLED_DIR" ]] || { echo 'Installed GPP plugin directory is missing or symlinked.' >&2; exit 1; }
IDENTITY_DIR="$EVIDENCE_DIR/artifact-identity-tree"
rm -rf "$IDENTITY_DIR"
mkdir -p "$IDENTITY_DIR"
unzip -q "$ZIP" -d "$IDENTITY_DIR"
diff -qr "$IDENTITY_DIR/gravity-presentation-profiles" "$INSTALLED_DIR" >/dev/null
ZIP_SHA="$(sha256sum "$ZIP" | awk '{print $1}')"
ZIP_FILES="$(unzip -Z1 "$ZIP" | grep -v '/$' | wc -l | tr -d ' ')"
php -r '$d=array("source_sha"=>$argv[1],"overlay_version"=>$argv[2],"zip"=>basename($argv[3]),"zip_sha256"=>$argv[4],"zip_file_count"=>(int)$argv[5],"installed_plugin_path"=>realpath($argv[6]),"installed_plugin_dir_is_link"=>is_link($argv[6]),"installed_tree_matches_zip"=>true); file_put_contents($argv[7], json_encode($d, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES).PHP_EOL);' "${GPP_RELEASE_SOURCE_SHA:-UNKNOWN}" "$EXPECTED_VERSION" "$ZIP" "$ZIP_SHA" "$ZIP_FILES" "$INSTALLED_DIR" "$EVIDENCE_DIR/artifact-identity.json"
rm -rf "$IDENTITY_DIR"

GPP_BEHAVIOR_STATE_COMMAND=preflight php "$WPCLI" --path="$WP_PATH" eval-file "$ROOT/tests/release/behavioral-host-fixture.php"
GPP_BEHAVIOR_STATE_COMMAND=preflight php "$WPCLI" --path="$WP_PATH" eval-file "$ROOT/tests/release/behavioral-state.php" > "$EVIDENCE_DIR/preflight.json"

curl -fsS -c "$COOKIES" "$BASE_URL/wp-login.php" -o "$EVIDENCE_DIR/login.html"
curl -fsS -L -b "$COOKIES" -c "$COOKIES" \
  --data-urlencode 'log=release_admin' \
  --data-urlencode 'pwd=gpp-release-smoke-2026' \
  --data-urlencode 'wp-submit=Log In' \
  --data-urlencode "redirect_to=$SETTINGS_URL" \
  --data-urlencode 'testcookie=1' \
  "$BASE_URL/wp-login.php" -o "$EVIDENCE_DIR/settings-before.html"
grep -Fq 'Operations Setup (Print)' "$EVIDENCE_DIR/settings-before.html"
grep -Fq 'Operations Setup (Inbox)' "$EVIDENCE_DIR/settings-before.html"
grep -Fq 'Mapping &amp; Binding Health' "$EVIDENCE_DIR/settings-before.html" || grep -Fq 'Mapping & Binding Health' "$EVIDENCE_DIR/settings-before.html"

php "$ROOT/tests/release/behavioral-http-form.php" setup "$EVIDENCE_DIR/settings-before.html" "$FIXTURE" > "$EVIDENCE_DIR/setup-payload.txt"
curl -fsS -L -b "$COOKIES" -c "$COOKIES" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-binary @"$EVIDENCE_DIR/setup-payload.txt" \
  "$SETTINGS_URL" -o "$EVIDENCE_DIR/settings-after-setup.html"
GPP_BEHAVIOR_STATE_COMMAND=after-setup php "$WPCLI" --path="$WP_PATH" eval-file "$ROOT/tests/release/behavioral-state.php" > "$EVIDENCE_DIR/after-setup.json"

# Fetch a fresh form after the setup mutation so row tokens bind to the newly
# active immutable binding identity/version.
curl -fsS -b "$COOKIES" -c "$COOKIES" "$SETTINGS_URL" -o "$EVIDENCE_DIR/settings-before-repair.html"
php "$ROOT/tests/release/behavioral-http-form.php" repair "$EVIDENCE_DIR/settings-before-repair.html" "$FIXTURE" > "$EVIDENCE_DIR/repair-payload.txt"
curl -fsS -L -b "$COOKIES" -c "$COOKIES" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-binary @"$EVIDENCE_DIR/repair-payload.txt" \
  "$SETTINGS_URL" -o "$EVIDENCE_DIR/settings-after-repair.html"
GPP_BEHAVIOR_STATE_COMMAND=after-repair php "$WPCLI" --path="$WP_PATH" eval-file "$ROOT/tests/release/behavioral-state.php" > "$EVIDENCE_DIR/after-repair.json"

# Rerun Print setup through the authentic Gravity Forms settings-save request.
# Inbox must still be unactivated at this point: Print remains Print-only.
curl -fsS -b "$COOKIES" -c "$COOKIES" "$SETTINGS_URL" -o "$EVIDENCE_DIR/settings-before-rerun.html"
php "$ROOT/tests/release/behavioral-http-form.php" setup "$EVIDENCE_DIR/settings-before-rerun.html" "$FIXTURE" > "$EVIDENCE_DIR/rerun-payload.txt"
curl -fsS -L -b "$COOKIES" -c "$COOKIES" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-binary @"$EVIDENCE_DIR/rerun-payload.txt" \
  "$SETTINGS_URL" -o "$EVIDENCE_DIR/settings-after-rerun.html"
GPP_BEHAVIOR_STATE_COMMAND=after-rerun php "$WPCLI" --path="$WP_PATH" eval-file "$ROOT/tests/release/behavioral-state.php" > "$EVIDENCE_DIR/after-rerun.json"

# Invoke Inbox through the same real GFAddOn settings form shipped in the exact
# ZIP. This is the production mutation seam repaired by PR31; no direct service
# invocation or option mutation is allowed here.
curl -fsS -b "$COOKIES" -c "$COOKIES" "$SETTINGS_URL" -o "$EVIDENCE_DIR/settings-before-inbox.html"
grep -Fq 'Operations Setup (Inbox)' "$EVIDENCE_DIR/settings-before-inbox.html"
php "$ROOT/tests/release/behavioral-http-form.php" inbox "$EVIDENCE_DIR/settings-before-inbox.html" "$FIXTURE" > "$EVIDENCE_DIR/inbox-payload.txt"
curl -fsS -L -b "$COOKIES" -c "$COOKIES" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-binary @"$EVIDENCE_DIR/inbox-payload.txt" \
  "$SETTINGS_URL" -o "$EVIDENCE_DIR/settings-after-inbox.html"
grep -Fq 'data-gpp-inbox-setup-result="completed"' "$EVIDENCE_DIR/settings-after-inbox.html"
grep -Fq 'Inbox setup/adoption completed for' "$EVIDENCE_DIR/settings-after-inbox.html"
GPP_BEHAVIOR_STATE_COMMAND=after-inbox php "$WPCLI" --path="$WP_PATH" eval-file "$ROOT/tests/release/behavioral-state.php" > "$EVIDENCE_DIR/after-inbox.json"

# A second identical Inbox settings submission must preserve compatible state
# without unnecessary immutable-binding churn.
curl -fsS -b "$COOKIES" -c "$COOKIES" "$SETTINGS_URL" -o "$EVIDENCE_DIR/settings-before-inbox-rerun.html"
php "$ROOT/tests/release/behavioral-http-form.php" inbox "$EVIDENCE_DIR/settings-before-inbox-rerun.html" "$FIXTURE" > "$EVIDENCE_DIR/inbox-rerun-payload.txt"
curl -fsS -L -b "$COOKIES" -c "$COOKIES" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-binary @"$EVIDENCE_DIR/inbox-rerun-payload.txt" \
  "$SETTINGS_URL" -o "$EVIDENCE_DIR/settings-after-inbox-rerun.html"
grep -Fq 'data-gpp-inbox-setup-result="completed"' "$EVIDENCE_DIR/settings-after-inbox-rerun.html"
GPP_BEHAVIOR_STATE_COMMAND=after-inbox-rerun php "$WPCLI" --path="$WP_PATH" eval-file "$ROOT/tests/release/behavioral-state.php" > "$EVIDENCE_DIR/after-inbox-rerun.json"

GPP_BEHAVIOR_STATE_COMMAND=runtime php "$WPCLI" --path="$WP_PATH" eval-file "$ROOT/tests/release/behavioral-state.php" > "$EVIDENCE_DIR/runtime.json"

php "$ROOT/tests/release/validate-behavioral-production-reachability.php" "$EVIDENCE_DIR"
