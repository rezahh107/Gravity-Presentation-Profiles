<?php

require_once dirname( __DIR__ ) . '/helpers.php';

define( 'GPP_PLUGIN_FILE', dirname( __DIR__, 2 ) . '/gravity-presentation-profiles.php' );

$GLOBALS['gpp_actions'] = array();
$GLOBALS['gpp_filters'] = array();
$GLOBALS['gpp_enqueued_scripts'] = array();
$GLOBALS['gpp_is_admin'] = true;

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_actions'][] = array( $hook, $callback, $priority, $accepted_args );
}

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_filters'][] = array( $hook, $callback, $priority, $accepted_args );
}

function is_admin() {
    return (bool) $GLOBALS['gpp_is_admin'];
}

function wp_enqueue_script() {
    $GLOBALS['gpp_enqueued_scripts'][] = func_get_args();
}

function plugins_url( $path, $plugin_file ) {
    unset( $plugin_file );
    return 'https://example.invalid/wp-content/plugins/gravity-presentation-profiles/' . ltrim( $path, '/' );
}

function wp_unslash( $value ) {
    return $value;
}

function sanitize_key( $key ) {
    return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
}

require_once dirname( __DIR__, 2 ) . '/src/SRWF/GravityFlow/InboxManualRefreshControl.php';

use GravityPresentationProfiles\SRWF\GravityFlow\InboxManualRefreshControl;

InboxManualRefreshControl::register();
gpp_assert_same( 1, count( $GLOBALS['gpp_actions'] ), 'Manual Inbox refresh should register one exact admin enqueue hook.' );
gpp_assert_same( 'admin_enqueue_scripts', $GLOBALS['gpp_actions'][0][0], 'Admin Inbox refresh must stay on the admin asset lifecycle.' );
gpp_assert_same( 2, count( $GLOBALS['gpp_filters'] ), 'Frontend refresh reachability must use native Inbox render seams only.' );
gpp_assert_same( 'gravityflow_shortcode_inbox', $GLOBALS['gpp_filters'][0][0], 'Shortcode reachability must be tied to Gravity Flow Inbox rendering.' );
gpp_assert_same( 'render_block', $GLOBALS['gpp_filters'][1][0], 'Block reachability must use WordPress block rendering.' );

$_GET = array( 'page' => 'gravityflow-inbox' );
InboxManualRefreshControl::enqueueAdmin();
gpp_assert_same( 1, count( $GLOBALS['gpp_enqueued_scripts'] ), 'Native admin Inbox list request should enqueue the manual refresh script.' );
$enqueue = $GLOBALS['gpp_enqueued_scripts'][0];
gpp_assert_same( InboxManualRefreshControl::SCRIPT_HANDLE, $enqueue[0], 'Manual refresh script handle mismatch.' );
gpp_assert_true( false !== strpos( $enqueue[1], 'assets/js/gravity-flow-inbox-manual-refresh.js' ), 'Manual refresh script source mismatch.' );
gpp_assert_same( array(), $enqueue[2], 'Manual refresh script must not add a runtime dependency.' );
gpp_assert_same( '2.0.0', $enqueue[3], 'Native-first manual refresh asset version mismatch.' );
gpp_assert_same( true, $enqueue[4], 'Manual refresh script should load in the footer.' );

$GLOBALS['gpp_enqueued_scripts'] = array();
$_GET = array( 'page' => 'gravityflow-inbox', 'view' => 'entry' );
InboxManualRefreshControl::enqueueAdmin();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_scripts'], 'Entry Detail must not receive the Inbox manual refresh asset.' );

$GLOBALS['gpp_is_admin'] = false;
$_GET = array();
$native = '<div class="gflow-inbox gflow-grid gflow-common" data-js="gflow-inbox"></div>';
$returned = InboxManualRefreshControl::filterFrontendInbox( $native, array( 'page' => 'inbox' ), '' );
gpp_assert_same( $native, $returned, 'Frontend reachability must not alter Gravity Flow Inbox HTML.' );
gpp_assert_same( 1, count( $GLOBALS['gpp_enqueued_scripts'] ), 'Authentic Gravity Flow Inbox output should enqueue the utility.' );

$GLOBALS['gpp_enqueued_scripts'] = array();
$lookalike = '<div class="gflow-inbox">not authentic</div>';
InboxManualRefreshControl::filterFrontendInbox( $lookalike, array( 'page' => 'inbox' ), '' );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_scripts'], 'Shortcode hook alone must not admit a utility before authentic native output exists.' );

