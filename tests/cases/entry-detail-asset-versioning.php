<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
    define( 'GPP_PLUGIN_FILE', realpath( __DIR__ . '/../../gravity-presentation-profiles.php' ) );
}

$GLOBALS['gpp_entry_detail_asset_styles'] = array();
$GLOBALS['gpp_entry_detail_asset_scripts'] = array();

function plugins_url( $path, $plugin_file ) {
    unset( $plugin_file );
    return 'https://example.test/wp-content/plugins/gravity-presentation-profiles/' . ltrim( (string) $path, '/' );
}

function wp_enqueue_style( $handle, $src = '', $dependencies = array(), $version = false, $media = 'all' ) {
    $GLOBALS['gpp_entry_detail_asset_styles'][] = compact( 'handle', 'src', 'dependencies', 'version', 'media' );
}

function wp_enqueue_script( $handle, $src = '', $dependencies = array(), $version = false, $in_footer = false ) {
    $GLOBALS['gpp_entry_detail_asset_scripts'][] = compact( 'handle', 'src', 'dependencies', 'version', 'in_footer' );
}

Autoloader::register();

$adapter = new ReflectionClass( EntryDetailPresentationAdapter::class );
$model_loaded = $adapter->getProperty( 'model_loaded' );
$model_loaded->setAccessible( true );
$model_loaded->setValue( null, true );
$model = $adapter->getProperty( 'model' );
$model->setAccessible( true );
$model->setValue( null, new stdClass() );

EntryDetailPresentationAdapter::enqueueAssets();

gpp_assert_same( 1, count( $GLOBALS['gpp_entry_detail_asset_styles'] ), 'Entry Detail must enqueue its stylesheet once.' );
gpp_assert_same( 1, count( $GLOBALS['gpp_entry_detail_asset_scripts'] ), 'Entry Detail must enqueue its script once.' );

$plugin_root = dirname( GPP_PLUGIN_FILE );
$contracts = array(
    $GLOBALS['gpp_entry_detail_asset_styles'][0] => 'assets/css/srwf-gravity-flow-entry-detail.css',
    $GLOBALS['gpp_entry_detail_asset_scripts'][0] => 'assets/js/srwf-gravity-flow-entry-detail.js',
);

foreach ( $contracts as $asset => $path ) {
    $hash = hash_file( 'sha256', $plugin_root . '/' . $path );
    gpp_assert_true( is_string( $hash ) && '' !== $hash, 'Entry Detail shipped asset hash must be readable.' );
    gpp_assert_same( substr( $hash, 0, 16 ), $asset['version'], 'Entry Detail cache key must derive from exact shipped bytes.' );
    gpp_assert_true( '1.0.0' !== $asset['version'], 'Entry Detail cache key must not remain fixed at the historical version.' );
}

$asset_version = $adapter->getMethod( 'assetVersion' );
$asset_version->setAccessible( true );
$temp = tempnam( sys_get_temp_dir(), 'gpp-entry-detail-asset-' );
gpp_assert_true( false !== $temp, 'Temporary asset required.' );
file_put_contents( $temp, 'old-bytes' );
$first = $asset_version->invoke( null, $temp );
file_put_contents( $temp, 'new-bytes' );
$second = $asset_version->invoke( null, $temp );
@unlink( $temp );

gpp_assert_true( is_string( $first ) && '' !== $first, 'Readable Entry Detail asset requires a content cache key.' );
gpp_assert_true( is_string( $second ) && '' !== $second, 'Changed Entry Detail asset requires a content cache key.' );
gpp_assert_true( $first !== $second, 'Changing Entry Detail bytes must change the cache key.' );

echo "ENTRY_DETAIL_ASSET_VERSIONING_PASS\n";
