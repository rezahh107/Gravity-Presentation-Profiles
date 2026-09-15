#!/usr/bin/env bash
set -euo pipefail

GPP_RELEASE_ROOT="${GPP_RELEASE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
GPP_RELEASE_POLICY="${GPP_RELEASE_POLICY:-$GPP_RELEASE_ROOT/release/release-policy.json}"
GPP_PLUGIN_ENTRY="gravity-presentation-profiles.php"
GPP_ADDON_FILE="src/GravityForms/AddOn.php"
GPP_PLUGIN_ROOT="gravity-presentation-profiles"

fail() { printf 'GPP_RELEASE_FAIL: %s\n' "$*" >&2; return 1; }

json_get() {
  local path="$1"
  php -r '
    $data = json_decode(file_get_contents($argv[1]), true);
    if (!is_array($data)) { fwrite(STDERR, "invalid policy json\n"); exit(2); }
    $value = $data;
    foreach (explode(".", $argv[2]) as $key) {
      if (!is_array($value) || !array_key_exists($key, $value)) { exit(3); }
      $value = $value[$key];
    }
    if ($value === null) { exit(4); }
    if (is_bool($value)) { echo $value ? "true" : "false"; }
    elseif (is_scalar($value)) { echo (string) $value; }
    else { echo json_encode($value, JSON_UNESCAPED_SLASHES); }
  ' "$GPP_RELEASE_POLICY" "$path"
}

is_stable_version() { [[ "${1:-}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; }
is_candidate_version() { [[ "${1:-}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z][0-9A-Za-z.-]*)?$ ]]; }

source_plugin_version() {
  sed -n 's/^ \* Version: \(.*\)$/\1/p' "$GPP_RELEASE_ROOT/$GPP_PLUGIN_ENTRY" | head -1
}

source_addon_version() {
  grep -m1 -F 'protected $_version' "$GPP_RELEASE_ROOT/$GPP_ADDON_FILE" | cut -d"'" -f2
}

assert_source_version_mirrors() {
  local plugin addon
  plugin="$(source_plugin_version)"
  addon="$(source_addon_version)"
  if [[ -z "$plugin" || -z "$addon" ]]; then fail "version declarations could not be parsed"; return 1; fi
  if [[ "$plugin" != "$addon" ]]; then fail "version mirror mismatch: plugin=$plugin addon=$addon"; return 1; fi
}

next_version() {
  local current="$1" bump="$2" major minor patch
  if ! is_stable_version "$current"; then fail "cannot bump invalid version: $current"; return 1; fi
  IFS=. read -r major minor patch <<<"$current"
  case "$bump" in
    patch) patch=$((patch + 1));;
    minor) minor=$((minor + 1)); patch=0;;
    major) major=$((major + 1)); minor=0; patch=0;;
    *) fail "invalid release intent: $bump"; return 1;;
  esac
  printf '%s.%s.%s\n' "$major" "$minor" "$patch"
}

resolve_release_version() {
  local latest_tag="${1:-}" intent="$2" first=""
  if [[ -z "$latest_tag" ]]; then
    first="$(json_get first_public_version 2>/dev/null || true)"
    if [[ -z "$first" ]]; then fail "first public release version is OWNER_DECISION_PENDING"; return 1; fi
    if ! is_stable_version "$first"; then fail "first public release version is invalid: $first"; return 1; fi
    printf '%s\n' "$first"
    return 0
  fi
  if [[ "$latest_tag" != v* ]]; then fail "latest release tag does not use v-prefix: $latest_tag"; return 1; fi
  next_version "${latest_tag#v}" "$intent"
}

release_file_list() {
  cd "$GPP_RELEASE_ROOT"
  git ls-files | while IFS= read -r path; do
    case "$path" in
      gravity-presentation-profiles.php) printf '%s\n' "$path" ;;
      src/*.php|src/*/*.php|src/*/*/*.php|src/*/*/*/*.php|src/*/*/*/*/*.php) printf '%s\n' "$path" ;;
      assets/*.css|assets/*.js|assets/*.png|assets/*.jpg|assets/*.jpeg|assets/*.gif|assets/*.svg|assets/*.webp|assets/*.woff|assets/*.woff2|assets/*.ttf|assets/*.otf|assets/*/*.css|assets/*/*.js|assets/*/*.png|assets/*/*.jpg|assets/*/*.jpeg|assets/*/*.gif|assets/*/*.svg|assets/*/*.webp|assets/*/*.woff|assets/*/*.woff2|assets/*/*.ttf|assets/*/*.otf|assets/*/*/*.png|assets/*/*/*.jpg|assets/*/*/*.jpeg|assets/*/*/*.gif|assets/*/*/*.svg|assets/*/*/*.webp) printf '%s\n' "$path" ;;
      profiles/*.css|profiles/*.json|profiles/*/*.css|profiles/*/*.json|profiles/*/*/*.css|profiles/*/*/*.json|profiles/*/*/*/*.css|profiles/*/*/*/*.json) printf '%s\n' "$path" ;;
    esac
  done | LC_ALL=C sort -u
}

render_versioned_file() {
  local source="$1" destination="$2" version="$3"
  case "$source" in
    "$GPP_PLUGIN_ENTRY")
      awk -v v="$version" '{ if ($0 ~ /^[[:space:]]*\*[[:space:]]*Version:/) sub(/Version:[[:space:]]*.*/, "Version: " v); print }' "$GPP_RELEASE_ROOT/$source" > "$destination"
      ;;
    "$GPP_ADDON_FILE")
      awk -v v="$version" '{ if ($0 ~ /protected[[:space:]]+\$_version[[:space:]]*=/) sub(/'"'"'[^'"'"']*'"'"'/, "'"'"'" v "'"'"'"); print }' "$GPP_RELEASE_ROOT/$source" > "$destination"
      ;;
    *) cp "$GPP_RELEASE_ROOT/$source" "$destination" ;;
  esac
}

