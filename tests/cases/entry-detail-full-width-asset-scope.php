<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailRequestReachability;

$GLOBALS['gpp_full_width_is_admin'] = false;
$GLOBALS['gpp_full_width_is_singular'] = true;
$GLOBALS['gpp_full_width_queried_object'] = (object) array( 'post_content' => '<p>Unrelated page.</p>' );

function sanitize_key( $value ) {
    return strtolower( preg_replace( '/[^a-z0-9_\-]/', '', (string) $value ) );
}
function wp_unslash( $value ) { return $value; }
function absint( $value ) { return abs( (int) $value ); }
function is_admin() { return (bool) $GLOBALS['gpp_full_width_is_admin']; }
function is_singular() { return (bool) $GLOBALS['gpp_full_width_is_singular']; }
function get_queried_object() { return $GLOBALS['gpp_full_width_queried_object']; }
function has_block( $name, $content ) { return false !== strpos( (string) $content, 'wp:' . $name ); }

if ( ! class_exists( 'WP_Block_Type_Registry' ) ) {
    final class WP_Block_Type_Registry {
        public static function get_instance() { return new self(); }
        public function is_registered( $name ) {
            return in_array( $name, array( 'gravityflow/inbox', 'gravityflow/status' ), true );
        }
    }
}

Autoloader::register();

$_GET = array();
gpp_assert_same( false, EntryDetailRequestReachability::isReachable(), 'Entry Detail assets must not load without Entry Detail query state.' );

$_GET = array( 'view' => 'entry', 'lid' => '11' );
gpp_assert_same( false, EntryDetailRequestReachability::isReachable(), 'Frontend query state alone must not establish Entry Detail reachability.' );

$GLOBALS['gpp_full_width_queried_object'] = (object) array( 'post_content' => '<!-- wp:gravityflow/inbox /-->' );
gpp_assert_same( true, EntryDetailRequestReachability::isReachable(), 'Registered frontend Inbox block must establish authentic Entry Detail reachability.' );

$GLOBALS['gpp_full_width_queried_object'] = (object) array( 'post_content' => '<!-- wp:gravityflow/status /-->' );
gpp_assert_same( true, EntryDetailRequestReachability::isReachable(), 'Registered frontend Status block must establish authentic Entry Detail reachability.' );

$_GET = array( 'view' => 'entry', 'lid' => '0' );
gpp_assert_same( false, EntryDetailRequestReachability::isReachable(), 'Entry Detail requires one positive entry ID.' );

$GLOBALS['gpp_full_width_is_admin'] = true;
$_GET = array( 'page' => 'gravityflow-inbox', 'view' => 'entry', 'lid' => '11' );
gpp_assert_same( true, EntryDetailRequestReachability::isReachable(), 'Native Gravity Flow admin Entry Detail must be reachable without a separate form ID.' );

$_GET = array( 'page' => 'gf_settings', 'view' => 'entry', 'lid' => '11' );
gpp_assert_same( false, EntryDetailRequestReachability::isReachable(), 'Entry Detail asset delivery must not leak to unrelated admin pages.' );

$_GET = array( 'page' => 'gravityflow-inbox', 'view' => 'inbox', 'lid' => '11' );
gpp_assert_same( false, EntryDetailRequestReachability::isReachable(), 'Entry Detail asset delivery must not leak to native Inbox list view.' );

$root = dirname( __DIR__, 2 );
$full_width = file_get_contents( $root . '/src/SRWF/GravityFlow/EntryDetailFullWidthPresentationAdapter.php' );
$timeline = file_get_contents( $root . '/src/SRWF/GravityFlow/EntryDetailTimelineSemanticPresentation.php' );
foreach ( array( $full_width, $timeline ) as $source ) {
    gpp_assert_true( false !== strpos( $source, 'EntryDetailRequestReachability::isReachable()' ), 'Full Width Entry Detail presentation must consume the shared qualified reachability predicate.' );
    gpp_assert_true( false === strpos( $source, 'private static function isEntryDetailRequest()' ), 'Full Width Entry Detail presentation must not keep a divergent request definition.' );
}

echo "ENTRY_DETAIL_FULL_WIDTH_ASSET_SCOPE_PASS\n";
