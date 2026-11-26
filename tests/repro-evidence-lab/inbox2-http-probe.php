<?php
/** WU21-only direct loopback witness, derived from the historical path probe.
 * Copied temporarily into the disposable WP root; never distributed in GPP.
 */
if ( ! in_array( $_SERVER['REMOTE_ADDR'] ?? '', array( '127.0.0.1', '::1' ), true ) ) {
    http_response_code( 403 );
    exit;
}
require __DIR__ . '/wp-load.php';
nocache_headers();
header( 'Content-Type: application/json' );
if ( ! defined( 'GPP_PLUGIN_FILE' ) || ! class_exists( \GravityPresentationProfiles\GravityForms\AddOn::class, false ) ) {
    http_response_code( 500 );
    echo '{"error":"GPP_NOT_LOADED"}';
    exit;
}
$addon = \GravityPresentationProfiles\GravityForms\AddOn::get_instance();
$version = new ReflectionProperty( $addon, '_version' );
$header = get_file_data( GPP_PLUGIN_FILE, array( 'version' => 'Version' ) );
echo wp_json_encode( array(
    'pid' => getmypid(),
    'plugin_file' => GPP_PLUGIN_FILE,
    'header' => $header['version'],
    'addon_version' => $version->getValue( $addon ),
    'addon_class_file' => ( new ReflectionClass( $addon ) )->getFileName(),
    'bootstrap_class_file' => ( new ReflectionClass( \GravityPresentationProfiles\Bootstrap::class ) )->getFileName(),
    'inbox_class_file' => ( new ReflectionClass( \GravityPresentationProfiles\SRWF\GravityFlow\Inbox2Shortcode::class ) )->getFileName(),
), JSON_UNESCAPED_SLASHES );
