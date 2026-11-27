#!/usr/bin/env bash
# Ephemeral WU21-only installed ZIP boundary. Never publishes a release.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$ROOT"
source scripts/release/release-lib.sh
source tests/repro-evidence-lab/inbox2-http-identity.sh
: "${WU21_WP_PATH:?}" "${WU21_WP_CLI:?}" "${WU21_ARTIFACT_DIR:?}"
# Expected identity comes from the selected source, never the installed copy.
SOURCE_ROOT="$(cd "${GPP_INBOX2_PREPARED_SOURCE:-$ROOT}" && pwd -P)"
release_assert_version_mirrors "$SOURCE_ROOT"
SOURCE_VERSION="$(release_plugin_version "$SOURCE_ROOT")"
VERSION="$SOURCE_VERSION"
if [[ "$SOURCE_VERSION" == '0.0.0-dev' ]]; then
  VERSION=9999.0.0
else
  release_is_production_version "$VERSION" || release_fail "Unsupported installed-ZIP source version: $VERSION"
fi
export GPP_INBOX2_EXPECTED_VERSION="$VERSION"
STAGE="$(mktemp -d)"
PLUGIN_DIR="$WU21_WP_PATH/wp-content/plugins/gravity-presentation-profiles"
changed_plugin=0
moved_mu=0
probe=
restart_attempted=0
current_wrapper=
MU="$WU21_WP_PATH/wp-content/mu-plugins/wu21-lab-plugin.php"
restore_wu21() {
  local rc=$?
  trap - EXIT
  if [[ "$changed_plugin" == 1 ]]; then
    # Always restore synthetic task count even when a browser assertion fails.
    if ! php "$WU21_WP_CLI" --path="$WU21_WP_PATH" eval-file tests/repro-evidence-lab/inbox2-installed-zip-cleanup.php; then rc=1; fi
    if ! php "$WU21_WP_CLI" plugin deactivate gravity-presentation-profiles --path="$WU21_WP_PATH"; then rc=1; fi
    # Only the disposable copy installed from our test ZIP is deleted.
    if [[ -d "$PLUGIN_DIR" && ! -L "$PLUGIN_DIR" ]]; then
      if ! rm -rf "$PLUGIN_DIR"; then rc=1; fi
    fi
    if [[ ! -e "$PLUGIN_DIR" && ! -L "$PLUGIN_DIR" ]]; then
      if ! ln -s "$ROOT" "$PLUGIN_DIR"; then rc=1; fi
    fi
    if ! php "$WU21_WP_CLI" plugin activate gravity-presentation-profiles --path="$WU21_WP_PATH"; then rc=1; fi
  fi
  if [[ "$moved_mu" == 1 ]]; then
    if ! mv "$STAGE/wu21-lab-plugin.php" "$MU"; then rc=1; fi
  fi
  if [[ -n "$probe" ]]; then
    if ! rm -f "$probe"; then rc=1; fi
  fi
  if [[ "$restart_attempted" == 1 ]]; then
    local recovered_pid= availability=UNAVAILABLE_OR_UNOWNED
    if [[ -n "$current_wrapper" ]] && recovered_pid="$(wu21_assert_owned_listener "$current_wrapper" 8080 "$WU21_WP_CLI" "$WU21_WP_PATH")"; then
      if curl --noproxy '*' -fsS --max-time 3 "$WU21_BASE_URL/wp-login.php" >/dev/null; then availability=AVAILABLE_OWNED; else availability=OWNED_HTTP_UNAVAILABLE; fi
    fi
    if [[ "$availability" != AVAILABLE_OWNED ]]; then rc=1; fi
    if ! printf 'http_after_restore=%s\nlistener=%s\nexit=%s\n' "$availability" "$recovered_pid" "$rc" > "$WU21_ARTIFACT_DIR/gpp-inbox2-http-recovery.txt"; then rc=1; fi
  fi
  if ! rm -rf "$STAGE"; then rc=1; fi
  exit "$rc"
}
trap restore_wu21 EXIT
SRC="$STAGE/source"
mkdir -p "$SRC" "$STAGE/out"
# A single checked inventory from the intended checkout governs staging and
# installed identity. Do not re-enumerate the already staged source as truth.
INVENTORY="$STAGE/runtime-files.txt"
mkdir -p "$WU21_ARTIFACT_DIR"
enumeration_rc=0
release_runtime_files "$SOURCE_ROOT" > "$INVENTORY" || enumeration_rc=$?
cp "$INVENTORY" "$WU21_ARTIFACT_DIR/gpp-inbox2-expected-files.txt"
printf 'enumeration_exit=%s\nsource_version=%s\n' "$enumeration_rc" "$SOURCE_VERSION" > "$WU21_ARTIFACT_DIR/gpp-inbox2-package-identity.txt"
[[ "$enumeration_rc" == 0 ]] || { release_fail 'Canonical runtime enumeration failed before staging.'; exit 1; }
while IFS= read -r file; do
  mkdir -p "$SRC/$(dirname "$file")"
  cp "$SOURCE_ROOT/$file" "$SRC/$file"
