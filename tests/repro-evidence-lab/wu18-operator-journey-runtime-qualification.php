<?php
/**
 * Qualification-only authentic Gravity Flow fixtures for the Owner-approved
 * SRWF operator journey. Synthetic/non-PII. No production GPP behavior changes.
 */
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$base = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || ! is_array( $base ) ) {
    throw new RuntimeException( 'Operator journey qualification requires WU21 fixtures.' );
}
$operator = get_user_by( 'login', 'bootstrap_admin' );
$participant = get_user_by( 'login', 'wu21_viewer' );
if ( ! $operator || ! $participant ) throw new RuntimeException( 'Pinned synthetic users unavailable.' );

function wu18_oj_add_form( $title ) {
    $form = array(
        'title' => $title,
        'description' => 'Synthetic non-PII operator journey qualification fixture.',
        'labelPlacement' => 'top_label',
        'fields' => array(
            array( 'id' => 1, 'label' => 'Synthetic Student', 'type' => 'text', 'isRequired' => true ),
            array( 'id' => 2, 'label' => 'Synthetic National ID', 'type' => 'text', 'isRequired' => true ),
            array( 'id' => 3, 'label' => 'Correction Value', 'type' => 'text', 'isRequired' => false ),
        ),
        'button' => array( 'type' => 'text', 'text' => 'Submit' ),
    );
    $id = GFAPI::add_form( $form );
    if ( is_wp_error( $id ) || ! $id ) throw new RuntimeException( 'Unable to create qualification form.' );
    return (int) $id;
}

function wu18_oj_add_entry( $form_id, $operator_id, $suffix ) {
    $id = GFAPI::add_entry( array(
        'form_id' => (int) $form_id,
        'created_by' => (int) $operator_id,
        '1' => 'OJ Student ' . $suffix,
        '2' => 'OJ-' . strtoupper( $suffix ) . '-0001',
        '3' => 'Initial ' . $suffix,
    ) );
    if ( is_wp_error( $id ) || ! $id ) throw new RuntimeException( 'Unable to create qualification entry.' );
    $api = new Gravity_Flow_API( (int) $form_id );
    $api->process_workflow( (int) $id );
    return (int) $id;
}

function wu18_oj_current_state( $form_id, $entry_id, $login, $known_step_ids = array() ) {
    $user = get_user_by( 'login', $login );
    if ( ! $user ) throw new RuntimeException( 'Synthetic qualification user missing: ' . $login );
    wp_set_current_user( $user->ID );
    $entry = GFAPI::get_entry( (int) $entry_id );
    if ( is_wp_error( $entry ) ) throw new RuntimeException( $entry->get_error_message() );
    $api = new Gravity_Flow_API( (int) $form_id );
    $step = $api->get_current_step( $entry );
    $known = array();
    foreach ( $known_step_ids as $label => $step_id ) {
        $historic = gravity_flow()->get_step( (int) $step_id, $entry );
        $known[ $label ] = $historic ? array(
            'id' => (int) $historic->get_id(),
            'type' => (string) $historic->get_type(),
            'status' => (string) $historic->get_status(),
            'next_step_id' => $historic->get_next_step_id(),
        ) : null;
    }
    $assignee = $step && method_exists( $step, 'get_current_assignee' ) ? $step->get_current_assignee() : null;
    return array(
        'user_login' => $login,
        'current_step' => $step ? array( 'id' => (int) $step->get_id(), 'type' => (string) $step->get_type(), 'name' => (string) $step->get_name() ) : null,
        'current_user_is_assignee' => is_object( $assignee ),
        'api_status' => $api->get_status( $entry ),
        'workflow_final_status' => gform_get_meta( (int) $entry_id, 'workflow_final_status' ),
        'workflow_current_status' => gform_get_meta( (int) $entry_id, 'workflow_current_status' ),
        'known_steps' => $known,
    );
}

