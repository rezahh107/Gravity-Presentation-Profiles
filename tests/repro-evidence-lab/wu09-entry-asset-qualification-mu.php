<?php
/**
 * WU09 evidence-only asset-delivery candidate.
 *
 * Loaded only in the disposable WU18 runtime. It replaces the production
 * Entry Detail asset callback so the intended CSS/JS delivery architecture can
 * be qualified without changing production PHP/CSS/JS.
 */
if ( ! defined( 'ABSPATH' ) ) {
    return;
}

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

$GLOBALS['gpp_wu09_probe'] = array(
    'id' => isset( $_GET['gpp_wu09_probe'] ) ? sanitize_key( wp_unslash( $_GET['gpp_wu09_probe'] ) ) : '',
    'candidate_reachable' => false,
    'profile_model_active' => false,
    'css_enqueued' => false,
    'post_permission_seam_reached' => false,
    'dossier_admitted' => false,
    'js_enqueued' => false,
    'footer_state_at_js_enqueue' => null,
);

function gpp_wu09_request_value( $key ) {
    return isset( $_GET[ $key ] ) ? wp_unslash( $_GET[ $key ] ) : null;
}

function gpp_wu09_frontend_host_content_reachable() {
    if ( ! function_exists( 'is_singular' ) || ! is_singular() || ! function_exists( 'get_queried_object' ) ) {
        return false;
    }

    $object = get_queried_object();
    if ( ! is_object( $object ) || ! isset( $object->post_content ) || ! is_string( $object->post_content ) ) {
        return false;
    }

    $content = $object->post_content;
    if ( function_exists( 'has_block' ) && has_block( 'gravityflow/inbox', $content ) ) {
        return true;
    }

    if ( ! function_exists( 'shortcode_exists' ) || ! shortcode_exists( 'gravityflow' )
        || ! function_exists( 'get_shortcode_regex' ) || ! function_exists( 'shortcode_parse_atts' )
        || ! function_exists( 'wp_html_split' ) ) {
        return false;
    }

    $pattern = get_shortcode_regex( array( 'gravityflow' ) );
    $tokens = wp_html_split( $content );
    if ( ! is_string( $pattern ) || '' === $pattern || ! is_array( $tokens ) ) {
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
        if ( false === $count || 0 === $count ) {
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

function gpp_wu09_candidate_entry_request() {
    $view = gpp_wu09_request_value( 'view' );
    $view = is_string( $view ) ? sanitize_key( $view ) : '';
    $form_id = absint( gpp_wu09_request_value( 'id' ) );
    $entry_id = absint( gpp_wu09_request_value( 'lid' ) );

    if ( 'entry' !== $view || $form_id < 1 || $entry_id < 1 ) {
        return false;
    }

    if ( function_exists( 'is_admin' ) && is_admin() ) {
        $page = gpp_wu09_request_value( 'page' );
        $page = is_string( $page ) ? sanitize_key( $page ) : '';
        return 'gravityflow-inbox' === $page;
    }

    return gpp_wu09_frontend_host_content_reachable();
}

function gpp_wu09_active_entry_model() {
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
    if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
        return false;
    }
    $absolute = dirname( GPP_PLUGIN_FILE ) . '/' . ltrim( $relative_path, '/' );
    if ( ! is_file( $absolute ) || ! is_readable( $absolute ) ) {
        return false;
    }
    $hash = hash_file( 'sha256', $absolute );
    return is_string( $hash ) && '' !== $hash ? substr( $hash, 0, 16 ) : false;
}

function gpp_wu09_candidate_enqueue_css() {
    $reachable = gpp_wu09_candidate_entry_request();
    $GLOBALS['gpp_wu09_probe']['candidate_reachable'] = $reachable;
    if ( ! $reachable ) {
        return;
    }

    $active = gpp_wu09_active_entry_model();
    $GLOBALS['gpp_wu09_probe']['profile_model_active'] = $active;
    if ( ! $active || ! function_exists( 'wp_enqueue_style' ) || ! defined( 'GPP_PLUGIN_FILE' ) ) {
        return;
    }

    $path = 'assets/css/srwf-gravity-flow-entry-detail.css';
    wp_enqueue_style(
        EntryDetailPresentationAdapter::STYLE_HANDLE,
        plugins_url( $path, GPP_PLUGIN_FILE ),
        array(),
        gpp_wu09_asset_version( $path )
    );
    $GLOBALS['gpp_wu09_probe']['css_enqueued'] = true;
}

function gpp_wu09_trace_has_admitted_dossier() {
    $trace = RuntimeDiagnostics::snapshot( EntryDetailPresentationAdapter::SURFACE );
    if ( ! is_array( $trace ) || empty( $trace['events'] ) || ! is_array( $trace['events'] ) ) {
        return false;
    }
    foreach ( $trace['events'] as $event ) {
        if ( isset( $event['stage'], $event['result'], $event['reason_code'] )
            && 'ENTRY_DETAIL_PRESENTATION_OUTPUT' === $event['stage']
            && 'PASS' === $event['result']
            && 'gpp_read_only_review_dossier_emitted' === $event['reason_code'] ) {
            return true;
        }
    }
    return false;
}

function gpp_wu09_candidate_enqueue_post_admission_js( $form, $entry ) {
    unset( $form, $entry );
    $GLOBALS['gpp_wu09_probe']['post_permission_seam_reached'] = true;

    if ( ! gpp_wu09_trace_has_admitted_dossier() ) {
        return;
    }
    $GLOBALS['gpp_wu09_probe']['dossier_admitted'] = true;

    if ( ! function_exists( 'wp_enqueue_script' ) || ! defined( 'GPP_PLUGIN_FILE' ) ) {
        return;
    }

    $path = 'assets/js/srwf-gravity-flow-entry-detail.js';
    wp_enqueue_script(
        EntryDetailPresentationAdapter::SCRIPT_HANDLE,
        plugins_url( $path, GPP_PLUGIN_FILE ),
        array(),
        gpp_wu09_asset_version( $path ),
        true
    );
    $GLOBALS['gpp_wu09_probe']['js_enqueued'] = true;
    $GLOBALS['gpp_wu09_probe']['footer_state_at_js_enqueue'] = array(
        'admin_print_footer_scripts' => function_exists( 'did_action' ) ? did_action( 'admin_print_footer_scripts' ) : null,
        'wp_print_footer_scripts' => function_exists( 'did_action' ) ? did_action( 'wp_print_footer_scripts' ) : null,
    );
}

function gpp_wu09_install_candidate_asset_delivery() {
    if ( empty( $GLOBALS['gpp_wu09_probe']['id'] ) || ! class_exists( EntryDetailPresentationAdapter::class ) ) {
        return;
    }

    remove_action( 'admin_enqueue_scripts', array( EntryDetailPresentationAdapter::class, 'enqueueAssets' ), 20 );
    remove_action( 'wp_enqueue_scripts', array( EntryDetailPresentationAdapter::class, 'enqueueAssets' ), 20 );

    add_action( 'admin_enqueue_scripts', 'gpp_wu09_candidate_enqueue_css', 20 );
    add_action( 'wp_enqueue_scripts', 'gpp_wu09_candidate_enqueue_css', 20 );
    add_action( 'gravityflow_entry_detail_content_before', 'gpp_wu09_candidate_enqueue_post_admission_js', 21, 2 );
}
add_action( 'gform_loaded', 'gpp_wu09_install_candidate_asset_delivery', 999 );

function gpp_wu09_write_probe() {
    $id = isset( $GLOBALS['gpp_wu09_probe']['id'] ) ? $GLOBALS['gpp_wu09_probe']['id'] : '';
    $artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
    if ( '' === $id || ! is_string( $artifact_dir ) || '' === $artifact_dir ) {
        return;
    }

    $record = $GLOBALS['gpp_wu09_probe'];
    $record['is_admin'] = function_exists( 'is_admin' ) ? is_admin() : null;
    $record['style_enqueued_at_shutdown'] = function_exists( 'wp_style_is' )
        ? wp_style_is( EntryDetailPresentationAdapter::STYLE_HANDLE, 'enqueued' )
        : null;
    $record['style_done_at_shutdown'] = function_exists( 'wp_style_is' )
        ? wp_style_is( EntryDetailPresentationAdapter::STYLE_HANDLE, 'done' )
        : null;
    $record['script_enqueued_at_shutdown'] = function_exists( 'wp_script_is' )
        ? wp_script_is( EntryDetailPresentationAdapter::SCRIPT_HANDLE, 'enqueued' )
        : null;
    $record['script_done_at_shutdown'] = function_exists( 'wp_script_is' )
        ? wp_script_is( EntryDetailPresentationAdapter::SCRIPT_HANDLE, 'done' )
        : null;

    file_put_contents(
        trailingslashit( $artifact_dir ) . 'wu09-entry-asset-request-probes.jsonl',
        wp_json_encode( $record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n",
        FILE_APPEND | LOCK_EX
    );
}
register_shutdown_function( 'gpp_wu09_write_probe' );
