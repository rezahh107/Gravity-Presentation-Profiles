<?php
/** Qualification-only synthetic SRWF journey fixture on authentic Gravity Flow. */
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir ) throw new RuntimeException( 'WU21_ARTIFACT_DIR required.' );
if ( ! class_exists( 'GFAPI' ) || ! class_exists( 'Gravity_Flow_API' ) ) throw new RuntimeException( 'Gravity APIs unavailable.' );

$flow = get_file_data( WP_PLUGIN_DIR . '/gravityflow/gravityflow.php', array( 'Version' => 'Version' ) );
$gf   = get_file_data( WP_PLUGIN_DIR . '/gravityforms/gravityforms.php', array( 'Version' => 'Version' ) );
if ( '3.1.0' !== (string) $flow['Version'] || '3.1.1.1' !== (string) $gf['Version'] ) throw new RuntimeException( 'Pinned host identity changed.' );

$operator = get_user_by( 'login', 'bootstrap_admin' );
if ( ! $operator ) throw new RuntimeException( 'Synthetic operator unavailable.' );
$participant = get_user_by( 'login', 'srwf_correction_participant' );
if ( ! $participant ) {
    $participant_id = wp_create_user( 'srwf_correction_participant', 'srwf-correction-pass-2026', 'srwf.correction@example.invalid' );
    if ( is_wp_error( $participant_id ) ) throw new RuntimeException( $participant_id->get_error_message() );
    $participant = get_user_by( 'id', $participant_id );
    $participant->set_role( 'subscriber' );
}

$form = array(
    'title' => 'SRWF Journey Qualification Fixture',
    'description' => 'Synthetic non-PII host capability fixture.',
    'labelPlacement' => 'top_label',
    'fields' => array(
        array( 'id' => 1, 'label' => 'Synthetic Student', 'type' => 'text', 'isRequired' => true ),
        array( 'id' => 2, 'label' => 'Correction Value', 'type' => 'text', 'isRequired' => false ),
    ),
    'button' => array( 'type' => 'text', 'text' => 'Submit' ),
);
$form_id = GFAPI::add_form( $form );
if ( is_wp_error( $form_id ) || ! $form_id ) throw new RuntimeException( is_wp_error( $form_id ) ? $form_id->get_error_message() : 'Unable to create form.' );
$form_id = (int) $form_id;
$api = new Gravity_Flow_API( $form_id );

$review_id = $api->add_step( array(
    'step_name' => 'SRWF Review Approval',
    'step_type' => 'approval',
    'description' => 'Synthetic approval qualification.',
    'type' => 'select',
    'assignees' => array( 'user_id|' . (int) $operator->ID ),
    'assignee_policy' => 'all',
    'editable_fields' => array(),
    'note_mode' => 'optional',
    'confirmation_prompt' => '1',
) );
if ( ! $review_id || is_wp_error( $review_id ) ) throw new RuntimeException( 'Unable to create Review Approval step.' );
$review_id = (int) $review_id;

$input_id = $api->add_step( array(
    'step_name' => 'SRWF Correction Input',
    'step_type' => 'user_input',
    'description' => 'Synthetic correction qualification.',
    'type' => 'select',
    'assignees' => array( 'user_id|' . (int) $participant->ID ),
    'assignee_policy' => 'all',
    'editable_fields' => array( '2' ),
    'default_status' => 'hidden',
    'note_mode' => 'not_required',
) );
if ( ! $input_id || is_wp_error( $input_id ) ) throw new RuntimeException( 'Unable to create User Input step.' );
$input_id = (int) $input_id;

$review_step = gravity_flow()->get_step( $review_id );
$review_meta = $review_step->get_feed_meta();
$review_meta['confirmation_prompt'] = '1';
$review_meta['revertEnable'] = '1';
$review_meta['revertValue'] = (string) $input_id;
$review_meta['destination_approved'] = 'complete';
$review_meta['destination_rejected'] = 'complete';
$review_meta['approved_messageEnable'] = '1';
$review_meta['approved_messageValue'] = 'HOST_APPROVED_CONFIRMATION';
$review_meta['rejected_messageEnable'] = '1';
$review_meta['rejected_messageValue'] = 'HOST_REJECTED_CONFIRMATION';
$review_meta['reverted_messageEnable'] = '1';
$review_meta['reverted_messageValue'] = 'HOST_REVERTED_CONFIRMATION';
gravity_flow()->update_feed_meta( $review_id, $review_meta );

