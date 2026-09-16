#!/usr/bin/env bash
set -euo pipefail
ZIP="${1:-}"
[[ -f "$ZIP" ]] || { echo 'Behavioral artifact missing.' >&2; exit 1; }
required='gravity-presentation-profiles/profiles/srwf/operations/operations-package-v1.json'
unzip -Z1 "$ZIP" | grep -Fxq "$required" || { echo 'Operations Package missing from behavioral artifact.' >&2; exit 1; }
package_json="$(unzip -p "$ZIP" "$required")"
php -r '$p=json_decode($argv[1],true); if(!is_array($p)||($p["package_id"]??null)!=="srwf.operations.presentation") exit(1);' "$package_json"
unzip -Z1 "$ZIP" | grep -Fxq 'gravity-presentation-profiles/gravity-presentation-profiles.php'
echo 'GPP_BEHAVIORAL_ARTIFACT_GUARD_PASS'
