<?php
/**
 * Disposable synthetic ~300-task cost fixture (Owner normal-peak estimate).
 * Grows the small authentic baseline to exactly 300 authorized Officer tasks
 * before the existing 500/501 lab continues from the same database.
 * Never run on real data; synthetic National ID placeholders only.
 */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
$f = get_option( 'cellq_fixture', array() );
$scope = array( 'form_id' => (int) ( $f['form_id'] ?? 0 ) );
$r = array( 'head' => getenv( 'GPP_WU21_REPOSITORY_SHA' ), 'status' => 'RUNNING', 'checks' => array() );
$save = static function () use ( &$r ) {
    file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-scale-300.json', wp_json_encode( $r, JSON_PRETTY_PRINT ) );
};
$ok = static function ( $condition, $label ) use ( &$r ) {
    if ( ! $condition ) { throw new RuntimeException( $label ); }
    $r['checks'][] = $label;
};
try {
    $ok( function_exists( 'ciq2_snapshot_rows' ) && $scope['form_id'] > 0, 'mu_and_fixture_ready' );
    wp_set_current_user( (int) $f['officer'] );
    $base = ciq2_snapshot_rows( $scope );
    $ok( is_array( $base ) && count( $base ) >= 1 && count( $base ) <= 3, 'small_native_baseline_before_300' );
    $flow = new Gravity_Flow_API( (int) $f['form_id'] );
    $created = array();
    wp_set_current_user( (int) $f['admin'] );
    for ( $i = 0, $n = 300 - count( $base ); $i < $n; ++$i ) {
        $id = GFAPI::add_entry( array(
            'form_id' => (int) $f['form_id'], 'created_by' => (int) $f['admin'],
            '1' => 'OP300_INDEX_' . $i, '2' => 'Synthetic', '4' => 'SYNTH300-' . $i,
            '5' => 'grade_code_10', '6' => 'school_code_A',
        ) );
        if ( is_wp_error( $id ) || (int) $id < 1 ) { throw new RuntimeException( 'synthetic_300_create_failed' ); }
        $created[] = (int) $id;
        $done = $flow->process_workflow( (int) $id );
        if ( is_wp_error( $done ) ) { throw new RuntimeException( 'synthetic_300_flow_failed' ); }
    }
    wp_set_current_user( (int) $f['officer'] );
    $total = 0;
    $args = apply_filters( 'gravityflow_inbox_args', array_merge( Gravity_Flow_Inbox::get_defaults(), $scope,
        array( 'paging' => array( 'offset' => 0, 'page_size' => 1 ) ) ) );
    Gravity_Flow_API::get_inbox_entries( $args, $total );
    $ok( 300 === (int) $total, 'public_host_total_300' );
    $native = array();
    for ( $offset = 0; $offset < 300; $offset += 40 ) {
        foreach ( cellq_model()->get_inbox_tasks( cellq_args( $scope, $offset, 40 ) ) as $item ) {
            $id = (int) ( $item['id'] ?? 0 );
            $ok( $id > 0 && ! isset( $native[ $id ] ), 'native_oracle_unique_300' );
            $native[ $id ] = true;
        }
    }
    $candidate = ciq2_snapshot_rows( $scope );
    $ok( is_array( $candidate ), 'snapshot_accepted_300' );
    $a = array_map( 'intval', array_column( $candidate, 'id' ) );
    $b = array_map( 'intval', array_keys( $native ) );
    sort( $a ); sort( $b );
    $ok( 300 === count( $a ) && $a === $b, 'exact_native_id_set_300' );
    // Recorded so the 500/501 lab can explicitly admit this known baseline.
    update_option( 'ciq2_scale300_ids', $a, false );
    update_option( 'ciq2_scale300_created', $created, false );
    $r['status'] = 'PASS_300_NATIVE_ID_SET'; $save();
    echo "CIQ2_SCALE_300_READY\n";
} catch ( Throwable $error ) {
    $r['status'] = 'FAIL'; $r['error'] = $error->getMessage(); $save(); throw $error;
}
