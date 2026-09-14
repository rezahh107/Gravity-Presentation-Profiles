<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu18_fixture_manifest' );
$base_manifest = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $manifest ) || ! is_array( $base_manifest ) ) throw new RuntimeException( 'WU18 fixture manifest unavailable.' );
$operator = get_user_by( 'login', 'bootstrap_admin' );
$viewer = get_user_by( 'login', 'wu21_viewer' );
if ( ! $operator || ! $viewer ) throw new RuntimeException( 'Pinned users unavailable.' );
if ( ! class_exists( 'Gravity_Flow_Entry_Detail' ) ) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';

function wu18_assert( $condition, $message ) { if ( ! $condition ) throw new RuntimeException( $message ); }
function wu18_render_entry( $form_id, $entry_id ) {
    $form = GFAPI::get_form( $form_id ); $entry = GFAPI::get_entry( $entry_id );
    $api = new Gravity_Flow_API( $form_id ); $step = $api->get_current_step( $entry );
    ob_start(); Gravity_Flow_Entry_Detail::entry_detail( $form, $entry, $step, array( 'show_header' => false ) );
    return array( ob_get_clean(), $form, $entry, $step );
}
function wu18_base_form_meta( $base_manifest, $form_id ) {
    foreach ( $base_manifest['forms'] as $form_meta ) {
        if ( (int) $form_meta['form_id'] === (int) $form_id ) return $form_meta;
    }
    throw new RuntimeException( 'Base WU21 form metadata unavailable.' );
}
function wu18_host_file_contract( $form, $entry, $field_id ) {
    $field = GFAPI::get_field( $form, $field_id );
    wu18_assert( is_object( $field ) && 'fileupload' === $field->type, 'Expected host File Upload field unavailable.' );
    $raw = isset( $entry[ (string) $field_id ] ) ? $entry[ (string) $field_id ] : null;
    $files = $field->to_array( $raw );
    wu18_assert( is_array( $files ) && ! empty( $files[0] ) && is_scalar( $files[0] ), 'Host File Upload value did not normalize to a stored URL.' );
    $stored_url = (string) $files[0];
    $name_metadata = $field->get_file_name_from_url( $stored_url );
    wu18_assert( is_array( $name_metadata ), 'Pinned Gravity Forms filename metadata was not structured.' );
    wu18_assert( isset( $name_metadata['original'], $name_metadata['sanitized'] ) && is_string( $name_metadata['original'] ) && is_string( $name_metadata['sanitized'] ) && '' !== $name_metadata['sanitized'], 'Pinned Gravity Forms filename metadata keys changed or became unusable.' );
    $download_url = $field->get_download_url( $stored_url, false, (int) $entry['id'] );
    wu18_assert( is_string( $download_url ) && '' !== $download_url, 'Host File Upload download URL unavailable.' );
    return array( 'field' => $field, 'stored_url' => $stored_url, 'name' => $name_metadata['sanitized'], 'download_url' => $download_url );
}
function wu18_html_uses_host_url( $html, $url ) {
    return false !== strpos( html_entity_decode( $html, ENT_QUOTES | ENT_HTML5, 'UTF-8' ), $url );
}

