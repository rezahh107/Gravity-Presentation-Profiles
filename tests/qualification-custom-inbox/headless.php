<?php
/** Gate B: real WU21 fixtures, native task model, public query, native field rules. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
require_once __DIR__ . '/boundary.php';
require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';

function ciq_assert( $ok, $message ) {
    if ( ! $ok ) { throw new RuntimeException( $message ); }
}
function ciq_native( $scope = array() ) {
    $model = gravity_flow()->container()->get( \Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider::TASK_MODEL );
    $rows = array();
    $expected = Gravity_Flow_API::get_inbox_entries_count( $scope );
    for ( $offset = 0; $offset < max( 1, $expected ); ++$offset ) {
        $page = $model->get_inbox_tasks( array_merge( $scope, array(
            'paging' => array( 'offset' => $offset, 'page_size' => 1 ),
            'detail_base_url' => add_query_arg( array( 'page' => 'gravityflow-inbox', 'view' => 'entry' ), get_option( 'ciq_native_url' ) ),
        ) ) );
        ciq_assert( count( $page ) <= 1, 'Native paging contract changed' );
        foreach ( $page as $row ) {
            $entry = GFAPI::get_entry( (int) $row['id'] );
            $step = ( new Gravity_Flow_API( $entry['form_id'] ) )->get_current_step( $entry );
            $rows[] = array( 'id' => (int) $row['id'], 'form_id' => (int) $row['fid'], 'step_id' => (int) $step->get_id() );
        }
    }
    ciq_assert( count( $rows ) === (int) $expected, 'Native enumeration incomplete' );
    return $rows;
}
function ciq_identity( $rows ) {
    $ids = array_map( static function ( $r ) { return array_intersect_key( $r, array( 'id' => 1, 'form_id' => 1, 'step_id' => 1 ) ); }, $rows );
    usort( $ids, static function ( $a, $b ) { return $a['id'] <=> $b['id']; } );
    return $ids;
}
function ciq_compare( $uid, $scope = array() ) {
    wp_set_current_user( $uid );
    $entries = ciq_entries( $scope );
    ciq_assert( ! is_wp_error( $entries ), 'Candidate query failed' );
    $rows = ciq_project( $entries );
    ciq_assert( ! is_wp_error( $rows ), 'Projection failed: ' . ( is_wp_error( $rows ) ? $rows->get_error_code() : '' ) );
    $native = ciq_identity( ciq_native( $scope ) );
    $candidate = ciq_identity( $rows );
    ciq_assert( $native === $candidate, 'Complete native/candidate task identity mismatch' );
    $oracle = mixed_inbox_rows( $uid, $scope );
    ciq_assert( count( $candidate ) === $oracle['total'], 'Existing PR162 oracle count mismatch' );
    ciq_assert( array_column( $candidate, 'id' ) === ( static function ( $ids ) { sort( $ids ); return $ids; } )( $oracle['ids'] ), 'Existing PR162 oracle membership mismatch' );
    return array( 'native' => $native, 'candidate' => $candidate, 'all_pages' => true, 'page_size' => 1, 'roles' => wp_get_current_user()->roles );
}

$admin = get_user_by( 'login', 'bootstrap_admin' )->ID;
$viewer = get_user_by( 'login', 'wu21_viewer' )->ID;
$officer = wp_insert_user( array( 'user_login' => 'ciq_officer', 'user_email' => 'ciq.officer@example.invalid', 'role' => 'subscriber', 'user_pass' => wp_generate_password() ) );
$receiver = wp_insert_user( array( 'user_login' => 'ciq_receiver', 'user_email' => 'ciq.receiver@example.invalid', 'role' => 'author', 'user_pass' => wp_generate_password() ) );
ciq_assert( ! is_wp_error( $officer ) && ! is_wp_error( $receiver ), 'Cannot create synthetic users' );
$form = GFAPI::add_form( array( 'title' => 'CIQ synthetic field disclosure', 'fields' => array(
    array( 'id' => 1, 'label' => 'نام', 'type' => 'text' ),
    array( 'id' => 2, 'label' => 'شناسه محرمانه آزمایشی', 'type' => 'text' ),
    array( 'id' => 3, 'label' => 'مدرسه', 'type' => 'text' ),
    array( 'id' => 4, 'label' => 'پایه', 'type' => 'text' ),
), 'button' => array( 'type' => 'text', 'text' => 'Submit' ) ) );
ciq_assert( ! is_wp_error( $form ), 'Cannot create synthetic form' );
$api = new Gravity_Flow_API( $form );
$step = $api->add_step( array( 'step_name' => 'Officer Review', 'step_type' => 'approval', 'type' => 'select',
    'assignees' => array( 'user_id|' . $officer ), 'assignee_policy' => 'all',
    'display_fields_mode' => 'selected_fields', 'display_fields_selected' => array( '1', '3', '4' ) ) );
$next = $api->add_step( array( 'step_name' => 'Role Review', 'step_type' => 'approval', 'type' => 'select',
    'assignees' => array( 'role|author' ), 'assignee_policy' => 'all', 'display_fields_mode' => 'all_fields' ) );
ciq_assert( $step && $next && ! is_wp_error( $step ) && ! is_wp_error( $next ), 'Cannot create steps' );
$entries = array();
foreach ( array( 'الف', 'ب', 'پ' ) as $index => $label ) {
    $id = GFAPI::add_entry( array( 'form_id' => $form, 'created_by' => $admin,
        '1' => 'دانش‌آموز آزمایشی ' . $label . ( 2 === $index ? ' <b id="ciq-unescaped">X</b>' : '' ), '2' => 'CIQ_WITHHELD_' . $index,
        '3' => 'مدرسه آزمایشی', '4' => 'پایه آزمایشی' ) );
    ciq_assert( ! is_wp_error( $id ), 'Cannot create entry' );
    $api->process_workflow( $id ); $entries[] = (int) $id;
}
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
update_option( 'ciq_native_url', $manifest['frontend_inbox_url'], false );
update_option( 'ciq_fixture', array( 'form_id' => (int) $form, 'step_id' => (int) $step, 'next_step' => (int) $next,
    'entries' => $entries, 'officer' => (int) $officer, 'viewer' => (int) $viewer, 'admin' => (int) $admin, 'receiver' => (int) $receiver ), false );
// Provision ALL forms before the first native global query: Flow caches its form
// inventory per request. Never clear or rewrite that private host cache.
(static function () { require dirname( __DIR__ ) . '/repro-evidence-lab/inbox-mixed-readiness-fixture.php'; })();
$report = array( 'gate_a' => 'PASS_SOURCE_INSPECTED', 'gate_b' => 'RUNNING', 'comparisons' => array(), 'checks' => array() );
$save = static function () use ( &$report ) { file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq-headless.json', wp_json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) ); };
try {
    foreach ( array( 'officer' => $officer, 'viewer' => $viewer, 'administrator' => $admin, 'role_receiver_empty' => $receiver ) as $name => $uid ) {
        $report['comparisons'][ $name ] = ciq_compare( $uid );
        $report['comparisons'][ $name . '_form' ] = ciq_compare( $uid, array( 'form_id' => $form ) );
    }
    ciq_assert( count( $report['comparisons']['officer']['candidate'] ) === 3, 'Expected three officer tasks' );
    ciq_assert( empty( $report['comparisons']['viewer']['candidate'] ), 'Unassigned viewer leaked tasks' );
    wp_set_current_user( $officer );
    $raw = ciq_entries(); $projected = ciq_project( $raw );
    ciq_assert( strpos( wp_json_encode( $raw ), 'CIQ_WITHHELD_' ) !== false, 'Adversarial raw field witness absent' );
    $scanner = static function ( $value ) { return strpos( wp_json_encode( $value ), 'CIQ_WITHHELD_' ) === false; };
    ciq_assert( $scanner( $projected ) && ! $scanner( $raw ), 'Disclosure scanner failed positive or negative control' );
    $final_filter_active = (bool) has_filter( 'gform_field_content' );
    $report['field_scope'] = $final_filter_active ? 'METADATA_ONLY_PERSONAL_FIELDS_NOT_PROVEN' : 'SIMPLE_TEXT_FIELDS';
    foreach ( $projected as $r ) {
        ciq_assert( ! isset( $r['fields']['2'] ), 'Withheld field disclosed' );
        if ( $final_filter_active ) {
            ciq_assert( empty( $r['fields'] ), 'Unqualified final output filter must omit every personal field' );
        } else {
            ciq_assert( isset( $r['fields']['1'] ), 'Qualified visible field missing' );
        }
    }
    $report['field_projection_readiness'] = $final_filter_active ? 'FIELD_VISIBILITY_NOT_PROVEN__ALL_PERSONAL_FIELDS_OMITTED' : 'SIMPLE_TEXT_ONLY';
    $report['checks']['raw_api_is_not_a_field_authorization_boundary'] = 'DEMONSTRATED';
    $report['checks']['withheld_field_projection_and_same_scanner_raw_mutant'] = 'PASS';
    $deny_field = static function ( $allowed, $field ) { return (int) $field->id === 3 ? false : $allowed; };
    add_filter( 'gravityflow_workflow_detail_display_field', $deny_field, 10, 2 );
    $filtered = ciq_project( ciq_entries() );
    foreach ( $filtered as $r ) { ciq_assert( ! isset( $r['fields']['3'] ), 'Native visibility filter bypass' ); }
    remove_filter( 'gravityflow_workflow_detail_display_field', $deny_field, 10 );
    $report['checks']['native_field_visibility_filter'] = 'PASS';
    $mask = static function ( $value, $field ) { return (int) $field->id === 3 ? 'CIQ_MASKED_SCHOOL' : $value; };
    add_filter( 'gform_entry_field_value', $mask, 10, 2 );
    $masked = ciq_project( ciq_entries() );
    foreach ( $masked as $r ) {
        ciq_assert( $final_filter_active ? empty( $r['fields'] ) : $r['fields']['3'] === 'CIQ_MASKED_SCHOOL', 'Native value masking bypass' );
    }
    // The earlier raw-value projection would still disclose the original value.
    ciq_assert( $raw[0]['3'] === 'مدرسه آزمایشی', 'Raw-value negative witness absent' );
    $entry = GFAPI::get_entry( $entries[0] );
    ob_start(); Gravity_Flow_Entry_Detail::entry_detail( GFAPI::get_form( $form ), $entry, $api->get_current_step( $entry ) ); $masked_html = ob_get_clean();
    ciq_assert( strpos( $masked_html, 'CIQ_MASKED_SCHOOL' ) !== false && strpos( $masked_html, 'مدرسه آزمایشی' ) === false, 'Native masking witness failed' );
    remove_filter( 'gform_entry_field_value', $mask, 10 );
    $report['checks']['native_value_masking_and_raw_value_counterexample'] = 'PASS';
    $report['candidate_masked_field_rendering'] = $final_filter_active ? 'NOT_EXECUTED__CONSERVATIVE_OMISSION' : 'PASS';
    $hide_content = static function () { return ''; };
    add_filter( 'gform_field_content', $hide_content );
    foreach ( ciq_project( ciq_entries() ) as $r ) { ciq_assert( empty( $r['fields'] ), 'Unqualified final HTML filter must omit fields' ); }
    remove_filter( 'gform_field_content', $hide_content );
    $report['checks']['unqualified_final_field_html_filters_omit_fields'] = 'PASS';
    $deny_entry = static function () { return false; };
    add_filter( 'gravityflow_permission_granted_entry_detail', $deny_entry );
    ciq_assert( is_wp_error( ciq_project( ciq_entries() ) ), 'Native entry denial filter bypass' );
    remove_filter( 'gravityflow_permission_granted_entry_detail', $deny_entry );
    $report['checks']['native_entry_denial_filter'] = 'PASS';
    // Native view, rather than a copied field policy, is the disclosure witness.
    $entry = GFAPI::get_entry( $entries[0] );
    ob_start(); Gravity_Flow_Entry_Detail::entry_detail( GFAPI::get_form( $form ), $entry, $api->get_current_step( $entry ) ); $html = ob_get_clean();
    ciq_assert( strpos( $html, 'CIQ_WITHHELD_' ) === false && strpos( $html, 'دانش‌آموز' ) !== false, 'Native withheld/visible field witness failed' );
    $report['checks']['authentic_native_entry_detail_withheld_field'] = 'PASS';
    // Genuine host transition; only this CLI fixture changes synthetic workflow.
    wp_set_current_user( $admin );
    $api->send_to_step( GFAPI::get_entry( $entries[0] ), $next );
    $report['comparisons']['officer_after_transition'] = ciq_compare( $officer );
    $report['comparisons']['receiver_after_transition'] = ciq_compare( $receiver );
    ciq_assert( count( $report['comparisons']['officer_after_transition']['candidate'] ) === 2, 'Stale officer task survived transition' );
    ciq_assert( count( $report['comparisons']['receiver_after_transition']['candidate'] ) === 1, 'Role assignment was not host-selected' );
    wp_set_current_user( $officer );
    $entry = GFAPI::get_entry( $entries[0] );
    ciq_assert( ! Gravity_Flow_Entry_Detail::is_permission_granted( $entry, GFAPI::get_form( $form ), $api->get_current_step( $entry ) ), 'Stale assignee retains entry permission' );
    wp_set_current_user( 0 );
    ciq_assert( is_wp_error( ciq_entries() ), 'Unauthenticated candidate query allowed' );
    $report['checks']['native_transition_role_assignment_stale_access'] = 'PASS';
    $report['checks']['unauthenticated_denial'] = 'PASS';
    wp_set_current_user( $viewer );
    $attack = ciq_entries( array( 'filter_key' => 'workflow_user_id_' . $officer, 'user_id' => $officer, 'step_id' => $step, 'form_id' => $form ) );
    ciq_assert( is_array( $attack ) && empty( $attack ), 'User-controlled query identity broadened task set' );
    $report['checks']['query_identity_injection_denied'] = 'PASS';
    $report['gate_b'] = 'PASS_HEADLESS_TESTED_SCOPE';
    update_option( 'ciq_gate_b_passed', true, false );
    $save();
    echo "CIQ_GATE_B_PASS\n";
} catch ( Throwable $error ) {
    $report['gate_b'] = 'FAIL'; $report['error'] = $error->getMessage(); $save(); throw $error;
}
