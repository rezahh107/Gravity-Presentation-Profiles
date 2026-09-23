<?php
/**
 * WU09 evidence-only candidate lifecycle shim.
 *
 * This file is copied into the disposable WU18 mu-plugins directory only.
 * It does not ship as production behavior.
 */

use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailVisualVariant;

function gpp_wu09_executable_gravityflow_shortcode_reaches_entry_detail( $content ) {
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

function gpp_wu09_registered_entry_detail_block_reachable( $content ) {
    if ( ! is_string( $content ) || '' === $content || ! function_exists( 'has_block' ) || ! class_exists( 'WP_Block_Type_Registry' ) ) {
        return false;
    }

    $registry = WP_Block_Type_Registry::get_instance();
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

function gpp_wu09_frontend_entry_host_reachable() {
    if ( ! function_exists( 'is_singular' ) || ! is_singular() || ! function_exists( 'get_queried_object' ) ) {
        return false;
    }

    $object = get_queried_object();
    if ( ! is_object( $object ) || ! isset( $object->post_content ) || ! is_string( $object->post_content ) ) {
        return false;
    }

    return gpp_wu09_executable_gravityflow_shortcode_reaches_entry_detail( $object->post_content )
        || gpp_wu09_registered_entry_detail_block_reachable( $object->post_content );
}

function gpp_wu09_entry_request_reachable() {
    $view = isset( $_GET['view'] ) && is_string( $_GET['view'] ) ? sanitize_key( wp_unslash( $_GET['view'] ) ) : '';
    $lid = isset( $_GET['lid'] ) ? absint( wp_unslash( $_GET['lid'] ) ) : 0;

    if ( 'entry' !== $view || $lid < 1 ) {
        return false;
    }

    if ( function_exists( 'is_admin' ) && is_admin() ) {
        $page = isset( $_GET['page'] ) && is_string( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
        return 'gravityflow-inbox' === $page;
    }

    return gpp_wu09_frontend_entry_host_reachable();
}

function gpp_wu09_candidate_rewrite_early_assets() {
    if ( ! class_exists( EntryDetailPresentationAdapter::class ) || ! class_exists( EntryDetailVisualVariant::class ) ) {
        return;
    }

    $styles = array(
        EntryDetailPresentationAdapter::STYLE_HANDLE,
        EntryDetailVisualVariant::FULL_WIDTH_STYLE_HANDLE,
        EntryDetailVisualVariant::FULL_WIDTH_WORKFLOW_PANEL_STYLE_HANDLE,
        EntryDetailVisualVariant::FULL_WIDTH_TIMELINE_STYLE_HANDLE,
    );
    $enqueued_styles = array();
    foreach ( $styles as $style ) {
        if ( function_exists( 'wp_style_is' ) && wp_style_is( $style, 'enqueued' ) ) {
            $enqueued_styles[] = $style;
            if ( function_exists( 'wp_dequeue_style' ) ) {
                wp_dequeue_style( $style );
            }
        }
    }

    $script = EntryDetailPresentationAdapter::SCRIPT_HANDLE;
    $script_was_enqueued = function_exists( 'wp_script_is' ) && wp_script_is( $script, 'enqueued' );
    $GLOBALS['gpp_wu09_script_was_enqueued_early'] = $script_was_enqueued;
    if ( $script_was_enqueued && function_exists( 'wp_dequeue_script' ) ) {
        wp_dequeue_script( $script );
    }

    if ( ! gpp_wu09_entry_request_reachable() || ! function_exists( 'wp_enqueue_style' ) ) {
        return;
    }

    // Re-enqueue only styles production already admitted for the active visual
    // profile/variant, preserving their registered dependency graph and versions.
    foreach ( $enqueued_styles as $style ) {
        wp_enqueue_style( $style );
    }

    // Evidence-only fallback probe: test the bounded alternative without
    // changing production. The existing JS root guard must make this inert on
    // genuine Entry Detail routes that never receive server admission markers.
    $js_mode = isset( $_GET['gpp_wu09_js_mode'] ) && is_string( $_GET['gpp_wu09_js_mode'] )
        ? sanitize_key( wp_unslash( $_GET['gpp_wu09_js_mode'] ) )
        : '';
    if ( 'early' === $js_mode && $script_was_enqueued && function_exists( 'wp_enqueue_script' ) ) {
        wp_enqueue_script( $script );
    }
}

add_action( 'admin_enqueue_scripts', 'gpp_wu09_candidate_rewrite_early_assets', 1000 );
add_action( 'wp_enqueue_scripts', 'gpp_wu09_candidate_rewrite_early_assets', 1000 );

function gpp_wu09_candidate_capture_dossier_start( $form, $entry ) {
    unset( $form, $entry );
    if ( ! gpp_wu09_entry_request_reachable() ) {
        return;
    }
    $GLOBALS['gpp_wu09_capture_level'] = ob_get_level();
    $GLOBALS['gpp_wu09_capture_active'] = ob_start();
}

function gpp_wu09_candidate_capture_dossier_finish( $form, $entry ) {
    unset( $form, $entry );
    if ( empty( $GLOBALS['gpp_wu09_capture_active'] ) ) {
        return;
    }

    $expected_level = isset( $GLOBALS['gpp_wu09_capture_level'] ) ? (int) $GLOBALS['gpp_wu09_capture_level'] : -1;
    if ( ob_get_level() <= $expected_level ) {
        $GLOBALS['gpp_wu09_capture_active'] = false;
        return;
    }

    $html = ob_get_clean();
    $GLOBALS['gpp_wu09_capture_active'] = false;
    echo $html;

    if ( ! is_string( $html )
        || false === strpos( $html, 'class="gpp-entry-dossier"' )
        || false === strpos( $html, 'data-gpp-entry-detail="ready"' )
        || false === strpos( $html, 'data-gpp-review-mode="read-only"' )
        || false === strpos( $html, 'data-gpp-native-table-suppression="read-only-review"' )
        || ! class_exists( EntryDetailPresentationAdapter::class )
        || ! function_exists( 'wp_enqueue_script' ) ) {
        return;
    }

    $script = EntryDetailPresentationAdapter::SCRIPT_HANDLE;
    $js_mode = isset( $_GET['gpp_wu09_js_mode'] ) && is_string( $_GET['gpp_wu09_js_mode'] )
        ? sanitize_key( wp_unslash( $_GET['gpp_wu09_js_mode'] ) )
        : '';
    $registered_before = function_exists( 'wp_script_is' ) && wp_script_is( $script, 'registered' );
    $enqueued_before = function_exists( 'wp_script_is' ) && wp_script_is( $script, 'enqueued' );
    $footer_before = function_exists( 'did_action' ) ? did_action( 'wp_print_footer_scripts' ) : null;
    $wp_footer_before = function_exists( 'did_action' ) ? did_action( 'wp_footer' ) : null;

    // Re-enqueue the already registered production handle. WordPress remains
    // responsible for the normal footer queue and once-only script printing.
    if ( 'early' !== $js_mode ) {
        wp_enqueue_script( $script );
    }

    $event = array(
        'request_uri' => isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '',
        'is_admin' => function_exists( 'is_admin' ) ? (bool) is_admin() : null,
        'mode' => '' === $js_mode ? 'post_admission' : $js_mode,
        'marker_admitted' => true,
        'script_registered_before' => $registered_before,
        'script_enqueued_before' => $enqueued_before,
        'script_enqueued_after' => function_exists( 'wp_script_is' ) ? (bool) wp_script_is( $script, 'enqueued' ) : null,
        'wp_print_footer_scripts_before' => $footer_before,
        'wp_footer_before' => $wp_footer_before,
        'production_script_was_enqueued_early' => ! empty( $GLOBALS['gpp_wu09_script_was_enqueued_early'] ),
    );
    $artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
    if ( is_string( $artifact_dir ) && '' !== $artifact_dir ) {
        file_put_contents(
            trailingslashit( $artifact_dir ) . 'wu09-entry-asset-lifecycle.ndjson',
            wp_json_encode( $event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n",
            FILE_APPEND
        );
    }
}

add_action( 'gravityflow_entry_detail_content_before', 'gpp_wu09_candidate_capture_dossier_start', 19, 2 );
add_action( 'gravityflow_entry_detail_content_before', 'gpp_wu09_candidate_capture_dossier_finish', 21, 2 );
