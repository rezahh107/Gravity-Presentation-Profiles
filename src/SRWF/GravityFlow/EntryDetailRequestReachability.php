<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Request-only reachability boundary for supported Gravity Flow Entry Detail surfaces.
 *
 * This predicate answers only whether the current request can authentically
 * reach Entry Detail. Gravity Flow remains authoritative for authorization,
 * workflow state, assignment and editability.
 */
final class EntryDetailRequestReachability {
    public static function isReachable() {
        $view = isset( $_GET['view'] ) && is_string( $_GET['view'] ) ? sanitize_key( wp_unslash( $_GET['view'] ) ) : '';
        $lid = isset( $_GET['lid'] ) ? absint( wp_unslash( $_GET['lid'] ) ) : 0;

        if ( 'entry' !== $view || $lid < 1 ) {
            return false;
        }

        if ( function_exists( 'is_admin' ) && is_admin() ) {
            $page = isset( $_GET['page'] ) && is_string( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
            return 'gravityflow-inbox' === $page;
        }

        return self::frontendHostReachable();
    }

    private static function frontendHostReachable() {
        if ( ! function_exists( 'is_singular' ) || ! is_singular() || ! function_exists( 'get_queried_object' ) ) {
            return false;
        }

        $object = get_queried_object();
        if ( ! is_object( $object ) || ! isset( $object->post_content ) || ! is_string( $object->post_content ) ) {
            return false;
        }

        return self::executableGravityFlowShortcodeReachesEntryDetail( $object->post_content )
            || self::registeredEntryDetailBlockReachable( $object->post_content );
    }

    private static function executableGravityFlowShortcodeReachesEntryDetail( $content ) {
        if ( ! is_string( $content ) || '' === $content || ! function_exists( 'shortcode_exists' )
            || ! shortcode_exists( 'gravityflow' ) || ! function_exists( 'wp_html_split' )
            || ! function_exists( 'get_shortcode_regex' ) || ! function_exists( 'shortcode_parse_atts' ) ) {
            return false;
        }

        $tokens = wp_html_split( $content );
        if ( ! is_array( $tokens ) ) {
            return false;
        }

        $pattern = get_shortcode_regex( array( 'gravityflow' ) );
        if ( ! is_string( $pattern ) || '' === $pattern ) {
            return false;
        }

        foreach ( $tokens as $token ) {
            if ( ! is_string( $token ) || '' === $token ) {
                continue;
            }
            if ( '<' === $token[0] && ( 0 === strpos( $token, '<!--' ) || 0 === strpos( $token, '<![CDATA[' ) ) ) {
                continue;
            }

            $count = preg_match_all( '/' . $pattern . '/s', $token, $matches, PREG_SET_ORDER );
            if ( ! is_int( $count ) || $count < 1 ) {
                continue;
            }

            foreach ( $matches as $match ) {
                if ( ! isset( $match[1], $match[2], $match[3], $match[6] ) || 'gravityflow' !== $match[2] ) {
                    continue;
                }
                if ( '[' === $match[1] && ']' === $match[6] ) {
                    continue;
                }

                $atts = shortcode_parse_atts( $match[3] );
                if ( ! is_array( $atts ) ) {
                    continue;
                }
                $page = isset( $atts['page'] ) ? sanitize_key( (string) $atts['page'] ) : 'inbox';
                if ( in_array( $page, array( 'inbox', 'status' ), true ) ) {
                    return true;
                }
            }
        }

        return false;
    }

    private static function registeredEntryDetailBlockReachable( $content ) {
        if ( ! is_string( $content ) || '' === $content || ! function_exists( 'has_block' ) || ! class_exists( 'WP_Block_Type_Registry' ) ) {
            return false;
        }

        $registry = \WP_Block_Type_Registry::get_instance();
        if ( ! is_object( $registry ) || ! method_exists( $registry, 'is_registered' ) ) {
            return false;
        }

        foreach ( array( 'gravityflow/inbox', 'gravityflow/status' ) as $name ) {
            if ( $registry->is_registered( $name ) && has_block( $name, $content ) ) {
                return true;
            }
        }

        return false;
    }
}
