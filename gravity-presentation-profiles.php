<?php
/**
 * Plugin Name: Gravity Presentation Profiles
 * Description: Deterministic, opt-in presentation profiles for supported Gravity ecosystem surfaces.
 * Version: 0.0.0-dev
 * Text Domain: gravity-presentation-profiles
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
    define( 'GPP_PLUGIN_FILE', __FILE__ );
}

require_once __DIR__ . '/src/Autoloader.php';

\GravityPresentationProfiles\Autoloader::register();
\GravityPresentationProfiles\Bootstrap::init();
