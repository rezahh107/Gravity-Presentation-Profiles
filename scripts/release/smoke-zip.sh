#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
ZIP="${2:-}"
WP_PATH="${3:-/tmp/gpp-release-wordpress}"
DB_NAME="${GPP_RELEASE_DB_NAME:-wordpress}"
DB_USER="${GPP_RELEASE_DB_USER:-root}"
DB_PASS="${GPP_RELEASE_DB_PASS:-gpp-release-root}"
DB_HOST="${GPP_RELEASE_DB_HOST:-127.0.0.1:3306}"
BASE_URL="${GPP_RELEASE_BASE_URL-http://127.0.0.1:8090}"
LAB_CONFIG="$ROOT/tests/repro-evidence-lab/lab-config.json"
FIXTURE_ROOT="$ROOT/tests/fixtures/wu21-packages"
PACKAGE_MANIFEST="$FIXTURE_ROOT/manifest.json"

source "$ROOT/scripts/release/release-lib.sh"
SMOKE_ENDPOINT="$(release_parse_smoke_endpoint "$BASE_URL")"
IFS=$'\t' read -r SERVER_HOST SERVER_PORT <<<"$SMOKE_ENDPOINT"

[[ -f "$ZIP" ]] || { echo "Missing release ZIP: $ZIP" >&2; exit 1; }
[[ -f "$LAB_CONFIG" ]] || { echo "Missing pinned runtime config: $LAB_CONFIG" >&2; exit 1; }
[[ -f "$PACKAGE_MANIFEST" ]] || { echo "Missing repository package manifest: $PACKAGE_MANIFEST" >&2; exit 1; }

json_value() {
    local expression="$1"
    php -r '$d=json_decode(file_get_contents($argv[1]),true); $v=$d; foreach(explode(".",$argv[2]) as $k){$v=$v[$k]??null;} if($v===null){exit(2);} echo is_scalar($v)?$v:json_encode($v);' "$LAB_CONFIG" "$expression"
}

manifest_value() {
    local package_id="$1"
    local key="$2"
    php -r '$d=json_decode(file_get_contents($argv[1]),true); if(!is_array($d["packages"]??null)) exit(2); foreach($d["packages"] as $p){if(($p["id"]??null)===$argv[2]){$v=$p[$argv[3]]??null;if($v===null)exit(3);echo is_scalar($v)?$v:json_encode($v);exit(0);}}exit(4);' "$PACKAGE_MANIFEST" "$package_id" "$key"
}

WP_VERSION="$(json_value wordpress.version)"
WPCLI_URL="$(json_value wp_cli.url)"
WPCLI_SHA="$(json_value wp_cli.sha256)"
GF_FILENAME="$(manifest_value gravityforms filename)"
GF_HASH="$(manifest_value gravityforms sha256)"
GF_SIZE="$(manifest_value gravityforms size_bytes)"
GF_VERSION="$(manifest_value gravityforms version)"
FLOW_FILENAME="$(manifest_value gravityflow filename)"
FLOW_HASH="$(manifest_value gravityflow sha256)"
FLOW_SIZE="$(manifest_value gravityflow size_bytes)"
FLOW_VERSION="$(manifest_value gravityflow version)"

WORK="$(mktemp -d)"
SERVER_PID=""
cleanup() {
    if [[ -n "$SERVER_PID" ]]; then
        kill "$SERVER_PID" >/dev/null 2>&1 || true
        wait "$SERVER_PID" >/dev/null 2>&1 || true
    fi
    rm -rf "$WORK"
}
trap cleanup EXIT
WPCLI="$WORK/wp-cli.phar"
GF_ZIP="$WORK/$GF_FILENAME"
FLOW_ZIP="$WORK/$FLOW_FILENAME"

curl -L --fail --retry 3 -o "$WPCLI" "$WPCLI_URL"
echo "$WPCLI_SHA  $WPCLI" | sha256sum -c -
rm -rf "$WP_PATH"
mkdir -p "$WP_PATH"
php "$WPCLI" core download --path="$WP_PATH" --version="$WP_VERSION" --force
php "$WPCLI" config create --path="$WP_PATH" --dbname="$DB_NAME" --dbuser="$DB_USER" --dbpass="$DB_PASS" --dbhost="$DB_HOST" --skip-check
php "$WPCLI" core install --path="$WP_PATH" --url="$BASE_URL" --title='GPP Release ZIP Smoke' --admin_user=release_admin --admin_password='gpp-release-smoke-2026' --admin_email='release@example.invalid' --skip-email