done < "$INVENTORY"
if [[ "$SOURCE_VERSION" == '0.0.0-dev' ]]; then
  sed -i "s/Version: 0.0.0-dev/Version: ${VERSION}/" "$SRC/gravity-presentation-profiles.php"
  sed -i "s/'0.0.0-dev'/'${VERSION}'/" "$SRC/src/GravityForms/AddOn.php"
fi
release_assert_version_mirrors "$SRC"
bash scripts/release/build-release.sh "$SRC" "$VERSION" "$STAGE/out"
ZIP="$STAGE/out/gravity-presentation-profiles-${VERSION}.zip"
ZIP_SHA="$(sha256sum "$ZIP")"
ZIP_SHA="${ZIP_SHA%% *}"
bash scripts/release/validate-release.sh "$SRC" "$ZIP" "$VERSION" "$ZIP_SHA"
if [[ -n "${GPP_INBOX2_EXPECTED_PARITY_SHA256:-}" ]]; then
  [[ "$ZIP_SHA" == "$GPP_INBOX2_EXPECTED_PARITY_SHA256" ]] || { release_fail 'Canonical package bytes changed against the same-source reference build.'; exit 1; }
  printf 'reference_zip_sha256=%s\npackage_byte_parity=PASS\n' "$GPP_INBOX2_EXPECTED_PARITY_SHA256" >> "$WU21_ARTIFACT_DIR/gpp-inbox2-package-identity.txt"
fi
printf 'expected_version=%s\nzip_sha256=%s\ncheckout_head=%s\n' "$VERSION" "$ZIP_SHA" "${GPP_INBOX2_TESTED_HEAD:-NOT_RECORDED}" >> "$WU21_ARTIFACT_DIR/gpp-inbox2-package-identity.txt"
unzip -Z1 "$ZIP" > "$STAGE/zip-list.txt"
grep -Fxq 'gravity-presentation-profiles/src/SRWF/GravityFlow/Inbox2Shortcode.php' "$STAGE/zip-list.txt"
grep -Fxq 'gravity-presentation-profiles/assets/css/gpp-inbox2.css' "$STAGE/zip-list.txt"
grep -Fxq 'gravity-presentation-profiles/assets/js/gpp-inbox2.js' "$STAGE/zip-list.txt"
if grep -Eq '^gravity-presentation-profiles/(tests|mu-plugins|\.github)/' "$STAGE/zip-list.txt"; then
  echo 'Test-only files in GPP ZIP' >&2
  exit 1
fi
test "$WU21_WP_PATH" = /tmp/wu21-wordpress
test -L "$PLUGIN_DIR" && test "$(readlink -f "$PLUGIN_DIR")" = "$ROOT" || {
  echo 'Original WU21 GPP checkout link mismatch; refusing replacement' >&2
  exit 1
}
changed_plugin=1
php "$WU21_WP_CLI" plugin deactivate gravity-presentation-profiles --path="$WU21_WP_PATH"
rm "$PLUGIN_DIR"
# Installed ZIP, not the source symlink. Other pinned host plugins remain active.
php "$WU21_WP_CLI" plugin install "$ZIP" --activate --path="$WU21_WP_PATH"
test -d "$PLUGIN_DIR" && test ! -L "$PLUGIN_DIR"
test -f "$PLUGIN_DIR/src/SRWF/GravityFlow/Inbox2Shortcode.php"
test ! -e "$PLUGIN_DIR/tests/qualification-custom-inbox/usability-mu.php"
release_assert_version_mirrors "$PLUGIN_DIR"
test "$(release_plugin_version "$PLUGIN_DIR")" = "$VERSION"
test "$(php "$WU21_WP_CLI" plugin get gravity-presentation-profiles --field=version --path="$WU21_WP_PATH")" = "$VERSION"
release_assert_installed_runtime_identity "$SRC" "$PLUGIN_DIR" "$INVENTORY" \
  "$WU21_ARTIFACT_DIR/gpp-inbox2-actual-files.txt" \
  "$WU21_ARTIFACT_DIR/gpp-inbox2-file-comparisons.txt"
printf 'GPP_INBOX2_VERSION_IDENTITY_PASS source=%s expected=%s installed=%s\n' "$SOURCE_VERSION" "$VERSION" "$(release_plugin_version "$PLUGIN_DIR")"
# Run without WU21 MU-plugin bootstrap. This is a disposable WordPress host.
if [[ -f "$MU" ]]; then
  mv "$MU" "$STAGE/wu21-lab-plugin.php"
  moved_mu=1
