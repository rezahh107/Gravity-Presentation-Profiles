<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Admits the authentic frontend Gravity Flow Inbox block into the same
 * page-level GPP composition already used by the frontend Inbox shortcode.
 *
 * Gravity Flow remains the owner of the rendered Inbox/Grid behavior. This
 * bridge only reuses GPP's existing presentation wrapper for a registered
 * Inbox block that is actually present in the current singular page content.
 */
final class InboxBlockCompositionBridge {
    public static function register() {
        if ( ! function_exists( 'add_filter' ) ) {
            return;
        }

        // WordPress applies the block-specific render filter after the generic
        // render_block filter used by InboxPresentationAdapter for reachability.
        // Scope composition to the one authentic Gravity Flow Inbox block type.
        add_filter( 'render_block_' . InboxPresentationAdapter::NATIVE_BLOCK, array( __CLASS__, 'filterFrontendBlock' ), 20, 2 );
    }

    public static function filterFrontendBlock( $block_content, $block ) {
        if ( ! is_string( $block_content ) || ! is_array( $block ) ) {
            return $block_content;
        }
        if ( InboxPresentationAdapter::NATIVE_BLOCK !== ( isset( $block['blockName'] ) ? $block['blockName'] : null ) ) {
            return $block_content;
        }
        if ( ! self::currentPageContainsNativeInboxBlock() ) {
            return $block_content;
        }

        // Reuse the canonical admitted frontend Inbox composition rather than
        // duplicating wrapper, heading/helper copy or late-style behavior.
        return InboxPresentationAdapter::filterShortcodeInbox( $block_content, array(), null );
    }

    private static function currentPageContainsNativeInboxBlock() {
        if ( ! function_exists( 'is_admin' ) || is_admin()
            || ! function_exists( 'is_singular' ) || ! is_singular()
            || ! function_exists( 'get_queried_object' ) || ! function_exists( 'has_block' )
            || ! class_exists( 'WP_Block_Type_Registry' ) ) {
            return false;
        }

        $registry = \WP_Block_Type_Registry::get_instance();
        if ( ! is_object( $registry ) || ! method_exists( $registry, 'is_registered' ) || ! $registry->is_registered( InboxPresentationAdapter::NATIVE_BLOCK ) ) {
            return false;
        }

        $object = get_queried_object();
        return is_object( $object )
            && isset( $object->post_content )
            && is_string( $object->post_content )
            && has_block( InboxPresentationAdapter::NATIVE_BLOCK, $object->post_content );
    }
}
