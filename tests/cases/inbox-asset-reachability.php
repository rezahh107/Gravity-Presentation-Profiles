<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;

if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
    define( 'GPP_PLUGIN_FILE', realpath( __DIR__ . '/../../gravity-presentation-profiles.php' ) );
}

$GLOBALS['gpp_actions'] = array();
$GLOBALS['gpp_filters'] = array();
$GLOBALS['gpp_enqueued_styles'] = array();
$GLOBALS['gpp_is_admin'] = false;

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_actions'][] = array( $hook, $callback, $priority, $accepted_args );
}

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_filters'][] = array( $hook, $callback, $priority, $accepted_args );
}

function is_admin() {
    return (bool) $GLOBALS['gpp_is_admin'];
}

function wp_enqueue_style( $handle, $src = '', $dependencies = array(), $version = false, $media = 'all' ) {
    $GLOBALS['gpp_enqueued_styles'][] = array(
        'handle' => $handle,
        'src' => $src,
        'dependencies' => $dependencies,
        'version' => $version,
        'media' => $media,
    );
}

function wp_style_is( $handle, $status = 'enqueued' ) {
    unset( $handle, $status );
    return false;
}

function plugins_url( $path, $plugin_file ) {
    unset( $plugin_file );
    return 'https://example.invalid/wp-content/plugins/gravity-presentation-profiles/' . ltrim( (string) $path, '/' );
}

function wp_unslash( $value ) {
    return $value;
}

function sanitize_key( $key ) {
    return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
}

function __( $text, $domain = null ) {
    unset( $domain );
    return $text;
}

function esc_html__( $text, $domain = null ) {
    unset( $domain );
    return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
}

Autoloader::register();

$adapter = new ReflectionClass( InboxPresentationAdapter::class );
$model_loaded = $adapter->getProperty( 'model_loaded' );
$model_loaded->setAccessible( true );
$model = $adapter->getProperty( 'model' );
$model->setAccessible( true );
$surface_reached = $adapter->getProperty( 'surface_reached' );
$surface_reached->setAccessible( true );

$set_active_profile = static function ( $active ) use ( $model_loaded, $model ) {
    $model_loaded->setValue( null, true );
    $model->setValue( null, $active ? new stdClass() : null );
};
$reset_reachability = static function () use ( $surface_reached ) {
    $surface_reached->setValue( null, false );
    $GLOBALS['gpp_enqueued_styles'] = array();
};
$style_handles = static function () {
    return array_map(
        static function ( $style ) {
            return $style['handle'];
        },
        $GLOBALS['gpp_enqueued_styles']
    );
};
$assert_inbox_styles = static function ( $message ) use ( $style_handles ) {
    gpp_assert_same(
        array( InboxPresentationAdapter::STYLE_HANDLE, InboxPresentationAdapter::NATIVE_STYLE_HANDLE ),
        $style_handles(),
        $message
    );
};

InboxPresentationAdapter::register();
gpp_assert_same( 1, count( $GLOBALS['gpp_actions'] ), 'Inbox presentation should register only one early admin enqueue hook.' );
gpp_assert_same( 'admin_enqueue_scripts', $GLOBALS['gpp_actions'][0][0], 'Inbox presentation admin delivery must stay on the admin asset lifecycle.' );
gpp_assert_same( array( InboxPresentationAdapter::class, 'enqueueAdminStyles' ), $GLOBALS['gpp_actions'][0][1], 'Admin enqueue must pass through the surface-qualified adapter method.' );
gpp_assert_same( 4, count( $GLOBALS['gpp_filters'] ), 'Inbox presentation should register the two native data seams plus shortcode and block render seams.' );
gpp_assert_same( 'gravityflow_columns_inbox_table', $GLOBALS['gpp_filters'][0][0], 'Native Inbox column seam changed unexpectedly.' );
gpp_assert_same( 'gravityflow_inbox_field_value', $GLOBALS['gpp_filters'][1][0], 'Native Inbox value seam changed unexpectedly.' );
gpp_assert_same( 'gravityflow_shortcode_inbox', $GLOBALS['gpp_filters'][2][0], 'Frontend shortcode reachability must remain tied to Gravity Flow Inbox rendering.' );
gpp_assert_same( 'render_block', $GLOBALS['gpp_filters'][3][0], 'Frontend block output must be checked only after native Inbox execution has been observed.' );
foreach ( $GLOBALS['gpp_actions'] as $action ) {
    gpp_assert_true( 'wp_enqueue_scripts' !== $action[0], 'Profile activation must not globally enqueue Inbox styles on frontend requests.' );
}

