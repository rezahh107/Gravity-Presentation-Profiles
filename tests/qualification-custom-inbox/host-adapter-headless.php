<?php
/** Focused, disposable native host-adapter safety tests. Synthetic entries only. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
require_once __DIR__ . '/cell-boundary.php';

$fixture = get_option( 'cellq_fixture', array() );
$scope = array( 'form_id' => (int) ( $fixture['form_id'] ?? 0 ) );
$checks = array();
$assert = static function ( $condition, $label ) use ( &$checks ) {
    if ( ! $condition ) { throw new RuntimeException( $label ); }
    $checks[] = $label;
};
$reject = static function ( $row ) { return is_wp_error( cellq_admitted_card( $row ) ); };
$report = array( 'status' => 'RUNNING', 'checks' => &$checks, 'head' => getenv( 'GPP_WU21_REPOSITORY_SHA' ) );
$save = static function () use ( &$report ) {
    file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-host-adapter-headless.json',
        wp_json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) );
};
try {
    $assert( function_exists( 'ciq2_snapshot_rows' ) && $scope['form_id'] > 0, 'real_mu_and_fixture_ready' );
    $assert( ciq_host_version_qualified( GRAVITY_FLOW_VERSION ), 'exact_host_version_accepted' );
    $assert( ! ciq_host_version_qualified( '3.0.2' ) && ! ciq_host_version_qualified( '3.2.0' ),
        'non_pinned_host_versions_rejected' );
    $assert( ! cellq_model_compatible( new stdClass() ) && ! is_wp_error( cellq_host_model() ),
        'invalid_model_shape_rejected_and_real_model_accepted' );
    wp_set_current_user( (int) $fixture['officer'] );
    update_option( 'cellq_mode', 'final_mask', false );
    $rows = ciq2_snapshot_rows( $scope );
    if ( is_wp_error( $rows ) ) {
        // Codes only, never student values or external URLs in diagnostics.
        $report['snapshot_error_code'] = $rows->get_error_code();
        $candidate = cellq_rows( $scope, true );
        $report['raw_candidate_error_code'] = is_wp_error( $candidate ) ? $candidate->get_error_code() : null;
        if ( is_array( $candidate ) ) {
            $report['individual_admission_codes'] = array();
            foreach ( $candidate as $r ) {
                $admitted = cellq_admitted_card( $r );
                $report['individual_admission_codes'][] = is_wp_error( $admitted ) ? $admitted->get_error_code() : 'OK';
            }
        }
    }
    $assert( is_array( $rows ) && count( $rows ) === 3, 'qualified_snapshot_positive' );
    $good = $rows[0];
    $assert( true === cellq_admitted_card( $good ), 'complete_native_card_admitted' );
    $by_id = array_column( $rows, null, 'id' );
    $partial = $by_id[ (int) $fixture['entries'][1] ];
    $assert( true === cellq_admitted_card( $partial )
        && 'آزمایش نیمه‌کامل' === $partial['cells']['student_name']['text']
        && 'دهم — گروه آزمایشی' === $partial['cells']['school_grade']['text'],
        'empty_optional_name_or_school_component_remains_valid' );
    $assert( 'CQ_FINAL_MASKED' === $by_id[ (int) $fixture['entries'][0] ]['cells']['national_id']['text'],
        'effective_native_final_mask_retained' );

    $bad = $good; $bad['actionable'] = false;
    $assert( $reject( $bad ), 'detail_access_without_current_actionability_rejected' );
    $bad = $good; $bad['date_created'] = '2026-99-99 99:99:99';
    $assert( $reject( $bad ), 'invalid_created_at_rejected_before_fifo' );
    $bad = $good; $bad['binding_state'] = 'NO_QUALIFIED_FORM_PROJECTION';
    $assert( $reject( $bad ), 'no_semantic_binding_fails_closed' );
    $bad = $good; unset( $bad['cells']['student_name'] );
    $assert( $reject( $bad ), 'missing_essential_name_fails_closed' );
    $bad = $good; $bad['cell_status']['national_id'] = 'MISSING_NATIVE_DISPLAY_KEY';
    $assert( $reject( $bad ), 'missing_display_key_fails_closed' );
    $bad = $good; $bad['cells']['national_id']['text'] = array( 'unqualified' );
    $assert( $reject( $bad ), 'non_scalar_value_fails_closed' );
    $bad = $good; $bad['cells']['school_grade']['text'] = '  ';
    $assert( $reject( $bad ), 'empty_essential_composite_fails_closed' );
    $bad = $good; $bad['cells']['school_grade']['text'] = '—';
    $assert( $reject( $bad ), 'native_placeholder_is_not_a_qualified_value' );
    $bad = $good; $bad['native_url'] = add_query_arg( 'lid', (int) $good['id'] + 1, $good['native_url'] );
    $assert( $reject( $bad ), 'wrong_entry_url_context_rejected' );
    $bad = $good; $bad['native_url'] = add_query_arg( array(
        'view' => 'entry', 'id' => (int) $good['form_id'], 'lid' => (int) $good['id'],
    ), 'https://other.example.invalid/inbox' );
    $assert( $reject( $bad ), 'cross_origin_native_url_rejected' );
    $bad = $good;
    $parsed = wp_parse_url( $good['native_url'] );
    $bad['native_url'] = $parsed['scheme'] . '://' . $parsed['host'] . ':'
        . ( (int) ( $parsed['port'] ?? 80 ) + 1 ) . '/'
        . ( isset( $parsed['query'] ) ? '?' . $parsed['query'] : '' );
    $assert( $reject( $bad ), 'same_host_wrong_port_rejected' );
    $bad = $good; $bad['native_url'] = 'javascript:alert(1)';
    $assert( $reject( $bad ), 'script_url_rejected' );

    // Real host source discriminators: do not mock a native row for these cases.
    update_option( 'cellq_mode', 'opaque', false );
    $assert( is_wp_error( ciq2_snapshot_rows( $scope ) ), 'opaque_final_school_cell_blocks_entire_snapshot' );
    update_option( 'cellq_mode', 'final_mask', false );
    $contract = \GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::initialGeometryContract( $scope );
    $assert( is_array( $contract ), 'qualified_semantic_mapping_available' );
    $column = (string) $contract['column_ids'][3];
    $remove_column = static function ( $columns ) use ( $column ) {
        unset( $columns[ $column ] );
        return $columns;
    };
    add_filter( 'gravityflow_columns_inbox_table', $remove_column, PHP_INT_MAX, 2 );
    try {
        $assert( is_wp_error( ciq2_snapshot_rows( $scope ) ), 'removed_native_display_column_blocks_snapshot' );
    } finally {
        remove_filter( 'gravityflow_columns_inbox_table', $remove_column, PHP_INT_MAX );
    }

    // Mutate actual host filter outputs, not only a copied candidate row.
    $bad_id = static function ( $value, $form_id, $field_id ) use ( $scope ) {
        return (int) $form_id === $scope['form_id'] && 'id' === (string) $field_id
            ? array( 'unexpected' => 'row-shape' ) : $value;
    };
    add_filter( 'gravityflow_inbox_field_value', $bad_id, PHP_INT_MAX, 4 );
    try {
        $assert( is_wp_error( ciq2_snapshot_rows( $scope ) ), 'non_scalar_native_task_identity_rejected' );
    } finally {
        remove_filter( 'gravityflow_inbox_field_value', $bad_id, PHP_INT_MAX );
    }
    $blank_nid = static function ( $value, $form_id, $field_id ) use ( $scope ) {
        return (int) $form_id === $scope['form_id'] && '4' === (string) $field_id ? '' : $value;
    };
    add_filter( 'gravityflow_inbox_field_value', $blank_nid, PHP_INT_MAX, 4 );
    try {
        $assert( is_wp_error( ciq2_snapshot_rows( $scope ) ), 'empty_final_native_nid_rejected' );
    } finally {
        remove_filter( 'gravityflow_inbox_field_value', $blank_nid, PHP_INT_MAX );
    }
    $wrong_host_detail = static function ( $url, $entry ) {
        return add_query_arg( 'lid', (int) $entry['id'] + 1, $url );
    };
    add_filter( 'gravityflow_entry_url_inbox_table', $wrong_host_detail, PHP_INT_MAX, 4 );
    try {
        $assert( is_wp_error( ciq2_snapshot_rows( $scope ) ), 'wrong_id_from_native_url_hook_rejected' );
    } finally {
        remove_filter( 'gravityflow_entry_url_inbox_table', $wrong_host_detail, PHP_INT_MAX );
    }

    // Native Task Model constructs both URLs; the adapter does not reconstruct them.
    $model = cellq_host_model();
    $admin_args = cellq_args( $scope, 0, 1 );
    $admin_args['detail_base_url'] = admin_url( 'admin.php?page=gravityflow-inbox&view=entry' );
    $admin_row = $model->get_inbox_tasks( $admin_args );
    $assert( count( $admin_row ) === 1 && cellq_native_detail_url_valid(
        $admin_row[0]['url_entry'], $scope['form_id'], (int) $admin_row[0]['id']
    ), 'authentic_admin_detail_link_valid' );
    $front_args = cellq_args( $scope, 0, 1 );
    $front_args['detail_base_url'] = add_query_arg(
        'view', 'entry', get_permalink( (int) get_option( 'ciq2_page_id' ) )
    );
    $front_row = $model->get_inbox_tasks( $front_args );
    $assert( count( $front_row ) === 1 && cellq_native_detail_url_valid(
        $front_row[0]['url_entry'], $scope['form_id'], (int) $front_row[0]['id']
    ), 'authentic_frontend_detail_link_valid' );
    $url_filter = static function ( $url ) { return add_query_arg( 'ciq2_probe', '1', $url ); };
    add_filter( 'gravityflow_entry_url_inbox_table', $url_filter, 50, 4 );
    try {
        $customized = ciq2_snapshot_rows( $scope );
        $assert( is_array( $customized ) && count( $customized ) === 3
            && false !== strpos( $customized[0]['native_url'], 'ciq2_probe=1' ),
            'native_url_customization_filter_preserved' );
    } finally {
        remove_filter( 'gravityflow_entry_url_inbox_table', $url_filter, 50 );
    }

    // The known early-mask override is explicitly observed, not misrepresented
    // as a guarantee that the underlying GPP native Inbox always masks identity.
    update_option( 'cellq_mode', 'early_mask', false );
    $early = ciq2_snapshot_rows( $scope );
    $assert( is_array( $early )
        && 'CQ_EARLY_MASK' !== array_column( $early, null, 'id' )[ (int) $fixture['entries'][0] ]['cells']['student_name']['text'],
        'pre_gpp_name_mask_override_is_a_known_native_contract_risk' );
    update_option( 'cellq_mode', 'final_mask', false );

    // Creator access to Detail must not be mistaken for an assigned pending task.
    $new_entry = 0;
    try {
        wp_set_current_user( (int) $fixture['admin'] );
        $new_entry = GFAPI::add_entry( array(
            'form_id' => $scope['form_id'], 'created_by' => (int) $fixture['viewer'],
            '1' => 'SYNTH_CREATOR_ONLY', '2' => 'Student', '4' => 'SYNTH-CREATOR',
            '5' => 'grade_code_10', '6' => 'school_code_A',
        ) );
        $assert( ! is_wp_error( $new_entry ) && (int) $new_entry > 0, 'synthetic_creator_entry_created' );
        $api = new Gravity_Flow_API( $scope['form_id'] );
        $assert( ! is_wp_error( $api->process_workflow( (int) $new_entry ) ),
            'synthetic_creator_entry_entered_native_flow' );
        wp_set_current_user( (int) $fixture['viewer'] );
        $entry = GFAPI::get_entry( (int) $new_entry );
        $step = $api->get_current_step( $entry );
        $assert( $step && Gravity_Flow_Entry_Detail::is_permission_granted(
            $entry, GFAPI::get_form( $scope['form_id'] ), $step
        ), 'creator_detail_permission_positive_control' );
        $viewer_tasks = ciq_entries( $scope );
        $assert( is_array( $viewer_tasks ) && ! in_array( (int) $new_entry,
            array_map( 'intval', array_column( $viewer_tasks, 'id' ) ), true ),
            'creator_not_in_officer_task_membership' );
        $viewer_snapshot = ciq2_snapshot_rows( $scope );
        $assert( is_array( $viewer_snapshot ) && 0 === count( $viewer_snapshot ),
            'creator_only_detail_access_does_not_create_inbox2_card' );
    } finally {
        wp_set_current_user( (int) $fixture['admin'] );
        if ( is_numeric( $new_entry ) && (int) $new_entry > 0 ) {
            GFAPI::delete_entry( (int) $new_entry );
        }
        update_option( 'cellq_mode', 'final_mask', false );
    }

    $report['status'] = 'PASS_PINNED_ADAPTER_NEGATIVE_AND_POSITIVE';
    $save();
    echo "CIQ2_HOST_ADAPTER_SAFETY_PASS\n";
} catch ( Throwable $error ) {
    $report['status'] = 'FAIL';
    $report['error'] = $error->getMessage();
    $save();
    throw $error;
}
