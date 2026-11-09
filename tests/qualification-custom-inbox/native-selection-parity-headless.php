<?php
/**
 * Owner-approved goal: Inbox 2 task selection == native Gravity Flow Inbox
 * membership for the same user, scope and configuration. No Inbox 2-only
 * eligibility rule; independent disclosure authorization and safe presentation
 * remain. Disposable synthetic DB only (negative-baseline scenario); real
 * Gravity Flow steps, assignments and entry meta, no vendor modification.
 */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
$f = get_option( 'cellq_fixture', array() );
$scope = array( 'form_id' => (int) ( $f['form_id'] ?? 0 ) );
// Two processes: Gravity Flow caches step feeds per request (`$found_feeds`),
// so a step deactivated in `main` is observed only by a fresh `inactive` process.
$phase = getenv( 'CIQ2_NSP_PHASE' ) ?: 'main';
$report = array( 'head' => getenv( 'GPP_WU21_REPOSITORY_SHA' ), 'phase' => $phase, 'status' => 'RUNNING', 'checks' => array(), 'scenarios' => array() );
$save = static function () use ( &$report, $phase ) {
    file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-native-selection-parity-' . $phase . '.json',
        wp_json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
};
$ok = static function ( $condition, $label ) use ( &$report ) {
    if ( ! $condition ) { throw new RuntimeException( $label ); }
    $report['checks'][] = $label;
};
// Independent host oracle: what the native Inbox itself selects for the user.
$oracle = static function () use ( $scope ) {
    $total = 0;
    $args = apply_filters( 'gravityflow_inbox_args', array_merge( Gravity_Flow_Inbox::get_defaults(), $scope,
        array( 'paging' => array( 'offset' => 0, 'page_size' => 2001 ) ) ) );
    $public = array_map( 'intval', array_column( (array) Gravity_Flow_API::get_inbox_entries( $args, $total ), 'id' ) );
    $native = array_map( 'intval', array_column( (array) cellq_model()->get_inbox_tasks( cellq_args( $scope, 0, 2001 ) ), 'id' ) );
    sort( $public ); sort( $native );
    return array( 'public' => $public, 'task_model' => $native, 'total' => (int) $total );
};
$snap = static function () use ( $scope ) {
    $rows = ciq2_snapshot_rows( $scope );
    if ( is_wp_error( $rows ) ) {
        return array( 'error' => $rows->get_error_code(), 'attempts' => $GLOBALS['ciq2_snapshot_attempts'] ?? null );
    }
    $ids = array_map( 'intval', array_column( $rows, 'id' ) );
    sort( $ids );
    return array( 'ids' => $ids, 'rows' => $rows, 'attempts' => $GLOBALS['ciq2_snapshot_attempts'] ?? null );
};
$same = static function ( array $a, array $b ) { sort( $a ); sort( $b ); return $a === $b; };
$as = static function ( $uid ) { wp_set_current_user( (int) $uid ); };
$flow = new Gravity_Flow_API( $scope['form_id'] );
$new_entry = static function ( $label ) use ( $f, $flow, $as ) {
    $as( $f['admin'] );
    $id = GFAPI::add_entry( array( 'form_id' => (int) $f['form_id'], 'created_by' => (int) $f['admin'],
        '1' => 'NSP_' . $label, '2' => 'Synthetic', '4' => 'SYNTH-NSP-' . $label,
        '5' => 'grade_code_10', '6' => 'school_code_A' ) );
    if ( is_wp_error( $id ) || (int) $id < 1 ) { throw new RuntimeException( 'nsp_entry_create_' . $label ); }
    $flow->process_workflow( (int) $id );
    return (int) $id;
};
$move = static function ( $entry_id, $step_id ) use ( $f, $flow, $as ) {
    $prior = get_current_user_id();
    $as( $f['admin'] );
    $r = $flow->send_to_step( GFAPI::get_entry( (int) $entry_id ), (int) $step_id );
    $as( $prior );
    if ( false === $r || is_wp_error( $r ) ) { throw new RuntimeException( 'nsp_move_failed' ); }
};
$add_step = static function ( $settings ) use ( $f, $flow, $as ) {
    $prior = get_current_user_id();
    $as( $f['admin'] );
    $id = $flow->add_step( $settings );
    $as( $prior );
    if ( ! $id || is_wp_error( $id ) ) { throw new RuntimeException( 'nsp_step_failed' ); }
    return (int) $id;
};
// Parity verdict for one actor: exact selection, or an explicit non-selection
// reason (disclosure / presentation contract) - never a silent exclusion.
$explicit_reasons = array( 'native_entry_access_denied', 'ciq2_unqualified_required_binding',
    'ciq2_unqualified_required_value', 'ciq2_unqualified_native_detail_url', 'ciq2_unqualified_creation_timestamp' );