$input_step = gravity_flow()->get_step( $input_id );
$input_meta = $input_step->get_feed_meta();
$input_meta['editable_fields'] = array( '2' );
$input_meta['default_status'] = 'hidden';
$input_meta['destination_complete'] = (string) $review_id;
$input_meta['confirmation_messageEnable'] = '1';
$input_meta['confirmation_messageValue'] = 'HOST_USER_INPUT_COMPLETE';
gravity_flow()->update_feed_meta( $input_id, $input_meta );

// Deliberately do not re-read step properties in this same PHP request. Gravity
// Flow can retain instantiated step/feed objects per request; host-effective
// persistence is asserted by wu18-srwf-journey-runtime.php in a fresh request.

$entries = array();
foreach ( array( 'approve', 'reject', 'correction', 'failure' ) as $key ) {
    $entry_id = GFAPI::add_entry( array(
        'form_id' => $form_id,
        'created_by' => (int) $operator->ID,
        '1' => 'Synthetic ' . ucfirst( $key ),
        '2' => 'Before correction',
    ) );
    if ( is_wp_error( $entry_id ) || ! $entry_id ) throw new RuntimeException( 'Unable to create synthetic entry.' );
    $entry_id = (int) $entry_id;
    $api->process_workflow( $entry_id );
    $current = ( new Gravity_Flow_API( $form_id ) )->get_current_step( GFAPI::get_entry( $entry_id ) );
    if ( ! $current || (int) $current->get_id() !== $review_id || 'approval' !== $current->get_type() ) throw new RuntimeException( 'Entry did not start on Review Approval.' );
    $entries[ $key ] = $entry_id;
}

function srwfq_page( $title, $content ) {
    $id = wp_insert_post( array( 'post_title' => $title, 'post_status' => 'publish', 'post_type' => 'page', 'post_content' => $content ), true );
    if ( is_wp_error( $id ) || (int) $id < 1 ) throw new RuntimeException( 'Unable to create frontend fixture page.' );
    return array( 'page_id' => (int) $id, 'url' => get_permalink( $id ), 'content' => $content );
}
$shortcode = srwfq_page( 'SRWF Journey Inbox Shortcode', '[gravityflow page="inbox" back_link="true" back_link_text="Return to tasks"]' );
$registry = WP_Block_Type_Registry::get_instance();
$block = null;
if ( $registry && $registry->is_registered( 'gravityflow/inbox' ) ) {
    $block = srwfq_page( 'SRWF Journey Inbox Block', '<!-- wp:gravityflow/inbox {"backLink":true,"backLinkText":"Return to tasks"} /-->' );
}

$manifest = array(
    'schema_version' => '1.1.0',
    'data_class' => 'SYNTHETIC_NON_PII',
    'evidence_class_ceiling' => 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
    'runtime' => array( 'wordpress' => get_bloginfo( 'version' ), 'gravity_forms' => (string) $gf['Version'], 'gravity_flow' => (string) $flow['Version'] ),
    'form_id' => $form_id,
    'review_step_id' => $review_id,
    'user_input_step_id' => $input_id,
    'operator_id' => (int) $operator->ID,
    'participant_id' => (int) $participant->ID,
    'entries' => $entries,
    'frontend' => array( 'shortcode' => $shortcode, 'block_registered' => (bool) $block, 'block' => $block ),
    'requested_configuration' => array(
        'confirmation_prompt' => true,
        'revert_enabled' => true,
        'revert_target' => $input_id,
        'approved_destination' => 'complete',
        'rejected_destination' => 'complete',
        'user_input_complete_destination' => $review_id,
        'user_input_editable_fields' => array( '2' ),
    ),
);
update_option( 'gpp_srwf_journey_qualification_manifest', $manifest, false );
wp_mkdir_p( $artifact_dir );
file_put_contents( trailingslashit( $artifact_dir ) . 'wu18-srwf-journey-fixture.json', wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "WU18_SRWF_JOURNEY_SETUP_PASS\n";
