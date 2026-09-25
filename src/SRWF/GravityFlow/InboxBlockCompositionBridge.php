<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Admits the authentic frontend Gravity Flow Inbox block into the same
 * page-level GPP composition already used by the frontend Inbox shortcode.
 *
 * Gravity Flow remains the owner of the rendered Inbox/Grid behavior. This
 * bridge only reuses GPP's existing presentation wrapper for a registered
 * Inbox block while the queried post's own frontend content is being rendered.
 */
final class InboxBlockCompositionBridge {
    private static $content_scope_stack = array();
    private static $composed_block_instance = 0;

    public static function register() {
        if ( ! function_exists( 'add_filter' ) ) {
            return;
        }

        // Establish an explicit scope around each the_content invocation before
        // core do_blocks (priority 9) can render an Inbox block, and clear it
        // only after every downstream content filter has completed. Nested
        // secondary-content filters push their own false scope instead of
        // inheriting admission from the queried post.
        add_filter( 'the_content', array( __CLASS__, 'enterCurrentPostContentScope' ), PHP_INT_MIN, 1 );
        add_filter( 'the_content', array( __CLASS__, 'leaveCurrentPostContentScope' ), PHP_INT_MAX, 1 );

        // WordPress applies the block-specific render filter after the generic
        // render_block filter used by InboxPresentationAdapter for reachability.
        // Scope composition to the one authentic Gravity Flow Inbox block type.
        add_filter( 'render_block_' . InboxPresentationAdapter::NATIVE_BLOCK, array( __CLASS__, 'filterFrontendBlock' ), 20, 3 );
    }

    public static function enterCurrentPostContentScope( $content ) {
        self::$content_scope_stack[] = self::isCurrentQueriedPostContent( $content );
        return $content;
    }

    public static function leaveCurrentPostContentScope( $content ) {
        if ( ! empty( self::$content_scope_stack ) ) {
            array_pop( self::$content_scope_stack );
        }
        return $content;
    }

    public static function filterFrontendBlock( $block_content, $block, $instance = null ) {
        if ( ! is_string( $block_content ) || ! is_array( $block ) ) {
            return $block_content;
        }
        if ( InboxPresentationAdapter::NATIVE_BLOCK !== ( isset( $block['blockName'] ) ? $block['blockName'] : null ) ) {
            return $block_content;
        }
        if ( ! self::currentContentScopeOwnsBlock( $instance ) || ! self::nativeInboxBlockRegistered() ) {
            return $block_content;
        }

        // Reuse the canonical admitted frontend Inbox composition rather than
        // duplicating wrapper, heading/helper copy or late-style behavior.
        $composed = InboxPresentationAdapter::filterShortcodeInbox( $block_content, array(), null );
        if ( false === strpos( $composed, 'data-gpp-inbox-surface="gravity_flow.inbox"' ) ) {
            return $composed;
        }

        // Already-composed output is idempotent and must not consume a new
        // document identity if the host applies the render filter again.
        if ( false !== strpos( $block_content, 'data-gpp-inbox-surface="gravity_flow.inbox"' ) ) {
            return $composed;
        }

        return self::withUniqueBlockHeadingId( $composed );
    }

    private static function isCurrentQueriedPostContent( $content ) {
        if ( ! is_string( $content ) || ! function_exists( 'is_admin' ) || is_admin()
            || ! function_exists( 'is_singular' ) || ! is_singular()
            || ! function_exists( 'get_queried_object' ) || ! function_exists( 'has_block' ) ) {
            return false;
        }

        $queried = get_queried_object();
        $current = isset( $GLOBALS['post'] ) ? $GLOBALS['post'] : null;
        if ( ! is_object( $queried ) || ! isset( $queried->ID, $queried->post_content )
            || ! is_object( $current ) || ! isset( $current->ID ) ) {
            return false;
        }

        $queried_id = (int) $queried->ID;
        return $queried_id > 0
            && $queried_id === (int) $current->ID
            && is_string( $queried->post_content )
            && $content === $queried->post_content
            && has_block( InboxPresentationAdapter::NATIVE_BLOCK, $content );
    }

    private static function currentContentScopeOwnsBlock( $instance ) {
        if ( ! function_exists( 'doing_filter' ) || ! doing_filter( 'the_content' ) || empty( self::$content_scope_stack ) ) {
            return false;
        }

        $scope_index = count( self::$content_scope_stack ) - 1;
        if ( true !== self::$content_scope_stack[ $scope_index ] ) {
            return false;
        }

        $queried = function_exists( 'get_queried_object' ) ? get_queried_object() : null;
        if ( ! is_object( $queried ) || ! isset( $queried->ID ) || ! is_object( $instance ) || ! isset( $instance->context ) || ! is_array( $instance->context ) ) {
            return false;
        }

        return isset( $instance->context['postId'] )
            && (int) $queried->ID > 0
            && (int) $queried->ID === (int) $instance->context['postId'];
    }

    private static function nativeInboxBlockRegistered() {
        if ( ! class_exists( 'WP_Block_Type_Registry' ) ) {
            return false;
        }

        $registry = \WP_Block_Type_Registry::get_instance();
        return is_object( $registry )
            && method_exists( $registry, 'is_registered' )
            && $registry->is_registered( InboxPresentationAdapter::NATIVE_BLOCK );
    }

    private static function withUniqueBlockHeadingId( $composed ) {
        self::$composed_block_instance++;
        $heading_id = 'gpp-inbox-title-block-' . self::$composed_block_instance;

        return str_replace(
            array(
                'aria-labelledby="gpp-inbox-title"',
                'id="gpp-inbox-title"',
            ),
            array(
                'aria-labelledby="' . $heading_id . '"',
                'id="' . $heading_id . '"',
            ),
            $composed
        );
    }
}