wp_set_current_user( $operator->ID );
list( $alpha_html, $alpha_form, $alpha_entry, $alpha_step ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
list( $beta_html, $beta_form, $beta_entry ) = wu18_render_entry( $manifest['beta']['form_id'], $manifest['beta']['entry_id'] );
list( $negative_html ) = wu18_render_entry( $manifest['negative']['form_id'], $manifest['negative']['entry_id'] );
wu18_assert( $alpha_step && 'approval' === $alpha_step->get_type(), 'Alpha current step is not native Approval.' );
wu18_assert( Gravity_Flow_Entry_Detail::is_permission_granted( $alpha_entry, $alpha_form, $alpha_step ), 'Operator lost native Entry Detail permission.' );
$editable = array_map( 'strval', $alpha_step->get_editable_fields() );
$review_field = (string) $manifest['alpha']['fields']['review.reason']; $mobile_field = (string) $manifest['alpha']['fields']['student.mobile'];
wu18_assert( in_array( $review_field, $editable, true ), 'Pinned Approval did not expose review field as host-editable.' );
wu18_assert( ! in_array( $mobile_field, $editable, true ), 'Semantic editability control became host-editable.' );
$identity_pos = strpos( $alpha_html, 'data-gpp-section="identity"' ); $task_pos = strpos( $alpha_html, 'data-gpp-section="current-task"' );
wu18_assert( false !== $identity_pos && false !== $task_pos && $identity_pos < $task_pos, 'Identity does not precede current task.' );
wu18_assert( false !== strpos( $alpha_html, 'کاری که الان باید انجام دهید' ), 'Exact current-task title missing.' );
wu18_assert( false !== strpos( $alpha_html, 'data-gpp-profile-id="shared.entry_detail.v1"' ) && false !== strpos( $beta_html, 'data-gpp-profile-id="shared.entry_detail.v1"' ), 'Shared profile was not preserved across forms.' );
wu18_assert( false !== strpos( $alpha_html, 'value="approved"' ) && false !== strpos( $alpha_html, 'تأیید پرونده' ), 'Native Approve action/label missing.' );
wu18_assert( false !== strpos( $alpha_html, 'value="rejected"' ) && false !== strpos( $alpha_html, 'رد پرونده' ), 'Native Reject action/label missing.' );
wu18_assert( false === strpos( $alpha_html, 'value="revert"' ), 'Fixture unexpectedly exposes Revert.' );
foreach ( array( 'Save Draft', 'Send Next', 'Return for Correction' ) as $invented ) wu18_assert( false === strpos( $alpha_html, $invented ), 'Invented workflow action leaked.' );

$alpha_document = wu18_host_file_contract( $alpha_form, $alpha_entry, $manifest['alpha']['fields']['documents.report_card'] );
$beta_document = wu18_host_file_contract( $beta_form, $beta_entry, $manifest['beta']['fields']['documents.report_card'] );
$alpha_base_form = wu18_base_form_meta( $base_manifest, $manifest['alpha']['form_id'] );
$alpha_photo = wu18_host_file_contract( $alpha_form, $alpha_entry, $alpha_base_form['photo_field_id'] );
wu18_assert( false !== strpos( $alpha_html, 'gpp-entry-dossier__document-thumbnail' ), 'Bound image document thumbnail missing.' );
wu18_assert( false !== strpos( $alpha_html, 'data-gpp-image-name="' . esc_attr( $alpha_document['name'] ) . '"' ), 'Image document did not use the canonical host filename.' );
wu18_assert( wu18_html_uses_host_url( $alpha_html, $alpha_document['download_url'] ), 'Image document did not use the host-authoritative download URL.' );
wu18_assert( false !== strpos( $alpha_html, 'gpp-entry-dossier__student-photo' ), 'Bound student.photo thumbnail missing through shared file normalization.' );
wu18_assert( false !== strpos( $alpha_html, 'data-gpp-image-name="' . esc_attr( $alpha_photo['name'] ) . '"' ), 'student.photo did not use the canonical host filename.' );
wu18_assert( wu18_html_uses_host_url( $alpha_html, $alpha_photo['download_url'] ), 'student.photo did not use the host-authoritative download URL.' );
wu18_assert( false !== strpos( $beta_html, esc_html( $beta_document['name'] ) ) && false !== strpos( $beta_html, 'target="_blank"' ), 'Bound PDF open behavior missing.' );
wu18_assert( wu18_html_uses_host_url( $beta_html, $beta_document['download_url'] ), 'PDF did not use the host-authoritative download URL.' );

$alpha_document_field = $manifest['alpha']['fields']['documents.report_card'];
$original_document_value = $alpha_entry[ (string) $alpha_document_field ];
$invalid_update = GFAPI::update_entry_field( $alpha_entry['id'], $alpha_document_field, 'not-a-valid-url' );
if ( is_wp_error( $invalid_update ) ) throw new RuntimeException( $invalid_update->get_error_message() );
try {
    list( $invalid_document_html, $invalid_form, $invalid_entry ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
    $invalid_field = GFAPI::get_field( $invalid_form, $alpha_document_field );
    wu18_assert( false === $invalid_field->get_file_name_from_url( $invalid_entry[ (string) $alpha_document_field ] ), 'Negative control did not produce unusable host filename metadata.' );
    wu18_assert( false === strpos( $invalid_document_html, 'data-gpp-section="documents"' ), 'Invalid host filename metadata did not fail closed.' );
    wu18_assert( false === strpos( $invalid_document_html, 'gpp-entry-dossier__document-thumbnail' ), 'Invalid host filename metadata projected an image document.' );
    wu18_assert( false === strpos( $invalid_document_html, 'gpp-entry-dossier__file-link' ), 'Invalid host filename metadata projected a file link.' );
} finally {
    $restore = GFAPI::update_entry_field( $alpha_entry['id'], $alpha_document_field, $original_document_value );
    if ( is_wp_error( $restore ) ) throw new RuntimeException( $restore->get_error_message() );
}
list( $restored_alpha_html ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
wu18_assert( false !== strpos( $restored_alpha_html, 'gpp-entry-dossier__document-thumbnail' ), 'Image document did not recover after negative-control restoration.' );

wu18_assert( false !== strpos( $alpha_html, 'data-gpp-history-details' ) && false === strpos( $alpha_html, '<details data-gpp-history-details open' ), 'History is not collapsed by default.' );
wu18_assert( false !== strpos( $alpha_html, $manifest['locked_history_helper'] ), 'Locked history helper changed.' );
wu18_assert( false !== strpos( $alpha_html, 'class="detail-view-print"' ), 'Native Print disappeared.' );
wu18_assert( false === strpos( $negative_html, 'data-gpp-entry-detail="ready"' ) && false !== strpos( $negative_html, 'entry-detail-view' ), 'Required NOT_PROVEN mapping did not fall back to native Entry Detail.' );

wp_set_current_user( $viewer->ID );
list( $denied_html, $denied_form, $denied_entry, $denied_step ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
wu18_assert( ! Gravity_Flow_Entry_Detail::is_permission_granted( $denied_entry, $denied_form, $denied_step ), 'Viewer unexpectedly has native permission.' );
wu18_assert( false === strpos( $denied_html, 'data-gpp-entry-detail="ready"' ) && false === strpos( $denied_html, 'entry-detail-view' ), 'GPP bypassed native permission denial.' );
wp_set_current_user( $operator->ID );

$results = array(
    'suite' => 'WU18 native PHP/runtime',
    'gravity_flow' => defined( 'GRAVITY_FLOW_VERSION' ) ? GRAVITY_FLOW_VERSION : null,
    'gravity_forms' => GFForms::$version,
    'shared_profile' => 'shared.entry_detail.v1',
    'host_editable_fields' => $editable,
    'negative_native_fallback' => true,
    'unauthorized_native_denial' => true,
    'native_approval_actions' => array( 'approved', 'rejected' ),
    'documents' => array(
        'alpha' => array( 'kind' => 'image_thumbnail', 'name' => $alpha_document['name'], 'host_download_url' => true ),
        'beta' => array( 'kind' => 'pdf_open_link', 'name' => $beta_document['name'], 'host_download_url' => true ),
        'student_photo' => array( 'kind' => 'image_thumbnail', 'name' => $alpha_photo['name'], 'host_download_url' => true ),
        'invalid_filename_metadata' => 'fail_closed',
    ),
);
file_put_contents( trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json', wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "WU18_RUNTIME_PASS\n";