// Confirmation/result fixture: one host Approval step and independent entries.
$result_form_id = wu18_oj_add_form( 'WU18 OJ Approval Results' );
$result_api = new Gravity_Flow_API( $result_form_id );
$result_step_id = $result_api->add_step( array(
    'step_name' => 'OJ Approval Result',
    'step_type' => 'approval',
    'description' => 'Synthetic Approval result truth fixture.',
    'type' => 'select',
    'assignees' => array( 'user_id|' . (int) $operator->ID ),
    'assignee_policy' => 'all',
    'confirmation_prompt' => '1',
    'note_mode' => 'hidden',
    'destination_approved' => 'complete',
    'destination_rejected' => 'complete',
) );
if ( ! $result_step_id || is_wp_error( $result_step_id ) ) throw new RuntimeException( 'Unable to create result Approval.' );
$result_step_id = (int) $result_step_id;
$approve_entry_id = wu18_oj_add_entry( $result_form_id, $operator->ID, 'approve' );
$reject_entry_id = wu18_oj_add_entry( $result_form_id, $operator->ID, 'reject' );
$cancel_entry_id = wu18_oj_add_entry( $result_form_id, $operator->ID, 'cancel' );

// Native validation-failure fixture: required note must block an empty-note action.
$failure_form_id = wu18_oj_add_form( 'WU18 OJ Approval Validation Failure' );
$failure_api = new Gravity_Flow_API( $failure_form_id );
$failure_step_id = $failure_api->add_step( array(
    'step_name' => 'OJ Approval Required Note',
    'step_type' => 'approval',
    'description' => 'Synthetic required-note negative control.',
    'type' => 'select',
    'assignees' => array( 'user_id|' . (int) $operator->ID ),
    'assignee_policy' => 'all',
    'confirmation_prompt' => '1',
    'note_mode' => 'required',
    'destination_approved' => 'complete',
    'destination_rejected' => 'complete',
) );
if ( ! $failure_step_id || is_wp_error( $failure_step_id ) ) throw new RuntimeException( 'Unable to create validation Approval.' );
$failure_step_id = (int) $failure_step_id;
$failure_entry_id = wu18_oj_add_entry( $failure_form_id, $operator->ID, 'failure' );

// Selected correction topology: Review R -> native Revert -> User Input U -> R.
$correction_form_id = wu18_oj_add_form( 'WU18 OJ Correction Cycle' );
$correction_api = new Gravity_Flow_API( $correction_form_id );
$review_step_id = $correction_api->add_step( array(
    'step_name' => 'OJ Review Approval',
    'step_type' => 'approval',
    'description' => 'Synthetic correction Review.',
    'type' => 'select',
    'assignees' => array( 'user_id|' . (int) $operator->ID ),
    'assignee_policy' => 'all',
    'confirmation_prompt' => '1',
    'note_mode' => 'hidden',
    'revertEnable' => '0',
    'destination_approved' => 'complete',
    'destination_rejected' => 'complete',
) );
if ( ! $review_step_id || is_wp_error( $review_step_id ) ) throw new RuntimeException( 'Unable to create Review Approval.' );
$review_step_id = (int) $review_step_id;
$user_input_step_id = $correction_api->add_step( array(
    'step_name' => 'OJ Correction User Input',
    'step_type' => 'user_input',
    'description' => 'Synthetic correction User Input.',
    'type' => 'select',
    'assignees' => array( 'user_id|' . (int) $participant->ID ),
    'assignee_policy' => 'all',
    'editable_fields' => array( '3' ),
    'display_fields' => array( '1', '2', '3' ),
    'default_status' => 'hidden',
    'note_mode' => 'hidden',
    'destination_complete' => $review_step_id,
) );
if ( ! $user_input_step_id || is_wp_error( $user_input_step_id ) ) throw new RuntimeException( 'Unable to create correction User Input.' );
$user_input_step_id = (int) $user_input_step_id;
$review_step = gravity_flow()->get_step( $review_step_id );
$review_meta = $review_step->get_feed_meta();
$review_meta['revertEnable'] = '1';
$review_meta['revertValue'] = (string) $user_input_step_id;
$review_meta['confirmation_prompt'] = '1';
$review_meta['destination_approved'] = 'complete';
$review_meta['destination_rejected'] = 'complete';
gravity_flow()->update_feed_meta( $review_step_id, $review_meta );
$correction_entry_id = wu18_oj_add_entry( $correction_form_id, $operator->ID, 'correction' );