fi
php "$WU21_WP_CLI" --path="$WU21_WP_PATH" eval-file tests/repro-evidence-lab/inbox2-installed-zip-setup.php
test -s "$WU21_ARTIFACT_DIR/gpp-inbox2-installed-fixture.json"
# A long-lived PHP HTTP process can retain the old checkout path after the
# symlink is replaced by the installed ZIP (WU21 discriminator 45470009134).
# Restart only at this boundary. The restored checkout passed both downstream
# consumers with the same new listener; no teardown restart is justified.
test "$WU21_BASE_URL" = http://127.0.0.1:8080
release_require_command ss
release_require_command jq
old_wrapper="$(cat /tmp/wu21-wp-server.pid)"
old_listener="$(wu21_assert_owned_listener "$old_wrapper" 8080 "$WU21_WP_CLI" "$WU21_WP_PATH")"
current_wrapper="$old_wrapper"
restart_attempted=1
printf 'old_wrapper=%s\nold_listener=%s\n' "$old_wrapper" "$old_listener" > "$WU21_ARTIFACT_DIR/gpp-inbox2-http-process.txt"
# Recheck ownership immediately before any termination. Never kill an occupant
# of the endpoint that is not a child of this laboratory's exact wrapper.
wu21_listener_owned "$old_listener" "$old_wrapper" 8080 "$WU21_WP_CLI" "$WU21_WP_PATH" || { release_fail 'Prior listener ownership changed.'; exit 1; }
kill "$old_listener"
if wu21_server_wrapper_owned "$old_wrapper" 8080 "$WU21_WP_CLI" "$WU21_WP_PATH"; then
  kill "$old_wrapper" 2>/dev/null || ! wu21_server_wrapper_owned "$old_wrapper" 8080 "$WU21_WP_CLI" "$WU21_WP_PATH" || exit 1
fi
current_wrapper=
wu21_wait_for_free_endpoint 8080 "$old_listener" || exit 1
# Reuse the historical loopback probe approach, with execution-derived
# Add-On version and class paths in addition to the plugin header.
probe="$(mktemp "$WU21_WP_PATH/wu21-inbox2-identity-XXXXXXXX.php")"
cp tests/repro-evidence-lab/inbox2-http-probe.php "$probe"
php "$WU21_WP_CLI" server --path="$WU21_WP_PATH" --host=127.0.0.1 --port=8080 >>/tmp/wu21-wp-server.log 2>&1 &
current_wrapper=$!
echo "$current_wrapper" >/tmp/wu21-wp-server.pid
new_listener="$(wu21_wait_for_owned_http "$current_wrapper" 8080 "$WU21_WP_CLI" "$WU21_WP_PATH")"
test "$new_listener" != "$old_listener"
printf 'new_wrapper=%s\nnew_listener=%s\n' "$current_wrapper" "$new_listener" >> "$WU21_ARTIFACT_DIR/gpp-inbox2-http-process.txt"
probe_url="$WU21_BASE_URL/$(basename "$probe")"
wu21_assert_http_identity "$probe_url" "$new_listener" "$VERSION" "$PLUGIN_DIR" "$WU21_ARTIFACT_DIR/gpp-inbox2-http-before-browser.json" || exit 1
wu21_assert_installed_http_assets "$WU21_BASE_URL" "$SRC" "$STAGE" "$WU21_ARTIFACT_DIR/gpp-inbox2-http-assets.txt" || exit 1
# The actual browser script reads fixture URLs. Reject any other origin before
# launching it; the same owned listener is independently checked after it.
jq -e --arg base "$WU21_BASE_URL/" '(.url | startswith($base)) and (.multi_url | startswith($base))' "$WU21_ARTIFACT_DIR/gpp-inbox2-installed-fixture.json" >/dev/null
printf 'GPP_INBOX2_INSTALLED_HTTP_RESTART_PASS old=%s new=%s\n' "$old_listener" "$new_listener"
export GPP_INBOX2_HTTP_PROBE_URL="$probe_url"
export GPP_INBOX2_HTTP_LISTENER_PID="$new_listener"
xvfb-run -a bash -euc 'openbox >/tmp/wu21-inbox2-openbox.log 2>&1 & sleep 2; exec node tests/repro-evidence-lab/inbox2-installed-zip-browser.mjs'
test -s "$WU21_ARTIFACT_DIR/gpp-inbox2-installed-browser.json"
test "$(wu21_assert_owned_listener "$current_wrapper" 8080 "$WU21_WP_CLI" "$WU21_WP_PATH")" = "$new_listener"
wu21_assert_http_identity "$probe_url" "$new_listener" "$VERSION" "$PLUGIN_DIR" "$WU21_ARTIFACT_DIR/gpp-inbox2-http-after-browser.json" || exit 1
echo 'GPP_INBOX2_INSTALLED_ZIP_RUNTIME_SMOKE_PASS'
