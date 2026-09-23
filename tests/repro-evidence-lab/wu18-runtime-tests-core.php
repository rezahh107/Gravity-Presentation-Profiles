<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationAdapter;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $manifest )
    || empty( $manifest['alpha'] )
    || empty( $manifest['editor'] )
    || empty( $manifest['negative'] )
    || empty( $manifest['viewer'] )
    || empty( $manifest['transition'] ) ) {
    throw new RuntimeException( 'WU18 fixture manifest unavailable.' );
}

$operator = get_user_by( 'login', 'bootstrap_admin' );
$viewer = get_user_by( 'login', 'wu21_viewer' );
if ( ! $operator || ! $viewer ) {
    throw new RuntimeException( 'Pinned WU18 users unavailable.' );
}
if ( ! class_exists( 'Gravity_Flow_Entry_Detail' ) ) {
    require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
}

function wu18_assert( $condition, $message ) {
    if ( ! $condition ) {
        throw new RuntimeException( $message );
    }
}

function wu18_fresh_step( $form_id, $entry_id ) {
    $entry = GFAPI::get_entry( $entry_id );
    if ( is_wp_error( $entry ) ) {
        throw new RuntimeException( $entry->get_error_message() );
    }
    return ( new Gravity_Flow_API( (int) $form_id ) )->get_current_step( $entry );
}

function wu18_effective_editable_fields( $step ) {
    if ( ! is_object( $step ) || ! method_exists( $step, 'get_editable_fields' ) ) {
        throw new RuntimeException( 'WU18 host step does not expose effective editable fields.' );
    }
    $fields = $step->get_editable_fields();
    if ( ! is_array( $fields ) ) {
        throw new RuntimeException( 'WU18 host editable-field state is not an array.' );
    }
    return array_values( array_filter( array_map( 'strval', $fields ), 'strlen' ) );
}

function wu18_render_entry( $form_id, $entry_id ) {
    $form = GFAPI::get_form( $form_id );
    $entry = GFAPI::get_entry( $entry_id );
    $api = new Gravity_Flow_API( $form_id );
    $step = $api->get_current_step( $entry );
    EntryDetailPresentationAdapter::resetRuntimeCache();
    ob_start();
    Gravity_Flow_Entry_Detail::entry_detail( $form, $entry, $step, array( 'show_header' => false ) );
    $html = ob_get_clean();
    return array( $html, $form, $entry, $step, RuntimeDiagnostics::snapshot( 'gravity_flow.entry_detail' ) );
}

function wu18_trace_event( $trace, $stage, $result = null ) {
    if ( ! is_array( $trace ) || empty( $trace['events'] ) || ! is_array( $trace['events'] ) ) {
        return null;
    }
    foreach ( $trace['events'] as $event ) {
        if ( $stage !== $event['stage'] ) continue;
        if ( null !== $result && $result !== $event['result'] ) continue;
        return $event;
    }
    return null;
}

function wu18_trace_reason( $trace, $stage, $reason ) {
    if ( ! is_array( $trace ) || empty( $trace['events'] ) || ! is_array( $trace['events'] ) ) {
        return null;
    }
    foreach ( $trace['events'] as $event ) {
        if ( $stage === $event['stage'] && $reason === ( isset( $event['reason_code'] ) ? $event['reason_code'] : null ) ) {
            return $event;
        }
    }
    return null;
}

