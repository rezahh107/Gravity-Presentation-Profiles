<?php
/**
 * WU09 evidence-only candidate lifecycle shim.
 *
 * This file is copied into the disposable WU18 mu-plugins directory only.
 * It replaces the base Entry Detail asset callbacks for qualification requests;
 * production source and shipped behavior remain unchanged.
 */

use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

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

function gpp_wu09_entry_model_active() {
    if ( ! class_exists( EntryDetailPresentationAdapter::class ) ) {
        return false;
    }

    try {
        $reflection = new ReflectionClass( EntryDetailPresentationAdapter::class );
        $method = $reflection->getMethod( 'model' );
        $method->setAccessible( true );
        return null !== $method->invoke( null );
    } catch ( Throwable $exception ) {
        return false;
    }
}

function gpp_wu09_asset_version( $relative_path ) {
    if ( ! defined( 'GPP_PLUGIN_FILE' ) || ! function_exists( 'hash_file' ) ) {
        return false;
    }
    $absolute = dirname( GPP_PLUGIN_FILE ) . '/' . ltrim( $relative_path, '/' );
    if ( ! is_file( $absolute ) || ! is_readable( $absolute ) ) {
        return false;
    }
    $hash = hash_file( 'sha256', $absolute );
    return is_string( $hash ) && '' !== $hash ? substr( $hash, 0, 16 ) : false;
}

function gpp_wu09_enqueue_base_css() {
    if ( ! gpp_wu09_entry_request_reachable() || ! gpp_wu09_entry_model_active()
        || ! defined( 'GPP_PLUGIN_FILE' ) || ! function_exists( 'wp_enqueue_style' ) ) {
        return;
    }

    $path = 'assets/css/srwf-gravity-flow-entry-detail.css';
    wp_enqueue_style(
        EntryDetailPresentationAdapter::STYLE_HANDLE,
        plugins_url( $path, GPP_PLUGIN_FILE ),
        array(),
        gpp_wu09_asset_version( $path )
    );

    $js_mode = isset( $_GET['gpp_wu09_js_mode'] ) && is_string( $_GET['gpp_wu09_js_mode'] )
        ? sanitize_key( wp_unslash( $_GET['gpp_wu09_js_mode'] ) )
        : '';
    if ( 'early' === $js_mode && function_exists( 'wp_enqueue_script' ) ) {
        $script_path = 'assets/js/srwf-gravity-flow-entry-detail.js';
        wp_enqueue_script(
            EntryDetailPresentationAdapter::SCRIPT_HANDLE,
            plugins_url( $script_path, GPP_PLUGIN_FILE ),
            array(),
            gpp_wu09_asset_version( $script_path ),
            true
        );
    }
}

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
        || ! defined( 'GPP_PLUGIN_FILE' ) || ! function_exists( 'wp_enqueue_script' ) ) {
        return;
    }

    $js_mode = isset( $_GET['gpp_wu09_js_mode'] ) && is_string( $_GET['gpp_wu09_js_mode'] )
        ? sanitize_key( wp_unslash( $_GET['gpp_wu09_js_mode'] ) )
        : '';

    $footer_before = function_exists( 'did_action' ) ? did_action( 'wp_print_footer_scripts' ) : null;
    $wp_footer_before = function_exists( 'did_action' ) ? did_action( 'wp_footer' ) : null;
    $admin_footer_before = function_exists( 'did_action' ) ? did_action( 'admin_print_footer_scripts' ) : null;

    if ( 'early' !== $js_mode ) {
        $script_path = 'assets/js/srwf-gravity-flow-entry-detail.js';
        wp_enqueue_script(
            EntryDetailPresentationAdapter::SCRIPT_HANDLE,
            plugins_url( $script_path, GPP_PLUGIN_FILE ),
            array(),
            gpp_wu09_asset_version( $script_path ),
            true
        );
    }

    $event = array(
        'request_uri' => isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '',
        'is_admin' => function_exists( 'is_admin' ) ? (bool) is_admin() : null,
        'mode' => '' === $js_mode ? 'post_admission' : $js_mode,
        'marker_admitted' => true,
        'script_enqueued_after' => function_exists( 'wp_script_is' )
            ? (bool) wp_script_is( EntryDetailPresentationAdapter::SCRIPT_HANDLE, 'enqueued' )
            : null,
        'wp_print_footer_scripts_before' => $footer_before,
        'wp_footer_before' => $wp_footer_before,
        'admin_print_footer_scripts_before' => $admin_footer_before,
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

function gpp_wu09_install_asset_candidate() {
    if ( ! class_exists( EntryDetailPresentationAdapter::class ) ) {
        return;
    }

    remove_action( 'admin_enqueue_scripts', array( EntryDetailPresentationAdapter::class, 'enqueueAssets' ), 20 );
    remove_action( 'wp_enqueue_scripts', array( EntryDetailPresentationAdapter::class, 'enqueueAssets' ), 20 );

    add_action( 'admin_enqueue_scripts', 'gpp_wu09_enqueue_base_css', 19 );
    add_action( 'wp_enqueue_scripts', 'gpp_wu09_enqueue_base_css', 19 );
    add_action( 'gravityflow_entry_detail_content_before', 'gpp_wu09_candidate_capture_dossier_start', 19, 2 );
    add_action( 'gravityflow_entry_detail_content_before', 'gpp_wu09_candidate_capture_dossier_finish', 21, 2 );
}

add_action( 'gform_loaded', 'gpp_wu09_install_asset_candidate', 50 );
