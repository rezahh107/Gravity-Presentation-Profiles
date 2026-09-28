#!/usr/bin/env bash
set -euo pipefail
ZIP="${1:-}"
[[ -f "$ZIP" ]] || { echo 'Behavioral artifact missing.' >&2; exit 1; }

required_package='gravity-presentation-profiles/profiles/srwf/operations/operations-package-v1.json'
required_entrypoint='gravity-presentation-profiles/gravity-presentation-profiles.php'
retired_resolver="gravity-presentation-profiles/src/SRWF/GravityFlow/InboxField""PresentationResolver.php"
zip_entries="$(unzip -Z1 "$ZIP")"

printf '%s\n' "$zip_entries" | grep -Fxq "$required_package" || { echo 'Operations Package missing from behavioral artifact.' >&2; exit 1; }
printf '%s\n' "$zip_entries" | grep -Fxq "$required_entrypoint" || { echo 'Plugin entrypoint missing from behavioral artifact.' >&2; exit 1; }
if printf '%s\n' "$zip_entries" | grep -Fxq "$retired_resolver"; then
  echo 'Retired Inbox field presentation resolver must not be present in Native-First behavioral artifacts.' >&2
  exit 1
fi

package_json="$(unzip -p "$ZIP" "$required_package")"
php -r '$p=json_decode($argv[1],true); if(!is_array($p)||($p["package_id"]??null)!=="srwf.operations.presentation") exit(1);' "$package_json"

echo 'GPP_BEHAVIORAL_ARTIFACT_GUARD_PASS'
