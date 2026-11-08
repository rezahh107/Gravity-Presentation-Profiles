<?php
/**
 * Disposable, two-task FIFO semantics counterexample in authentic Gravity Flow.
 * The hypothesis tested: entry creation order differs from actionable-step
 * eligibility order when an older entry re-enters an Officer step later.
 * This does NOT decide which ordering Owner has approved.
 */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }

$f = get_option( 'cellq_fixture', array() );
if ( empty( $f['form_id'] ) || empty( $f['officer'] ) || empty( $f['admin'] )
    || empty( $f['next_step'] ) || empty( $f['step_id'] ) ) {
    throw new RuntimeException( 'Synthetic Gravity Flow fixture unavailable' );
}
$created = array();
$report = array(
    'head' => getenv( 'GPP_WU21_REPOSITORY_SHA' ),
    'status' => 'RUNNING',
    'type' => 'FIFO_SEMANTIC_COUNTEREXAMPLE_NOT_PRODUCT_DECISION',
    'checks' => array(),
);
$path = getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-fifo-counterexample.json';
$save = static function () use ( &$report, $path ) {
    file_put_contents( $path, wp_json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
};
$ok = static function ( $condition, $name ) use ( &$report, $save ) {
    if ( ! $condition ) { throw new RuntimeException( $name ); }
    $report['checks'][] = $name;
    $save();
};
$scope = array( 'form_id' => (int) $f['form_id'] );
$ordered = static function () use ( $scope ) {
    $rows = ciq2_snapshot_rows( $scope );
    if ( is_wp_error( $rows ) ) { throw new RuntimeException( $rows->get_error_code() ); }
    return $rows;
};
try {
    wp_set_current_user( (int) $f['officer'] );
    $baseline = $ordered();
    $baseline_ids = array_map( 'intval', array_column( $baseline, 'id' ) );
    $report['host_api_available'] = method_exists( 'Gravity_Flow_API', 'get_inbox_entries' );
    $report['host_inbox_default_sorting'] = Gravity_Flow_Inbox::get_defaults()['sorting'] ?? null;

    $flow = new Gravity_Flow_API( (int) $f['form_id'] );
    wp_set_current_user( (int) $f['admin'] );
    $new = static function ( $token ) use ( $f, $flow, &$created ) {
        $id = GFAPI::add_entry( array(
            'form_id' => (int) $f['form_id'],
            'created_by' => (int) $f['admin'],
            '1' => $token, '2' => 'Synthetic',
            '4' => 'FIFO-SYNTH-' . $token, '5' => 'grade_code_10',
            '6' => 'school_code_A',
        ) );
        if ( is_wp_error( $id ) || (int) $id < 1 ) {
            throw new RuntimeException( 'cannot_create_synthetic_entry' );
        }
        $created[] = (int) $id;
        $r = $flow->process_workflow( (int) $id );
        if ( is_wp_error( $r ) || false === $r ) {
            throw new RuntimeException( 'cannot_start_synthetic_workflow' );
        }
        return (int) $id;
    };

    $older = $new( 'OLDER_ENTRY' );
    // Make dates observably distinct instead of depending on an entry-ID tie break.
    sleep( 2 );
    $newer = $new( 'NEWER_ENTRY' );
    $older_date = (string) GFAPI::get_entry( $older )['date_created'];
    $newer_date = (string) GFAPI::get_entry( $newer )['date_created'];
    $ok( strcmp( $older_date, $newer_date ) < 0 && $older < $newer,
        'older_entry_date_precedes_newer_entry' );

    wp_set_current_user( (int) $f['officer'] );
    $initial = $ordered();
    $initial_ids = array_map( 'intval', array_column( $initial, 'id' ) );
    $ok( in_array( $older, $initial_ids, true ) && in_array( $newer, $initial_ids, true ),
        'both_entries_initially_in_officer_queue' );

    wp_set_current_user( (int) $f['admin'] );
    $older_entry = GFAPI::get_entry( $older );
    $r = $flow->send_to_step( $older_entry, (int) $f['next_step'] );
    $ok( ! is_wp_error( $r ) && false !== $r, 'older_entry_removed_from_officer_step' );
    wp_set_current_user( (int) $f['officer'] );
    $middle = $ordered();
    $middle_ids = array_map( 'intval', array_column( $middle, 'id' ) );
    $ok( ! in_array( $older, $middle_ids, true ) && in_array( $newer, $middle_ids, true ),
        'newer_task_stays_actionable_while_older_is_not' );

    // Create a distinct Officer actionable approval step; now the older *entry*
    // becomes eligible later than the newer entry already pending in Step 1.
    wp_set_current_user( (int) $f['admin'] );
    $late_step = $flow->add_step( array(
        'step_name' => 'FIFO late-entry Officer approval synthetic',
        'step_type' => 'approval', 'type' => 'select',
        'assignees' => array( 'user_id|' . (int) $f['officer'] ),
        'assignee_policy' => 'all',
    ) );
    $ok( ! is_wp_error( $late_step ) && (int) $late_step > 0,
        'distinct_late_officer_step_exists' );
    $r = $flow->send_to_step( GFAPI::get_entry( $older ), (int) $late_step );
    $ok( ! is_wp_error( $r ) && false !== $r,
        'older_entry_new_actionable_step_arrives_after_newer_task' );

    wp_set_current_user( (int) $f['officer'] );
    $final = $ordered();
    $final_ids = array_map( 'intval', array_column( $final, 'id' ) );
    $older_position = array_search( $older, $final_ids, true );
    $newer_position = array_search( $newer, $final_ids, true );
    $ok( false !== $older_position && false !== $newer_position,
        'both_entries_actionable_again_after_late_reassignment' );
    $ok( $older_position < $newer_position,
        'current_inbox2_uses_entry_age_not_new_actionable_step_age' );

    $older_task = $final[ $older_position ];
    $newer_task = $final[ $newer_position ];
    $report['observed'] = array(
        'older_id' => $older,
        'newer_id' => $newer,
        'older_entry_created' => $older_date,
        'newer_entry_created' => $newer_date,
        'first_step' => (int) $f['step_id'],
        'late_step' => (int) $late_step,
        'initial_authorized_ids' => $initial_ids,
        'middle_authorized_ids' => $middle_ids,
        'after_authorized_ids' => $final_ids,
        'older_index' => $older_position,
        'newer_index' => $newer_position,
        'older_current_step' => (int) $older_task['step_id'],
        'newer_current_step' => (int) $newer_task['step_id'],
        'candidate_order_basis' => 'date_created_then_id',
        'host_task_keys' => array_keys( cellq_model()->get_inbox_tasks(
            cellq_args( $scope, 0, 1 ) )[0] ?? array() ),
    );
    $ok( (int) $older_task['step_id'] === (int) $late_step
        && (int) $newer_task['step_id'] === (int) $f['step_id'],
        'host_confirms_distinct_current_workflow_steps' );
    $report['status'] = 'PASS_SEMANTIC_COUNTEREXAMPLE';
    $save();
    echo "CIQ2_FIFO_COUNTEREXAMPLE_PASS\n";
} catch ( Throwable $e ) {
    $report['status'] = 'FAIL'; $report['error'] = $e->getMessage(); $save();
    throw $e;
} finally {
    wp_set_current_user( (int) $f['admin'] );
    foreach ( $created as $id ) {
        $res = GFAPI::delete_entry( $id );
        if ( is_wp_error( $res ) ) {
            $report['cleanup_error'][] = array( 'synthetic_id' => $id, 'reason' => $res->get_error_code() );
        }
    }
    $report['cleanup_synthetic_entries_attempted'] = count( $created );
    $save();
}
