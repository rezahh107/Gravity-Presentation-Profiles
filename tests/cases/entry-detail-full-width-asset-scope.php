<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailFullWidthPresentationAdapter;

$GLOBALS['gpp_full_width_is_admin'] = false;

function sanitize_key( $value ) {
    return strtolower( preg_replace( '/[^a-z0-9_\-]/', '', (string) $value ) );
}
function wp_unslash( $value ) { return $value; }
function absint( $value ) { return abs( (int) $value ); }
function is_admin() { return (bool) $GLOBALS['gpp_full_width_is_admin']; }

Autoloader::register();

$reflection = new ReflectionClass( EntryDetailFullWidthPresentationAdapter::class );
$method = $reflection->getMethod( 'isEntryDetailRequest' );
$method->setAccessible( true );

$_GET = array();
gpp_assert_same( false, $method->invoke( null ), 'Full Width assets must not load without an Entry Detail request.' );

$_GET = array( 'view' => 'entry', 'lid' => '11' );
gpp_assert_same( true, $method->invoke( null ), 'Frontend Entry Detail view/lid must be admitted.' );

$_GET = array( 'view' => 'entry', 'lid' => '0' );
gpp_assert_same( false, $method->invoke( null ), 'Entry Detail requires one concrete entry ID.' );

$GLOBALS['gpp_full_width_is_admin'] = true;
$_GET = array( 'page' => 'gravityflow-inbox', 'view' => 'entry', 'lid' => '11' );
gpp_assert_same( true, $method->invoke( null ), 'Native Gravity Flow admin Entry Detail must be admitted.' );

$_GET = array( 'page' => 'gf_settings', 'view' => 'entry', 'lid' => '11' );
gpp_assert_same( false, $method->invoke( null ), 'Full Width asset delivery must not leak to unrelated admin pages.' );

$_GET = array( 'page' => 'gravityflow-inbox', 'view' => 'inbox', 'lid' => '11' );
gpp_assert_same( false, $method->invoke( null ), 'Full Width asset delivery must not leak to native Inbox list view.' );

echo "ENTRY_DETAIL_FULL_WIDTH_ASSET_SCOPE_PASS\n";
