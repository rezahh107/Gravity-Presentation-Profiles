<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Adds one explicit document-reload utility beside the native Gravity Flow Inbox.
 *
 * Gravity Flow remains the owner of Inbox data, assignment, authorization,
 * search, paging, settings and Live Refresh. This control owns no Inbox state;
 * it only asks the browser to reload the current document URL.
 */
final class InboxManualRefreshControl {
    const SCRIPT_HANDLE = 'gpp-gravity-flow-inbox-manual-refresh';
    const NATIVE_BLOCK = 'gravityflow/inbox';

    public static function register() {
        if ( ! function_exists( 'add_action' ) || ! function_exists( 'add_filter' ) ) {
            return;
        }

        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueAdmin' ), 20 );
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

        // Enqueue only after Gravity Flow has produced its authentic Inbox
        // surface. The HTML itself remains untouched.
        if ( self::containsNativeInboxSurface( $html ) ) {
            self::enqueueScript();
        }
        return $html;
    }

    public static function filterFrontendBlock( $block_content, $block ) {
        if ( ! is_array( $block )
            || self::NATIVE_BLOCK !== ( isset( $block['blockName'] ) ? $block['blockName'] : null )
            || ! self::containsNativeInboxSurface( $block_content ) ) {
            return $block_content;
        }

        self::enqueueScript();
        return $block_content;
    }

    private static function containsNativeInboxSurface( $html ) {
        return is_string( $html )
            && false !== strpos( $html, 'gflow-inbox gflow-grid gflow-common' )
            && false !== strpos( $html, 'data-js="gflow-inbox"' );
    }

    private static function enqueueScript() {
        if ( ! defined( 'GPP_PLUGIN_FILE' ) || ! function_exists( 'wp_enqueue_script' ) ) {
            return;
        }

        wp_enqueue_script(
            self::SCRIPT_HANDLE,
            plugins_url( 'assets/js/gravity-flow-inbox-manual-refresh.js', GPP_PLUGIN_FILE ),
            array(),
            '2.0.0',
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
