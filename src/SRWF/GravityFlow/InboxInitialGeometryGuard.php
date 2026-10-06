<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Composes the bounded SRWF Inbox initial/grow geometry guard into native Grid lifecycle.
 *
 * Gravity Flow/AG Grid remain authoritative for construction, column state,
 * persistence and ordinary resize lifecycle. This adapter only authorizes the
 * pre-construction callback composition for one resolved SRWF form/column
 * contract. The browser asset may retain a disposable, namespaced presentation
 * provenance signature for widths produced by native size-to-fit so a later
 * wider mount can distinguish them from newly observed non-GPP/manual widths;
 * it never replaces or writes the host's native Grid-state record.
 */
final class InboxInitialGeometryGuard {
    const SCRIPT_RELATIVE_PATH = 'assets/js/srwf-gravity-flow-inbox-initial-geometry-guard.js';
    const CONTRACT_PLACEHOLDER = '__GPP_INITIAL_GEOMETRY_CONTRACT__';

    private static $request_contract = null;
    private static $request_ambiguous = false;

    public static function register() {
        if ( ! function_exists( 'add_filter' ) || ! function_exists( 'add_action' ) ) {
            return;
        }

        // InboxTableHeaderPresentation is registered first at the same final
        // priority. Observe only the already-resolved five-column projection;
        // never create a second binding or column authority here.
        add_filter( 'gravityflow_columns_inbox_table', array( __CLASS__, 'captureResolvedContract' ), PHP_INT_MAX, 2 );

        // The qualified lifecycle adds real Functions to localized GridOptions
        // before Gravity Flow's frontend theme script constructs the native Grid.
        // WordPress prints footer scripts later in this hook, so priority 0 keeps
        // the bounded composition pre-construction.
        add_action( 'wp_print_footer_scripts', array( __CLASS__, 'attachBeforeNativeGridConstruction' ), 0 );
    }

    public static function resetRuntimeCache() {
        self::$request_contract = null;
        self::$request_ambiguous = false;
    }

    public static function captureResolvedContract( $columns, $args = array() ) {
        if ( ! is_array( $columns ) ) {
            return $columns;
        }

        $contract = InboxTableHeaderPresentation::initialGeometryContract( $args );
        if ( ! is_array( $contract )
            || empty( $contract['form_id'] )
            || empty( $contract['column_ids'] )
            || ! is_array( $contract['column_ids'] ) ) {
            return $columns;
        }

        $expected = array_values( array_map( 'strval', $contract['column_ids'] ) );
        if ( 5 !== count( $expected ) || 5 !== count( array_unique( $expected, SORT_STRING ) ) ) {
            return $columns;
        }

        // The authoritative header projection preserves exactly one hidden
        // native human-readable date companion in addition to the five Grid
        // columns. Any extra/missing identity is outside this guard's scope.
        if ( 6 !== count( $columns ) || ! array_key_exists( 'date_created_human_readable', $columns ) ) {
            return $columns;
        }

        $actual = array();
        foreach ( array_keys( $columns ) as $column_id ) {
            $column_id = (string) $column_id;
            if ( 'date_created_human_readable' !== $column_id ) {
                $actual[] = $column_id;
            }
        }

        if ( ! self::sameIdentitySet( $actual, $expected ) ) {
            return $columns;
        }

        $resolved = array(
            'form_id'    => (int) $contract['form_id'],
            'column_ids' => $expected,
        );

        if ( null === self::$request_contract ) {
            self::$request_contract = $resolved;
        } elseif ( self::$request_contract !== $resolved ) {
            // More than one resolved target in one request cannot be mapped to
            // one injected production contract without becoming a second Grid
            // registry. Fail the whole request closed instead.
            self::$request_ambiguous = true;
        }

        return $columns;
    }

    public static function attachBeforeNativeGridConstruction() {
        if ( self::$request_ambiguous || null === self::$request_contract ) {
            return;
        }
        if ( ! defined( 'GPP_PLUGIN_FILE' )
            || ! class_exists( 'Gravity_Flow' )
            || ! defined( 'Gravity_Flow::THEME_JS' )
            || ! function_exists( 'wp_script_is' )
            || ! function_exists( 'wp_add_inline_script' )
            || ! function_exists( 'wp_json_encode' ) ) {
            return;
        }

        $handle = \Gravity_Flow::THEME_JS;
        if ( ! is_string( $handle ) || '' === $handle || ! wp_script_is( $handle, 'enqueued' ) ) {
            return;
        }

        $path = dirname( GPP_PLUGIN_FILE ) . '/' . self::SCRIPT_RELATIVE_PATH;
        if ( ! is_readable( $path ) ) {
            return;
        }

        $source = file_get_contents( $path );
        if ( ! is_string( $source ) || 1 !== substr_count( $source, self::CONTRACT_PLACEHOLDER ) ) {
            return;
        }

        $json = wp_json_encode(
            self::$request_contract,
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
        );
        if ( ! is_string( $json ) || '' === $json ) {
            return;
        }

        $source = str_replace( self::CONTRACT_PLACEHOLDER, $json, $source );
        wp_add_inline_script( $handle, $source, 'before' );
    }

    private static function sameIdentitySet( $actual, $expected ) {
        if ( count( $actual ) !== count( $expected )
            || count( array_unique( $actual, SORT_STRING ) ) !== count( $actual ) ) {
            return false;
        }

        $actual = array_values( array_map( 'strval', $actual ) );
        $expected = array_values( array_map( 'strval', $expected ) );
        sort( $actual, SORT_STRING );
        sort( $expected, SORT_STRING );

        return $actual === $expected;
    }
}