// Read back host-effective configuration/state; feed settings alone are not proof.
$effective_review = ( new Gravity_Flow_API( $correction_form_id ) )->get_current_step( GFAPI::get_entry( $correction_entry_id ) );
if ( ! $effective_review || 'approval' !== $effective_review->get_type() || (int) $effective_review->get_id() !== $review_step_id ) {
    throw new RuntimeException( 'Correction fixture did not enter native Review Approval.' );
}
if ( ! $effective_review->revertEnable || (int) $effective_review->revertValue !== $user_input_step_id || ! $effective_review->confirmation_prompt ) {
    throw new RuntimeException( 'Correction Review host-effective Revert/confirmation configuration mismatch.' );
}
$effective_user_input = gravity_flow()->get_step( $user_input_step_id, GFAPI::get_entry( $correction_entry_id ) );
if ( ! $effective_user_input || 'user_input' !== $effective_user_input->get_type() || (int) $effective_user_input->destination_complete !== $review_step_id ) {
    throw new RuntimeException( 'User Input explicit return destination was not host-effective.' );
}

$manifest = array(
    'schema_version' => '1.0.0',
    'data_class' => 'SYNTHETIC_NON_PII',
    'evidence_class_ceiling' => 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
    'runtime' => array( 'wordpress' => get_bloginfo( 'version' ), 'php' => PHP_VERSION, 'gravity_forms' => GFForms::$version, 'gravity_flow' => gravity_flow()->get_version() ),
    'operator' => array( 'login' => 'bootstrap_admin', 'id' => (int) $operator->ID ),
    'participant' => array( 'login' => 'wu21_viewer', 'id' => (int) $participant->ID ),
    'results' => array(
        'form_id' => $result_form_id,
        'step_id' => $result_step_id,
        'approve_entry_id' => $approve_entry_id,
        'reject_entry_id' => $reject_entry_id,
        'cancel_entry_id' => $cancel_entry_id,
    ),
    'validation_failure' => array( 'form_id' => $failure_form_id, 'step_id' => $failure_step_id, 'entry_id' => $failure_entry_id ),
    'correction' => array(
        'form_id' => $correction_form_id,
        'entry_id' => $correction_entry_id,
        'review_step_id' => $review_step_id,
        'user_input_step_id' => $user_input_step_id,
        'editable_field_id' => 3,
    ),
    'navigation' => array(
        'admin_inbox_url' => admin_url( 'admin.php?page=gravityflow-inbox' ),
        'frontend_shortcode_inbox_url' => isset( $base['frontend_inbox_url'] ) ? (string) $base['frontend_inbox_url'] : null,
        'frontend_shortcode_page_id_is_fixture_metadata_only' => isset( $base['frontend_inbox_page_id'] ) ? (int) $base['frontend_inbox_page_id'] : null,
    ),
    'initial_state' => array(
        'approve' => wu18_oj_current_state( $result_form_id, $approve_entry_id, 'bootstrap_admin', array( 'approval' => $result_step_id ) ),
        'reject' => wu18_oj_current_state( $result_form_id, $reject_entry_id, 'bootstrap_admin', array( 'approval' => $result_step_id ) ),
        'cancel' => wu18_oj_current_state( $result_form_id, $cancel_entry_id, 'bootstrap_admin', array( 'approval' => $result_step_id ) ),
        'failure' => wu18_oj_current_state( $failure_form_id, $failure_entry_id, 'bootstrap_admin', array( 'approval' => $failure_step_id ) ),
        'correction_operator' => wu18_oj_current_state( $correction_form_id, $correction_entry_id, 'bootstrap_admin', array( 'review' => $review_step_id, 'user_input' => $user_input_step_id ) ),
        'correction_participant' => wu18_oj_current_state( $correction_form_id, $correction_entry_id, 'wu21_viewer', array( 'review' => $review_step_id, 'user_input' => $user_input_step_id ) ),
    ),
);
update_option( 'gpp_wu18_operator_journey_manifest', $manifest, false );

$results_path = trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json';
$results = is_file( $results_path ) ? json_decode( file_get_contents( $results_path ), true ) : array();
if ( ! is_array( $results ) ) $results = array();
$results['operator_journey_runtime_setup'] = $manifest;
file_put_contents( $results_path, wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );

echo "WU18_OPERATOR_JOURNEY_RUNTIME_FIXTURES_PASS\n";
