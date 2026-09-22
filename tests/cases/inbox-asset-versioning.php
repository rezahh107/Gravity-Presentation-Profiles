<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;

if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
    define( 'GPP_PLUGIN_FILE', realpath( __DIR__ . '/../../gravity-presentation-profiles.php' ) );
}

$GLOBALS['gpp_inbox_asset_styles'] = array();
$GLOBALS['gpp_inbox_asset_wp_theme_registered'] = false;
$GLOBALS['gpp_inbox_asset_global_styles_enqueued'] = true;
$GLOBALS['gpp_is_admin'] = true;

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    unset( $hook, $callback, $priority, $accepted_args );
}

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    unset( $hook, $callback, $priority, $accepted_args );
}

function is_admin() {
    return (bool) $GLOBALS['gpp_is_admin'];
}

function wp_unslash( $value ) {
    return $value;
}

function sanitize_key( $key ) {
    return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
}

function plugins_url( $path, $plugin_file ) {
    unset( $plugin_file );
    return 'https://example.invalid/wp-content/plugins/gravity-presentation-profiles/' . ltrim( $path, '/' );
}

function wp_style_is( $handle, $status = 'enqueued' ) {
    if ( 'global-styles' === $handle && 'enqueued' === $status ) {
        return (bool) $GLOBALS['gpp_inbox_asset_global_styles_enqueued'];
    }
    if ( 'wp-theme' === $handle && 'registered' === $status ) {
        return (bool) $GLOBALS['gpp_inbox_asset_wp_theme_registered'];
    }
    return false;
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

$_GET = array( 'page' => 'gravityflow-inbox' );
InboxPresentationAdapter::enqueueStyles();

gpp_assert_same( 2, count( $GLOBALS['gpp_inbox_asset_styles'] ), 'Inbox styles should enqueue as one presentation/native pair.' );
$presentation = $GLOBALS['gpp_inbox_asset_styles'][0];
$native = $GLOBALS['gpp_inbox_asset_styles'][1];

gpp_assert_same( InboxPresentationAdapter::STYLE_HANDLE, $presentation['handle'], 'Presentation stylesheet handle changed.' );
gpp_assert_same( array( 'global-styles' ), $presentation['dependencies'], 'Active WordPress global styles must precede the host-owned Inbox presentation cascade.' );
gpp_assert_same( InboxPresentationAdapter::NATIVE_STYLE_HANDLE, $native['handle'], 'Native projection stylesheet handle changed.' );
gpp_assert_same( array( InboxPresentationAdapter::STYLE_HANDLE ), $native['dependencies'], 'Native projection stylesheet must stay ordered after the presentation stylesheet.' );
gpp_assert_true( is_string( $presentation['version'] ) && 16 === strlen( $presentation['version'] ), 'Presentation stylesheet requires deterministic content-derived version identity.' );
gpp_assert_true( is_string( $native['version'] ) && 16 === strlen( $native['version'] ), 'Native projection stylesheet requires deterministic content-derived version identity.' );
gpp_assert_same( substr( hash_file( 'sha256', dirname( GPP_PLUGIN_FILE ) . '/assets/css/srwf-gravity-flow-inbox.css' ), 0, 16 ), $presentation['version'], 'Presentation stylesheet version must bind to exact bytes.' );
gpp_assert_same( substr( hash_file( 'sha256', dirname( GPP_PLUGIN_FILE ) . '/assets/css/srwf-gravity-flow-inbox-native.css' ), 0, 16 ), $native['version'], 'Native projection stylesheet version must bind to exact bytes.' );

$GLOBALS['gpp_inbox_asset_styles'] = array();
$GLOBALS['gpp_inbox_asset_wp_theme_registered'] = true;
InboxPresentationAdapter::resetRuntimeCache();
$model_loaded->setValue( null, true );
$model->setValue( null, new stdClass() );
$_GET = array( 'page' => 'gravityflow-inbox' );
InboxPresentationAdapter::enqueueStyles();

gpp_assert_same( 3, count( $GLOBALS['gpp_inbox_asset_styles'] ), 'Registered wp-theme dependency should be enqueued with the Inbox style pair.' );
gpp_assert_same( 'wp-theme', $GLOBALS['gpp_inbox_asset_styles'][0]['handle'], 'wp-theme must be enqueued when the host registers it.' );
gpp_assert_same( array( 'global-styles', 'wp-theme' ), $GLOBALS['gpp_inbox_asset_styles'][1]['dependencies'], 'Presentation stylesheet must preserve both active host dependencies in deterministic order.' );
gpp_assert_same( array( InboxPresentationAdapter::STYLE_HANDLE ), $GLOBALS['gpp_inbox_asset_styles'][2]['dependencies'], 'Native projection stylesheet dependency ordering changed when wp-theme is available.' );

echo "INBOX_ASSET_VERSIONING_PASS\n";
