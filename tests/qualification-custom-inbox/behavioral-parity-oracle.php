<?php
/**
 * WU21-only independent host oracle. No candidate snapshot or production data.
 * Run with WP-CLI after the authentic fixture and Inbox 2 page are installed.
 */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
require_once ABSPATH . 'wp-admin/includes/plugin.php';
require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
require_once __DIR__ . '/cell-boundary.php';

$phase = (string) getenv( 'CIQ2_PARITY_PHASE' );
$allowed_phases = array( 'initial', 'after-usability', 'after-native' );
$dir = (string) getenv( 'WU21_ARTIFACT_DIR' );
$report = array(
    'status' => 'RUNNING',
    'phase' => $phase,
    'head' => (string) getenv( 'GPP_WU21_REPOSITORY_SHA' ),
    'base_sha' => (string) getenv( 'CIQ2_PARITY_BASE_SHA' ),
    'oracle_provenance' => array(
        'Gravity_Flow_API::get_inbox_entries (authenticated per actor)',
        'GFAPI::get_entry + Gravity_Flow_API::get_current_step',
        'Gravity_Flow_Entry_Detail::is_permission_granted',
        'Gravity Flow authentic Task Model, independently of Inbox 2 projection',
    ),
);
$save = static function () use ( &$report, $dir, $phase ) {
    if ( is_dir( $dir ) && in_array( $phase, array( 'initial', 'after-usability', 'after-native' ), true ) ) {
        file_put_contents( $dir . '/ciq2-parity-oracle-' . $phase . '.json',
            wp_json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
    }
};
$require = static function ( $condition, $reason ) {
    if ( ! $condition ) { throw new RuntimeException( $reason ); }
};

try {
    $require( 'return-fifo' === getenv( 'CIQ2_SCENARIO' ) &&
        in_array( $phase, $allowed_phases, true ), 'parity_wrong_scenario_or_phase' );
    $f = get_option( 'cellq_fixture', array() );
    $require( is_array( $f ) && ! empty( $f['form_id'] ) &&
        count( $f['entries'] ?? array() ) === 3 &&
        ! empty( $f['officer'] ) && ! empty( $f['viewer'] ) &&
        ! empty( $f['admin'] ), 'parity_fixture_unavailable' );
    // CI writes the Head to the browser fixture, not to cellq_fixture.
    $require( is_file( $dir . '/ciq2-browser-fixture.json' ), 'parity_browser_fixture_missing' );
    $browser_fixture = json_decode( file_get_contents( $dir . '/ciq2-browser-fixture.json' ), true );
    $require( is_array( $browser_fixture ) &&
        ( $browser_fixture['head'] ?? null ) === $report['head'] &&
        (int) ( $browser_fixture['form_id'] ?? 0 ) === (int) $f['form_id'],
        'parity_fixture_head_or_form_mismatch' );
    $require( 'baseline' === get_option( 'cellq_mode', 'baseline' ), 'parity_synthetic_mode_not_baseline' );
    $require( get_option( 'ciq_gate_b_passed' ) && get_option( 'cellq_gate_b_passed' ),
        'parity_inherited_gate_missing' );
    $form_id = (int) $f['form_id'];
    $form = GFAPI::get_form( $form_id );
    $require( is_array( $form ), 'parity_form_missing' );
    $known = array_map( 'intval', $f['entries'] );
    $require( count( array_unique( $known ) ) === 3, 'parity_fixture_duplicate_ids' );
    $flow = new Gravity_Flow_API( $form_id );
    $facts = array();
    wp_set_current_user( (int) $f['admin'] );
    foreach ( $known as $id ) {
        $entry = GFAPI::get_entry( $id );
        $require( is_array( $entry ) && (int) $entry['form_id'] === $form_id &&
            ! empty( $entry['date_created'] ), 'parity_gf_entry_missing_or_invalid' );
        $step = $flow->get_current_step( $entry );
        $facts[ $id ] = array(
            'id' => $id,
            'date_created' => (string) $entry['date_created'],
            'current_step_id' => is_object( $step ) ? (int) $step->get_id() : null,
        );
    }
    $report['fixture_entry_facts'] = array_values( $facts ); // IDs, dates, step IDs only.
    $report['versions'] = array(
        'wordpress' => get_bloginfo( 'version' ),
        'php' => PHP_VERSION,
        'gravityforms' => get_plugin_data( WP_PLUGIN_DIR . '/gravityforms/gravityforms.php', false, false )['Version'],
        'gravityflow' => get_plugin_data( WP_PLUGIN_DIR . '/gravityflow/gravityflow.php', false, false )['Version'],
    );

    $scope = array( 'form_id' => $form_id );
    foreach ( array( 'officer', 'viewer' ) as $actor ) {
        wp_set_current_user( (int) $f[ $actor ] );
        $args = apply_filters( 'gravityflow_inbox_args', array_merge(
            Gravity_Flow_Inbox::get_defaults(), $scope,
            array( 'paging' => array( 'offset' => 0, 'page_size' => 40 ) )
        ) );
        $total = 0;
        $public = Gravity_Flow_API::get_inbox_entries( $args, $total );
        $require( is_array( $public ) && count( $public ) === (int) $total &&
            count( $public ) <= 3, 'parity_host_public_inbox_not_complete' );
        $ids = array_map( 'intval', array_column( $public, 'id' ) );
        $require( count( $ids ) === count( array_unique( $ids ) ) &&
            ! array_diff( $ids, $known ), 'parity_public_membership_invalid' );

        // Second upstream host path; never call ciq2_snapshot_rows/cellq_rows.
        $native = cellq_model()->get_inbox_tasks( cellq_args( $scope, 0, 40 ) );
        $require( is_array( $native ) && count( $native ) <= 3,
            'parity_native_task_model_unreadable' );
        $native_ids = array_map( 'intval', array_column( $native, 'id' ) );
        $sorted = $ids;
        sort( $sorted, SORT_NUMERIC );
        sort( $native_ids, SORT_NUMERIC );
        $require( $sorted === $native_ids, 'parity_independent_host_feeds_disagree' );

        foreach ( $public as $item ) {
            $id = (int) $item['id'];
            $entry = GFAPI::get_entry( $id );
            $step = $flow->get_current_step( $entry );
            $require( is_object( $step ) && method_exists( $step, 'get_id' ) &&
                (int) $step->get_id() === $facts[ $id ]['current_step_id'],
                'parity_host_current_step_changed' );
            if ( 'officer' === $actor ) {
                $require( $step instanceof Gravity_Flow_Step_Approval &&
                    $step->is_user_assignee() &&
                    (int) $step->get_id() === (int) $f['step_id'],
                    'parity_public_feed_contains_non_officer_actionable_step' );
            }
            $prepared = apply_filters( 'gform_pre_render', $form, false, null );
            $prepared = apply_filters( 'gform_pre_render_' . $form_id, $prepared, false, null );
            $permitted = Gravity_Flow_Entry_Detail::is_permission_granted( $entry, $prepared, $step );
            $permitted = apply_filters( 'gravityflow_permission_granted_entry_detail',
                $permitted, $entry, $prepared, $step );
            $require( (bool) $permitted, 'parity_host_detail_permission_denied' );
        }
        $report['roles'][ $actor ] = array(
            'user_id' => (int) $f[ $actor ],
            'ids' => $sorted,
            'public_total' => (int) $total,
            'native_task_model_ids' => $native_ids,
        );
    }
    $require( count( $report['roles']['viewer']['ids'] ) === 0,
        'parity_unassigned_viewer_has_tasks' );
    // Independent fixture script contract: 3 initial, 1 authentic move,
    // then a real Officer Approve and second move. Never let zero==zero
    // comparison give a false GREEN when setup silently omitted tasks.
    $expected_counts = array( 'initial' => 3, 'after-usability' => 2, 'after-native' => 0 );
    $require( count( $report['roles']['officer']['ids'] ) === $expected_counts[ $phase ],
        'parity_unexpected_authorized_officer_task_count' );

    $ordered = $report['roles']['officer']['ids'];
    usort( $ordered, static function ( $a, $b ) use ( $facts ) {
        $by_date = strcmp( $facts[ $a ]['date_created'], $facts[ $b ]['date_created'] );
        return 0 !== $by_date ? $by_date : ( $a <=> $b );
    } );
    $report['expected_fifo_ids'] = $ordered;
    $report['expected_detail_entry_ids'] = $report['roles']['officer']['ids'];
    $report['status'] = 'PASS_INDEPENDENT_HOST_ORACLE';
    $save();
    echo 'CIQ2_PARITY_HOST_ORACLE_PASS ' . $phase . PHP_EOL;
} catch ( Throwable $error ) {
    $report['status'] = 'FAIL';
    $report['error'] = $error->getMessage();
    $save();
    throw $error;
}
