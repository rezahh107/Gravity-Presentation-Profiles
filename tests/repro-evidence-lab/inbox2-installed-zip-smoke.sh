#!/usr/bin/env bash
# Ephemeral WU21-only installed ZIP boundary. Never publishes a release.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$ROOT"
source scripts/release/release-lib.sh
: "${WU21_WP_PATH:?}" "${WU21_WP_CLI:?}" "${WU21_ARTIFACT_DIR:?}"
# Expected identity comes from the selected source, never the installed copy.
release_assert_version_mirrors "$ROOT"
SOURCE_VERSION="$(release_plugin_version "$ROOT")"
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
MU="$WU21_WP_PATH/wp-content/mu-plugins/wu21-lab-plugin.php"
restore_wu21() {
  local rc=$?
  trap - EXIT
  if [[ "$changed_plugin" == 1 ]]; then
    # Always restore synthetic task count even when a browser assertion fails.
    if ! php "$WU21_WP_CLI" --path="$WU21_WP_PATH" eval-file tests/repro-evidence-lab/inbox2-installed-zip-cleanup.php; then rc=1; fi
    if ! php "$WU21_WP_CLI" plugin deactivate gravity-presentation-profiles --path="$WU21_WP_PATH"; then rc=1; fi
    # Only the disposable copy installed from our test ZIP is deleted.
    if [[ -d "$PLUGIN_DIR" && ! -L "$PLUGIN_DIR" ]]; then rm -rf "$PLUGIN_DIR"; fi
    if [[ ! -e "$PLUGIN_DIR" && ! -L "$PLUGIN_DIR" ]]; then ln -s "$ROOT" "$PLUGIN_DIR"; fi
    if ! php "$WU21_WP_CLI" plugin activate gravity-presentation-profiles --path="$WU21_WP_PATH"; then rc=1; fi
  fi
  if [[ "$moved_mu" == 1 ]]; then
    if ! mv "$STAGE/wu21-lab-plugin.php" "$MU"; then rc=1; fi
  fi
  rm -rf "$STAGE"
  exit "$rc"
}
trap restore_wu21 EXIT
SRC="$STAGE/source"
mkdir -p "$SRC" "$STAGE/out"
while IFS= read -r file; do
  mkdir -p "$SRC/$(dirname "$file")"
  cp "$file" "$SRC/$file"
done < <(release_runtime_files "$ROOT")
if [[ "$SOURCE_VERSION" == '0.0.0-dev' ]]; then
  sed -i "s/Version: 0.0.0-dev/Version: ${VERSION}/" "$SRC/gravity-presentation-profiles.php"
  sed -i "s/'0.0.0-dev'/'${VERSION}'/" "$SRC/src/GravityForms/AddOn.php"
fi
release_assert_version_mirrors "$SRC"
bash scripts/release/build-release.sh "$SRC" "$VERSION" "$STAGE/out"
ZIP="$STAGE/out/gravity-presentation-profiles-${VERSION}.zip"
bash scripts/release/validate-release.sh "$SRC" "$ZIP" "$VERSION"
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
while IFS= read -r file; do
  cmp "$SRC/$file" "$PLUGIN_DIR/$file"
done < <(release_runtime_files "$SRC")
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
old_listener="$(lsof -tiTCP:8080 -sTCP:LISTEN)"
old_wrapper="$(cat /tmp/wu21-wp-server.pid)"
[[ "$old_listener" =~ ^[0-9]+$ && "$old_wrapper" =~ ^[0-9]+$ ]]
test "$old_listener" != "$$" && test "$old_wrapper" != "$$"
case "$(ps -p "$old_listener" -o comm= | tr -d ' ')" in
  php|php[0-9]*) ;;
  *) exit 1 ;;
esac
tr '\0' ' ' < "/proc/$old_listener/cmdline" | grep -Fq '127.0.0.1:8080'
tr '\0' ' ' < "/proc/$old_wrapper/cmdline" | grep -Fq -- "$WU21_WP_CLI server --path=$WU21_WP_PATH --host=127.0.0.1 --port=8080"
kill "$old_listener"
if kill -0 "$old_wrapper" 2>/dev/null; then
  kill "$old_wrapper" 2>/dev/null || ! kill -0 "$old_wrapper" 2>/dev/null
fi
for i in $(seq 1 30); do
  if ! lsof -tiTCP:8080 -sTCP:LISTEN >/dev/null; then break; fi
  sleep 1
done
! lsof -tiTCP:8080 -sTCP:LISTEN >/dev/null
php "$WU21_WP_CLI" server --path="$WU21_WP_PATH" --host=127.0.0.1 --port=8080 >>/tmp/wu21-wp-server.log 2>&1 &
echo $! >/tmp/wu21-wp-server.pid
ready=0
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 "$WU21_BASE_URL/wp-login.php" >/dev/null; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
new_listener="$(lsof -tiTCP:8080 -sTCP:LISTEN)"
[[ "$new_listener" =~ ^[0-9]+$ ]]
test "$new_listener" != "$old_listener"
printf 'GPP_INBOX2_INSTALLED_HTTP_RESTART_PASS old=%s new=%s\n' "$old_listener" "$new_listener"
node tests/repro-evidence-lab/inbox2-installed-zip-browser.mjs
test -s "$WU21_ARTIFACT_DIR/gpp-inbox2-installed-browser.json"
echo 'GPP_INBOX2_INSTALLED_ZIP_RUNTIME_SMOKE_PASS'
