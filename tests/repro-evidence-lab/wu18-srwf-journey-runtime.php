<?php
/** Qualification-only host runtime assertions for the SRWF journey. */
if ( ! defined( 'ABSPATH' ) ) exit( 1 );
$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_srwf_journey_qualification_manifest' );
if ( ! is_string( $artifact_dir ) || ! is_array( $manifest ) ) throw new RuntimeException( 'Journey fixture unavailable.' );

function srwfq_assert( $cond, $message ) { if ( ! $cond ) throw new RuntimeException( $message ); }
function srwfq_snapshot( $form_id, $entry_id ) {
    $entry = GFAPI::get_entry( $entry_id );
    srwfq_assert( ! is_wp_error( $entry ), 'Entry unavailable.' );
    $api = new Gravity_Flow_API( (int) $form_id );
    $step = $api->get_current_step( $entry );
    $assignees = array();
    if ( $step ) {
        foreach ( $step->get_assignees() as $assignee ) {
            $assignees[] = array(
                'key' => method_exists( $assignee, 'get_key' ) ? $assignee->get_key() : null,
                'status' => method_exists( $assignee, 'get_status' ) ? $assignee->get_status() : null,
                'current_user' => method_exists( $assignee, 'is_current_user' ) ? (bool) $assignee->is_current_user() : null,
            );
        }
    }
    return array(
        'entry_id' => (int) $entry_id,
        'current_step_id' => $step ? (int) $step->get_id() : null,
        'current_step_type' => $step ? (string) $step->get_type() : null,
        'current_step_status' => $step && method_exists( $step, 'get_status' ) ? (string) $step->get_status() : null,
        'workflow_current_status' => gform_get_meta( $entry_id, 'workflow_current_status' ),
        'workflow_final_status' => gform_get_meta( $entry_id, 'workflow_final_status' ),
        'assignees' => $assignees,
        'correction_value' => rgar( $entry, '2' ),
    );
}

$form_id = (int) $manifest['form_id'];
$review_id = (int) $manifest['review_step_id'];
$input_id = (int) $manifest['user_input_step_id'];
$operator_id = (int) $manifest['operator_id'];
wp_set_current_user( $operator_id );
$form = GFAPI::get_form( $form_id );
srwfq_assert( is_array( $form ), 'Form unavailable.' );

$preflight = array();
foreach ( $manifest['entries'] as $key => $entry_id ) {
    $snap = srwfq_snapshot( $form_id, (int) $entry_id );
    srwfq_assert( $snap['current_step_id'] === $review_id && 'approval' === $snap['current_step_type'], 'Fixture not on native Approval: ' . $key );
    $step = ( new Gravity_Flow_API( $form_id ) )->get_current_step( GFAPI::get_entry( (int) $entry_id ) );
    srwfq_assert( Gravity_Flow_Entry_Detail::can_update( $step ), 'Operator is not current native Approval assignee: ' . $key );
    $preflight[ $key ] = $snap;
}

// Negative control: an authenticated/native-nonce request with an unsupported status
// must fail host validation and leave authoritative workflow state unchanged.
$failure_id = (int) $manifest['entries']['failure'];
$before_failure = srwfq_snapshot( $form_id, $failure_id );
$failure_step = ( new Gravity_Flow_API( $form_id ) )->get_current_step( GFAPI::get_entry( $failure_id ) );
$status_key = 'gravityflow_approval_new_status_step_' . $review_id;
$old_post = $_POST;
$old_request = $_REQUEST;
$_POST = array(
    '_wpnonce' => wp_create_nonce( 'gravityflow_approvals_' . $review_id ),
    $status_key => 'unsupported-qualification-status',
);
$_REQUEST = $_POST;
$result = $failure_step->maybe_process_status_update( $form, GFAPI::get_entry( $failure_id ) );
$_POST = $old_post;
$_REQUEST = $old_request;
srwfq_assert( is_wp_error( $result ), 'Unsupported Approval status did not fail host validation.' );
$after_failure = srwfq_snapshot( $form_id, $failure_id );
srwfq_assert( $before_failure['current_step_id'] === $after_failure['current_step_id'], 'Failed status update mutated current step.' );
srwfq_assert( $before_failure['workflow_current_status'] === $after_failure['workflow_current_status'], 'Failed status update mutated workflow status.' );

$review_step = gravity_flow()->get_step( $review_id, GFAPI::get_entry( (int) $manifest['entries']['correction'] ) );
$input_step = gravity_flow()->get_step( $input_id, GFAPI::get_entry( (int) $manifest['entries']['correction'] ) );
srwfq_assert( (bool) $review_step->confirmation_prompt, 'Require Confirmation is not effective.' );
srwfq_assert( (bool) $review_step->revertEnable && (int) $review_step->revertValue === $input_id, 'Native Revert target is not effective.' );
srwfq_assert( (int) $input_step->destination_complete === $review_id, 'User Input return destination is not effective.' );

$out = array(
    'schema_version' => '1.0.0',
    'evidence_class_ceiling' => 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
    'preflight' => $preflight,
    'negative_validation' => array(
        'result_is_wp_error' => true,
        'error_codes' => $result->get_error_codes(),
        'before' => $before_failure,
        'after' => $after_failure,
        'state_unchanged' => true,
    ),
    'effective_configuration' => $manifest['effective_configuration'],
    'block_registered' => ! empty( $manifest['frontend']['block_registered'] ),
);
file_put_contents( trailingslashit( $artifact_dir ) . 'wu18-srwf-journey-runtime.json', wp_json_encode( $out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "WU18_SRWF_JOURNEY_RUNTIME_PASS\n";