$set_active_profile( true );
$reset_reachability();
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'An active Inbox profile alone must not deliver Inbox styles.' );

$GLOBALS['gpp_is_admin'] = false;
$_GET = array();
InboxPresentationAdapter::enqueueAdminStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'An unrelated frontend request must not receive Inbox styles.' );

$lookalike = '<div class="gflow-inbox gflow-grid gflow-common"><div data-js="gflow-inbox"></div></div>';
$returned = InboxPresentationAdapter::filterFrontendBlock( $lookalike, array( 'blockName' => 'example/lookalike' ) );
gpp_assert_same( $lookalike, $returned, 'Block qualification must never alter host output.' );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Lookalike Inbox markup must not independently qualify style delivery.' );

$reset_reachability();
InboxPresentationAdapter::filterColumns( array( 'id' => 'Entry ID' ), array() );
InboxPresentationAdapter::filterFrontendBlock( $lookalike, array() );
$assert_inbox_styles( 'A block request that crossed the exact native Inbox table seam and rendered native Inbox markers must receive both styles.' );

$reset_reachability();
$native_shortcode = '<div class="gravityflow_wrap"><div class="gflow-inbox gflow-grid gflow-common"><div data-js="gflow-inbox"></div></div></div>';
$wrapped = InboxPresentationAdapter::filterShortcodeInbox( $native_shortcode, array(), '' );
$assert_inbox_styles( 'The authentic Gravity Flow Inbox shortcode render seam must receive both styles.' );
gpp_assert_true( false !== strpos( $wrapped, 'data-gpp-inbox-surface="gravity_flow.inbox"' ), 'Authentic active shortcode Inbox must retain the admitted GPP surface composition.' );

$reset_reachability();
$GLOBALS['gpp_is_admin'] = true;
$_GET = array( 'page' => 'gravityflow-inbox' );
InboxPresentationAdapter::enqueueAdminStyles();
$assert_inbox_styles( 'The exact native admin Inbox list request must receive both styles.' );

$reset_reachability();
$_GET = array( 'page' => 'gravityflow-inbox', 'view' => 'entry', 'lid' => '42' );
InboxPresentationAdapter::enqueueAdminStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Gravity Flow Entry Detail must not receive Inbox presentation styles.' );

$reset_reachability();
$_GET = array( 'page' => 'gf_settings' );
InboxPresentationAdapter::enqueueAdminStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Unrelated wp-admin requests must not receive Inbox presentation styles.' );

$reset_reachability();
$_GET = array( 'action' => 'gravityflow_print_entries', 'lid' => '42', 'gpp_presentation' => 'dossier' );
$_REQUEST = array( 'action' => 'gravityflow_print_entries' );
InboxPresentationAdapter::enqueueAdminStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Gravity Flow Print requests must not receive Inbox presentation styles.' );

$set_active_profile( false );
$reset_reachability();
$_GET = array( 'page' => 'gravityflow-inbox' );
InboxPresentationAdapter::enqueueAdminStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Authentic admin Inbox must remain native when the Inbox profile is inactive.' );

$reset_reachability();
$native_inactive = InboxPresentationAdapter::filterShortcodeInbox( $native_shortcode, array(), '' );
gpp_assert_same( $native_shortcode, $native_inactive, 'Inactive frontend Inbox must remain native and unwrapped.' );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Inactive frontend Inbox must not receive GPP Inbox styles.' );

$reset_reachability();
InboxPresentationAdapter::filterColumns( array( 'id' => 'Entry ID' ), array() );
InboxPresentationAdapter::filterFrontendBlock( $lookalike, array() );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Inactive authentic block path must not receive GPP Inbox styles.' );

echo "INBOX_ASSET_REACHABILITY_PASS\n";
