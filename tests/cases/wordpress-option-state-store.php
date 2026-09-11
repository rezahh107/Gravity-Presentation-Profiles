<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

Autoloader::register();

$GLOBALS['gpp_test_options'] = array();
$GLOBALS['gpp_update_calls'] = array();

function get_option( $name, $default = false ) {
    return array_key_exists( $name, $GLOBALS['gpp_test_options'] ) ? $GLOBALS['gpp_test_options'][ $name ] : $default;
}

function update_option( $name, $value, $autoload = null ) {
    $GLOBALS['gpp_update_calls'][] = array( $name, $value, $autoload );
    $GLOBALS['gpp_test_options'][ $name ] = $value;
    return true;
}

final class GppLockWpdbStub {
    public $prefix = 'wp_7_';
    public $blogid = 7;
    public $last_error = '';
    public $database_name = 'gpp_test_db';
    public $acquire_result = '1';
    public $release_result = '1';
    public $prepared = array();
    public $queries = array();

    public function prepare( $query, ...$args ) {
        $this->prepared[] = array( $query, $args );
        if ( 1 !== count( $args ) ) {
            return null;
        }
        return str_replace( '%s', "'" . $args[0] . "'", $query );
    }

    public function get_var( $query ) {
        $this->queries[] = $query;
        if ( 'SELECT DATABASE()' === $query ) {
            return $this->database_name;
        }
        if ( false !== strpos( $query, 'GET_LOCK(' ) ) {
            return $this->acquire_result;
        }
        if ( false !== strpos( $query, 'RELEASE_LOCK(' ) ) {
            return $this->release_result;
        }
        return null;
    }
}

function gpp_lock_reset() {
    $GLOBALS['gpp_test_options'] = array();
    $GLOBALS['gpp_update_calls'] = array();
    $GLOBALS['wpdb'] = new GppLockWpdbStub();
}

function gpp_lock_prepared_name( $wpdb, $function ) {
    foreach ( $wpdb->prepared as $prepared ) {
        if ( false !== strpos( $prepared[0], $function ) ) {
            return $prepared[1][0];
        }
    }
    return null;
}

// T-LOCK-01: successful non-blocking advisory acquisition commits exactly once and releases.
gpp_lock_reset();
$store = new WordPressOptionStateStore( 'gpp_visual_package_lifecycle_v1' );
$next  = array( 'revision' => 1, 'installed' => array() );
gpp_assert_true( $store->commit( 0, $next ), 'T-LOCK-01 commit must succeed.' );
gpp_assert_same( $next, get_option( 'gpp_visual_package_lifecycle_v1', null ), 'T-LOCK-01 state must advance exactly once.' );
gpp_assert_same( 1, count( $GLOBALS['gpp_update_calls'] ), 'T-LOCK-01 update_option must run exactly once.' );
$visual_lock = gpp_lock_prepared_name( $GLOBALS['wpdb'], 'GET_LOCK' );
gpp_assert_true( is_string( $visual_lock ) && strlen( $visual_lock ) <= 64, 'T-LOCK-01 lock name must be deterministic and within database limits.' );
gpp_assert_same( $visual_lock, gpp_lock_prepared_name( $GLOBALS['wpdb'], 'RELEASE_LOCK' ), 'T-LOCK-01 release must target the acquired lock.' );
gpp_assert_true( false === array_key_exists( 'gpp_visual_package_lifecycle_v1_lock', $GLOBALS['gpp_test_options'] ), 'T-LOCK-01 no persistent lock option may be created.' );

// The same store identity is stable; the binding store has a distinct lock name.
gpp_lock_reset();
$store = new WordPressOptionStateStore( 'gpp_visual_package_lifecycle_v1' );
gpp_assert_true( $store->commit( 0, array( 'revision' => 1 ) ), 'Stable-name visual commit must succeed.' );
$visual_lock_again = gpp_lock_prepared_name( $GLOBALS['wpdb'], 'GET_LOCK' );
gpp_assert_same( $visual_lock, $visual_lock_again, 'Advisory lock name must be stable for the same database/site/store identity.' );
gpp_lock_reset();
$store = new WordPressOptionStateStore( 'gpp_binding_set_lifecycle_v1' );
gpp_assert_true( $store->commit( 0, array( 'revision' => 1 ) ), 'Distinct-name binding commit must succeed.' );
$binding_lock = gpp_lock_prepared_name( $GLOBALS['wpdb'], 'GET_LOCK' );
gpp_assert_true( $binding_lock !== $visual_lock, 'Visual and binding lifecycle stores must use distinct advisory locks.' );

