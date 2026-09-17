#!/usr/bin/env bash
set -euo pipefail
ZIP="${1:-}"
[[ -f "$ZIP" ]] || { echo 'Behavioral artifact missing.' >&2; exit 1; }
required_package='gravity-presentation-profiles/profiles/srwf/operations/operations-package-v1.json'
required_resolver='gravity-presentation-profiles/src/SRWF/GravityFlow/InboxFieldPresentationResolver.php'
unzip -Z1 "$ZIP" | grep -Fxq "$required_package" || { echo 'Operations Package missing from behavioral artifact.' >&2; exit 1; }
unzip -Z1 "$ZIP" | grep -Fxq "$required_resolver" || { echo 'Inbox field presentation resolver missing from behavioral artifact.' >&2; exit 1; }
package_json="$(unzip -p "$ZIP" "$required_package")"
php -r '$p=json_decode($argv[1],true); if(!is_array($p)||($p["package_id"]??null)!=="srwf.operations.presentation") exit(1);' "$package_json"
unzip -Z1 "$ZIP" | grep -Fxq 'gravity-presentation-profiles/gravity-presentation-profiles.php'
echo 'GPP_BEHAVIORAL_ARTIFACT_GUARD_PASS'
