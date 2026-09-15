#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/release-lib.sh"

version="${1:?usage: build-release.sh VERSION [OUT_DIR]}"
out_dir="${2:-$GPP_RELEASE_ROOT/dist}"
source_sha="${GPP_RELEASE_SOURCE_SHA:-$(git -C "$GPP_RELEASE_ROOT" rev-parse HEAD)}"
epoch="${SOURCE_DATE_EPOCH:-$(git -C "$GPP_RELEASE_ROOT" show -s --format=%ct "$source_sha")}"

is_candidate_version "$version" || fail "invalid candidate version: $version"
assert_source_version_mirrors
mkdir -p "$out_dir"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
root="$work/$GPP_PLUGIN_ROOT"
mkdir -p "$root"
mapfile -t files < <(release_file_list)
[[ ${#files[@]} -gt 3 ]] || fail "release file list is unexpectedly small"

for path in "${files[@]}"; do
  mkdir -p "$root/$(dirname "$path")"
  render_versioned_file "$path" "$root/$path" "$version"
done
find "$root" -exec touch -h -d "@$epoch" {} +
zip_name="gravity-presentation-profiles-$version.zip"
zip_path="$out_dir/$zip_name"
rm -f "$zip_path"
(
  cd "$work"
  LC_ALL=C find "$GPP_PLUGIN_ROOT" -type f -print | LC_ALL=C sort | zip -X -q "$zip_path" -@
)
sha="$(sha256sum "$zip_path" | awk '{print $1}')"
printf '%s  %s\n' "$sha" "$zip_name" > "$out_dir/$zip_name.sha256"
printf '%s\n' "$zip_path"
