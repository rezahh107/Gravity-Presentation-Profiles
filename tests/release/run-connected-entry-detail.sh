#!/usr/bin/env bash
# Runs after connected Print in the same clean installed-ZIP WordPress runtime.
set -euo pipefail
ROOT="$1"
WPCLI="$2"
WP_PATH="$3"
BASE_URL="$4"
EVIDENCE_DIR="$5"
SETTINGS_URL="$BASE_URL/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles"
FIXTURE="$EVIDENCE_DIR/behavioral-host-fixture.json"
COOKIES="$EVIDENCE_DIR/admin-cookies.txt"
export GPP_BEHAVIOR_ARTIFACT_DIR="$EVIDENCE_DIR"

entry_state() {
  GPP_BEHAVIOR_STATE_COMMAND="$1" php "$WPCLI" --path="$WP_PATH" \
    eval-file "$ROOT/tests/release/behavioral-state.php" > "$EVIDENCE_DIR/$1.json"
}
entry_setup() {
  local stage="$1" before="$EVIDENCE_DIR/entry-settings-before-$1.html"
  curl -fsS -b "$COOKIES" -c "$COOKIES" "$SETTINGS_URL" -o "$before"
  grep -Fq 'Operations Setup (Entry Detail)' "$before"
  php "$ROOT/tests/release/behavioral-http-form.php" entry "$before" "$FIXTURE" \
    > "$EVIDENCE_DIR/entry-$stage-payload.txt"
  curl -fsS -L -b "$COOKIES" -c "$COOKIES" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-binary @"$EVIDENCE_DIR/entry-$stage-payload.txt" \
    "$SETTINGS_URL" -o "$EVIDENCE_DIR/entry-settings-after-$stage.html"
  entry_state "$stage"
}
entry_mapping() {
  local stage="$1" field="$2" before="$EVIDENCE_DIR/entry-mapping-before-$1.html"
  curl -fsS -b "$COOKIES" -c "$COOKIES" "$SETTINGS_URL" -o "$before"
  php "$ROOT/tests/release/behavioral-http-form.php" repair "$before" "$FIXTURE" \
    student.home_phone "$field" > "$EVIDENCE_DIR/entry-mapping-$stage-payload.txt"
  curl -fsS -L -b "$COOKIES" -c "$COOKIES" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-binary @"$EVIDENCE_DIR/entry-mapping-$stage-payload.txt" \
    "$SETTINGS_URL" -o "$EVIDENCE_DIR/entry-mapping-after-$stage.html"
  entry_state "$stage"
}
entry_browser() {
  local stage="$1"
  GPP_BEHAVIOR_ENTRY_STAGE="$stage" php "$WPCLI" --path="$WP_PATH" \
    eval-file "$ROOT/tests/release/behavioral-entry-host-state.php"
  GPP_TEST_ADMIN_USER=release_admin \
  GPP_TEST_ADMIN_PASS=gpp-release-smoke-2026 \
  GPP_TEST_VIEWER_USER=release_viewer \
  GPP_TEST_VIEWER_PASS=gpp-synthetic-viewer-2026 \
    node "$ROOT/tests/release/connected-entry-detail-browser.mjs" \
    "$stage" "$FIXTURE" "$BASE_URL" "$EVIDENCE_DIR"
}
entry_state before-entry-setup
entry_setup after-entry-setup
entry_browser initial
entry_setup after-entry-rerun
entry_mapping after-entry-empty empty_phone
entry_browser empty
php "$WPCLI" --path="$WP_PATH" eval-file "$ROOT/tests/release/behavioral-entry-host-change.php"
entry_state after-entry-stale
entry_browser stale
entry_mapping after-entry-rebind replacement_empty_phone
entry_setup after-entry-requalification
entry_browser requalified
php "$ROOT/tests/release/validate-connected-entry-detail.php" "$EVIDENCE_DIR"
python3 "$ROOT/tests/release/falsify-connected-entry-detail.py" "$ROOT" "$EVIDENCE_DIR"