// T-LOCK-02: contention cannot steal the lock or mutate state.
gpp_lock_reset();
$GLOBALS['gpp_test_options']['gpp_visual_package_lifecycle_v1'] = array( 'revision' => 4, 'sentinel' => 'before' );
$GLOBALS['wpdb']->acquire_result = '0';
$before = $GLOBALS['gpp_test_options']['gpp_visual_package_lifecycle_v1'];
$store = new WordPressOptionStateStore( 'gpp_visual_package_lifecycle_v1' );
gpp_assert_same( false, $store->commit( 4, array( 'revision' => 5 ) ), 'T-LOCK-02 busy acquisition must fail.' );
gpp_assert_same( $before, $GLOBALS['gpp_test_options']['gpp_visual_package_lifecycle_v1'], 'T-LOCK-02 state must remain unchanged.' );
gpp_assert_same( 0, count( $GLOBALS['gpp_update_calls'] ), 'T-LOCK-02 update_option must not run.' );
gpp_assert_true( 0 === count( array_filter( $GLOBALS['wpdb']->queries, static function ( $query ) { return false !== strpos( $query, 'RELEASE_LOCK(' ); } ) ), 'T-LOCK-02 unacquired lock must not be released.' );

// T-LOCK-03: NULL/error acquisition is indeterminate and fails closed.
gpp_lock_reset();
$GLOBALS['gpp_test_options']['gpp_visual_package_lifecycle_v1'] = array( 'revision' => 2, 'sentinel' => 'before' );
$GLOBALS['wpdb']->acquire_result = null;
$GLOBALS['wpdb']->last_error = 'simulated advisory lock error';
$before = $GLOBALS['gpp_test_options']['gpp_visual_package_lifecycle_v1'];
$store = new WordPressOptionStateStore( 'gpp_visual_package_lifecycle_v1' );
gpp_assert_same( false, $store->commit( 2, array( 'revision' => 3 ) ), 'T-LOCK-03 indeterminate acquisition must fail.' );
gpp_assert_same( $before, $GLOBALS['gpp_test_options']['gpp_visual_package_lifecycle_v1'], 'T-LOCK-03 state must remain unchanged.' );
gpp_assert_same( 0, count( $GLOBALS['gpp_update_calls'] ), 'T-LOCK-03 update_option must not run.' );

// T-LOCK-04: revision mismatch preserves state and still releases the acquired lock.
gpp_lock_reset();
$GLOBALS['gpp_test_options']['gpp_visual_package_lifecycle_v1'] = array( 'revision' => 9, 'sentinel' => 'before' );
$before = $GLOBALS['gpp_test_options']['gpp_visual_package_lifecycle_v1'];
$store = new WordPressOptionStateStore( 'gpp_visual_package_lifecycle_v1' );
gpp_assert_same( false, $store->commit( 8, array( 'revision' => 10 ) ), 'T-LOCK-04 revision mismatch must fail.' );
gpp_assert_same( $before, $GLOBALS['gpp_test_options']['gpp_visual_package_lifecycle_v1'], 'T-LOCK-04 state must remain unchanged.' );
gpp_assert_same( 0, count( $GLOBALS['gpp_update_calls'] ), 'T-LOCK-04 update_option must not run.' );
gpp_assert_true( null !== gpp_lock_prepared_name( $GLOBALS['wpdb'], 'RELEASE_LOCK' ), 'T-LOCK-04 acquired lock must be released.' );

echo "GPP_WORDPRESS_OPTION_STATE_STORE_LOCK_PASS\n";
