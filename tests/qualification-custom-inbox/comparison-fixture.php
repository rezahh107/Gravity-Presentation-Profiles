<?php
/**
 * Disposable comparison fixture. Invoked only by isolated GitHub Actions WP-CLI.
 * Retains three original synthetic cellq tasks and temporarily adds 44.
 */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
$action = getenv( 'CIQ2_COMPARE_ACTION' );
$stored = get_option( 'ciq2_comparison_entries', array() );
$f = get_option( 'cellq_fixture', array() );
if ( ! $f || empty( $f['form_id'] ) || empty( $f['officer'] ) || empty( $f['admin'] ) ) {
    throw new RuntimeException( 'Authentic host fixture absent' );
}
if ( 'cleanup' === $action ) {
    wp_set_current_user( (int) $f['admin'] );
    foreach ( $stored as $id ) {
        $r = GFAPI::delete_entry( (int) $id );
        if ( is_wp_error( $r ) ) { throw new RuntimeException( 'Synthetic comparison cleanup failed' ); }
    }
    delete_option( 'ciq2_comparison_entries' );
    echo "CIQ2_COMPARISON_CLEANED\n";
    return;
}
if ( 'setup' !== $action || ! get_option( 'cellq_gate_b_passed' ) || ! get_option( 'ciq_gate_b_passed' ) ) {
    throw new RuntimeException( 'Unqualified comparison attempt' );
}
if ( $stored ) { throw new RuntimeException( 'Comparison fixture already exists; cleanup required' ); }
wp_set_current_user( (int) $f['admin'] );
$api = new Gravity_Flow_API( (int) $f['form_id'] );
$created = array();
try {
    for ( $i = 0; $i < 44; ++$i ) {
        $id = GFAPI::add_entry( array(
            'form_id' => (int) $f['form_id'],
            'created_by' => (int) $f['admin'],
            '1' => ( 0 === $i ? 'داوطلب سیمرغ۷۳یگانه' : 'مقایسه دانش‌آموز ' . $i ),
            '2' => 'آزمایشی',
            '4' => 'COMPARE-SYNTH-' . $i,
            '5' => 'grade_code_10',
            '6' => 'school_code_A',
        ) );
        if ( is_wp_error( $id ) ) { throw new RuntimeException( 'Synthetic task insertion failed' ); }
        $created[] = (int) $id;
        update_option( 'ciq2_comparison_entries', $created, false );
        $api->process_workflow( (int) $id );
    }
    wp_set_current_user( (int) $f['officer'] );
    require_once __DIR__ . '/cell-boundary.php';
    $rows = cellq_rows( array( 'form_id' => (int) $f['form_id'] ), true );
    if ( is_wp_error( $rows ) || count( $rows ) !== 47 ) {
        throw new RuntimeException( 'Comparison not authorized to use exactly 47 matched tasks' );
    }
    $ids = array_map( 'intval', array_column( $rows, 'id' ) );
    $expected = array_merge( array_map( 'intval', $f['entries'] ), $created );
    sort( $ids ); sort( $expected );
    if ( $ids !== $expected ) { throw new RuntimeException( 'Comparison task identity mismatch' ); }
    $manifest = array(
        'head' => getenv( 'GPP_WU21_REPOSITORY_SHA' ),
        'form_id' => (int) $f['form_id'], 'officer' => (int) $f['officer'],
        'viewer' => (int) $f['viewer'], 'admin' => (int) $f['admin'],
        'next_step' => (int) $f['next_step'],
        'original_ids' => array_map( 'intval', $f['entries'] ),
        'created_ids' => $created,
        'all_ids' => $ids,
        'target_id' => (int) $created[0],
        'target_name' => 'سیمرغ۷۳یگانه',
        'native_url' => $f['native_url'],
        'inbox2_url' => get_permalink( (int) get_option( 'ciq2_page_id' ) ),
    );
    file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-comparison-manifest.json',
        wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) );
    echo "CIQ2_COMPARISON_47_TASKS_READY\n";
} catch ( Throwable $e ) {
    // Only synthetic task IDs are saved in this disposable lab.
    wp_set_current_user( (int) $f['admin'] );
    foreach ( $created as $id ) { GFAPI::delete_entry( $id ); }
    delete_option( 'ciq2_comparison_entries' );
    throw $e;
}
