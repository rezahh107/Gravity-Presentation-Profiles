<?php
/** Synthetic, actual-Flow mutation probes between Inbox 2 source reads; no vendor modifications. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
$f = get_option( 'cellq_fixture', array() );
$scope = array( 'form_id' => (int) $f['form_id'] );
$report = array( 'head' => getenv( 'GPP_WU21_REPOSITORY_SHA' ), 'status' => 'RUNNING', 'scenarios' => array() );
$save = static function () use ( &$report ) {
    file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-operational-mutations.json',
        wp_json_encode( $report, JSON_PRETTY_PRINT ) );
};
$ok = static function ( $condition, $label ) {
    if ( ! $condition ) { throw new RuntimeException( $label ); }
};
try {
    wp_set_current_user( (int) $f['officer'] );
    $baseline = ciq2_snapshot_rows( $scope );
    $ok( is_array( $baseline ) && count( $baseline ) === 501, 'baseline_before_mutations_is_501' );
    $baseline_ids = array_map( 'intval', array_column( $baseline, 'id' ) );
    sort( $baseline_ids );
    $flow = new Gravity_Flow_API( (int) $f['form_id'] );

    // Real Gravity Flow step moves injected between the two independent source
    // statements of one read (public membership, then native Task Model).
    // recovered: one transient change -> first attempt rejected, bounded retry
    //            returns the exact current host membership.
    // persistent: the set changes inside every attempt -> fail closed, no rows.
    foreach ( array( 'between_source_reads_recovered', 'persistent_instability_fails_closed' ) as $kind ) {
        wp_set_current_user( (int) $f['admin'] );
        $extra = GFAPI::add_entry( array(
            'form_id' => (int) $f['form_id'], 'created_by' => (int) $f['admin'],
            '1' => 'OP_MUTATION_' . $kind, '2' => 'Synthetic',
            '4' => 'SYNTH-MUTATION', '5' => 'grade_code_10', '6' => 'school_code_A',
        ) );
        $ok( ! is_wp_error( $extra ) && (int) $extra > 0, 'mutation_entry_creation_' . $kind );
        $done = $flow->process_workflow( (int) $extra );
        $ok( ! is_wp_error( $done ), 'mutation_entry_workflow_' . $kind );
        $move = static function ( $step_id ) use ( $f, $flow, $extra ) {
            $prior = get_current_user_id();
            wp_set_current_user( (int) $f['admin'] );
            $result = $flow->send_to_step( GFAPI::get_entry( (int) $extra ), (int) $step_id );
            wp_set_current_user( $prior );
            if ( is_wp_error( $result ) || false === $result ) {
                throw new RuntimeException( 'authentic_native_mutation_failed' );
            }
        };
        wp_set_current_user( (int) $f['officer'] );
        $attempt = 0; $injections = 0; $in_officer_queue = true; $armed = false;
        // The public read starts with an empty request-local paging ledger; the
        // first filter call after that ledger is filled belongs to the Task Model
        // side of the same attempt (header defs or task query).
        $mutate = static function ( $args ) use ( &$attempt, &$injections, &$in_officer_queue, &$armed, $kind, $move, $f ) {
            if ( empty( $GLOBALS['ciq_query_paging'] ) ) { ++$attempt; $armed = true; return $args; }
            if ( $armed && ( 1 === $attempt || 'persistent_instability_fails_closed' === $kind ) ) {
                $armed = false; ++$injections;
                $move( $in_officer_queue ? (int) $f['next_step'] : (int) $f['step_id'] );
                $in_officer_queue = ! $in_officer_queue;
            }
            return $args;
        };
        add_filter( 'gravityflow_inbox_args', $mutate, 999, 1 );
        try {
            $result = ciq2_snapshot_rows( $scope );
        } finally {
            remove_filter( 'gravityflow_inbox_args', $mutate, 999 );
        }
        $attempts = $GLOBALS['ciq2_snapshot_attempts'] ?? array();
        $ok( $injections >= 1, 'mutation_was_not_injected_' . $kind );
        $ok( 2 === count( $attempts ) && 'native_cell_task_set_changed' === $attempts[0],
            'first_attempt_detects_cross_source_change_' . $kind );
        if ( 'between_source_reads_recovered' === $kind ) {
            $ok( is_array( $result ) && 'OK' === $attempts[1], 'bounded_retry_recovers_' . $kind );
            $ids = array_map( 'intval', array_column( $result, 'id' ) );
            sort( $ids );
            // The extra left the Officer queue during attempt 1: exact baseline.
            $ok( $ids === $baseline_ids && ! $in_officer_queue, 'retry_returns_exact_current_membership_' . $kind );
        } else {
            $ok( is_wp_error( $result ) && 'native_cell_task_set_changed' === $result->get_error_code()
                && 2 === $injections, 'persistent_change_fails_closed_without_rows' );
            if ( $in_officer_queue ) { $move( (int) $f['next_step'] ); }
        }
        $report['scenarios'][ $kind ] = array(
            'attempts' => $attempts, 'injections' => $injections,
            'result' => is_wp_error( $result ) ? $result->get_error_code() : 'ROWS_' . count( $result ),
        );
        $recovered = ciq2_snapshot_rows( $scope );
        $ok( is_array( $recovered ) && count( $recovered ) === 501, 'recovery_failed_' . $kind );
        $ids = array_map( 'intval', array_column( $recovered, 'id' ) );
        sort( $ids );
        $ok( $ids === $baseline_ids, 'stable_host_membership_did_not_recover_' . $kind );
        $report['scenarios'][ $kind ]['recovery'] = 'EXACT_BASELINE_MEMBERSHIP';
    }
    $report['status'] = 'PASS_REAL_HOST_MID_SCAN_MUTATIONS'; $save();
    echo 'CIQ2_MUTATIONS_PASS ' . wp_json_encode( $report['scenarios'] ) . "\n";
} catch ( Throwable $error ) {
    $report['status'] = 'FAIL'; $report['error'] = $error->getMessage(); $save(); throw $error;
}
