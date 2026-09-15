<?php

require_once dirname( __DIR__ ) . '/helpers.php';

define( 'GPP_PLUGIN_FILE', dirname( __DIR__, 2 ) . '/gravity-presentation-profiles.php' );

$GLOBALS['gpp_actions'] = array();
$GLOBALS['gpp_enqueued_scripts'] = array();
$GLOBALS['gpp_is_admin'] = true;

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_actions'][] = array( $hook, $callback, $priority, $accepted_args );
}

function is_admin() {
    return (bool) $GLOBALS['gpp_is_admin'];
}

function wp_enqueue_script() {
    $GLOBALS['gpp_enqueued_scripts'][] = func_get_args();
}

function plugins_url( $path, $plugin_file ) {
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
gpp_assert_same( 1, count( $GLOBALS['gpp_actions'] ), 'Manual Inbox refresh should register one admin enqueue hook.' );
gpp_assert_same( 'admin_enqueue_scripts', $GLOBALS['gpp_actions'][0][0], 'Manual Inbox refresh must stay on the admin asset lifecycle.' );
gpp_assert_same( 20, $GLOBALS['gpp_actions'][0][2], 'Manual Inbox refresh enqueue priority changed unexpectedly.' );

$_GET = array( 'page' => 'gravityflow-inbox' );
InboxManualRefreshControl::enqueue();
gpp_assert_same( 1, count( $GLOBALS['gpp_enqueued_scripts'] ), 'Native Inbox list request should enqueue the manual refresh script.' );
$enqueue = $GLOBALS['gpp_enqueued_scripts'][0];
gpp_assert_same( InboxManualRefreshControl::SCRIPT_HANDLE, $enqueue[0], 'Manual refresh script handle mismatch.' );
gpp_assert_true( false !== strpos( $enqueue[1], 'assets/js/gravity-flow-inbox-manual-refresh.js' ), 'Manual refresh script source mismatch.' );
gpp_assert_same( array(), $enqueue[2], 'Manual refresh script must not add a runtime dependency.' );
gpp_assert_same( true, $enqueue[4], 'Manual refresh script should load in the footer.' );

$GLOBALS['gpp_enqueued_scripts'] = array();
$_GET = array( 'page' => 'gravityflow-inbox', 'view' => 'entry' );
InboxManualRefreshControl::enqueue();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_scripts'], 'Entry Detail must not receive the Inbox manual refresh control asset.' );

$_GET = array( 'page' => 'gf_settings' );
InboxManualRefreshControl::enqueue();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_scripts'], 'Unrelated admin pages must not receive the Inbox manual refresh control asset.' );

$GLOBALS['gpp_is_admin'] = false;
$_GET = array( 'page' => 'gravityflow-inbox' );
InboxManualRefreshControl::enqueue();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_scripts'], 'Frontend requests must not receive the admin Inbox manual refresh control asset.' );

$script = file_get_contents( dirname( __DIR__, 2 ) . '/assets/js/gravity-flow-inbox-manual-refresh.js' );
gpp_assert_true( false !== strpos( $script, 'به‌روزرسانی کارهای من' ), 'Owner-locked Persian manual refresh label is missing.' );
gpp_assert_true( false !== strpos( $script, 'window.location.reload()' ), 'Manual refresh must use a normal browser document reload.' );
gpp_assert_true( false !== strpos( $script, '.gflow-inbox.gflow-grid.gflow-common' ), 'Manual refresh must bind only to the evidenced native Inbox outer surface.' );
gpp_assert_true( false !== strpos( $script, "document.createElement( 'button' )" ), 'Manual refresh must expose native button keyboard semantics.' );

foreach ( array( 'fetch(', 'XMLHttpRequest', '/inbox/changes', 'admin-ajax.php', 'wp-json', 'applyTransaction', 'setQuickFilter', 'gravityflow_inbox' ) as $forbidden ) {
    gpp_assert_true( false === strpos( $script, $forbidden ), 'Manual refresh script must not contain custom/private refresh behavior: ' . $forbidden );
}

echo "INBOX_MANUAL_REFRESH_TESTS_PASS\n";
