<?php
/**
 * Synthetic-only scale precondition. Runs BEFORE any 500-task creation.
 * Never repairs a bad fixture. The negative-control CI job deliberately
 * denies entry permission and must receive a non-zero exit from this gate.
 */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
$f = get_option( 'cellq_fixture', array() );
$expected_scenario = (string) getenv( 'CIQ2_SCENARIO' );
$artifact = getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-scale-baseline-' . $expected_scenario . '.json';
$report = array(
    'head' => (string) getenv( 'GPP_WU21_REPOSITORY_SHA' ),
    'scenario' => $expected_scenario,
    'status' => 'RUNNING',
);
$write = static function () use ( &$report, $artifact ) {
    file_put_contents( $artifact, wp_json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
};
try {
    if ( ! in_array( $expected_scenario, array( 'scale', 'negative-baseline' ), true ) ) {
        throw new RuntimeException( 'invalid_scale_scenario' );
    }
    $marker = (string) get_option( 'ciq2_scenario_isolation_marker', '' );
    $expected_marker = getenv( 'GITHUB_RUN_ID' ) . ':' .
        getenv( 'GITHUB_RUN_ATTEMPT' ) . ':' . $expected_scenario . ':' .
        getenv( 'GPP_WU21_REPOSITORY_SHA' );
    $report['database_marker'] = $marker;
    if ( $marker !== $expected_marker ) {
        throw new RuntimeException( 'wrong_or_missing_scenario_database_marker' );
    }
    if ( empty( $f['form_id'] ) || empty( $f['officer'] ) ||
        empty( $f['step_id'] ) || empty( $f['next_step'] ) ) {
        throw new RuntimeException( 'missing_native_scale_fixture' );
    }
    wp_set_current_user( (int) $f['admin'] );
    $steps = ( new Gravity_Flow_API( (int) $f['form_id'] ) )->get_steps();
    if ( ! is_array( $steps ) ) {
        throw new RuntimeException( 'scale_step_inventory_unavailable' );
    }
    $step_ids = array();
    foreach ( $steps as $step ) {
        if ( ! is_object( $step ) || ! method_exists( $step, 'get_id' ) ) {
            throw new RuntimeException( 'scale_step_object_invalid' );
        }
        $step_ids[] = (int) $step->get_id();
    }
    sort( $step_ids, SORT_NUMERIC );
    $expected_step_ids = array( (int) $f['step_id'], (int) $f['next_step'] );
    sort( $expected_step_ids, SORT_NUMERIC );
    $report['workflow_step_ids'] = $step_ids;
    if ( $step_ids !== $expected_step_ids ) {
        throw new RuntimeException( 'scale_step_inventory_not_fresh' );
    }

    wp_set_current_user( (int) $f['officer'] );
    $rows = ciq2_snapshot_rows( array( 'form_id' => (int) $f['form_id'] ) );
    if ( is_wp_error( $rows ) || ! is_array( $rows ) ) {
        throw new RuntimeException( 'scale_baseline_unreadable' );
    }
    $ids = array_map( 'intval', array_column( $rows, 'id' ) );
    $report['officer_authorized_ids'] = $ids;
    $report['count'] = count( $ids );
    if ( count( $ids ) < 1 || count( $ids ) > 3 ) {
        throw new RuntimeException( 'scale_baseline_invalid' );
    }
    if ( count( array_unique( $ids ) ) !== count( $ids ) ) {
        throw new RuntimeException( 'scale_baseline_duplicate_entries' );
    }
    $original = array_map( 'intval', $f['entries'] ?? array() );
    if ( count( $original ) !== 3 || array_diff( $ids, $original ) ) {
        throw new RuntimeException( 'scale_baseline_contains_unexpected_entries' );
    }

    // Compare against the independent Native task model, not candidate count.
    $native = cellq_model()->get_inbox_tasks( cellq_args(
        array( 'form_id' => (int) $f['form_id'] ), 0, 40
    ) );
    if ( ! is_array( $native ) ) {
        throw new RuntimeException( 'scale_native_oracle_unreadable' );
    }
    $native_ids = array_map( 'intval', array_column( $native, 'id' ) );
    $report['native_authorized_ids'] = $native_ids;
    sort( $native_ids, SORT_NUMERIC );
    $sorted_ids = $ids;
    sort( $sorted_ids, SORT_NUMERIC );
    if ( $native_ids !== $sorted_ids ) {
        throw new RuntimeException( 'scale_native_candidate_identity_mismatch' );
    }
    $report['status'] = 'PASS_FRESH_AUTHORIZED_SCALE_BASELINE';
    $write();
    echo "CIQ2_FRESH_SCALE_BASELINE_PASS\n";
} catch ( Throwable $e ) {
    $report['status'] = 'FAIL';
    $report['error'] = $e->getMessage();
    $write();
    throw $e;
}
