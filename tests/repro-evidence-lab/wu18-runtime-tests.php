<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $manifest ) ) throw new RuntimeException( 'WU18 fixture manifest unavailable.' );
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

wp_set_current_user( $operator->ID );
list( $alpha_html, $alpha_form, $alpha_entry, $alpha_step ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
list( $beta_html ) = wu18_render_entry( $manifest['beta']['form_id'], $manifest['beta']['entry_id'] );
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
wu18_assert( false !== strpos( $alpha_html, 'gpp-entry-dossier__document-thumbnail' ), 'Bound image document thumbnail missing.' );
wu18_assert( false !== strpos( $beta_html, 'report-card.pdf' ) && false !== strpos( $beta_html, 'target="_blank"' ), 'Bound PDF open behavior missing.' );
wu18_assert( false !== strpos( $alpha_html, 'data-gpp-history-details' ) && false === strpos( $alpha_html, '<details data-gpp-history-details open' ), 'History is not collapsed by default.' );
wu18_assert( false !== strpos( $alpha_html, $manifest['locked_history_helper'] ), 'Locked history helper changed.' );
wu18_assert( false !== strpos( $alpha_html, 'class="detail-view-print"' ), 'Native Print disappeared.' );
wu18_assert( false === strpos( $negative_html, 'data-gpp-entry-detail="ready"' ) && false !== strpos( $negative_html, 'entry-detail-view' ), 'Required NOT_PROVEN mapping did not fall back to native Entry Detail.' );

wp_set_current_user( $viewer->ID );
list( $denied_html, $denied_form, $denied_entry, $denied_step ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
wu18_assert( ! Gravity_Flow_Entry_Detail::is_permission_granted( $denied_entry, $denied_form, $denied_step ), 'Viewer unexpectedly has native permission.' );
wu18_assert( false === strpos( $denied_html, 'data-gpp-entry-detail="ready"' ) && false === strpos( $denied_html, 'entry-detail-view' ), 'GPP bypassed native permission denial.' );
wp_set_current_user( $operator->ID );

$results = array( 'suite' => 'WU18 native PHP/runtime', 'gravity_flow' => defined( 'GRAVITY_FLOW_VERSION' ) ? GRAVITY_FLOW_VERSION : null, 'gravity_forms' => GFForms::$version, 'shared_profile' => 'shared.entry_detail.v1', 'host_editable_fields' => $editable, 'negative_native_fallback' => true, 'unauthorized_native_denial' => true, 'native_approval_actions' => array( 'approved', 'rejected' ), 'documents' => array( 'alpha' => 'image_thumbnail', 'beta' => 'pdf_open_link' ) );
file_put_contents( trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json', wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "WU18_RUNTIME_PASS\n";
