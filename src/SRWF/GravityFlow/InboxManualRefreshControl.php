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
        if ( ! function_exists( 'add_action' ) ) {
            return;
        }

        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ), 20 );
    }

    public static function enqueue() {
        if ( ! self::isNativeInboxListRequest() || ! defined( 'GPP_PLUGIN_FILE' ) || ! function_exists( 'wp_enqueue_script' ) ) {
            return;
        }

        wp_enqueue_script(
            self::SCRIPT_HANDLE,
            plugins_url( 'assets/js/gravity-flow-inbox-manual-refresh.js', GPP_PLUGIN_FILE ),
            array(),
            '1.0.0',
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
