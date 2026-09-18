<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\BoundHostValueReader;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierRuntime;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu18_fixture_manifest' );
$base_manifest = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $manifest ) || ! is_array( $base_manifest ) ) {
    throw new RuntimeException( 'WU18 fixture manifest unavailable.' );
}
$operator = get_user_by( 'login', 'bootstrap_admin' );
$viewer = get_user_by( 'login', 'wu21_viewer' );
if ( ! $operator || ! $viewer ) throw new RuntimeException( 'Pinned users unavailable.' );
if ( ! class_exists( 'Gravity_Flow_Entry_Detail' ) ) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';

function wu18_assert( $condition, $message ) {
    if ( ! $condition ) throw new RuntimeException( $message );
}

function wu18_render_entry( $form_id, $entry_id ) {
    $form = GFAPI::get_form( $form_id );
    $entry = GFAPI::get_entry( $entry_id );
    $api = new Gravity_Flow_API( $form_id );
    $step = $api->get_current_step( $entry );
    ob_start();
    Gravity_Flow_Entry_Detail::entry_detail( $form, $entry, $step, array( 'show_header' => false ) );
    return array( ob_get_clean(), $form, $entry, $step );
}

function wu18_base_form_meta( $base_manifest, $form_id ) {
    foreach ( $base_manifest['forms'] as $form_meta ) {
        if ( (int) $form_meta['form_id'] === (int) $form_id ) return $form_meta;
    }
    throw new RuntimeException( 'Base WU21 form metadata unavailable.' );
}

function wu18_base_entry_meta( $base_manifest, $entry_id ) {
    foreach ( $base_manifest['entry_records'] as $entry_meta ) {
        if ( (int) $entry_meta['entry_id'] === (int) $entry_id ) return $entry_meta;
    }
    throw new RuntimeException( 'Base WU21 entry metadata unavailable.' );
}

function wu18_host_file_contract( $form, $entry, $field_id ) {
    $field = GFAPI::get_field( $form, $field_id );
    wu18_assert( is_object( $field ) && 'fileupload' === $field->type, 'Expected host File Upload field unavailable.' );
    $raw = isset( $entry[ (string) $field_id ] ) ? $entry[ (string) $field_id ] : null;
    $files = $field->to_array( $raw );
    wu18_assert( is_array( $files ) && 1 === count( array_filter( $files ) ) && ! empty( $files[0] ) && is_scalar( $files[0] ), 'Host File Upload value did not normalize to one stored URL.' );
    $stored_url = (string) $files[0];
    $name_metadata = $field->get_file_name_from_url( $stored_url );
    wu18_assert( is_array( $name_metadata ) && isset( $name_metadata['sanitized'] ) && is_string( $name_metadata['sanitized'] ) && '' !== $name_metadata['sanitized'], 'Pinned Gravity Forms filename metadata was unusable.' );
    $download_url = $field->get_download_url( $stored_url, false, (int) $entry['id'] );
    wu18_assert( is_string( $download_url ) && '' !== $download_url, 'Host File Upload download URL unavailable.' );
    return array( 'field' => $field, 'name' => $name_metadata['sanitized'], 'download_url' => $download_url );
}

function wu18_html_uses_host_url( $html, $url ) {
    return false !== strpos( html_entity_decode( $html, ENT_QUOTES | ENT_HTML5, 'UTF-8' ), $url );
}

function wu18_trace_event( $trace, $stage, $result = null ) {
    if ( ! is_array( $trace ) || empty( $trace['events'] ) ) return null;
    foreach ( $trace['events'] as $event ) {
        if ( $stage !== $event['stage'] ) continue;
        if ( null !== $result && $result !== $event['result'] ) continue;
        return $event;
    }
    return null;
}

function wu18_trace_reason( $trace, $stage, $reason ) {
    if ( ! is_array( $trace ) || empty( $trace['events'] ) ) return null;
    foreach ( $trace['events'] as $event ) {
        if ( $stage !== $event['stage'] ) continue;
        if ( $reason !== ( isset( $event['reason_code'] ) ? $event['reason_code'] : null ) ) continue;
        return $event;
    }
    return null;
}

function wu18_active_binding_artifact( $binding_set_id, $version = '1.0.0' ) {
    $reader = new BindingSetLifecycle(
        new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
        new EvidenceReferenceGate( array() )
    );
    $snapshot = $reader->snapshot();
    if ( empty( $snapshot['installed'][ $binding_set_id ][ $version ]['artifact'] ) ) {
        throw new RuntimeException( 'Expected WU18 binding artifact missing: ' . $binding_set_id );
    }
    return $snapshot['installed'][ $binding_set_id ][ $version ]['artifact'];
}

