<?php
/** Experimental batch/recovery checks against synthetic authentic Flow fixture. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
require_once __DIR__ . '/cell-boundary.php';
$f = get_option( 'cellq_fixture', array() );
$report = array( 'status' => 'RUNNING', 'baseline_count' => 0, 'checks' => array(), 'measurements' => array() );
$save = static function () use ( &$report ) {
    file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-headless.json',
        wp_json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) );
};
$assert = static function ( $yes, $name ) use ( &$report ) {
    if ( ! $yes ) { throw new RuntimeException( $name ); }
    $report['checks'][] = $name;
};
try {
    $scope = array( 'form_id' => (int) $f['form_id'] );
    wp_set_current_user( (int) $f['officer'] );
    $rows = cellq_rows( $scope, true );
    $assert( is_array( $rows ) && count( $rows ) === 3, 'officer_qualified_three_rows' );
    $report['baseline_count'] = count( $rows );
    $assert( count( $GLOBALS['ciq_query_paging'] ) === 1 &&
        $GLOBALS['ciq_query_paging'][0]['page_size'] === 40, 'public_api_uses_batch_size_40' );
    $assert( count( $GLOBALS['cellq_task_model_paging'] ) === 1 &&
        $GLOBALS['cellq_task_model_paging'][0]['page_size'] === 40, 'native_task_model_uses_batch_size_40' );
    foreach ( $rows as $row ) {
        $assert( isset( $row['cells']['student_name'], $row['cells']['national_id'],
            $row['cells']['school_grade'] ) && ! empty( $row['native_url'] ),
            'qualified_native_cells_and_entry_link_' . $row['id'] );
    }
    $target = (int) $f['entries'][0];
    $deny = static function ( $allowed, $entry ) use ( $target ) {
        return (int) ( $entry['id'] ?? 0 ) === $target ? false : $allowed;
    };
    add_filter( 'gravityflow_permission_granted_entry_detail', $deny, 10, 4 );
    $filtered = cellq_rows( $scope, true );
    $unfiltered = cellq_rows( $scope, false );
    remove_filter( 'gravityflow_permission_granted_entry_detail', $deny, 10 );
    $assert( is_array( $filtered ) && count( $filtered ) === 2 &&
        ! in_array( $target, array_column( $filtered, 'id' ), true ),
        'single_denied_entry_only_omitted_from_usable_list' );
    $assert( is_wp_error( $unfiltered ), 'strict_original_denial_behavior_preserved' );

    // Exercise a true second page; afterwards delete only newly created
    // synthetic tasks to keep browser comparison legible.
    wp_set_current_user( (int) $f['admin'] );
    $api = new Gravity_Flow_API( (int) $f['form_id'] );
    $temp = array();
    try {
        for ( $i = 0; $i < 44; $i++ ) {
            $id = GFAPI::add_entry( array(
                'form_id' => (int) $f['form_id'], 'created_by' => (int) $f['admin'],
                '1' => 'حجم آزمایشی ' . $i, '2' => 'نام', '4' => 'FAKE-' . $i,
                '5' => 'grade_code_10', '6' => 'school_code_A',
            ) );
            if ( is_wp_error( $id ) ) { throw new RuntimeException( 'Cannot add synthetic bulk entry' ); }
            $temp[] = (int) $id;
            $api->process_workflow( (int) $id );
        }
        wp_set_current_user( (int) $f['officer'] );
        $before_queries = get_num_queries(); $start = microtime( true );
        $bulk = cellq_rows( $scope, true );
        $report['measurements']['forty_seven_tasks'] = array(
            'elapsed_ms' => round( ( microtime( true ) - $start ) * 1000, 1 ),
            'wordpress_db_query_delta' => get_num_queries() - $before_queries,
            'public_pages' => $GLOBALS['ciq_query_paging'],
            'task_model_pages' => $GLOBALS['cellq_task_model_paging'],
        );
        $assert( is_array( $bulk ) && count( $bulk ) === 47, 'forty_seven_authorized_tasks_complete' );
        $assert( count( $GLOBALS['ciq_query_paging'] ) === 2 &&
            $GLOBALS['ciq_query_paging'][1]['offset'] === 40, 'public_api_second_page_offset_40' );
        $assert( count( $GLOBALS['cellq_task_model_paging'] ) === 2 &&
            $GLOBALS['cellq_task_model_paging'][1]['offset'] === 40, 'task_model_second_page_offset_40' );
    } finally {
        wp_set_current_user( (int) $f['admin'] );
        foreach ( $temp as $id ) { GFAPI::delete_entry( $id ); }
    }
    wp_set_current_user( (int) $f['officer'] );
    $restored = cellq_rows( $scope, true );
    $assert( is_array( $restored ) && count( $restored ) === 3,
        'synthetic_bulk_entries_removed_for_browser' );
    wp_set_current_user( (int) $f['viewer'] );
    $viewer = cellq_rows( $scope, true );
    $assert( is_array( $viewer ) && count( $viewer ) === 0, 'unassigned_viewer_no_tasks' );
    // The browser prototype compares original native values on synthetic
    // records; final-mask behavior was separately falsified by cell-headless.
    update_option( 'cellq_mode', 'baseline', false );
    $report['status'] = 'PASS_BOUNDED_BATCH_AND_ROW_POLICY'; $save();
    echo "CIQ2_HEADLESS_PASS\n";
} catch ( Throwable $error ) {
    $report['status'] = 'FAIL'; $report['error'] = $error->getMessage(); $save(); throw $error;
}
