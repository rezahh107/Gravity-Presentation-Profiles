<?php
/**
 * Plugin Name: Gravity Presentation Profiles
 * Description: Deterministic, opt-in presentation profiles for supported Gravity ecosystem surfaces.
 * Version: 0.0.0-dev
 * Requires at least: 6.8.3
 * Requires PHP: 8.2
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: gravity-presentation-profiles
 */

// Release authority: the plugin-header Version is canonical; release tooling
// machine-checks the Gravity Forms Add-On version mirror before packaging.

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
    define( 'GPP_PLUGIN_FILE', __FILE__ );
}

require_once __DIR__ . '/src/Autoloader.php';

\GravityPresentationProfiles\Autoloader::register();
\GravityPresentationProfiles\Bootstrap::init();