php "$ROOT/tests/repro-evidence-lab/verify-wu21-package-fixtures.php" "$FIXTURE_ROOT"
cp "$FIXTURE_ROOT/$GF_FILENAME" "$GF_ZIP"
cp "$FIXTURE_ROOT/$FLOW_FILENAME" "$FLOW_ZIP"
[[ "$(stat -c '%s' "$GF_ZIP")" == "$GF_SIZE" ]]
[[ "$(stat -c '%s' "$FLOW_ZIP")" == "$FLOW_SIZE" ]]
echo "$GF_HASH  $GF_ZIP" | sha256sum -c -
echo "$FLOW_HASH  $FLOW_ZIP" | sha256sum -c -
unzip -q "$GF_ZIP" -d "$WP_PATH/wp-content/plugins"
unzip -q "$FLOW_ZIP" -d "$WP_PATH/wp-content/plugins"
grep -q "^Version: ${GF_VERSION//./\\.}$" "$WP_PATH/wp-content/plugins/gravityforms/gravityforms.php"
grep -q "^Version: ${FLOW_VERSION//./\\.}$" "$WP_PATH/wp-content/plugins/gravityflow/gravityflow.php"

php "$WPCLI" plugin install "$ZIP" --path="$WP_PATH" --force
php "$WPCLI" plugin activate gravityforms gravityflow gravity-presentation-profiles --path="$WP_PATH"
php "$WPCLI" plugin is-active gravity-presentation-profiles --path="$WP_PATH"
php "$WPCLI" --path="$WP_PATH" eval '
if (!class_exists("GravityPresentationProfiles\\Bootstrap")) { fwrite(STDERR,"Bootstrap missing\n"); exit(1); }
if (!class_exists("GravityPresentationProfiles\\GravityForms\\AddOn")) { fwrite(STDERR,"Add-On integration missing\n"); exit(1); }
$registry = \GravityPresentationProfiles\ProfileCatalog::create();
$profile = $registry->get("srwf-registration");
if (!$profile || $profile->assetPath() !== "profiles/srwf/registration/profile.css") { fwrite(STDERR,"Representative production profile unavailable\n"); exit(1); }
echo "GPP_RELEASE_RUNTIME_ASSERT_PASS\n";
'

# Behavioral Production Reachability extends this exact installed-ZIP runtime.
# The test harness remains outside the installed plugin and is forbidden from
# manufacturing GPP lifecycle state directly.
BEHAVIOR_DIR="$ROOT/build/release/behavioral-production-reachability"
rm -rf "$BEHAVIOR_DIR"
mkdir -p "$BEHAVIOR_DIR"
printf 'GPP_RELEASE_SMOKE_ENDPOINT base_url=%s bind_host=%s bind_port=%s\n' "$BASE_URL" "$SERVER_HOST" "$SERVER_PORT"
php "$WPCLI" server --path="$WP_PATH" --host="$SERVER_HOST" --port="$SERVER_PORT" >"$WORK/wp-server.log" 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do
    if curl -fsS "$BASE_URL/wp-login.php" >/dev/null; then
        break
    fi
    if [[ "$i" -eq 30 ]]; then
        cat "$WORK/wp-server.log" >&2
        exit 1
    fi
    sleep 1
done

bash "$ROOT/tests/release/run-behavioral-production-reachability.sh" \
    "$ROOT" "$ZIP" "$WPCLI" "$WP_PATH" "$BASE_URL" "$BEHAVIOR_DIR"
cp "$BEHAVIOR_DIR/behavioral-production-reachability.json" "$ROOT/build/release/behavioral-production-reachability.json"

echo "GPP_RELEASE_BEHAVIORAL_EVIDENCE=$ROOT/build/release/behavioral-production-reachability.json"
printf 'GPP_RELEASE_ZIP_SMOKE_PASS wordpress=%s gravity_forms=%s gravity_flow=%s\n' "$WP_VERSION" "$GF_VERSION" "$FLOW_VERSION"
