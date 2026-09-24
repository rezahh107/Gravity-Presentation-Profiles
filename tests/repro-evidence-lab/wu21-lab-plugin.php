<?php
/**
 * WU21 diagnostics-only MU plugin.
 *
 * PR4 provisions and renders Inbox semantics through the real GPP product path.
 * This test-only plugin therefore observes Gravity Flow's native Live Refresh
 * transport only; it does not add columns, values, bindings, profiles or task
 * behavior.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

final class GPP_WU21_Polling_Diagnostics {
    const ROUTE = '/gravityflow/internal/inbox/changes';
    const REQUEST_PATH = '/wp-json/gravityflow/internal/inbox/changes';

    private static $active = false;
    private static $wp_die_delegate = null;

    public static function boot() {
        add_filter( 'rest_pre_dispatch', array( __CLASS__, 'before_dispatch' ), 10, 3 );
        add_filter( 'rest_request_after_callbacks', array( __CLASS__, 'after_callbacks' ), 10, 3 );
        add_filter( 'wp_die_handler', array( __CLASS__, 'filter_wp_die_handler' ), 999, 1 );
        register_shutdown_function( array( __CLASS__, 'shutdown' ) );
    }

    public static function filter_wp_die_handler( $handler ) {
        if ( ! self::is_polling_request_uri() ) {
            return $handler;
        }
        self::$wp_die_delegate = $handler;
        return array( __CLASS__, 'handle_wp_die' );
    }

    public static function handle_wp_die( $message, $title = '', $args = array() ) {
        $template = get_option( 'template' );
        $stylesheet = get_option( 'stylesheet' );
        $template_path = WP_CONTENT_DIR . '/themes/' . $template;
        $stylesheet_path = WP_CONTENT_DIR . '/themes/' . $stylesheet;
        $trace = array();
        foreach ( debug_backtrace( DEBUG_BACKTRACE_IGNORE_ARGS, 40 ) as $frame ) {
            $trace[] = array(
                'file' => isset( $frame['file'] ) ? $frame['file'] : null,
                'line' => isset( $frame['line'] ) ? $frame['line'] : null,
                'function' => isset( $frame['function'] ) ? $frame['function'] : null,
                'class' => isset( $frame['class'] ) ? $frame['class'] : null,
                'type' => isset( $frame['type'] ) ? $frame['type'] : null,
            );
        }

        self::write_event(
            array(
                'event' => 'wp_die_polling_request',
                'request_uri' => isset( $_SERVER['REQUEST_URI'] ) ? $_SERVER['REQUEST_URI'] : null,
                'message' => self::bounded_value( $message ),
                'title' => self::bounded_value( $title ),
                'template_option' => $template,
                'stylesheet_option' => $stylesheet,
                'template_path' => $template_path,
                'template_path_exists' => is_dir( $template_path ),
                'stylesheet_path' => $stylesheet_path,
                'stylesheet_path_exists' => is_dir( $stylesheet_path ),
                'trace' => $trace,
            )
        );

        $delegate = self::$wp_die_delegate;
        if ( ! is_callable( $delegate ) || array( __CLASS__, 'handle_wp_die' ) === $delegate ) {
            $delegate = '_default_wp_die_handler';
        }
        return call_user_func( $delegate, $message, $title, $args );
    }

    public static function before_dispatch( $result, $server, $request ) {
        if ( ! $request instanceof WP_REST_Request || self::ROUTE !== $request->get_route() ) {
            return $result;
        }

        self::$active = true;
        $token = $request->get_param( 'gflow_access_token' );
        $decoded = false;
        if ( is_string( $token ) && '' !== $token && function_exists( 'gravity_flow' ) ) {
            $decoded = gravity_flow()->decode_access_token( $token );
        }

        $search_args = $request->get_param( 'search_args' );
        if ( is_string( $search_args ) ) {
            $decoded_search_args = json_decode( $search_args, true );
            if ( is_array( $decoded_search_args ) ) {
                $search_args = $decoded_search_args;
            }
        }

        self::write_event(
            array(
                'event' => 'rest_pre_dispatch',
                'route' => $request->get_route(),
                'method' => $request->get_method(),
                'current_user_id' => get_current_user_id(),
                'is_user_logged_in' => is_user_logged_in(),
                'token_present' => is_string( $token ) && '' !== $token,
                'token_sha256' => is_string( $token ) && '' !== $token ? hash( 'sha256', $token ) : null,
                'token_subject' => is_array( $decoded ) && isset( $decoded['sub'] ) ? sanitize_text_field( $decoded['sub'] ) : null,
                'current_ids' => $request->get_param( 'current_ids' ),
                'search_args' => $search_args,
            )
        );

        return $result;
    }

    public static function after_callbacks( $response, $handler, $request ) {
        if ( ! $request instanceof WP_REST_Request || self::ROUTE !== $request->get_route() ) {
            return $response;
        }

        $normalized = is_wp_error( $response ) ? rest_convert_error_to_response( $response ) : rest_ensure_response( $response );
        self::write_event(
            array(
                'event' => 'rest_request_after_callbacks',
                'route' => $request->get_route(),
                'status' => $normalized instanceof WP_REST_Response ? $normalized->get_status() : null,
                'response_data' => self::bounded_value( $normalized instanceof WP_REST_Response ? $normalized->get_data() : $response ),
            )
        );
        self::$active = false;

        return $response;
    }

    public static function shutdown() {
        if ( ! self::$active ) {
            return;
        }
        $error = error_get_last();
        self::write_event(
            array(
                'event' => 'shutdown_after_polling_request',
                'fatal' => is_array( $error ) ? array(
                    'type' => isset( $error['type'] ) ? $error['type'] : null,
                    'message' => isset( $error['message'] ) ? self::bounded_text( $error['message'], 12000 ) : null,
                    'file' => isset( $error['file'] ) ? $error['file'] : null,
                    'line' => isset( $error['line'] ) ? $error['line'] : null,
                ) : null,
            )
        );
    }

    private static function is_polling_request_uri() {
        return isset( $_SERVER['REQUEST_URI'] ) && false !== strpos( $_SERVER['REQUEST_URI'], self::REQUEST_PATH );
    }

    private static function bounded_value( $value ) {
        if ( is_wp_error( $value ) ) {
            return array( 'codes' => $value->get_error_codes(), 'messages' => $value->get_error_messages() );
        }
        if ( is_scalar( $value ) || null === $value ) {
            return self::bounded_text( $value, 4000 );
        }
        return self::bounded_text( wp_json_encode( $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ), 8000 );
    }

    private static function bounded_text( $value, $limit ) {
        $text = (string) $value;
        return strlen( $text ) > $limit ? substr( $text, 0, $limit ) . '…' : $text;
    }

    private static function write_event( $event ) {
        $artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
        if ( ! $artifact_dir ) {
            return;
        }
        $event['observed_at_utc'] = gmdate( 'c' );
        file_put_contents(
            trailingslashit( $artifact_dir ) . 'polling-server-events.jsonl',
            wp_json_encode( $event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n",
            FILE_APPEND
        );
    }
}

add_action( 'plugins_loaded', array( 'GPP_WU21_Polling_Diagnostics', 'boot' ), 31 );

/**
 * Render an existing synthetic Inbox fixture through a real Elementor shortcode
 * widget without copying its Gravity Flow behavior into the host fixture.
 */
function gpp_wu21_elementor_inbox_content( $attributes ) {
    $attributes = shortcode_atts( array( 'page_id' => 0 ), $attributes, 'gpp_wu21_elementor_inbox' );
    $page_id    = absint( $attributes['page_id'] );
    $content    = $page_id ? get_post_field( 'post_content', $page_id ) : '';
    if ( ! $content ) {
        return '';
    }
    return do_shortcode( do_blocks( $content ) );
}
add_shortcode( 'gpp_wu21_elementor_inbox', 'gpp_wu21_elementor_inbox_content' );
