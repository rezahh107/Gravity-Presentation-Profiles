<?php
/**
 * Disposable, read-only runtime observations for the pinned WU21 CI host.
 * Never installed in production and never changes a query, identity, or permission.
 */
if ( ! defined( 'ABSPATH' ) || getenv( 'WU21_BASE_URL' ) !== 'http://127.0.0.1:8080' ) {
    return;
}
function ciq_native_search_trace( $event, $value = null ) {
    $dir = getenv( 'WU21_ARTIFACT_DIR' );
    if ( ! $dir || ! is_dir( $dir ) ) {
        return;
    }
    $uri = $_SERVER['REQUEST_URI'] ?? 'WP_CLI';
    $snapshot = array( 'event' => $event, 'uri' => parse_url( $uri, PHP_URL_PATH ),
        'method' => $_SERVER['REQUEST_METHOD'] ?? 'CLI', 'user_id' => get_current_user_id(),
        'time' => gmdate( 'c' ) );
    if ( is_array( $value ) ) {
        $snapshot['keys'] = array_keys( $value );
        foreach ( array( 'search', 'search_criteria', 'field_filters', 'paging', 'offset',
            'page_size', 'form_id', 'filter_key', 'user_id' ) as $key ) {
            if ( array_key_exists( $key, $value ) ) {
                $json = wp_json_encode( $value[ $key ], JSON_UNESCAPED_UNICODE );
                $snapshot[ $key ] = substr( (string) $json, 0, 600 );
            }
        }
    } elseif ( is_scalar( $value ) ) {
        $snapshot['value'] = substr( (string) $value, 0, 160 );
    } else {
        $snapshot['value_type'] = get_debug_type( $value );
    }
    file_put_contents( $dir . '/native-search-server-trace.ndjson',
        wp_json_encode( $snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) . "\n",
        FILE_APPEND | LOCK_EX );
}
add_action( 'init', static function () {
    $uri = $_SERVER['REQUEST_URI'] ?? '';
    if ( str_contains( $uri, 'gravityflow' ) || str_contains( $uri, '/wp-json/' ) ) {
        ciq_native_search_trace( 'http_request', array( 'query_keys' => array_keys( $_GET ),
            'post_keys' => array_keys( $_POST ) ) );
    }
}, 999 );
foreach ( array( 'gravityflow_inbox_search_criteria', 'gravityflow_inbox_paging',
    'gravityflow_inbox_sorting', 'gravityflow_inbox_args', 'gravityflow_inbox_filter' ) as $hook ) {
    add_filter( $hook, static function ( $value, ...$rest ) use ( $hook ) {
        ciq_native_search_trace( $hook, $value );
        return $value;
    }, 999, 10 );
}
add_filter( 'rest_request_before_callbacks', static function ( $response, $handler, $request ) {
    if ( str_contains( $request->get_route(), 'gravityflow' ) ) {
        ciq_native_search_trace( 'rest_route', array( 'route' => $request->get_route(),
            'method' => $request->get_method(), 'params' => array_keys( $request->get_params() ) ) );
    }
    return $response;
}, 999, 3 );
