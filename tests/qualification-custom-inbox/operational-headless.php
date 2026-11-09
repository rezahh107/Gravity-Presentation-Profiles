<?php
/** Disposable, authentic 500/501-task native-ID oracle; never run on real data. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
$f = get_option( 'cellq_fixture', array() );
$scope = array( 'form_id' => (int) $f['form_id'] );
$r = array( 'head' => getenv( 'GPP_WU21_REPOSITORY_SHA' ), 'status' => 'RUNNING', 'checks' => array() );
$save = static function () use ( &$r ) {
    file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-operational-headless.json', wp_json_encode( $r, JSON_PRETTY_PRINT ) );
};
$ok = static function ( $condition, $label ) use ( &$r ) {
    if ( ! $condition ) { throw new RuntimeException( $label ); }
    $r['checks'][] = $label;
};
try {
    $ok( function_exists( 'ciq2_snapshot_rows' ), 'new_mu_loaded' );
    wp_set_current_user( (int) $f['officer'] );
    $base = ciq2_snapshot_rows( $scope );
    // Either the small authentic baseline, or the exact 300-task set recorded by
    // scale-300.php in this same disposable database. Never admit unknown growth.
    $known_300 = array_map( 'intval', (array) get_option( 'ciq2_scale300_ids', array() ) );
    $base_ids = is_array( $base ) ? array_map( 'intval', array_column( $base, 'id' ) ) : array();
    sort( $base_ids );
    $ok( is_array( $base ) && ( ( count( $base ) >= 1 && count( $base ) <= 3 )
        || ( 300 === count( $base ) && $base_ids === $known_300 ) ), 'native_baseline_active' );
    $flow = new Gravity_Flow_API( (int) $f['form_id'] );
    $temporary = array();
    wp_set_current_user( (int) $f['admin'] );
    for ( $i = 0, $n = 500 - count( $base ); $i < $n; ++$i ) {
        $id = GFAPI::add_entry( array(
            'form_id' => (int) $f['form_id'], 'created_by' => (int) $f['admin'],
            '1' => 'OP_INDEX_' . $i, '2' => 'Synthetic', '4' => 'SYNTH-' . $i,
            '5' => 'grade_code_10', '6' => 'school_code_A',
        ) );
        if ( is_wp_error( $id ) || (int) $id < 1 ) { throw new RuntimeException( 'Synthetic create failed' ); }
        $temporary[] = (int) $id;
        $done = $flow->process_workflow( (int) $id );
        if ( is_wp_error( $done ) ) { throw new RuntimeException( 'Native Flow create failed' ); }
    }
    $verify = static function ( $n ) use ( $scope, $ok, &$r, $f ) {
        wp_set_current_user( (int) $f['officer'] );
        $total = 0;
        $args = apply_filters( 'gravityflow_inbox_args', array_merge( Gravity_Flow_Inbox::get_defaults(), $scope,
            array( 'paging' => array( 'offset' => 0, 'page_size' => 1 ) ) ) );
        $first = Gravity_Flow_API::get_inbox_entries( $args, $total );
        $ok( is_array( $first ) && (int) $total === $n, 'public_host_total_' . $n );
        $native = array();
        for ( $offset = 0; $offset < $n; $offset += 40 ) {
            $page = cellq_model()->get_inbox_tasks( cellq_args( $scope, $offset, 40 ) );
            $ok( is_array( $page ) && count( $page ) <= 40, 'native_batch_' . $n . '_' . $offset );
            foreach ( $page as $item ) {
                $id = (int) ( $item['id'] ?? 0 );
                $ok( $id > 0 && ! isset( $native[ $id ] ), 'native_unique_' . $n . '_' . $id );
                $native[ $id ] = true;
            }
        }
        $candidate = ciq2_snapshot_rows( $scope );
        $ok( is_array( $candidate ), 'snapshot_accepted_' . $n );
        $a = array_map( 'intval', array_column( $candidate, 'id' ) );
        $b = array_map( 'intval', array_keys( $native ) );
        sort( $a ); sort( $b );
        $ok( count( $a ) === $n && $a === $b && count( array_unique( $a ) ) === $n,
            'exact_native_id_set_' . $n );
        $r['candidate_ids_' . $n] = $a;
        $r['native_oracle_ids_' . $n] = $b;
        return $a;
    };
    $verify( 500 );
    wp_set_current_user( (int) $f['admin'] );
    $extra = GFAPI::add_entry( array(
        'form_id' => (int) $f['form_id'], 'created_by' => (int) $f['admin'],
        '1' => 'OP_INDEX_500_EXTRA', '2' => 'Synthetic', '4' => 'SYNTH-EXTRA',
        '5' => 'grade_code_10', '6' => 'school_code_A',
    ) );
    if ( is_wp_error( $extra ) || (int) $extra < 1 ) { throw new RuntimeException( 'Crossing ceiling failed' ); }
    $temporary[] = (int) $extra;
    $flow->process_workflow( (int) $extra );
    $ids = $verify( 501 );
    $ok( in_array( (int) $extra, $ids, true ), 'new_boundary_task_visible' );
    wp_set_current_user( (int) $f['viewer'] );
    $viewer = ciq2_snapshot_rows( $scope );
    $ok( is_array( $viewer ) && count( $viewer ) === 0, 'viewer_sees_zero_other_users_at_501' );
    $fixture = array( 'head' => getenv( 'GPP_WU21_REPOSITORY_SHA' ), 'url' => get_permalink( (int) get_option( 'ciq2_page_id' ) ),
        'form_id' => (int) $f['form_id'], 'officer' => (int) $f['officer'],
        'viewer' => (int) $f['viewer'], 'admin' => (int) $f['admin'],
        'next_step' => (int) $f['next_step'], 'ids' => $ids, 'synthetic' => $temporary );
    file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-operational-fixture.json',
        wp_json_encode( $fixture, JSON_PRETTY_PRINT ) );
    $r['status'] = 'PASS_500_501_NATIVE_ID_SET'; $save();
    echo "CIQ2_OPERATIONAL_HEADLESS_PASS\n";
} catch ( Throwable $error ) {
    $r['status'] = 'FAIL'; $r['error'] = $error->getMessage(); $save(); throw $error;
}