function wu18_binding_row( $artifact, $slot ) {
    foreach ( $artifact['bindings'] as $binding ) {
        if ( $slot === $binding['semantic_slot_key'] ) return $binding;
    }
    throw new RuntimeException( 'Binding row unavailable: ' . $slot );
}

function wu18_set_print_runtime_resolution( $resolution ) {
    $runtime = new ReflectionClass( PrintDossierRuntime::class );
    $loaded = $runtime->getProperty( 'model_loaded' );
    $loaded->setAccessible( true );
    $model_resolution = $runtime->getProperty( 'model_resolution' );
    $model_resolution->setAccessible( true );
    $loaded->setValue( null, true );
    $model_resolution->setValue( null, $resolution );
}

wu18_assert( 'srwf.operations.entry-detail.v1' === $manifest['profile_id'], 'WU18 did not load the current Operations Entry Detail profile.' );
wu18_assert( 'shared.entry_detail.v1' === $manifest['legacy_profile_excluded'], 'WU18 legacy-fixture exclusion control is missing.' );

$alpha_binding = wu18_active_binding_artifact( 'wu18.operations.alpha.v1' );
foreach ( array( 'student.full_name', 'print.utility', 'workflow.approve_action', 'workflow.reject_action' ) as $unbound_slot ) {
    $row = wu18_binding_row( $alpha_binding, $unbound_slot );
    wu18_assert( 'UNBOUND' === $row['state'] && null === $row['source_ref'], 'WU18 fabricated a direct source for ' . $unbound_slot );
}
$stale_permission_claim = false;
foreach ( $alpha_binding['runtime_claims'] as $claim ) {
    if ( 'workflow.approve_action' === $claim['semantic_slot_key'] && 'action_permission' === $claim['claim'] && 'PROVEN' === $claim['evidence_state'] ) {
        $stale_permission_claim = true;
        break;
    }
}
wu18_assert( $stale_permission_claim, 'Stale action-permission falsification claim is missing.' );