function wu18_assert_read_only_marker( $html, $label ) {
    wu18_assert( false !== strpos( $html, 'data-gpp-entry-detail="ready"' ), $label . ': GPP dossier missing.' );
    wu18_assert( false !== strpos( $html, 'data-gpp-review-mode="read-only"' ), $label . ': read-only review marker missing.' );
    wu18_assert( false !== strpos( $html, 'data-gpp-native-table-suppression="read-only-review"' ), $label . ': native-table suppression marker missing.' );
    wu18_assert( false !== strpos( $html, 'entry-detail-view' ), $label . ': native host field table missing from server HTML.' );
    wu18_assert( false === strpos( $html, 'gpp-entry-dossier--composed' ), $label . ': obsolete JS-composed state leaked.' );
    foreach ( array( 'data-gpp-native-status', 'data-gpp-native-editor', 'data-gpp-native-instructions', 'data-gpp-native-history', 'data-gpp-composition-state' ) as $obsolete ) {
        wu18_assert( false === strpos( $html, $obsolete ), $label . ': obsolete composition destination leaked: ' . $obsolete );
    }
}

wp_set_current_user( $operator->ID );
PrintDossierPresentationAdapter::resetRuntimeCache();
$binding_hash_before_runtime = hash( 'sha256', wp_json_encode( get_option( BindingSetLifecycle::OPTION_NAME ) ) );

