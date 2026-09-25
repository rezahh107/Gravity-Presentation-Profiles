<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxBlockCompositionBridge;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;

$GLOBALS['gpp_block_filters'] = array();
$GLOBALS['gpp_block_is_admin'] = false;
$GLOBALS['gpp_block_is_singular'] = true;
$GLOBALS['gpp_block_queried_object'] = (object) array( 'post_content' => '' );

class WP_Block_Type_Registry {
    private static $instance;

    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function is_registered( $name ) {
        return InboxPresentationAdapter::NATIVE_BLOCK === $name;
    }
}

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_block_filters'][] = array( $hook, $callback, $priority, $accepted_args );
}

function is_admin() {
    return (bool) $GLOBALS['gpp_block_is_admin'];
}

function is_singular() {
    return (bool) $GLOBALS['gpp_block_is_singular'];
}

function get_queried_object() {
    return $GLOBALS['gpp_block_queried_object'];
}

function has_block( $name, $content = null ) {
    return InboxPresentationAdapter::NATIVE_BLOCK === $name
        && is_string( $content )
        && false !== strpos( $content, '<!-- wp:gravityflow/inbox' );
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

$set_profile = static function ( $active ) use ( $model_loaded, $model, $surface_reached ) {
    $model_loaded->setValue( null, true );
    $model->setValue( null, $active ? new stdClass() : null );
    $surface_reached->setValue( null, false );
};

InboxBlockCompositionBridge::register();
gpp_assert_same( 1, count( $GLOBALS['gpp_block_filters'] ), 'Block composition bridge must register exactly one render_block filter.' );
gpp_assert_same( 'render_block', $GLOBALS['gpp_block_filters'][0][0], 'Block composition bridge must stay on WordPress render_block.' );
gpp_assert_same( array( InboxBlockCompositionBridge::class, 'filterFrontendBlock' ), $GLOBALS['gpp_block_filters'][0][1], 'Registered callback changed unexpectedly.' );
gpp_assert_same( 30, $GLOBALS['gpp_block_filters'][0][2], 'Block composition must run after the Inbox reachability hook.' );
gpp_assert_same( 2, $GLOBALS['gpp_block_filters'][0][3], 'Block composition needs both rendered content and block identity.' );

$native = '<div class="gflow-inbox gflow-grid gflow-common"><div data-js="gflow-inbox"></div></div>';
$block = array( 'blockName' => InboxPresentationAdapter::NATIVE_BLOCK );

$set_profile( true );
$GLOBALS['gpp_block_queried_object'] = (object) array( 'post_content' => '<!-- wp:gravityflow/inbox /-->' );
$composed = InboxBlockCompositionBridge::filterFrontendBlock( $native, $block );
gpp_assert_true( false !== strpos( $composed, 'class="gpp-inbox-surface gpp-inbox-surface--full-width"' ), 'Authentic page-level Inbox block must receive the admitted Full Width surface.' );
gpp_assert_same( 1, substr_count( $composed, 'data-gpp-inbox-surface="gravity_flow.inbox"' ), 'Authentic Inbox block must receive exactly one GPP Inbox surface.' );
gpp_assert_true( false !== strpos( $composed, 'id="gpp-inbox-title"' ), 'Authentic Inbox block must share the Owner-facing Inbox heading.' );
gpp_assert_true( false !== strpos( $composed, 'gpp-inbox-surface__helper' ), 'Authentic Inbox block must share the admitted Inbox helper copy.' );
gpp_assert_true( false !== strpos( $composed, $native ), 'Composition must preserve the exact native Gravity Flow Inbox markup inside the GPP host wrapper.' );

$recomposed = InboxBlockCompositionBridge::filterFrontendBlock( $composed, $block );
gpp_assert_same( 1, substr_count( $recomposed, 'data-gpp-inbox-surface="gravity_flow.inbox"' ), 'Repeated block filtering must not create nested GPP Inbox surfaces.' );

$GLOBALS['gpp_block_queried_object'] = (object) array( 'post_content' => '<p>Dynamic host render.</p>' );
gpp_assert_same( $native, InboxBlockCompositionBridge::filterFrontendBlock( $native, $block ), 'Dynamic Inbox block render outside current page content must preserve host output.' );

$GLOBALS['gpp_block_queried_object'] = (object) array( 'post_content' => '<!-- wp:gravityflow/inbox /-->' );
gpp_assert_same( $native, InboxBlockCompositionBridge::filterFrontendBlock( $native, array( 'blockName' => 'core/html' ) ), 'Unrelated blocks must remain untouched.' );

$set_profile( false );
gpp_assert_same( $native, InboxBlockCompositionBridge::filterFrontendBlock( $native, $block ), 'Inactive Inbox presentation must preserve the native authentic block output.' );

echo "INBOX_BLOCK_FULL_WIDTH_COMPOSITION_PASS\n";
