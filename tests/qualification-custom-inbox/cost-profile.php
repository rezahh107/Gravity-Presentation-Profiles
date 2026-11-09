<?php
/**
 * Disposable stage-level database/time profile for Inbox 2 reads (synthetic only).
 * Read-only: it calls the same experimental boundary functions as the MU plugin,
 * as the synthetic Officer, and records WordPress query deltas per stage.
 * Usage: CIQ2_PROFILE_WORKLOAD=<n> wp eval-file cost-profile.php
 * The headline is the full snapshot measured first in this PHP process;
 * later stage numbers are indicative because request-local host caches warm up.
 */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
$f = get_option( 'cellq_fixture', array() );
$scope = array( 'form_id' => (int) ( $f['form_id'] ?? 0 ) );
$workload = (int) getenv( 'CIQ2_PROFILE_WORKLOAD' );
$report = array( 'head' => getenv( 'GPP_WU21_REPOSITORY_SHA' ), 'workload' => $workload, 'stages' => array() );
$measure = static function ( $label, callable $fn, $flush = true ) use ( &$report ) {
    if ( $flush ) { wp_cache_flush(); }
    $q = get_num_queries();
    $t = microtime( true );
    $value = $fn();
    $report['stages'][ $label ] = array(
        'db_queries' => get_num_queries() - $q,
        'ms' => round( 1000 * ( microtime( true ) - $t ), 1 ),
        'public_pages' => count( (array) ( $GLOBALS['ciq_query_paging'] ?? array() ) ),
        'task_model_pages' => count( (array) ( $GLOBALS['cellq_task_model_paging'] ?? array() ) ),
        'result' => is_wp_error( $value ) ? 'WP_ERROR:' . $value->get_error_code()
            : ( is_array( $value ) ? 'ROWS:' . count( $value ) : ( is_string( $value ) ? 'BYTES:' . strlen( $value ) : gettype( $value ) ) ),
    );
    return $value;
};
try {
    if ( ! function_exists( 'ciq2_snapshot_rows' ) || $scope['form_id'] < 1 || $workload < 1 ) {
        throw new RuntimeException( 'profile_preconditions' );
    }
    wp_set_current_user( (int) $f['officer'] );
    $GLOBALS['ciq2_snapshot_attempts'] = array();
    $rows = $measure( 'snapshot_full', static function () use ( $scope ) { return ciq2_snapshot_rows( $scope ); }, false );
    $report['stages']['snapshot_full']['attempts'] = $GLOBALS['ciq2_snapshot_attempts'] ?? null;
    if ( ! is_array( $rows ) || count( $rows ) !== $workload ) {
        throw new RuntimeException( 'profile_snapshot_cardinality' );
    }
    $measure( 'snapshot_repeat', static function () use ( $scope ) { return ciq2_snapshot_rows( $scope ); } );
    $entries = $measure( 'public_membership_batch40', static function () use ( $scope ) { return ciq_entries( $scope, 40 ); } );
    $measure( 'public_membership_single_call', static function () use ( $scope ) { return ciq_entries( $scope, 2001 ); } );
    $measure( 'project_with_detail_fields', static function () use ( $entries ) { return ciq_project( $entries, true, true ); } );
    $measure( 'project_without_detail_fields', static function () use ( $entries ) { return ciq_project( $entries, true, false ); } );
    $measure( 'task_model_batch40', static function () use ( $scope, $workload ) {
        $all = array();
        for ( $o = 0; $o < $workload; $o += 40 ) {
            $all = array_merge( $all, cellq_model()->get_inbox_tasks( cellq_args( $scope, $o, 40 ) ) );
        }
        return $all;
    } );
    $measure( 'task_model_single_call', static function () use ( $scope ) {
        return cellq_model()->get_inbox_tasks( cellq_args( $scope, 0, 2001 ) );
    } );
    $measure( 'admission_all_rows', static function () use ( $rows ) {
        foreach ( $rows as $row ) { if ( true !== cellq_admitted_card( $row ) ) { return new WP_Error( 'admission' ); } }
        return $rows;
    } );
    $measure( 'render_html', static function () use ( $rows ) {
        $GLOBALS['ciq2_ajax_rows'] = $rows;
        $html = do_shortcode( '[ciq2_usability_inbox]' );
        unset( $GLOBALS['ciq2_ajax_rows'] );
        return $html;
    } );
    $report['peak_memory_bytes'] = memory_get_peak_usage( true );
    file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-cost-profile-' . $workload . '.json',
        wp_json_encode( $report, JSON_PRETTY_PRINT ) );
    echo 'CIQ2_COST_PROFILE ' . wp_json_encode( $report ) . "\n";
} catch ( Throwable $error ) {
    $report['error'] = $error->getMessage();
    echo 'CIQ2_COST_PROFILE_FAILED ' . wp_json_encode( $report ) . "\n";
    throw $error;
}