// Read the positive Review state from a freshly resolved authentic Gravity Flow
// step before rendering. Test-local expectations/feed meta are not proof.
$alpha_fresh = wu18_fresh_step( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
wu18_assert( $alpha_fresh && 'approval' === $alpha_fresh->get_type(), 'Positive Review fixture is not native Approval.' );
wu18_assert( Gravity_Flow_Entry_Detail::can_update( $alpha_fresh ), 'Positive Review operator lacks native Approval update/action eligibility.' );
wu18_assert( array() === wu18_effective_editable_fields( $alpha_fresh ), 'Positive Review fixture unexpectedly requires a native editor.' );

list( $alpha_html, $alpha_form, $alpha_entry, $alpha_step, $alpha_trace ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
wu18_assert( is_array( $alpha_form ) && is_array( $alpha_entry ) && $alpha_step && 'approval' === $alpha_step->get_type(), 'Alpha native Approval context unavailable.' );
wu18_assert( Gravity_Flow_Entry_Detail::is_permission_granted( $alpha_entry, $alpha_form, $alpha_step ), 'Operator lost native Entry Detail permission.' );
wu18_assert( Gravity_Flow_Entry_Detail::can_update( $alpha_step ), 'Operator is not the native current Approval assignee/update subject.' );
wu18_assert( array() === wu18_effective_editable_fields( $alpha_step ), 'Rendered Review fixture gained effective editable fields.' );
wu18_assert_read_only_marker( $alpha_html, 'Alpha Review' );
wu18_assert( false !== strpos( $alpha_html, 'data-gpp-profile-id="srwf.operations.entry-detail.v1"' ), 'Current Operations Entry Detail profile was not rendered.' );
wu18_assert( false !== strpos( $alpha_html, 'value="approved"' ), 'Native Approve control missing.' );
wu18_assert( false !== strpos( $alpha_html, 'value="rejected"' ), 'Native Reject control missing.' );
wu18_assert( false !== strpos( $alpha_html, 'value="revert"' ), 'Native Revert control missing.' );
wu18_assert( false !== strpos( $alpha_html, 'name="gravityflow_note"' ), 'Native Approval note control missing.' );
wu18_assert( false !== strpos( $alpha_html, 'name="_wpnonce"' ), 'Native workflow nonce missing.' );
wu18_assert( false !== strpos( $alpha_html, 'gravityflow-status-box' ), 'Native workflow/status box missing.' );
wu18_assert( false !== strpos( $alpha_html, 'gravityflow-timeline' ), 'Native Timeline missing.' );
wu18_assert( false !== strpos( $alpha_html, 'detail-view-print' ), 'Native Print utility missing.' );
wu18_assert( false !== strpos( $alpha_html, 'data-gpp-print-utility="dossier"' ), 'Existing independent GPP Print utility missing.' );
wu18_assert( null !== wu18_trace_event( $alpha_trace, 'ENTRY_DETAIL_BINDING_READINESS', 'PASS' ), 'Successful structural-readiness trace missing.' );
wu18_assert( null !== wu18_trace_event( $alpha_trace, 'ENTRY_DETAIL_APPROVAL_ELIGIBILITY', 'PASS' ), 'Native Approval eligibility trace missing.' );
wu18_assert( null !== wu18_trace_event( $alpha_trace, 'ENTRY_DETAIL_PRESENTATION_OUTPUT', 'PASS' ), 'Successful dossier output trace missing.' );
wu18_assert( null !== wu18_trace_reason( $alpha_trace, 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION', 'server_admitted_read_only_gpp_review' ), 'Server suppression admission trace missing.' );

// One UNMAPPED semantic plus visible empty and stale-file states must degrade
// independently without returning the duplicate native visual presentation.
$negative_entry_id = (int) $manifest['negative']['entry_id'];
$home_field_id = (string) $manifest['alpha']['fields']['student.home_phone'];
$document_field_id = (string) $manifest['alpha']['fields']['documents.report_card'];
$negative_entry = GFAPI::get_entry( $negative_entry_id );
$original_home = isset( $negative_entry[ $home_field_id ] ) ? $negative_entry[ $home_field_id ] : '';
$original_document = isset( $negative_entry[ $document_field_id ] ) ? $negative_entry[ $document_field_id ] : '';
wu18_assert( ! is_wp_error( GFAPI::update_entry_field( $negative_entry_id, $home_field_id, '' ) ), 'Unable to create mapped-empty control.' );
wu18_assert( ! is_wp_error( GFAPI::update_entry_field( $negative_entry_id, $document_field_id, 'not-a-valid-url' ) ), 'Unable to create stale-file control.' );
try {
    list( $negative_html, , , , $negative_trace ) = wu18_render_entry( $manifest['negative']['form_id'], $negative_entry_id );
    wu18_assert_read_only_marker( $negative_html, 'Degraded Review' );
    wu18_assert( 1 === preg_match( '/data-gpp-slot="student\.national_id"[^>]*>.*?<dd>\s*نگاشت نشده\s*<\/dd>/su', $negative_html ), 'UNMAPPED semantic did not degrade in-place.' );
    wu18_assert( 1 === preg_match( '/data-gpp-slot="student\.home_phone"[^>]*>.*?<dd>\s*ثبت نشده\s*<\/dd>/su', $negative_html ), 'MAPPED_EMPTY semantic did not degrade in-place.' );
    wu18_assert( false !== strpos( $negative_html, 'data-gpp-slot="documents.report_card"' ) && false !== strpos( $negative_html, 'نگاشت معتبر نیست' ), 'STALE document semantic did not degrade in-place.' );
    wu18_assert( null !== wu18_trace_reason( $negative_trace, 'ENTRY_DETAIL_SEMANTIC_COMPLETENESS', 'semantic.student.national_id.unmapped' ), 'UNMAPPED diagnostic missing.' );
    wu18_assert( null !== wu18_trace_reason( $negative_trace, 'ENTRY_DETAIL_SEMANTIC_COMPLETENESS', 'semantic.student.home_phone.mapped_empty' ), 'MAPPED_EMPTY diagnostic missing.' );
    wu18_assert( null !== wu18_trace_reason( $negative_trace, 'ENTRY_DETAIL_SEMANTIC_COMPLETENESS', 'semantic.documents.report_card.invalid_file_metadata' ), 'STALE file diagnostic missing.' );
    wu18_assert( null !== wu18_trace_reason( $negative_trace, 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION', 'server_admitted_read_only_gpp_review' ), 'Semantic degradation incorrectly disabled suppression admission.' );
} finally {
    GFAPI::update_entry_field( $negative_entry_id, $home_field_id, $original_home );
    GFAPI::update_entry_field( $negative_entry_id, $document_field_id, $original_document );
}

// HOST_HIDDEN remains an information boundary. Use Gravity Flow's own display
// predicate filter, then prove GPP omits the slot/value rather than treating it
// like an ordinary degraded placeholder.
$hidden_sentinel = 'WU18-HIDDEN-SENTINEL-DO-NOT-RENDER';
$alpha_home_original = isset( $alpha_entry[ $home_field_id ] ) ? $alpha_entry[ $home_field_id ] : '';
wu18_assert( ! is_wp_error( GFAPI::update_entry_field( $alpha_entry['id'], $home_field_id, $hidden_sentinel ) ), 'Unable to create HOST_HIDDEN control.' );
$hide_home_phone = static function ( $display, $field ) use ( $home_field_id ) {
    return is_object( $field ) && (string) $field->id === $home_field_id ? false : $display;
};
add_filter( 'gravityflow_workflow_detail_display_field', $hide_home_phone, 99, 2 );
try {
    list( $hidden_html, , , , $hidden_trace ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
    wu18_assert_read_only_marker( $hidden_html, 'HOST_HIDDEN Review' );
    wu18_assert( false === strpos( $hidden_html, $hidden_sentinel ), 'HOST_HIDDEN value leaked.' );
    wu18_assert( false === strpos( $hidden_html, 'data-gpp-slot="student.home_phone"' ), 'HOST_HIDDEN slot rendered a GPP placeholder.' );
    wu18_assert( null !== wu18_trace_reason( $hidden_trace, 'ENTRY_DETAIL_SEMANTIC_COMPLETENESS', 'semantic.student.home_phone.host_hidden' ), 'HOST_HIDDEN diagnostic missing.' );
} finally {
    remove_filter( 'gravityflow_workflow_detail_display_field', $hide_home_phone, 99 );
    GFAPI::update_entry_field( $alpha_entry['id'], $home_field_id, $alpha_home_original );
}

// Dedicated stable Approval editor fixture. Resolve the host state fresh and
// prove effective editability before asserting GPP's conservative fallback.
$editor_fresh = wu18_fresh_step( $manifest['editor']['form_id'], $manifest['editor']['entry_id'] );
wu18_assert( $editor_fresh && 'approval' === $editor_fresh->get_type(), 'Editor fixture is not native Approval.' );
wu18_assert( Gravity_Flow_Entry_Detail::can_update( $editor_fresh ), 'Editor fixture operator lacks native update eligibility.' );
$editor_effective_fields = wu18_effective_editable_fields( $editor_fresh );
wu18_assert( in_array( (string) $manifest['editor']['editable_field_id'], $editor_effective_fields, true ), 'Editor fixture effective fields do not contain review.reason.' );

list( $editor_html, , , $editor_step, $editor_trace ) = wu18_render_entry( $manifest['editor']['form_id'], $manifest['editor']['entry_id'] );
wu18_assert( $editor_step && Gravity_Flow_Entry_Detail::can_update( $editor_step ), 'Editor fallback fixture lost native update eligibility.' );
wu18_assert( in_array( (string) $manifest['editor']['editable_field_id'], wu18_effective_editable_fields( $editor_step ), true ), 'Rendered editor fixture lost effective native editability.' );
wu18_assert( false === strpos( $editor_html, 'data-gpp-entry-detail="ready"' ), 'Approval editor request incorrectly emitted GPP dossier.' );
wu18_assert( false === strpos( $editor_html, 'data-gpp-native-table-suppression' ), 'Approval editor request incorrectly emitted suppression marker.' );
wu18_assert( false !== strpos( $editor_html, 'entry-detail-view' ) && false !== strpos( $editor_html, 'gform_wrapper' ), 'Native Approval editor was not preserved.' );
wu18_assert( null !== wu18_trace_reason( $editor_trace, 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION', 'native_editor_required' ), 'Native-editor fallback diagnostic missing.' );
wu18_assert( null !== wu18_trace_reason( $editor_trace, 'ENTRY_DETAIL_PRESENTATION_OUTPUT', 'native_editor_required' ), 'Native-editor output SKIP diagnostic missing.' );

// A structurally invalid host payload must not produce a marker or enqueue the
// progressive-enhancement script. Native host rendering is unaffected because
// this direct adapter control never touches it.
if ( function_exists( 'wp_dequeue_script' ) ) {
    wp_dequeue_script( EntryDetailPresentationAdapter::SCRIPT_HANDLE );
}
wu18_assert(
    ! function_exists( 'wp_script_is' ) || ! wp_script_is( EntryDetailPresentationAdapter::SCRIPT_HANDLE, 'enqueued' ),
    'Structural fallback control could not establish a clean Entry Detail script queue.'
);
EntryDetailPresentationAdapter::resetRuntimeCache();
$bad_entry = $alpha_entry;
$bad_entry['form_id'] = (int) $alpha_entry['form_id'] + 999;
ob_start();
EntryDetailPresentationAdapter::renderDossier( $alpha_form, $bad_entry );
$bad_html = ob_get_clean();
$bad_trace = RuntimeDiagnostics::snapshot( 'gravity_flow.entry_detail' );
wu18_assert( '' === $bad_html, 'Structurally invalid host payload emitted GPP output.' );
wu18_assert(
    ! function_exists( 'wp_script_is' ) || ! wp_script_is( EntryDetailPresentationAdapter::SCRIPT_HANDLE, 'enqueued' ),
    'Structurally invalid dossier admission enqueued progressive-enhancement JS.'
);
wu18_assert( null !== wu18_trace_reason( $bad_trace, 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION', 'structural_readiness_not_satisfied' ), 'Structural fallback suppression diagnostic missing.' );

// Profile inactive is a native-only request: prove the output/suppression gate
// directly, while existing production-activation tests cover lifecycle storage.
EntryDetailPresentationAdapter::resetRuntimeCache();
$adapter_reflection = new ReflectionClass( EntryDetailPresentationAdapter::class );
$model_loaded = $adapter_reflection->getProperty( 'model_loaded' );
$model_loaded->setAccessible( true );
$model_property = $adapter_reflection->getProperty( 'model' );
$model_property->setAccessible( true );
$model_loaded->setValue( null, true );
$model_property->setValue( null, null );
ob_start();
EntryDetailPresentationAdapter::renderDossier( $alpha_form, $alpha_entry );
$inactive_html = ob_get_clean();
$inactive_trace = RuntimeDiagnostics::snapshot( 'gravity_flow.entry_detail' );
wu18_assert( '' === $inactive_html, 'Inactive profile emitted GPP output.' );
wu18_assert( null !== wu18_trace_reason( $inactive_trace, 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION', 'profile_inactive' ), 'Inactive-profile suppression diagnostic missing.' );
EntryDetailPresentationAdapter::resetRuntimeCache();

// A stable synthetic creator-view entry makes the subscriber an authentically
// authorized non-assignee while the Approval assignee remains the operator.
wp_set_current_user( $viewer->ID );
$viewer_fresh = wu18_fresh_step( $manifest['viewer']['form_id'], $manifest['viewer']['entry_id'] );
wu18_assert( $viewer_fresh && 'approval' === $viewer_fresh->get_type(), 'Read-only viewer fixture is not native Approval.' );
wu18_assert( ! Gravity_Flow_Entry_Detail::can_update( $viewer_fresh ), 'Viewer unexpectedly became current Approval assignee.' );
list( $viewer_html, $viewer_form, $viewer_entry_runtime, $viewer_step, $viewer_trace ) = wu18_render_entry( $manifest['viewer']['form_id'], $manifest['viewer']['entry_id'] );
wu18_assert( Gravity_Flow_Entry_Detail::is_permission_granted( $viewer_entry_runtime, $viewer_form, $viewer_step ), 'Viewer lost native Entry Detail authorization.' );
wu18_assert( ! Gravity_Flow_Entry_Detail::can_update( $viewer_step ), 'Viewer unexpectedly gained native update eligibility.' );
wu18_assert_read_only_marker( $viewer_html, 'Authorized read-only viewer' );
wu18_assert( false === strpos( $viewer_html, 'value="approved"' ) && false === strpos( $viewer_html, 'value="rejected"' ), 'Non-assignee received native Approval actions.' );
wu18_assert( null !== wu18_trace_reason( $viewer_trace, 'ENTRY_DETAIL_APPROVAL_ELIGIBILITY', 'current_assignee_not_eligible' ), 'Non-assignee Approval diagnostic missing.' );
wu18_assert( null !== wu18_trace_reason( $viewer_trace, 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION', 'server_admitted_read_only_gpp_review' ), 'Read-only viewer suppression admission missing.' );

// A genuinely unauthorized request must never reach the GPP post-permission
// seam. Gravity Flow's denial remains authoritative.
wp_set_current_user( 0 );
list( $denied_html ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
wu18_assert( false === strpos( $denied_html, 'data-gpp-entry-detail="ready"' ), 'Native authorization denial was bypassed by GPP.' );
wu18_assert( false === strpos( $denied_html, 'data-gpp-native-table-suppression' ), 'Denied request emitted suppression marker.' );

wp_set_current_user( $operator->ID );
EntryDetailPresentationAdapter::resetRuntimeCache();

$binding_hash_after = hash( 'sha256', wp_json_encode( get_option( BindingSetLifecycle::OPTION_NAME ) ) );
wu18_assert( $binding_hash_after === $binding_hash_before_runtime, 'Runtime Review qualification unexpectedly mutated EnvironmentBindingSet state.' );

$results = array(
    'schema_version' => '5.0.0',
    'surface' => 'gravity_flow.entry_detail',
    'profile_id' => $manifest['profile_id'],
    'host_versions' => array(
        'gravity_forms' => class_exists( 'GFCommon' ) && method_exists( 'GFCommon', 'get_version' ) ? GFCommon::get_version() : null,
        'gravity_flow' => defined( 'GRAVITY_FLOW_VERSION' ) ? GRAVITY_FLOW_VERSION : null,
    ),
    'effective_fixture_state' => array(
        'read_only_review' => array(
            'step_type' => $alpha_fresh->get_type(),
            'operator_can_update' => true,
            'effective_editable_fields' => array(),
        ),
        'approval_editor' => array(
            'step_type' => $editor_fresh->get_type(),
            'operator_can_update' => true,
            'effective_editable_fields' => $editor_effective_fields,
        ),
        'authorized_non_assignee' => array(
            'step_type' => $viewer_fresh->get_type(),
            'viewer_can_update' => false,
            'native_permission' => true,
        ),
    ),
    'server_read_only_review' => array(
        'dossier_emitted' => true,
        'suppression_marker_emitted' => true,
        'native_field_table_retained_in_html' => true,
        'native_approve_reject_revert_note_nonce_present' => true,
        'native_timeline_present' => true,
        'print_independent' => true,
        'structural_js_required' => false,
    ),
    'semantic_degradation' => array(
        'unmapped' => 'student.national_id',
        'mapped_empty' => 'student.home_phone',
        'stale' => 'documents.report_card',
        'dossier_retained' => true,
        'suppression_retained' => true,
        'host_hidden_omitted' => true,
    ),
    'fallbacks' => array(
        'native_editor_required' => true,
        'structural_readiness_not_satisfied' => true,
        'profile_inactive' => true,
    ),
    'decision_controls' => array(
        'success' => $alpha_trace,
        'semantic_degradation' => $negative_trace,
        'authorized_non_assignee' => $viewer_trace,
        'native_editor_required' => $editor_trace,
        'structural_fallback' => $bad_trace,
        'profile_inactive' => $inactive_trace,
    ),
);

file_put_contents(
    trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json',
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU18_RUNTIME_CORE_PASS\n";