wp_set_current_user( $operator->ID );
PrintDossierPresentationAdapter::resetRuntimeCache();
EntryDetailPresentationAdapter::resetRuntimeCache();
list( $alpha_html, $alpha_form, $alpha_entry, $alpha_step ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
$alpha_trace = RuntimeDiagnostics::snapshot( 'gravity_flow.entry_detail' );

wu18_assert( $alpha_step && 'approval' === $alpha_step->get_type(), 'Alpha current step is not native Approval.' );
wu18_assert( Gravity_Flow_Entry_Detail::is_permission_granted( $alpha_entry, $alpha_form, $alpha_step ), 'Operator lost native Entry Detail permission.' );
wu18_assert( Gravity_Flow_Entry_Detail::can_update( $alpha_step ), 'Operator is not the native current Approval assignee/update subject.' );
wu18_assert( false !== strpos( $alpha_html, 'data-gpp-profile-id="srwf.operations.entry-detail.v1"' ), 'Current Operations Entry Detail profile was not rendered.' );
wu18_assert( false === strpos( $alpha_html, 'data-gpp-profile-id="shared.entry_detail.v1"' ), 'Legacy WU09 Entry Detail profile leaked into current qualification.' );
wu18_assert( false !== strpos( $alpha_html, 'data-gpp-print-utility="dossier"' ), 'Required existing Print utility capability was not exposed.' );

$base_alpha_entry = wu18_base_entry_meta( $base_manifest, $alpha_entry['id'] );
wu18_assert( false !== strpos( $alpha_html, esc_html( $base_alpha_entry['student_name'] ) ), 'Derived student.full_name did not compose authoritative first/last values.' );

$host_api = new Gravity_Flow_API( (int) $alpha_form['id'] );
$reader = new BoundHostValueReader();
$bound_step = $reader->readRaw( array( 'type' => 'gravity_flow.state', 'state_key' => 'current_step' ), $alpha_form, $alpha_entry );
$bound_status = $reader->readRaw( array( 'type' => 'gravity_flow.state', 'state_key' => 'status' ), $alpha_form, $alpha_entry );
wu18_assert( $alpha_step->get_name() === $bound_step, 'GPP current-step source diverged from Gravity_Flow_API::get_current_step().' );
wu18_assert( $host_api->get_status( $alpha_entry ) === $bound_status, 'GPP workflow-status source diverged from Gravity_Flow_API::get_status().' );

$editable = array_map( 'strval', $alpha_step->get_editable_fields() );
$review_field = (string) $manifest['alpha']['fields']['review.reason'];
$mobile_field = (string) $manifest['alpha']['fields']['student.mobile'];
wu18_assert( in_array( $review_field, $editable, true ), 'Pinned Approval did not expose review field as host-editable.' );
wu18_assert( ! in_array( $mobile_field, $editable, true ), 'Semantic editability control became host-editable.' );
wu18_assert( false !== strpos( $alpha_html, 'value="approved"' ) && false !== strpos( $alpha_html, 'تأیید پرونده' ), 'Native Approve action/label missing.' );
wu18_assert( false !== strpos( $alpha_html, 'value="rejected"' ) && false !== strpos( $alpha_html, 'رد پرونده' ), 'Native Reject action/label missing.' );
wu18_assert( false === strpos( $alpha_html, 'value="revert"' ), 'Fixture unexpectedly exposes Revert.' );

wu18_assert( null !== wu18_trace_event( $alpha_trace, 'ENTRY_DETAIL_BINDING_READINESS', 'PASS' ), 'Successful structural-readiness trace missing.' );
wu18_assert( null !== wu18_trace_event( $alpha_trace, 'ENTRY_DETAIL_APPROVAL_ELIGIBILITY', 'PASS' ), 'Successful live Approval eligibility trace missing.' );
wu18_assert( null !== wu18_trace_event( $alpha_trace, 'ENTRY_DETAIL_PRESENTATION_OUTPUT', 'PASS' ), 'Successful GPP presentation trace missing.' );

EntryDetailPresentationAdapter::resetRuntimeCache();
list( $beta_html, $beta_form, $beta_entry ) = wu18_render_entry( $manifest['beta']['form_id'], $manifest['beta']['entry_id'] );
$alpha_document = wu18_host_file_contract( $alpha_form, $alpha_entry, $manifest['alpha']['fields']['documents.report_card'] );
$beta_document = wu18_host_file_contract( $beta_form, $beta_entry, $manifest['beta']['fields']['documents.report_card'] );
$alpha_base_form = wu18_base_form_meta( $base_manifest, $manifest['alpha']['form_id'] );
$alpha_photo = wu18_host_file_contract( $alpha_form, $alpha_entry, $alpha_base_form['photo_field_id'] );
wu18_assert( false !== strpos( $alpha_html, 'gpp-entry-dossier__document-thumbnail' ), 'Bound image document thumbnail missing.' );
wu18_assert( wu18_html_uses_host_url( $alpha_html, $alpha_document['download_url'] ), 'Image document did not use host-authoritative download URL.' );
wu18_assert( false !== strpos( $alpha_html, 'gpp-entry-dossier__student-photo' ), 'Bound student.photo thumbnail missing.' );
wu18_assert( wu18_html_uses_host_url( $alpha_html, $alpha_photo['download_url'] ), 'student.photo did not use host-authoritative download URL.' );
wu18_assert( false !== strpos( $beta_html, esc_html( $beta_document['name'] ) ) && false !== strpos( $beta_html, 'target="_blank"' ), 'Bound PDF open behavior missing.' );
wu18_assert( wu18_html_uses_host_url( $beta_html, $beta_document['download_url'] ), 'PDF did not use host-authoritative download URL.' );

$document_field_id = $manifest['alpha']['fields']['documents.report_card'];
$original_document_value = $alpha_entry[ (string) $document_field_id ];
$invalid_update = GFAPI::update_entry_field( $alpha_entry['id'], $document_field_id, 'not-a-valid-url' );
if ( is_wp_error( $invalid_update ) ) throw new RuntimeException( $invalid_update->get_error_message() );
try {
    EntryDetailPresentationAdapter::resetRuntimeCache();
    list( $invalid_document_html, $invalid_form, $invalid_entry ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
    $invalid_document_trace = RuntimeDiagnostics::snapshot( 'gravity_flow.entry_detail' );
    $invalid_field = GFAPI::get_field( $invalid_form, $document_field_id );
    wu18_assert( false === $invalid_field->get_file_name_from_url( $invalid_entry[ (string) $document_field_id ] ), 'Invalid filename control did not become unusable host metadata.' );
    $documents_start = strpos( $invalid_document_html, '<section class="gpp-entry-dossier__section gpp-entry-dossier__documents"' );
    $documents_end = false === $documents_start ? false : strpos( $invalid_document_html, '</section>', $documents_start );
    wu18_assert( false !== $documents_start && false !== $documents_end, 'Invalid host filename metadata incorrectly removed the Documents region.' );
    $invalid_documents_html = substr( $invalid_document_html, $documents_start, $documents_end + strlen( '</section>' ) - $documents_start );
    wu18_assert( false !== strpos( $invalid_documents_html, 'data-gpp-slot="documents.report_card"' ) && false !== strpos( $invalid_documents_html, 'نگاشت معتبر نیست' ), 'Invalid document metadata did not degrade the report-card slot to its safe stale-source state.' );
    wu18_assert( false === strpos( $invalid_documents_html, 'not-a-valid-url' ), 'Invalid raw file metadata leaked into the GPP Documents region.' );
    wu18_assert( false === strpos( $invalid_documents_html, 'gpp-entry-dossier__file-link' ), 'Invalid file metadata produced an actionable GPP file link.' );
    wu18_assert( false !== strpos( $invalid_document_html, 'data-gpp-entry-detail="ready"' ), 'Invalid document metadata incorrectly killed the structurally admitted dossier.' );
    wu18_assert( null !== wu18_trace_reason( $invalid_document_trace, 'ENTRY_DETAIL_SEMANTIC_COMPLETENESS', 'semantic.documents.report_card.invalid_file_metadata' ), 'Invalid document metadata degradation was not diagnosed.' );
} finally {
    $restore = GFAPI::update_entry_field( $alpha_entry['id'], $document_field_id, $original_document_value );
    if ( is_wp_error( $restore ) ) throw new RuntimeException( $restore->get_error_message() );
}

EntryDetailPresentationAdapter::resetRuntimeCache();
list( $negative_html ) = wu18_render_entry( $manifest['negative']['form_id'], $manifest['negative']['entry_id'] );
$negative_trace = RuntimeDiagnostics::snapshot( 'gravity_flow.entry_detail' );
wu18_assert( false !== strpos( $negative_html, 'data-gpp-entry-detail="ready"' ), 'Required NOT_PROVEN semantic incorrectly killed structurally admitted Entry Detail.' );
wu18_assert( false !== strpos( $negative_html, 'data-gpp-slot="student.national_id"' ) && false !== strpos( $negative_html, 'نگاشت نشده' ), 'Required NOT_PROVEN semantic did not degrade to an explicit unmapped placeholder.' );
wu18_assert( null !== wu18_trace_event( $negative_trace, 'ENTRY_DETAIL_BINDING_READINESS', 'PASS' ), 'Required semantic degradation was misclassified as structural failure.' );
wu18_assert( null !== wu18_trace_reason( $negative_trace, 'ENTRY_DETAIL_SEMANTIC_COMPLETENESS', 'semantic.student.national_id.unmapped' ), 'Required semantic degradation did not expose its semantic key.' );
wu18_assert( null !== wu18_trace_event( $negative_trace, 'ENTRY_DETAIL_APPROVAL_ELIGIBILITY' ), 'Live action eligibility must still be evaluated after structural admission.' );

wu18_set_print_runtime_resolution( array( 'model' => null, 'reason' => 'synthetic_unavailable_control' ) );
EntryDetailPresentationAdapter::resetRuntimeCache();
list( $print_unready_html ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
$print_unready_trace = RuntimeDiagnostics::snapshot( 'gravity_flow.entry_detail' );
wu18_assert( false !== strpos( $print_unready_html, 'data-gpp-entry-detail="ready"' ), 'Unavailable Print utility incorrectly killed structurally admitted Entry Detail.' );
wu18_assert( false === strpos( $print_unready_html, 'data-gpp-print-utility="dossier"' ), 'Unavailable Print utility was fabricated into the dossier.' );
wu18_assert( null !== wu18_trace_event( $print_unready_trace, 'ENTRY_DETAIL_BINDING_READINESS', 'PASS' ), 'Print utility degradation was misclassified as structural failure.' );
wu18_assert( null !== wu18_trace_reason( $print_unready_trace, 'ENTRY_DETAIL_OPTIONAL_REGIONS', 'region.print.utility.unavailable' ), 'Print utility degradation was not attributed to its optional region.' );
PrintDossierPresentationAdapter::resetRuntimeCache();

$original_creator = (int) $alpha_entry['created_by'];
$creator_update = GFAPI::update_entry_property( $alpha_entry['id'], 'created_by', (int) $viewer->ID );
if ( is_wp_error( $creator_update ) ) throw new RuntimeException( $creator_update->get_error_message() );
try {
    wp_set_current_user( $viewer->ID );
    EntryDetailPresentationAdapter::resetRuntimeCache();
    list( $non_assignee_html, $non_assignee_form, $non_assignee_entry, $non_assignee_step ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
    $non_assignee_trace = RuntimeDiagnostics::snapshot( 'gravity_flow.entry_detail' );
    wu18_assert( Gravity_Flow_Entry_Detail::is_permission_granted( $non_assignee_entry, $non_assignee_form, $non_assignee_step ), 'Creator-view control lost native permission.' );
    wu18_assert( ! Gravity_Flow_Entry_Detail::can_update( $non_assignee_step ), 'Creator-view control unexpectedly gained native Approval update eligibility.' );
    wu18_assert( false !== strpos( $non_assignee_html, 'data-gpp-entry-detail="ready"' ), 'Authorized non-assignee did not receive the read-only enhanced dossier.' );
    wu18_assert( false !== strpos( $non_assignee_html, 'data-gpp-actions-expected="0"' ), 'Read-only enhanced dossier incorrectly expected native Approval actions.' );
    wu18_assert( false === strpos( $non_assignee_html, 'value="approved"' ) && false === strpos( $non_assignee_html, 'value="rejected"' ), 'Read-only viewer received native Approval mutation controls.' );
    $non_assignee_gate = wu18_trace_event( $non_assignee_trace, 'ENTRY_DETAIL_APPROVAL_ELIGIBILITY', 'SKIP' );
    wu18_assert( null !== $non_assignee_gate && 'current_assignee_not_eligible' === $non_assignee_gate['reason_code'], 'Non-assignee request was not distinguished from binding failure.' );
    wu18_assert( null !== wu18_trace_event( $non_assignee_trace, 'ENTRY_DETAIL_PRESENTATION_OUTPUT', 'PASS' ), 'Authorized read-only enhanced presentation was not recorded.' );
} finally {
    wp_set_current_user( $operator->ID );
    $restore_creator = GFAPI::update_entry_property( $alpha_entry['id'], 'created_by', $original_creator );
    if ( is_wp_error( $restore_creator ) ) throw new RuntimeException( $restore_creator->get_error_message() );
}

wp_set_current_user( $viewer->ID );
EntryDetailPresentationAdapter::resetRuntimeCache();
list( $denied_html, $denied_form, $denied_entry, $denied_step ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
wu18_assert( ! Gravity_Flow_Entry_Detail::is_permission_granted( $denied_entry, $denied_form, $denied_step ), 'Viewer unexpectedly has native permission after creator restoration.' );
wu18_assert( false === strpos( $denied_html, 'data-gpp-entry-detail="ready"' ) && false === strpos( $denied_html, 'entry-detail-view' ), 'GPP bypassed native permission denial.' );
wp_set_current_user( $operator->ID );

$results = array(
    'suite' => 'WU18 current Operations Package native PHP/runtime',
    'gravity_flow' => defined( 'GRAVITY_FLOW_VERSION' ) ? GRAVITY_FLOW_VERSION : null,
    'gravity_forms' => GFForms::$version,
    'package_id' => $manifest['package_id'],
    'package_version' => $manifest['package_version'],
    'profile_id' => $manifest['profile_id'],
    'legacy_profile_excluded' => true,
    'derived_full_name_without_direct_source' => true,
    'print_utility_without_direct_source' => true,
    'print_capability_region_degraded' => true,
    'approval_assignee_positive' => true,
    'authorized_non_assignee_read_only_enhanced' => true,
    'stale_action_permission_bypass_blocked' => true,
    'request_change_controls' => 'browser_fresh_request',
    'native_region_integrity' => 'browser_fresh_request',
    'required_semantic_degraded_without_page_fallback' => true,
    'unauthorized_native_denial' => true,
    'native_approval_actions' => array( 'approved', 'rejected' ),
    'host_editable_fields' => $editable,
    'authoritative_state_sources' => array(
        'workflow.current_step' => 'Gravity_Flow_API::get_current_step',
        'workflow.status' => 'Gravity_Flow_API::get_status',
    ),
    'documents' => array(
        'alpha' => array( 'kind' => 'image_thumbnail', 'name' => $alpha_document['name'], 'host_download_url' => true ),
        'beta' => array( 'kind' => 'pdf_open_link', 'name' => $beta_document['name'], 'host_download_url' => true ),
        'student_photo' => array( 'kind' => 'image_thumbnail', 'name' => $alpha_photo['name'], 'host_download_url' => true ),
        'invalid_filename_metadata' => 'slot_stale_placeholder_without_raw_file_leak',
    ),
    'decision_controls' => array(
        'success' => $alpha_trace,
        'semantic_degradation' => $negative_trace,
        'authorized_non_assignee' => $non_assignee_trace,
        'print_unavailable' => $print_unready_trace,
    ),
);
file_put_contents(
    trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json',
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);
echo "WU18_RUNTIME_PASS\n";