$verdict = static function ( $o, $s ) use ( $same, $explicit_reasons ) {
    if ( isset( $s['ids'] ) ) { return $same( $s['ids'], $o['public'] ) ? 'EXACT_NATIVE_SELECTION' : 'MISMATCH'; }
    return in_array( $s['error'], $explicit_reasons, true ) && ! empty( $o['public'] )
        ? 'EXPLICIT_REASON:' . $s['error'] : 'UNEXPLAINED_ERROR:' . $s['error'];
};
$record = static function ( $name, array $data ) use ( &$report ) {
    foreach ( $data as &$actor ) { if ( isset( $actor['inbox2']['rows'] ) ) { unset( $actor['inbox2']['rows'] ); } }
    $report['scenarios'][ $name ] = $data;
};

try {
    $ok( function_exists( 'ciq2_snapshot_rows' ) && $scope['form_id'] > 0, 'nsp_preconditions' );
    update_option( 'cellq_mode', 'baseline', false );
    if ( 'inactive' === $phase ) {
        $state = get_option( 'ciq2_nsp_state', array() );
        $user_input = (int) ( $state['user_input'] ?? 0 );
        $ui_entry = (int) ( $state['ui_entry'] ?? 0 );
        $ok( $user_input > 0 && $ui_entry > 0, 'nsp_s2_state_from_main_phase' );
        $ok( empty( gravity_flow()->get_feed( $user_input )['is_active'] ), 'nsp_s2_step_inactive_in_database' );
        // S2 inactive step: observe the task waiting on the step deactivated by `main`.
        $as( $f['officer'] );
        $o = $oracle(); $s = $snap();
        $v = $verdict( $o, $s );
        $ok( 0 !== strpos( $v, 'MISMATCH' ) && 0 !== strpos( $v, 'UNEXPLAINED_ERROR' ), 'nsp_s2_inactive_step_follows_native_or_explicit_reason' );
        $current = $flow->get_current_step( GFAPI::get_entry( $ui_entry ) );
        $record( 'S2_inactive_step', array( 'officer' => array( 'native' => $o, 'inbox2' => $s, 'verdict' => $v,
            'native_current_step_resolved' => is_object( $current ),
            'native_step_active' => is_object( $current ) ? (bool) $current->is_active() : null ) ) );
        $as( $f['admin'] );
        gravity_flow()->update_feed_active( $user_input, 1 );
        $move( $ui_entry, (int) $f['next_step'] );
        // S6 cleanup parity: Officer and Viewer, creator-only covered by the adapter gate.
        foreach ( array( 'officer', 'viewer' ) as $actor ) {
            $as( $f[ $actor ] );
            $o = $oracle(); $s = $snap();
            $ok( 'EXACT_NATIVE_SELECTION' === $verdict( $o, $s ), 'nsp_s6_exact_after_cleanup_' . $actor );
        }
        $report['status'] = 'PASS_INACTIVE_PHASE'; $save();
        echo 'CIQ2_NATIVE_SELECTION_PARITY_INACTIVE_PASS ' . wp_json_encode( array(
            'S2' => $report['scenarios']['S2_inactive_step']['officer']['verdict'] ?? null,
            'S2_native' => $report['scenarios']['S2_inactive_step']['officer']['native']['public'] ?? null,
            'S2_native_step_resolved' => $report['scenarios']['S2_inactive_step']['officer']['native_current_step_resolved'] ?? null,
            'S2_native_step_active' => $report['scenarios']['S2_inactive_step']['officer']['native_step_active'] ?? null,
            'checks' => count( $report['checks'] ),
        ) ) . "\n";
        return;
    }

    // S0 same-user parity, officer and viewer.
    foreach ( array( 'officer', 'viewer' ) as $actor ) {
        $as( $f[ $actor ] );
        $o = $oracle(); $s = $snap();
        $ok( $o['public'] === $o['task_model'], 'nsp_s0_host_sources_agree_' . $actor );
        $ok( 'EXACT_NATIVE_SELECTION' === $verdict( $o, $s ), 'nsp_s0_exact_native_selection_' . $actor );
        $record( 'S0_' . $actor, array( $actor => array( 'native' => $o, 'inbox2' => $s ) ) );
    }
    $as( $f['officer'] );
    $baseline = $oracle()['public'];
    $ok( 3 === count( $baseline ), 'nsp_s0_officer_three_tasks' );
    foreach ( $snap()['rows'] as $row ) {
        $ok( ! array_key_exists( 'actionable', $row ) && 'NATIVE_INBOX_MEMBERSHIP' === $row['task_source'],
            'nsp_s0_no_inbox2_eligibility_flag_only_native_provenance' );
    }

    // S1 non-Approval (User Input) step assigned to the Officer: native selects it.
    $user_input = $add_step( array( 'step_name' => 'NSP officer user input', 'step_type' => 'user_input',
        'type' => 'select', 'assignees' => array( 'user_id|' . $f['officer'] ), 'assignee_policy' => 'all',
        'editable_fields' => array() ) );
    $ui_entry = $new_entry( 'USER_INPUT' );
    $move( $ui_entry, $user_input );
    $as( $f['officer'] );
    $o = $oracle(); $s = $snap();
    $ok( in_array( $ui_entry, $o['public'], true ), 'nsp_s1_native_selects_user_input_task' );
    $ok( 'EXACT_NATIVE_SELECTION' === $verdict( $o, $s ) && in_array( $ui_entry, $s['ids'], true ),
        'nsp_s1_inbox2_follows_native_for_non_approval_step' );
    $record( 'S1_non_approval_step', array( 'officer' => array( 'native' => $o, 'inbox2' => $s,
        'native_step_type' => 'user_input', 'entry' => $ui_entry ) ) );

    // S3 assignment change: one Officer task moves to a Viewer-assigned step.
    $viewer_step = $add_step( array( 'step_name' => 'NSP viewer review', 'step_type' => 'approval',
        'type' => 'select', 'assignees' => array( 'user_id|' . $f['viewer'] ), 'assignee_policy' => 'all' ) );
    $moved = (int) $baseline[0];
    $move( $moved, $viewer_step );
    $s3 = array();
    foreach ( array( 'officer', 'viewer' ) as $actor ) {
        $as( $f[ $actor ] );
        $o = $oracle(); $s = $snap();
        $ok( 'EXACT_NATIVE_SELECTION' === $verdict( $o, $s ), 'nsp_s3_exact_after_reassignment_' . $actor );
        $s3[ $actor ] = array( 'native' => $o, 'inbox2' => $s );
    }
    $ok( ! in_array( $moved, $s3['officer']['inbox2']['ids'], true ) && array( $moved ) === $s3['viewer']['inbox2']['ids'],
        'nsp_s3_task_follows_new_assignee_only' );
    $record( 'S3_assignment_change', $s3 );
    $move( $moved, (int) $f['step_id'] );

    // S4 stale pending: Officer status meta left 'pending' on an entry whose current
    // step does not include the Officer. Membership vs disclosure vs action differ.
    $stale = $new_entry( 'STALE' );
    $move( $stale, (int) $f['next_step'] );
    // Clear GF's request meta cache first: send_to_step removed the status row
    // through another path, so an unchanged cached 'pending' would skip the write.
    gform_delete_meta( $stale, 'workflow_user_id_' . $f['officer'] );
    gform_update_meta( $stale, 'workflow_user_id_' . $f['officer'], 'pending' );
    global $wpdb;
    $ok( 'pending' === $wpdb->get_var( $wpdb->prepare( "SELECT meta_value FROM {$wpdb->prefix}gf_entry_meta WHERE entry_id = %d AND meta_key = %s",
        $stale, 'workflow_user_id_' . $f['officer'] ) ), 'nsp_s4_stale_pending_meta_written' );
    $as( $f['officer'] );
    $o = $oracle(); $s = $snap();
    $step = $flow->get_current_step( GFAPI::get_entry( $stale ) );
    $native_detail = Gravity_Flow_Entry_Detail::is_permission_granted( GFAPI::get_entry( $stale ), GFAPI::get_form( $scope['form_id'] ), $step );
    $native_action = is_object( $step ) && $step->is_user_assignee();
    $ok( in_array( $stale, $o['public'], true ), 'nsp_s4_native_membership_includes_stale_pending' );
    $ok( ! $native_detail && ! $native_action, 'nsp_s4_native_denies_detail_and_action' );
    $ok( isset( $s['error'] ) && 'native_entry_access_denied' === $s['error'] && 2 === count( (array) $s['attempts'] ),
        'nsp_s4_inbox2_explicit_disclosure_reason_no_rows' );
    $record( 'S4_stale_pending', array( 'officer' => array( 'native' => $o, 'inbox2' => $s,
        'verdict' => $verdict( $o, $s ), 'native_detail_permission' => (bool) $native_detail,
        'native_action_permission' => (bool) $native_action ) ) );
    gform_delete_meta( $stale, 'workflow_user_id_' . $f['officer'] );

    // S5 negative controls: the parity predicate detects a real mismatch.
    $as( $f['officer'] );
    $o = $oracle(); $s = $snap();
    $ok( 'EXACT_NATIVE_SELECTION' === $verdict( $o, $s ), 'nsp_s5_restored_parity' );
    $short = $o; array_pop( $short['public'] );
    $ok( 'MISMATCH' === $verdict( $short, $s ), 'nsp_s5_predicate_detects_missing_task' );
    $extra = $o; $extra['public'][] = 999999;
    $ok( 'MISMATCH' === $verdict( $extra, $s ), 'nsp_s5_predicate_detects_extra_task' );
    $hidden = (int) $o['public'][0];
    $officer = (int) $f['officer'];
    $hide = static function ( $criteria, $args ) use ( $hidden, $officer ) {
        if ( ! isset( $args['is_shortcode'] ) ) {
            $criteria['field_filters'] = array( 'mode' => 'all',
                array( 'key' => 'workflow_user_id_' . $officer, 'value' => 'pending' ),
                array( 'key' => 'id', 'operator' => 'isnot', 'value' => $hidden ) );
        }
        return $criteria;
    };
    add_filter( 'gravityflow_inbox_search_criteria', $hide, 500, 2 );
    try {
        $mismatch = $snap();
    } finally {
        remove_filter( 'gravityflow_inbox_search_criteria', $hide, 500 );
    }
    $ok( isset( $mismatch['error'] ) && 'native_cell_task_set_changed' === $mismatch['error'],
        'nsp_s5_real_cross_source_mismatch_rejected' );
    $record( 'S5_negative_controls', array( 'officer' => array( 'real_mismatch' => $mismatch ) ) );

    // Prepare S2 for the fresh process: the User Input task waits on a step that
    // is deactivated in the database.
    $as( $f['admin'] );
    gravity_flow()->update_feed_active( $user_input, 0 );
    update_option( 'ciq2_nsp_state', array( 'user_input' => $user_input, 'ui_entry' => $ui_entry ), false );
    $report['status'] = 'PASS_MAIN_PHASE'; $save();
    echo 'CIQ2_NATIVE_SELECTION_PARITY_MAIN_PASS ' . wp_json_encode( array(
        'S1' => $report['scenarios']['S1_non_approval_step']['officer']['inbox2']['ids'] ?? null,
        'S3' => $report['scenarios']['S3_assignment_change']['viewer']['inbox2']['ids'] ?? null,
        'S4' => $report['scenarios']['S4_stale_pending']['officer']['verdict'] ?? null,
        'checks' => count( $report['checks'] ),
    ) ) . "\n";
} catch ( Throwable $error ) {
    $report['status'] = 'FAIL'; $report['error'] = $error->getMessage(); $save(); throw $error;
}
