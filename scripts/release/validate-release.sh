#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/release-lib.sh"
zip_path="${1:?usage: validate-release.sh ZIP VERSION [SOURCE_SHA]}"
version="${2:?missing version}"
source_sha="${3:-$(git -C "$GPP_RELEASE_ROOT" rev-parse HEAD)}"

[[ -f "$zip_path" ]] || fail "zip missing: $zip_path"
is_candidate_version "$version" || fail "invalid candidate version: $version"
unzip -tq "$zip_path" >/dev/null || fail "corrupt zip"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
unzip -q "$zip_path" -d "$work"
root="$work/$GPP_PLUGIN_ROOT"
[[ -f "$root/$GPP_PLUGIN_ENTRY" ]] || fail "plugin entrypoint missing"
[[ -f "$root/src/Bootstrap.php" ]] || fail "required runtime source missing"
[[ -f "$root/assets/css/base.css" ]] || fail "required runtime asset missing"
[[ -f "$root/profiles/srwf/registration/profile.css" ]] || fail "required profile asset missing"
[[ -f "$root/profiles/srwf/registration/profile-package-v1.1.json" ]] || fail "required profile package missing"

mapfile -t expected < <(release_file_list | sed "s#^#$GPP_PLUGIN_ROOT/#")
mapfile -t actual < <(cd "$work" && find "$GPP_PLUGIN_ROOT" -type f -print | LC_ALL=C sort)
[[ "$(printf '%s\n' "${expected[@]}")" == "$(printf '%s\n' "${actual[@]}")" ]] || { printf 'expected:\n%s\nactual:\n%s\n' "$(printf '%s\n' "${expected[@]}")" "$(printf '%s\n' "${actual[@]}")" >&2; fail "zip file set mismatch"; }

for forbidden in .git .github tests docs scripts release AGENTS.md CHANGELOG.md README.md SECURITY.md composer.json composer.lock node_modules vendor; do
  [[ ! -e "$root/$forbidden" ]] || fail "forbidden development material present: $forbidden"
done

for path in "${actual[@]}"; do
  rel="${path#${GPP_PLUGIN_ROOT}/}"
  expected_file="$work/expected-$RANDOM"
  if [[ "$rel" == "$GPP_PLUGIN_ENTRY" || "$rel" == "$GPP_ADDON_FILE" ]]; then
    render_versioned_file "$rel" "$expected_file" "$version"
    cmp -s "$expected_file" "$work/$path" || fail "transformed runtime file differs unexpectedly: $rel"
    rm -f "$expected_file"
  else
    cmp -s "$GPP_RELEASE_ROOT/$rel" "$work/$path" || fail "artifact/source byte mismatch: $rel"
  fi
done
plugin_version="$(sed -n 's/^ \* Version: \(.*\)$/\1/p' "$root/$GPP_PLUGIN_ENTRY" | head -1)"
addon_version="$(grep -m1 -F 'protected $_version' "$root/$GPP_ADDON_FILE" | cut -d"'" -f2)"
[[ "$plugin_version" == "$version" && "$addon_version" == "$version" ]] || fail "artifact version mismatch: plugin=$plugin_version addon=$addon_version expected=$version"

if grep -RIlE --exclude='*.png' --exclude='*.jpg' --exclude='*.jpeg' --exclude='*.gif' --exclude='*.webp' -- '(BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})' "$root" | grep -q .; then
  grep -RIlE '(BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})' "$root" >&2 || true
  fail "secret-like material detected in release"
fi
sha="$(sha256sum "$zip_path" | awk '{print $1}')"
printf 'GPP_RELEASE_ARTIFACT_VALIDATION_PASS source=%s version=%s sha256=%s\n' "$source_sha" "$version" "$sha"
