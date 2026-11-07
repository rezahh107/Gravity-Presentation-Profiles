<?php
/** Synthetic, actual-Flow mutation probes for offset scans; no vendor modifications. */
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

    foreach ( array( 'during_offset_pagination', 'between_complete_scans' ) as $kind ) {
        wp_set_current_user( (int) $f['admin'] );
        $extra = GFAPI::add_entry( array(
            'form_id' => (int) $f['form_id'], 'created_by' => (int) $f['admin'],
            '1' => 'OP_MUTATION_' . $kind, '2' => 'Synthetic',
            '4' => 'SYNTH-MUTATION', '5' => 'grade_code_10', '6' => 'school_code_A',
        ) );
        $ok( ! is_wp_error( $extra ) && (int) $extra > 0, 'mutation_entry_creation_' . $kind );
        $done = $flow->process_workflow( (int) $extra );
        $ok( ! is_wp_error( $done ), 'mutation_entry_workflow_' . $kind );
        wp_set_current_user( (int) $f['officer'] );
        // The boundary test records its public API pages in this request-local global.
        $public_first_page_calls = 0;
        $injected = false;
        $mutate = static function ( $args ) use ( &$public_first_page_calls, &$injected, $kind, $extra, $f, $flow ) {
            $paging = $args['paging'] ?? array();
            $offset = (int) ( $paging['offset'] ?? -1 );
            // Only the public paging function clears this ledger before its first page.
            // The native Task Model may also apply the same host filter, so an
            // unqualified offset=0 counter would misidentify the scan boundary.
            if ( 0 === $offset && empty( $GLOBALS['ciq_query_paging'] ) ) {
                ++$public_first_page_calls;
            }
            $should_change = ( 'during_offset_pagination' === $kind && 40 === $offset )
                || ( 'between_complete_scans' === $kind && 0 === $offset && 2 === $public_first_page_calls );
            if ( $should_change && ! $injected ) {
                $injected = true;
                $prior = get_current_user_id();
                wp_set_current_user( (int) $f['admin'] );
                $entry = GFAPI::get_entry( (int) $extra );
                $result = $flow->send_to_step( $entry, (int) $f['next_step'] );
                wp_set_current_user( $prior );
                if ( is_wp_error( $result ) || false === $result ) {
                    throw new RuntimeException( 'authentic_native_mutation_failed' );
                }
            }
            return $args;
        };
        add_filter( 'gravityflow_inbox_args', $mutate, 999, 1 );
        try {
            $unstable = ciq2_snapshot_rows( $scope );
        } finally {
            remove_filter( 'gravityflow_inbox_args', $mutate, 999 );
        }
        $ok( $injected, 'mutation_was_not_injected_' . $kind . '_public_scans_' . $public_first_page_calls );
        $ok( is_wp_error( $unstable ), 'unstable_scan_silently_accepted_' . $kind );
        $report['scenarios'][ $kind ] = array(
            'rejected' => $unstable->get_error_code(), 'public_first_page_calls' => $public_first_page_calls,
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
