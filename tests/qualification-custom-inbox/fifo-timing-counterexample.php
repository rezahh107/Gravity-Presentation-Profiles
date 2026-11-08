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
$late_step = null;
$steps_before = null;
$steps_after_addition = null;
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
// Read the complete authoritative form-step inventory. Recreate API to avoid
// trusting previously loaded step objects after a definition mutation.
$inventory = static function () use ( $f ) {
    $api = new Gravity_Flow_API( (int) $f['form_id'] );
    $steps = $api->get_steps();
    if ( ! is_array( $steps ) ) {
        throw new RuntimeException( 'step_inventory_not_readable' );
    }
    $rows = array();
    foreach ( $steps as $step ) {
        if ( ! is_object( $step ) || ! method_exists( $step, 'get_id' ) ) {
            throw new RuntimeException( 'step_inventory_invalid_object' );
        }
        $id = (int) $step->get_id();
        if ( $id < 1 || isset( $rows[ $id ] ) ) {
            throw new RuntimeException( 'step_inventory_duplicate_or_invalid_id' );
        }
        $rows[ $id ] = array( 'id' => $id, 'class' => get_class( $step ) );
    }
    ksort( $rows, SORT_NUMERIC );
    return array_values( $rows );
};
$step_ids = static function ( $inventory ) {
    return array_map( 'intval', array_column( $inventory, 'id' ) );
};

try {
    wp_set_current_user( (int) $f['admin'] );
    $steps_before = $inventory();
    $report['step_inventory_before'] = $steps_before;
    $ok( in_array( (int) $f['step_id'], $step_ids( $steps_before ), true )
        && in_array( (int) $f['next_step'], $step_ids( $steps_before ), true ),
        'initial_complete_workflow_inventory_has_native_fixture_steps' );
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
    $steps_after_addition = $inventory();
    $report['step_inventory_after_addition'] = $steps_after_addition;
    $difference = array_values( array_diff( $step_ids( $steps_after_addition ), $step_ids( $steps_before ) ) );
    $ok( $difference === array( (int) $late_step ) &&
        count( $steps_after_addition ) === count( $steps_before ) + 1,
        'new_step_is_the_only_workflow_definition_change' );
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
    $cleanup_verified = true;
    $report['entry_teardown'] = array();
    foreach ( $created as $id ) {
        $res = GFAPI::delete_entry( $id );
        // A successful API return is insufficient: verify actual GF Entry absence.
        $readback = GFAPI::get_entry( $id );
        $deleted = true === $res;
        $absent = is_wp_error( $readback ) && 'not_found' === $readback->get_error_code();
        $report['entry_teardown'][] = array(
            'id' => (int) $id, 'delete_returned_true' => $deleted,
            'readback_absent' => $absent,
            'readback_error' => is_wp_error( $readback ) ? $readback->get_error_code() : null,
        );
        $cleanup_verified = $cleanup_verified && $deleted && $absent;
    }
    $report['cleanup_synthetic_entries_attempted'] = count( $created );
    $report['cleanup_entries_verified'] = $cleanup_verified;
    try {
        $after = $inventory();
        $report['step_inventory_after_teardown'] = $after;
        if ( null !== $steps_before && null !== $steps_after_addition ) {
            $after_ids = $step_ids( $after );
            $original_ids = $step_ids( $steps_before );
            $added_ids = $step_ids( $steps_after_addition );
            if ( $after_ids === $original_ids ) {
                $report['workflow_teardown'] = 'ORIGINAL_STEP_INVENTORY_RESTORED';
            } elseif ( $after_ids === $added_ids && in_array( (int) $late_step, $after_ids, true ) ) {
                // Explicit non-restoration. GitHub Actions must destroy this
                // scenario's private DB and runner before any other test group.
                $report['workflow_teardown'] = 'RESIDUAL_STEP_DISPOSE_WITH_SCENARIO';
                $report['residual_step_id'] = (int) $late_step;
            } else {
                throw new RuntimeException( 'unexpected_workflow_step_inventory_after_teardown' );
            }
        } else {
            $report['workflow_teardown'] = 'INCOMPLETE_STEP_INVENTORY_DISPOSAL_REQUIRED';
        }
    } catch ( Throwable $inventory_error ) {
        $report['workflow_teardown'] = 'UNVERIFIED_DISPOSAL_REQUIRED';
        $report['inventory_error'] = $inventory_error->getMessage();
        $cleanup_verified = false;
    }
    $report['cleanup_verified'] = $cleanup_verified &&
        in_array( $report['workflow_teardown'], array(
            'ORIGINAL_STEP_INVENTORY_RESTORED',
            'RESIDUAL_STEP_DISPOSE_WITH_SCENARIO',
        ), true );
    if ( ! $report['cleanup_verified'] ) {
        $report['status'] = 'FAIL_UNVERIFIED_TEARDOWN';
    } elseif ( 'PASS_SEMANTIC_COUNTEREXAMPLE' === $report['status'] ) {
        $report['status'] = 'PASS_COUNTEREXAMPLE_WITH_VERIFIED_ENTRY_TEARDOWN';
    }
    $save();
    if ( ! $report['cleanup_verified'] ) {
        throw new RuntimeException( 'fixture_teardown_unverified' );
    }
}