changelog_unreleased_body() {
  awk '
    /^## \[Unreleased\]/ {in_section=1; next}
    /^## \[/ && in_section {exit}
    in_section {print}
  ' "$GPP_RELEASE_ROOT/CHANGELOG.md"
}

assert_release_notes_ready() {
  local body
  body="$(changelog_unreleased_body | sed '/^[[:space:]]*$/d')"
  [[ -n "$body" ]] || fail "CHANGELOG [Unreleased] is empty"
}

publication_blockers() {
  local -a blockers=()
  local status file
  status="$(json_get license.status 2>/dev/null || true)"
  file="$(json_get license.file 2>/dev/null || true)"
  [[ "$status" == "APPROVED" && -n "$file" && -f "$GPP_RELEASE_ROOT/$file" ]] || blockers+=("LICENSE_OWNER_DECISION_PENDING")
  status="$(json_get compatibility.status 2>/dev/null || true)"
  if [[ "$status" != "APPROVED" ]]; then
    blockers+=("COMPATIBILITY_POLICY_OWNER_DECISION_PENDING")
  else
    for key in wordpress_min php_min gravity_forms_min gravity_flow_min; do
      [[ -n "$(json_get "compatibility.$key" 2>/dev/null || true)" ]] || blockers+=("COMPATIBILITY_${key^^}_MISSING")
    done
    wp_min="$(json_get compatibility.wordpress_min 2>/dev/null || true)"
    php_min="$(json_get compatibility.php_min 2>/dev/null || true)"
    source_wp_min="$(sed -n 's/^ \* Requires at least: \(.*\)$/\1/p' "$GPP_RELEASE_ROOT/$GPP_PLUGIN_ENTRY" | head -1)"
    source_php_min="$(sed -n 's/^ \* Requires PHP: \(.*\)$/\1/p' "$GPP_RELEASE_ROOT/$GPP_PLUGIN_ENTRY" | head -1)"
    [[ -n "$wp_min" && "$source_wp_min" == "$wp_min" ]] || blockers+=("WORDPRESS_COMPATIBILITY_METADATA_MISMATCH")
    [[ -n "$php_min" && "$source_php_min" == "$php_min" ]] || blockers+=("PHP_COMPATIBILITY_METADATA_MISMATCH")
  fi
  first="$(json_get first_public_version 2>/dev/null || true)"
  [[ -n "$first" ]] || blockers+=("FIRST_PUBLIC_VERSION_OWNER_DECISION_PENDING")
  [[ "$(source_plugin_version)" == "$(json_get development_version 2>/dev/null || true)" ]] || blockers+=("SOURCE_NOT_IN_DEVELOPMENT_VERSION_STATE")
  assert_release_notes_ready || blockers+=("CHANGELOG_UNRELEASED_INVALID")
  printf '%s\n' "${blockers[@]:-}"
}

assert_source_identity() {
  local approved="$1" observed="$2"
  [[ -n "$approved" && "$approved" == "$observed" ]] || fail "release source moved: approved=$approved observed=$observed"
}

assert_qualified() {
  local state="$1"
  [[ "$state" == "PASS" ]] || fail "release source is not fully qualified: $state"
}
