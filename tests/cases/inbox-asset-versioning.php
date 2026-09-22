<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;

if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
    define( 'GPP_PLUGIN_FILE', realpath( __DIR__ . '/../../gravity-presentation-profiles.php' ) );
}

$GLOBALS['gpp_inbox_asset_styles'] = array();

function plugins_url( $path, $plugin_file ) {
    unset( $plugin_file );
    return 'https://example.test/wp-content/plugins/gravity-presentation-profiles/' . ltrim( (string) $path, '/' );
}

function wp_enqueue_style( $handle, $src = '', $dependencies = array(), $version = false, $media = 'all' ) {
    $GLOBALS['gpp_inbox_asset_styles'][] = array(
        'handle' => $handle,
        'src' => $src,
        'dependencies' => $dependencies,
        'version' => $version,
        'media' => $media,
    );
}

Autoloader::register();

$adapter = new ReflectionClass( InboxPresentationAdapter::class );
$model_loaded = $adapter->getProperty( 'model_loaded' );
$model_loaded->setAccessible( true );
$model_loaded->setValue( null, true );
$model = $adapter->getProperty( 'model' );
$model->setAccessible( true );
$model->setValue( null, new stdClass() );
$surface_reached = $adapter->getProperty( 'surface_reached' );
$surface_reached->setAccessible( true );
$surface_reached->setValue( null, true );

InboxPresentationAdapter::enqueueStyles();

gpp_assert_same( 2, count( $GLOBALS['gpp_inbox_asset_styles'] ), 'Inbox must enqueue exactly its presentation and native projection styles after reachability is established.' );

$plugin_root = dirname( GPP_PLUGIN_FILE );
$expected = array(
    InboxPresentationAdapter::STYLE_HANDLE => array(
        'path' => 'assets/css/srwf-gravity-flow-inbox.css',
        'dependencies' => array(),
    ),
    InboxPresentationAdapter::NATIVE_STYLE_HANDLE => array(
        'path' => 'assets/css/srwf-gravity-flow-inbox-native.css',
        'dependencies' => array( InboxPresentationAdapter::STYLE_HANDLE ),
    ),
);

foreach ( $GLOBALS['gpp_inbox_asset_styles'] as $style ) {
    gpp_assert_true( isset( $expected[ $style['handle'] ] ), 'Unexpected Inbox style handle was enqueued.' );
    $contract = $expected[ $style['handle'] ];
    $absolute = $plugin_root . '/' . $contract['path'];
    $hash = hash_file( 'sha256', $absolute );
    gpp_assert_true( is_string( $hash ) && '' !== $hash, 'Inbox stylesheet content hash must be readable.' );
    gpp_assert_same( substr( $hash, 0, 16 ), $style['version'], 'Inbox stylesheet cache key must be derived from the exact shipped bytes: ' . $style['handle'] );
    gpp_assert_same( $contract['dependencies'], $style['dependencies'], 'Inbox stylesheet dependencies must remain unchanged: ' . $style['handle'] );
    gpp_assert_true( '1.0.0' !== $style['version'], 'Inbox stylesheet cache key must not remain the historical hard-coded version.' );
}

$asset_version = $adapter->getMethod( 'assetVersion' );
$asset_version->setAccessible( true );
$temp = tempnam( sys_get_temp_dir(), 'gpp-inbox-asset-' );
gpp_assert_true( false !== $temp, 'A temporary asset file is required for cache-key falsification.' );
file_put_contents( $temp, 'old-css-bytes' );
$first = $asset_version->invoke( null, $temp );
file_put_contents( $temp, 'new-css-bytes' );
$second = $asset_version->invoke( null, $temp );
@unlink( $temp );

gpp_assert_true( is_string( $first ) && '' !== $first, 'Content-derived cache key must be available for readable assets.' );
gpp_assert_true( is_string( $second ) && '' !== $second, 'Changed asset bytes must still produce a cache key.' );
gpp_assert_true( $first !== $second, 'Changing stylesheet bytes must change the cache key even when the plugin version is unchanged.' );

echo "INBOX_ASSET_VERSIONING_PASS\n";
