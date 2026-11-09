<?php
/** Isolated synthetic 2000/2001 upper-bound and cost qualification; never install on production. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
$f = get_option( 'cellq_fixture', array() );
$scope = array( 'form_id' => (int) ( $f['form_id'] ?? 0 ) );
$report = array( 'head' => getenv( 'GPP_WU21_REPOSITORY_SHA' ), 'status' => 'RUNNING', 'checks' => array(), 'measurements' => array() );
$save = static function () use ( &$report ) {
    file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-operational-scale.json',
        wp_json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
};
$ok = static function ( $condition, $label ) use ( &$report ) {
    if ( ! $condition ) { throw new RuntimeException( $label ); }
    $report['checks'][] = $label;
};
try {
    $ok( function_exists( 'ciq2_snapshot_rows' ), 'isolated_mu_loaded' );
    wp_set_current_user( (int) $f['officer'] );
    $baseline = ciq2_snapshot_rows( $scope );
    $ok( is_array( $baseline ) && count( $baseline ) === 501, 'after_browser_501_authorized_tasks' );
    // Explicitly admit the single native step added by operational-browser.mjs
    // within this SAME scale chain. Never silently inherit unknown step changes.
    $browser_evidence = getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-operational-browser.json';
    if ( ! is_file( $browser_evidence ) ) {
        throw new RuntimeException( 'scale_previous_step_inventory_missing' );
    }
    $prior = json_decode( file_get_contents( $browser_evidence ), true );
    $previous_steps = $prior['step_inventory'] ?? null;
    $ok( ( $prior['status'] ?? null ) === 'PASS_OPERATIONAL_BROWSER'
        && is_array( $previous_steps )
        && ( $previous_steps['teardown'] ?? null ) === 'DISCARD_AFTER_SCALE_SCENARIO_ONLY',
        'scale_browser_step_mutation_record_verified' );
    $known_ids = array_map( 'intval', $previous_steps['after'] );
    $native_steps = ( new Gravity_Flow_API( (int) $f['form_id'] ) )->get_steps();
    $ok( is_array( $native_steps ), 'scale_current_workflow_inventory_available' );
    $actual_steps = array();
    foreach ( $native_steps as $step ) {
        $actual_steps[] = (int) $step->get_id();
    }
    sort( $actual_steps, SORT_NUMERIC );
    $ok( $actual_steps === $known_ids &&
        count( $actual_steps ) === count( array_unique( $actual_steps ) ),
        'scale_expected_browser_step_inventory_matches_native_host' );
    $report['step_inventory_pre_2000'] = $actual_steps;
    $report['known_scale_viewer_step'] = (int) $previous_steps['added_viewer_step_id'];

    $needed = 2000 - count( $baseline );
    $flow = new Gravity_Flow_API( (int) $f['form_id'] );
    wp_set_current_user( (int) $f['admin'] );
    $start_create = microtime( true );
    for ( $i = 0; $i < $needed; ++$i ) {
        $id = GFAPI::add_entry( array(
            'form_id' => (int) $f['form_id'], 'created_by' => (int) $f['admin'],
            '1' => 'OP_BOUND_' . $i, '2' => 'Synthetic',
            '4' => 'SYNTH-BOUND-' . $i, '5' => 'grade_code_10', '6' => 'school_code_A',
        ) );
        if ( is_wp_error( $id ) || (int) $id < 1 ) { throw new RuntimeException( 'synthetic_create_failed_' . $i ); }
        $processed = $flow->process_workflow( (int) $id );
        if ( is_wp_error( $processed ) ) { throw new RuntimeException( 'synthetic_workflow_failed_' . $i ); }
    }
    $report['measurements']['creation_ms'] = round( 1000 * ( microtime( true ) - $start_create ), 1 );
    wp_set_current_user( (int) $f['officer'] );

    // Independent native-host task-ID oracle, not merely the candidate's reported count.
    $native_ids = array();
    $start_oracle = microtime( true );
    for ( $offset = 0; $offset < 2000; $offset += 40 ) {
        $page = cellq_model()->get_inbox_tasks( cellq_args( $scope, $offset, 40 ) );
        $ok( is_array( $page ) && count( $page ) === 40, 'native_page_complete_' . $offset );
        foreach ( $page as $item ) {
            $id = (int) ( $item['id'] ?? 0 );
            $ok( $id > 0 && ! isset( $native_ids[ $id ] ), 'native_unique_' . $id );
            $native_ids[ $id ] = true;
        }
    }
    $report['measurements']['native_oracle_ms'] = round( 1000 * ( microtime( true ) - $start_oracle ), 1 );
    $ok( count( $native_ids ) === 2000, 'independent_native_host_2000_distinct_tasks' );
    $before_queries = get_num_queries();
    $start_read = microtime( true );
    $rows = ciq2_snapshot_rows( $scope );
    $report['measurements']['2000_snapshot_ms'] = round( 1000 * ( microtime( true ) - $start_read ), 1 );
    $report['measurements']['2000_snapshot_db_queries'] = get_num_queries() - $before_queries;
    $ok( is_array( $rows ), 'single_read_2000_snapshot_accepted' );
    $candidate_ids = array_map( 'intval', array_column( $rows, 'id' ) );
    $ok( count( $candidate_ids ) === 2000 && count( array_unique( $candidate_ids ) ) === 2000, 'candidate_2000_unique' );
    $actual = $candidate_ids; $expected = array_map( 'intval', array_keys( $native_ids ) );
    sort( $actual ); sort( $expected );
    $ok( $actual === $expected, 'candidate_equals_independent_native_task_id_oracle_at_2000' );
    $GLOBALS['ciq2_ajax_rows'] = $rows;
    $html = do_shortcode( '[ciq2_usability_inbox]' );
    unset( $GLOBALS['ciq2_ajax_rows'] );
    $report['measurements']['2000_json_response_bytes'] = strlen( wp_json_encode( array(
        'success' => true, 'data' => array( 'html' => $html, 'count' => count( $rows ) ),
    ) ) );
    $report['measurements']['2000_html_bytes'] = strlen( $html );
    $ok( substr_count( $html, 'data-ciq2-entry=' ) === 2000, 'rendered_html_2000_cards' );
    $report['measurements']['peak_memory_bytes'] = memory_get_peak_usage( true );

    // Cross the boundary with authentic Gravity Flow assignment: no 2000-row truncation.
    wp_set_current_user( (int) $f['admin'] );
    $extra = GFAPI::add_entry( array(
        'form_id' => (int) $f['form_id'], 'created_by' => (int) $f['admin'],
        '1' => 'OP_BOUND_OVERFLOW', '2' => 'Synthetic', '4' => 'SYNTH-OVERFLOW',
        '5' => 'grade_code_10', '6' => 'school_code_A',
    ) );
    $ok( ! is_wp_error( $extra ) && (int) $extra > 0, 'overflow_entry_created' );
    $processed = $flow->process_workflow( (int) $extra );
    $ok( ! is_wp_error( $processed ), 'overflow_host_workflow_process_ok' );
    wp_set_current_user( (int) $f['officer'] );
    $args = apply_filters( 'gravityflow_inbox_args', array_merge( Gravity_Flow_Inbox::get_defaults(), $scope,
        array( 'paging' => array( 'offset' => 0, 'page_size' => 1 ) ) ) );
    $total = 0;
    $first = Gravity_Flow_API::get_inbox_entries( $args, $total );
    $ok( is_array( $first ) && (int) $total === 2001, 'independent_host_total_2001' );
    $rejected = ciq2_snapshot_rows( $scope );
    $ok( is_wp_error( $rejected ) && 'task_set_bound_exceeded' === $rejected->get_error_code(),
        'over_bound_fails_closed_without_partial_rows' );
    $report['measurements']['peak_memory_after_overflow_bytes'] = memory_get_peak_usage( true );
    $report['status'] = 'PASS_2000_2001_BOUNDARY_AND_COST'; $save();
    echo 'CIQ2_SCALE_PASS ' . wp_json_encode( $report['measurements'] ) . "\n";
} catch ( Throwable $error ) {
    $report['status'] = 'FAIL'; $report['error'] = $error->getMessage(); $save(); throw $error;
}
