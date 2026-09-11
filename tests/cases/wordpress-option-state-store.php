<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

Autoloader::register();

$GLOBALS['gpp_test_options'] = array();
$GLOBALS['gpp_update_calls'] = array();
$GLOBALS['gpp_update_hook'] = null;
$GLOBALS['gpp_nested_commit_result'] = null;

function get_option( $name, $default = false ) {
    return array_key_exists( $name, $GLOBALS['gpp_test_options'] ) ? $GLOBALS['gpp_test_options'][ $name ] : $default;
}

function update_option( $name, $value, $autoload = null ) {
    $GLOBALS['gpp_update_calls'][] = array( $name, $value, $autoload );

    $hook = $GLOBALS['gpp_update_hook'];
    if ( is_callable( $hook ) ) {
        $GLOBALS['gpp_update_hook'] = null;
        $hook();
    }

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

        if ( false !== strpos( $query, 'IS_USED_LOCK(' ) || false !== strpos( $query, 'CONNECTION_ID(' ) ) {
            gpp_fail( 'Selected-method violation: ownership-probing SQL is forbidden.' );
        }

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
    $GLOBALS['gpp_update_hook'] = null;
    $GLOBALS['gpp_nested_commit_result'] = null;
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

function gpp_lock_prepared_names( $wpdb, $function ) {
    $names = array();
    foreach ( $wpdb->prepared as $prepared ) {
        if ( false !== strpos( $prepared[0], $function ) ) {
            $names[] = $prepared[1][0];
        }
    }
    return $names;
}

function gpp_lock_query_count( $wpdb, $needle ) {
    return count(
        array_filter(
            $wpdb->queries,
            static function ( $query ) use ( $needle ) {
                return false !== strpos( $query, $needle );
            }
        )
    );
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
gpp_assert_same( 0, gpp_lock_query_count( $GLOBALS['wpdb'], 'RELEASE_LOCK(' ), 'T-LOCK-02 unacquired lock must not be released.' );

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

// T-RG-01: same-store reentry through update_option fails before recursive GET_LOCK or state mutation.
gpp_lock_reset();
$outer_store = new WordPressOptionStateStore( 'gpp_visual_package_lifecycle_v1' );
$inner_store = new WordPressOptionStateStore( 'gpp_visual_package_lifecycle_v1' );
$outer_next  = array( 'revision' => 1, 'writer' => 'outer' );
$GLOBALS['gpp_update_hook'] = static function () use ( $inner_store ) {
    $GLOBALS['gpp_nested_commit_result'] = $inner_store->commit( 0, array( 'revision' => 1, 'writer' => 'nested' ) );
};
gpp_assert_true( $outer_store->commit( 0, $outer_next ), 'T-RG-01 outer commit must succeed.' );
gpp_assert_same( false, $GLOBALS['gpp_nested_commit_result'], 'T-RG-01 nested same-store commit must fail closed.' );
gpp_assert_same( 1, count( $GLOBALS['gpp_update_calls'] ), 'T-RG-01 lifecycle update_option must execute exactly once.' );
gpp_assert_same( 1, gpp_lock_query_count( $GLOBALS['wpdb'], 'GET_LOCK(' ), 'T-RG-01 nested same-store commit must not issue a second GET_LOCK.' );
gpp_assert_same( 1, gpp_lock_query_count( $GLOBALS['wpdb'], 'RELEASE_LOCK(' ), 'T-RG-01 outer advisory lock must release exactly once.' );
gpp_assert_same( $outer_next, get_option( 'gpp_visual_package_lifecycle_v1', null ), 'T-RG-01 outer next_state must remain authoritative.' );

// T-RG-02: sequential same-store commits remain valid after guard cleanup.
gpp_lock_reset();
$first_store  = new WordPressOptionStateStore( 'gpp_visual_package_lifecycle_v1' );
$second_store = new WordPressOptionStateStore( 'gpp_visual_package_lifecycle_v1' );
gpp_assert_true( $first_store->commit( 0, array( 'revision' => 1 ) ), 'T-RG-02 first sequential commit must succeed.' );
gpp_assert_true( $second_store->commit( 1, array( 'revision' => 2 ) ), 'T-RG-02 second sequential commit must succeed after guard cleanup.' );
gpp_assert_same( 2, gpp_lock_query_count( $GLOBALS['wpdb'], 'GET_LOCK(' ), 'T-RG-02 each sequential commit must acquire its own advisory lock.' );
gpp_assert_same( 2, gpp_lock_query_count( $GLOBALS['wpdb'], 'RELEASE_LOCK(' ), 'T-RG-02 each sequential commit must release its advisory lock.' );

// T-RG-03: visual and binding stores retain independent request-local guards and advisory lock identities.
gpp_lock_reset();
$visual_store  = new WordPressOptionStateStore( 'gpp_visual_package_lifecycle_v1' );
$binding_store = new WordPressOptionStateStore( 'gpp_binding_set_lifecycle_v1' );
$GLOBALS['gpp_update_hook'] = static function () use ( $binding_store ) {
    $GLOBALS['gpp_nested_commit_result'] = $binding_store->commit( 0, array( 'revision' => 1, 'writer' => 'binding' ) );
};
gpp_assert_true( $visual_store->commit( 0, array( 'revision' => 1, 'writer' => 'visual' ) ), 'T-RG-03 visual outer commit must succeed.' );
gpp_assert_same( true, $GLOBALS['gpp_nested_commit_result'], 'T-RG-03 distinct binding-store commit must not be rejected by the visual guard.' );
gpp_assert_same( 2, gpp_lock_query_count( $GLOBALS['wpdb'], 'GET_LOCK(' ), 'T-RG-03 distinct stores must each acquire their own advisory lock.' );
$nested_lock_names = gpp_lock_prepared_names( $GLOBALS['wpdb'], 'GET_LOCK' );
gpp_assert_same( 2, count( array_unique( $nested_lock_names ) ), 'T-RG-03 visual and binding stores must retain distinct advisory lock identities.' );
gpp_assert_same( 'binding', get_option( 'gpp_binding_set_lifecycle_v1', null )['writer'], 'T-RG-03 binding state must commit independently.' );

// T-RG-04: a failed protected critical section must not leave a stale request-local guard.
gpp_lock_reset();
$GLOBALS['gpp_test_options']['gpp_visual_package_lifecycle_v1'] = array( 'revision' => 2, 'sentinel' => 'before' );
$store = new WordPressOptionStateStore( 'gpp_visual_package_lifecycle_v1' );
gpp_assert_same( false, $store->commit( 1, array( 'revision' => 3, 'sentinel' => 'invalid' ) ), 'T-RG-04 revision mismatch must fail.' );
gpp_assert_same( 0, count( $GLOBALS['gpp_update_calls'] ), 'T-RG-04 revision mismatch must not mutate lifecycle state.' );
gpp_assert_true( $store->commit( 2, array( 'revision' => 3, 'sentinel' => 'after' ) ), 'T-RG-04 valid commit after mismatch must succeed.' );
gpp_assert_same( 2, gpp_lock_query_count( $GLOBALS['wpdb'], 'GET_LOCK(' ), 'T-RG-04 guard cleanup must permit the later acquisition.' );
gpp_assert_same( 2, gpp_lock_query_count( $GLOBALS['wpdb'], 'RELEASE_LOCK(' ), 'T-RG-04 both successfully acquired locks must be released.' );

// T-RG-06: conformance guard rejects ownership-probing substitution and persistent coordination remains absent.
foreach ( $GLOBALS['wpdb']->queries as $query ) {
    gpp_assert_true( false === strpos( $query, 'IS_USED_LOCK(' ), 'T-RG-06 IS_USED_LOCK() must not be used.' );
    gpp_assert_true( false === strpos( $query, 'CONNECTION_ID(' ), 'T-RG-06 CONNECTION_ID() must not be used.' );
}
foreach ( array_keys( $GLOBALS['gpp_test_options'] ) as $option_name ) {
    gpp_assert_true( '_lock' !== substr( $option_name, -5 ), 'T-RG-06 no persistent coordination lock option may be created.' );
}

echo "GPP_WORDPRESS_OPTION_STATE_STORE_REENTRANCY_PASS\n";
echo "GPP_WORDPRESS_OPTION_STATE_STORE_LOCK_PASS\n";