$GLOBALS['gpp_enqueued_scripts'] = array();
InboxManualRefreshControl::filterFrontendBlock( $native, array( 'blockName' => 'core/html' ) );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_scripts'], 'Native-looking markup in a non-Inbox block must not enqueue the utility.' );
InboxManualRefreshControl::filterFrontendBlock( $native, array( 'blockName' => InboxManualRefreshControl::NATIVE_BLOCK ) );
gpp_assert_same( 1, count( $GLOBALS['gpp_enqueued_scripts'] ), 'Exact native Inbox block plus authentic output should enqueue the utility.' );

$script = file_get_contents( dirname( __DIR__, 2 ) . '/assets/js/gravity-flow-inbox-manual-refresh.js' );
gpp_assert_true( false !== strpos( $script, 'به‌روزرسانی کارهای من' ), 'Owner-locked Persian manual refresh label is missing.' );
gpp_assert_true( false !== strpos( $script, 'window.location.reload()' ), 'Manual refresh must use the current document reload lifecycle.' );
gpp_assert_true( false !== strpos( $script, '.gflow-inbox.gflow-grid.gflow-common' ), 'Manual refresh must admit only the native Inbox outer surface.' );
gpp_assert_true( false !== strpos( $script, 'document.querySelector( controlSelector )' ), 'Repeated execution must preserve one utility identity.' );
gpp_assert_true( false !== strpos( $script, 'inbox.parentNode.insertBefore' ), 'Utility must stay outside the host-replaced Inbox subtree.' );
gpp_assert_true( false !== strpos( $script, "button.setAttribute( 'aria-busy', 'true' )" ), 'Busy state must be explicit before reload.' );
gpp_assert_true( false !== strpos( $script, "window.addEventListener( 'pageshow'" ), 'bfcache pageshow must recover the utility state.' );
gpp_assert_true( false === strpos( $script, 'MutationObserver' ), 'Native-first utility must not own a persistent DOM reconciliation lifecycle.' );

$css = file_get_contents( dirname( __DIR__, 2 ) . '/assets/css/srwf-gravity-flow-inbox.css' );
gpp_assert_true( false !== strpos( $css, '.gpp-inbox-manual-refresh__button::before' ), 'Manual refresh must expose its decorative Refresh icon through scoped CSS only.' );
gpp_assert_true( false !== strpos( $css, 'mask-image: url("data:image/svg+xml' ), 'Manual refresh Refresh icon must remain dependency-free CSS presentation.' );
gpp_assert_true( false !== strpos( $css, 'background-color: currentColor' ), 'Manual refresh icon must inherit the semantic utility text color.' );
foreach ( array( '#1d4ed8', '#1e40af', '#f8fafe', '#c9d6f0', '#9bb4e7', '#93c5fd' ) as $semantic_color ) {
    gpp_assert_true( false !== strpos( $css, $semantic_color ), 'Manual refresh semantic utility color is missing: ' . $semantic_color );
}
gpp_assert_true( false !== strpos( $css, 'min-block-size: 44px' ), 'Manual refresh must preserve the minimum touch target block size.' );
gpp_assert_true( false !== strpos( $css, '.gpp-inbox-manual-refresh > .gpp-inbox-manual-refresh__button:focus-visible' ), 'Manual refresh must retain an explicit scoped focus-visible treatment.' );
gpp_assert_true( false !== strpos( $css, '.gpp-inbox-manual-refresh > .gpp-inbox-manual-refresh__button[aria-busy="true"]' ), 'Manual refresh must retain a distinct scoped busy presentation.' );

$admission = strpos( $script, 'var inbox = document.querySelector( surfaceSelector )' );
$creation = strpos( $script, "document.createElement( 'p' )" );
gpp_assert_true( false !== $admission && false !== $creation && $admission < $creation, 'Native Inbox admission must complete before any control DOM creation.' );

foreach ( array( 'fetch(', 'XMLHttpRequest', '/inbox/changes', 'admin-ajax.php', 'wp-json', 'applyTransaction', 'setQuickFilter', 'setInterval(', 'setTimeout(' ) as $forbidden ) {
    gpp_assert_true( false === strpos( $script, $forbidden ), 'Manual refresh must not create parallel Inbox behavior: ' . $forbidden );
}

echo "INBOX_MANUAL_REFRESH_TESTS_PASS\n";
