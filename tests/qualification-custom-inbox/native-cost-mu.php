<?php
/**
 * Isolated WU21, read-only request metering for authentic Native and Inbox 2.
 * No request values, tokens, user identifiers, task contents, or SQL are logged.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }
$ciq_cost_started = microtime( true );
register_shutdown_function( static function () use ( $ciq_cost_started ) {
    $path = parse_url( (string) ( $_SERVER['REQUEST_URI'] ?? '' ), PHP_URL_PATH );
    $kind = null;
    if ( '/wp-json/gravityflow/internal/inbox/changes' === $path ) {
        $kind = 'native_delta';
    } elseif ( '/wp-admin/admin-ajax.php' === $path && 'ciq2_read' === ( $_POST['action'] ?? '' ) ) {
        $kind = 'inbox2_delta';
    } elseif ( '/wp-admin/admin.php' === $path && 'gravityflow-inbox' === ( $_GET['page'] ?? '' ) ) {
        $kind = 'native_initial';
    } elseif ( function_exists( 'is_page' ) && is_page( (int) get_option( 'ciq2_page_id' ) ) ) {
        $kind = 'inbox2_initial';
    }
    if ( null === $kind ) { return; }
    $dir = getenv( 'WU21_ARTIFACT_DIR' );
    if ( ! is_string( $dir ) || ! is_dir( $dir ) ) { return; }
    $record = array(
        'kind' => $kind,
        'timestamp_ms' => round( microtime( true ) * 1000 ),
        'elapsed_since_mu_ms' => round( ( microtime( true ) - $ciq_cost_started ) * 1000, 2 ),
        'elapsed_since_request_ms' => isset( $_SERVER['REQUEST_TIME_FLOAT'] )
            ? round( ( microtime( true ) - (float) $_SERVER['REQUEST_TIME_FLOAT'] ) * 1000, 2 ) : null,
        'db_queries' => function_exists( 'get_num_queries' ) ? get_num_queries() : null,
        'http_status' => http_response_code(),
        'php_peak_bytes' => memory_get_peak_usage( true ),
    );
    file_put_contents( $dir . '/ciq2-native-cost-server.ndjson',
        wp_json_encode( $record, JSON_UNESCAPED_SLASHES ) . "\n", FILE_APPEND | LOCK_EX );
} );
