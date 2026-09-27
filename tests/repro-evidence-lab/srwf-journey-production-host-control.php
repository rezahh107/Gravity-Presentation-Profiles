<?php
/**
 * Test-only control for exercising effective Gravity Flow Entry Detail args.
 * Inert unless the disposable pinned lab sets gpp_journey_back_link_control.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_filter(
    'gravityflow_entry_detail_args',
    static function ( $args ) {
        if ( ! is_array( $args ) ) {
            return $args;
        }

        $mode = get_option( 'gpp_journey_back_link_control', '' );
        if ( 'force_on' === $mode ) {
            $args['back_link'] = true;
        } elseif ( 'force_off' === $mode ) {
            $args['back_link'] = false;
        }

        return $args;
    },
    5
);
