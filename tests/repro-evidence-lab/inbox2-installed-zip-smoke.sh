#!/usr/bin/env bash
# Ephemeral WU21-only installed ZIP boundary. Never publishes a release.
set -euo pipefail
ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$ROOT"
source scripts/release/release-lib.sh
: "\${WU21_WP_PATH:?}" "\${WU21_WP_CLI:?}" "\${WU21_ARTIFACT_DIR:?}"
VERSION=9999.0.0
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
SRC="$STAGE/source"
mkdir -p "$SRC" "$STAGE/out"
while IFS= read -r file; do
  mkdir -p "$SRC/$(dirname "$file")"
  cp "$file" "$SRC/$file"
done < <(release_runtime_files "$ROOT")
sed -i "s/Version: 0.0.0-dev/Version: \${VERSION}/" "$SRC/gravity-presentation-profiles.php"
sed -i "s/'0.0.0-dev'/'\${VERSION}'/" "$SRC/src/GravityForms/AddOn.php"
release_assert_version_mirrors "$SRC"
bash scripts/release/build-release.sh "$SRC" "$VERSION" "$STAGE/out"
ZIP="$STAGE/out/gravity-presentation-profiles-\${VERSION}.zip"
bash scripts/release/validate-release.sh "$SRC" "$ZIP" "$VERSION"
unzip -Z1 "$ZIP" | grep -Fxq 'gravity-presentation-profiles/src/SRWF/GravityFlow/Inbox2Shortcode.php'
unzip -Z1 "$ZIP" | grep -Fxq 'gravity-presentation-profiles/assets/css/gpp-inbox2.css'
unzip -Z1 "$ZIP" | grep -Fxq 'gravity-presentation-profiles/assets/js/gpp-inbox2.js'
if unzip -Z1 "$ZIP" | grep -Eq '^gravity-presentation-profiles/(tests|mu-plugins|\.github)/'; then
  echo 'Test-only files in GPP ZIP' >&2
  exit 1
fi
PLUGIN_DIR="$WU21_WP_PATH/wp-content/plugins/gravity-presentation-profiles"
test -L "$PLUGIN_DIR" || { echo 'Original WU21 GPP source must be a symlink' >&2; exit 1; }
php "$WU21_WP_CLI" plugin deactivate gravity-presentation-profiles --path="$WU21_WP_PATH"
rm "$PLUGIN_DIR"
# Installed ZIP, not the source symlink. Other pinned host plugins remain active.
php "$WU21_WP_CLI" plugin install "$ZIP" --activate --path="$WU21_WP_PATH"
test -d "$PLUGIN_DIR" && test ! -L "$PLUGIN_DIR"
test -f "$PLUGIN_DIR/src/SRWF/GravityFlow/Inbox2Shortcode.php"
test ! -e "$PLUGIN_DIR/tests/qualification-custom-inbox/usability-mu.php"
# Run without WU21 MU-plugin bootstrap. This is a disposable WordPress host.
MU="$WU21_WP_PATH/wp-content/mu-plugins/wu21-lab-plugin.php"
if [[ -f "$MU" ]]; then mv "$MU" "$STAGE/wu21-lab-plugin.php"; fi
php "$WU21_WP_CLI" --path="$WU21_WP_PATH" eval-file tests/repro-evidence-lab/inbox2-installed-zip-setup.php
test -s "$WU21_ARTIFACT_DIR/gpp-inbox2-installed-fixture.json"
node tests/repro-evidence-lab/inbox2-installed-zip-browser.mjs
test -s "$WU21_ARTIFACT_DIR/gpp-inbox2-installed-browser.json"
echo 'GPP_INBOX2_INSTALLED_ZIP_RUNTIME_SMOKE_PASS'
