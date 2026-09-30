<?php
/**
 * WU21-only request-scoped bypass for Raw Native Inbox baseline capture.
 *
 * This file is copied into the ephemeral WU21 MU-plugin directory only. It is
 * not a production runtime feature. On one explicit evidence query parameter it
 * removes only GPP Inbox presentation callbacks after GPP has registered them.
 * Gravity Flow / AG Grid remain loaded and authoritative for the Inbox itself.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

final class GPP_WU21_Native_Inbox_Baseline_Mode {
    const QUERY_KEY = 'wu21_native_inbox_baseline';
    const RAW_VALUE = 'raw_native';

    public static function detach_gpp_inbox_presentation() {
        if ( is_admin() || ! isset( $_GET[ self::QUERY_KEY ] ) ) {
            return;
        }

        $mode = sanitize_key( wp_unslash( $_GET[ self::QUERY_KEY ] ) );
        if ( self::RAW_VALUE !== $mode ) {
            return;
        }

        $presentation = 'GravityPresentationProfiles\\SRWF\\GravityFlow\\InboxPresentationAdapter';
        $header       = 'GravityPresentationProfiles\\SRWF\\GravityFlow\\InboxTableHeaderPresentation';
        $refresh      = 'GravityPresentationProfiles\\SRWF\\GravityFlow\\InboxManualRefreshControl';
        $block_bridge = 'GravityPresentationProfiles\\SRWF\\GravityFlow\\InboxBlockCompositionBridge';

        if ( class_exists( $presentation ) ) {
            remove_filter( 'gravityflow_shortcode_inbox', array( $presentation, 'filterShortcodeInbox' ), 20 );
            remove_filter( 'render_block', array( $presentation, 'filterFrontendBlock' ), 20 );
            remove_action( 'wp_enqueue_scripts', array( $presentation, 'enqueueStyles' ), 20 );
        }

        if ( class_exists( $header ) ) {
            remove_filter( 'gravityflow_columns_inbox_table', array( $header, 'filterColumns' ), PHP_INT_MAX );
            remove_filter( 'gravityflow_inbox_field_value', array( $header, 'filterFieldValue' ), PHP_INT_MAX );
        }

        if ( class_exists( $refresh ) ) {
            remove_filter( 'gravityflow_shortcode_inbox', array( $refresh, 'filterFrontendInbox' ), 20 );
            remove_filter( 'render_block', array( $refresh, 'filterFrontendBlock' ), 20 );
        }

        if ( class_exists( $block_bridge ) ) {
            remove_filter( 'the_content', array( $block_bridge, 'enterCurrentPostContentScope' ), PHP_INT_MIN );
            remove_filter( 'the_content', array( $block_bridge, 'leaveCurrentPostContentScope' ), PHP_INT_MAX );
            remove_filter( 'render_block_gravityflow/inbox', array( $block_bridge, 'filterFrontendBlock' ), 20 );
        }
    }
}

// GPP registers its Gravity Flow Inbox adapters from gform_loaded at priority 5.
// Run later on the same lifecycle so the bypass is deterministic and bounded to
// this one request instead of changing any persistent profile/runtime state.
add_action( 'gform_loaded', array( 'GPP_WU21_Native_Inbox_Baseline_Mode', 'detach_gpp_inbox_presentation' ), 99 );
