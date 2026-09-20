<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Adds an explicit manual reload control around the native Gravity Flow Inbox.
 *
 * Gravity Flow remains the owner of Inbox data, assignment, authorization,
 * search, paging and Live Refresh. This control only asks the browser to reload
 * the current native Inbox document through the normal host lifecycle.
 */
final class InboxManualRefreshControl {
    const SCRIPT_HANDLE = 'gpp-gravity-flow-inbox-manual-refresh';

    public static function register() {
        if ( ! function_exists( 'add_action' ) || ! function_exists( 'add_filter' ) ) {
            return;
        }

        // WordPress admin Inbox is identified by its exact native admin route.
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueAdmin' ), 20 );

        // Frontend reachability is attached to Gravity Flow's own Inbox shortcode
        // render seam. The authentic host HTML is optionally enclosed by the
        // admitted GPP presentation shell; no Inbox state/rows are reconstructed.
        add_filter( 'gravityflow_shortcode_inbox', array( __CLASS__, 'filterFrontendInbox' ), 20, 3 );
        add_filter( 'render_block', array( __CLASS__, 'filterFrontendBlock' ), 20, 2 );
    }

    public static function enqueueAdmin() {
        if ( ! self::isNativeInboxListRequest() ) {
            return;
        }
        self::enqueueScript();
    }

    public static function filterFrontendInbox( $html, $atts, $content ) {
        unset( $atts, $content );
        self::enqueueScript();
        return self::wrapPresentation( $html );
    }

    /**
     * Gravity Flow 3.1.0 also supports its native Inbox block. Keep the WordPress
     * block filter generic but gate the enqueue/composition on the exact admitted
     * native Inbox DOM markers already used by the presentation layer.
     */
    public static function filterFrontendBlock( $block_content, $block ) {
        unset( $block );
        if ( is_string( $block_content )
            && false !== strpos( $block_content, 'gflow-inbox' )
            && false !== strpos( $block_content, 'data-js="gflow-inbox"' ) ) {
            self::enqueueScript();
            return self::wrapPresentation( $block_content );
        }
        return $block_content;
    }

    private static function wrapPresentation( $html ) {
        if ( ! is_string( $html )
            || false === strpos( $html, 'gflow-inbox' )
            || false === strpos( $html, 'data-js="gflow-inbox"' )
            || ! class_exists( InboxSurfaceComposition::class ) ) {
            return $html;
        }

        return InboxSurfaceComposition::wrap( $html );
    }

    private static function enqueueScript() {
        if ( ! defined( 'GPP_PLUGIN_FILE' ) || ! function_exists( 'wp_enqueue_script' ) ) {
            return;
        }

        wp_enqueue_script(
            self::SCRIPT_HANDLE,
            plugins_url( 'assets/js/gravity-flow-inbox-manual-refresh.js', GPP_PLUGIN_FILE ),
            array(),
            '1.1.0',
            true
        );
    }

    private static function isNativeInboxListRequest() {
        if ( ! function_exists( 'is_admin' ) || ! is_admin() ) {
            return false;
        }

        $page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
        $view = isset( $_GET['view'] ) ? sanitize_key( wp_unslash( $_GET['view'] ) ) : '';

        return 'gravityflow-inbox' === $page && '' === $view;
    }
}
