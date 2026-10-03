<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDecisionTrace;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/**
 * SRWF presentation shell for the native Gravity Flow Inbox.
 *
 * Gravity Flow and AG Grid remain authoritative for the Inbox structure,
 * columns, row/cell lifecycle, search, sorting, paging, settings, focus model,
 * navigation and state. GPP owns only the bounded page shell and paint assets,
 * plus the Owner-authorized four-node physical LTR CSS exception documented by
 * the Inbox V2 Visual/UX Contract.
 */
final class InboxPresentationAdapter {
    const SURFACE = 'gravity_flow.inbox';
    const STYLE_HANDLE = 'gpp-srwf-gravity-flow-inbox';
    const NATIVE_STYLE_HANDLE = 'gpp-srwf-gravity-flow-inbox-native';
    const NATIVE_BLOCK = 'gravityflow/inbox';

    private static $model_loaded = false;
    private static $model = null;
    private static $surface_reached = false;

    public static function register() {
        if ( ! function_exists( 'add_filter' ) || ! function_exists( 'add_action' ) ) {
            return;
        }

        // The native Inbox render seams establish reachability only. GPP does
        // not alter native columns, values, Grid options, query state or nodes.
        add_filter( 'gravityflow_shortcode_inbox', array( __CLASS__, 'filterShortcodeInbox' ), 20, 3 );
        add_filter( 'render_block', array( __CLASS__, 'filterFrontendBlock' ), 20, 2 );

        // Styles use normal WordPress asset lifecycle and remain fail-safe: if
        // the SRWF Inbox profile is unavailable, native Gravity Flow is returned.
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueStyles' ), 20 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueueStyles' ), 20 );
    }

    public static function resetRuntimeCache() {
        self::$model_loaded = false;
        self::$model = null;
        self::$surface_reached = false;
        RuntimeDiagnostics::resetSurface( self::SURFACE );
    }

    /**
     * Add only the GPP-owned page shell around authentic frontend Inbox output.
     * The host subtree is kept byte-for-byte in place inside that shell.
     */
    public static function filterShortcodeInbox( $html, $atts, $content ) {
        unset( $atts, $content );

        if ( ! is_string( $html ) ) {
            return $html;
        }
        if ( false === strpos( $html, 'gflow-inbox gflow-grid gflow-common' ) || false === strpos( $html, 'data-js="gflow-inbox"' ) ) {
            return $html;
        }

        self::$surface_reached = true;

        if ( null === self::model() ) {
            return $html;
        }
        if ( false !== strpos( $html, 'data-gpp-inbox-surface="gravity_flow.inbox"' ) ) {
            return self::prependLateStyles( $html );
        }

        $title = esc_html__( 'کارهای من', 'gravity-presentation-profiles' );
        $helper = esc_html__( 'پرونده‌هایی که اکنون نیاز به اقدام شما دارند در این صفحه نمایش داده می‌شوند. برای شروع، یکی از پرونده‌های زیر را باز کنید.', 'gravity-presentation-profiles' );

        // Persian copy remains RTL. The only native Grid direction exception is
        // the Owner-authorized four-node physical LTR CSS seam; no Grid option,
        // state, DOM or interaction ownership is acquired here.
        return self::prependLateStyles( '<section class="gpp-inbox-surface gpp-inbox-surface--full-width" data-gpp-inbox-surface="gravity_flow.inbox" aria-labelledby="gpp-inbox-title">'
            . '<div class="gpp-inbox-surface__inner">'
            . '<header class="gpp-inbox-surface__header" dir="rtl">'
            . '<h1 class="gpp-inbox-surface__title" id="gpp-inbox-title">' . $title . '</h1>'
            . '<p class="gpp-inbox-surface__helper">' . $helper . '</p>'
            . '</header>'
            . '<div class="gpp-inbox-surface__host">' . $html . '</div>'
            . '</div>'
            . '</section>' );
    }

    /**
     * Gravity Flow also registers its native Inbox block. This generic render
     * filter establishes reachability only for that exact registered block and
     * its authentic native DOM marker; it does not compose or mutate Grid nodes.
     */
    public static function filterFrontendBlock( $block_content, $block ) {
        if ( ! is_string( $block_content ) || ! is_array( $block ) ) {
            return $block_content;
        }
        if ( self::NATIVE_BLOCK !== ( isset( $block['blockName'] ) ? $block['blockName'] : null ) || ! self::nativeInboxBlockRegistered() ) {
            return $block_content;
        }
        if ( false === strpos( $block_content, 'gflow-inbox' ) || false === strpos( $block_content, 'data-js="gflow-inbox"' ) ) {
            return $block_content;
        }

        self::$surface_reached = true;
        return null === self::model() ? $block_content : self::prependLateStyles( $block_content );
    }

    /** Print only the Inbox handles still pending after frontend head styles. */
    private static function prependLateStyles( $content ) {
        if ( ! function_exists( 'is_admin' ) || is_admin() || ! function_exists( 'did_action' ) || ! did_action( 'wp_print_styles' )
            || ! function_exists( 'wp_style_is' ) || ! function_exists( 'wp_print_styles' ) ) {
            return $content;
        }

        $pending = array();
        foreach ( array( self::STYLE_HANDLE, self::NATIVE_STYLE_HANDLE ) as $handle ) {
            if ( ! wp_style_is( $handle, 'done' ) ) {
                $pending[] = $handle;
            }
        }
        if ( ! $pending ) {
            return $content;
        }

        self::enqueueStyles();
        ob_start();
        wp_print_styles( $pending );
        $styles = ob_get_clean();
        return $styles . $content;
    }

    public static function enqueueStyles() {
        if ( ! self::currentRequestReachesInbox() || null === self::model() || ! defined( 'GPP_PLUGIN_FILE' ) || ! function_exists( 'wp_enqueue_style' ) ) {
            return;
        }

        $presentation_path = 'assets/css/srwf-gravity-flow-inbox.css';
        $native_path = 'assets/css/srwf-gravity-flow-inbox-native.css';
        $plugin_root = dirname( GPP_PLUGIN_FILE );
        $presentation_dependencies = array();

        if ( function_exists( 'wp_style_is' ) && wp_style_is( 'global-styles', 'enqueued' ) ) {
            $presentation_dependencies[] = 'global-styles';
        }

        if ( function_exists( 'wp_style_is' ) && wp_style_is( 'wp-theme', 'registered' ) ) {
            wp_enqueue_style( 'wp-theme' );
            $presentation_dependencies[] = 'wp-theme';
        }

        wp_enqueue_style(
            self::STYLE_HANDLE,
            plugins_url( $presentation_path, GPP_PLUGIN_FILE ),
            $presentation_dependencies,
            self::assetVersion( $plugin_root . '/' . $presentation_path )
        );
        wp_enqueue_style(
            self::NATIVE_STYLE_HANDLE,
            plugins_url( $native_path, GPP_PLUGIN_FILE ),
            array( self::STYLE_HANDLE ),
            self::assetVersion( $plugin_root . '/' . $native_path )
        );
    }

    private static function currentRequestReachesInbox() {
        if ( self::$surface_reached ) {
            return true;
        }

        if ( self::isNativeInboxListRequest() || self::isFrontendInboxRequest() ) {
            self::$surface_reached = true;
            return true;
        }

        return false;
    }

    private static function isNativeInboxListRequest() {
        if ( ! function_exists( 'is_admin' ) || ! is_admin() ) {
            return false;
        }

        $page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
        $view = isset( $_GET['view'] ) ? sanitize_key( wp_unslash( $_GET['view'] ) ) : '';

        return 'gravityflow-inbox' === $page && '' === $view;
    }

    private static function isFrontendInboxRequest() {
        if ( ! function_exists( 'is_admin' ) || is_admin() || ! function_exists( 'is_singular' ) || ! is_singular() || ! function_exists( 'get_queried_object' ) ) {
            return false;
        }

        $object = get_queried_object();
        if ( ! is_object( $object ) || ! isset( $object->post_content ) || ! is_string( $object->post_content ) ) {
            return false;
        }

        $content = $object->post_content;
        return self::contentHasInboxShortcode( $content ) || self::contentHasInboxBlock( $content );
    }

    private static function contentHasInboxShortcode( $content ) {
        if ( ! is_string( $content ) || '' === $content || ! function_exists( 'shortcode_exists' ) || ! shortcode_exists( 'gravityflow' )
            || ! function_exists( 'get_shortcode_regex' ) || ! function_exists( 'shortcode_parse_atts' ) || ! function_exists( 'wp_html_split' ) ) {
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

            $match_count = preg_match_all( '/' . $pattern . '/s', $token, $matches, PREG_SET_ORDER );
            if ( false === $match_count || 0 === $match_count ) {
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
                if ( is_array( $atts ) && isset( $atts['page'] ) && 'inbox' === sanitize_key( (string) $atts['page'] ) ) {
                    return true;
                }
            }
        }

        return false;
    }

    private static function contentHasInboxBlock( $content ) {
        if ( ! is_string( $content ) || '' === $content || ! function_exists( 'has_block' ) || ! self::nativeInboxBlockRegistered() ) {
            return false;
        }

        return has_block( self::NATIVE_BLOCK, $content );
    }

    private static function nativeInboxBlockRegistered() {
        if ( ! class_exists( 'WP_Block_Type_Registry' ) ) {
            return false;
        }

        $registry = \WP_Block_Type_Registry::get_instance();
        return is_object( $registry ) && method_exists( $registry, 'is_registered' ) && $registry->is_registered( self::NATIVE_BLOCK );
    }

    private static function assetVersion( $absolute_path ) {
        if ( ! is_string( $absolute_path ) || '' === $absolute_path || ! is_file( $absolute_path ) || ! is_readable( $absolute_path ) ) {
            return false;
        }

        if ( function_exists( 'hash_file' ) ) {
            $hash = hash_file( 'sha256', $absolute_path );
            if ( is_string( $hash ) && '' !== $hash ) {
                return substr( $hash, 0, 16 );
            }
        }

        $modified = filemtime( $absolute_path );
        return false === $modified ? false : (string) $modified;
    }

    /**
     * Preserve the existing explicit SRWF Inbox activation/fallback contract.
     * The model is now an activation/readiness boundary only; it is not used to
     * manufacture Grid columns, cells or values.
     */
    private static function model() {
        if ( self::$model_loaded ) {
            return self::$model;
        }

        self::$model_loaded = true;

        try {
            $visual = new VisualPackageLifecycle(
                new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME )
            );
            $activation = $visual->resolve( self::SURFACE );
            if ( null === $activation ) {
                RuntimeDiagnostics::recordOnce(
                    self::SURFACE,
                    'INBOX_PROFILE_RESOLUTION',
                    RuntimeDecisionTrace::RESULT_NOT_APPLICABLE,
                    'profile_not_active',
                    'native_gravity_flow_inbox'
                );
                return null;
            }

            $profile = $visual->effectiveProfile( self::SURFACE );
            $package = self::activeVisualPackage( $visual->snapshot(), $activation );
            if ( null === $profile || null === $package ) {
                RuntimeDiagnostics::recordOnce(
                    self::SURFACE,
                    'INBOX_PROFILE_RESOLUTION',
                    RuntimeDecisionTrace::RESULT_FAIL,
                    'profile_resolution_unavailable',
                    'native_gravity_flow_inbox'
                );
                return null;
            }

            $bindings = new BindingSetLifecycle(
                new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
                new EvidenceReferenceGate( array() )
            );
            $active_binding_sets = self::activeBindingSets( $bindings->snapshot() );

            self::$model = new InboxPresentationModel(
                $profile,
                $active_binding_sets,
                $package['semantic_slots']
            );
            RuntimeDiagnostics::recordOnce(
                self::SURFACE,
                'INBOX_PROFILE_RESOLUTION',
                RuntimeDecisionTrace::RESULT_PASS
            );
        } catch ( \Throwable $exception ) {
            RuntimeDiagnostics::recordException(
                self::SURFACE,
                'INBOX_PROFILE_RESOLUTION',
                'runtime_exception',
                'native_gravity_flow_inbox',
                $exception
            );
            self::$model = null;
        }

        return self::$model;
    }

    private static function activeVisualPackage( $snapshot, $activation ) {
        if ( ! is_array( $snapshot ) || ! is_array( $activation ) ) {
            return null;
        }
        if ( ! isset( $activation['package_id'], $activation['package_version'], $activation['profile_id'] ) ) {
            return null;
        }

        $id = $activation['package_id'];
        $version = $activation['package_version'];
        if ( empty( $snapshot['installed'][ $id ][ $version ]['artifact'] ) ) {
            return null;
        }

        $package = $snapshot['installed'][ $id ][ $version ]['artifact'];
        if ( empty( $package['semantic_slots'] ) || ! is_array( $package['semantic_slots'] ) ) {
            return null;
        }

        return $package;
    }

    private static function activeBindingSets( $snapshot ) {
        if ( ! is_array( $snapshot ) || empty( $snapshot['installed'] ) || empty( $snapshot['activations'] ) ) {
            return array();
        }

        $active = array();
        foreach ( $snapshot['activations'] as $context_key => $identity ) {
            if ( ! isset( $identity['binding_set_id'], $identity['binding_set_version'] ) ) {
                continue;
            }

            $id = $identity['binding_set_id'];
            $version = $identity['binding_set_version'];
            if ( ! isset( $snapshot['installed'][ $id ][ $version ] ) ) {
                continue;
            }

            $record = $snapshot['installed'][ $id ][ $version ];
            if ( ! isset( $record['context_key'], $record['artifact'] ) || $record['context_key'] !== $context_key ) {
                continue;
            }

            $active[] = $record['artifact'];
        }

        return $active;
    }
}
