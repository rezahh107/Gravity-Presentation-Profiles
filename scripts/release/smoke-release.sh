#!/usr/bin/env bash
set -euo pipefail
wp_cli="${1:?usage: smoke-release.sh WP_CLI WP_PATH ZIP}"
wp_path="${2:?missing wp path}"
zip_path="${3:?missing zip}"
php "$wp_cli" plugin install "$zip_path" --path="$wp_path" --force >/dev/null
php "$wp_cli" plugin activate gravity-presentation-profiles --path="$wp_path" >/dev/null
php "$wp_cli" plugin status gravity-presentation-profiles --path="$wp_path" | grep -q 'Status: Active'
php "$wp_cli" --path="$wp_path" eval '
if (!defined("GPP_PLUGIN_FILE")) { fwrite(STDERR, "GPP_PLUGIN_FILE missing\n"); exit(1); }
if (!class_exists("GravityPresentationProfiles\\Bootstrap")) { fwrite(STDERR, "Bootstrap unavailable\n"); exit(1); }
if (!class_exists("GravityPresentationProfiles\\GravityForms\\AddOn")) { fwrite(STDERR, "Gravity Forms Add-On unavailable\n"); exit(1); }
$addon = GravityPresentationProfiles\GravityForms\AddOn::get_instance();
if (!$addon instanceof GFAddOn) { fwrite(STDERR, "GPP Add-On not reachable\n"); exit(1); }
echo "GPP_RELEASE_ZIP_RUNTIME_REACHABLE\n";
'
plugin_dir="$wp_path/wp-content/plugins/gravity-presentation-profiles"
[[ -f "$plugin_dir/gravity-presentation-profiles.php" ]]
[[ ! -e "$plugin_dir/tests" && ! -e "$plugin_dir/.github" && ! -e "$plugin_dir/docs" ]]
echo GPP_RELEASE_EXACT_ZIP_SMOKE_PASS
