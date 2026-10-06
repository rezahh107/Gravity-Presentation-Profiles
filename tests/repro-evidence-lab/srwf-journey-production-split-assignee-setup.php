<?php
/**
 * Test-only split-assignee topology. Run only after the normal production
 * journey scenarios which depend on the canonical Review step being terminal.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$manifest = get_option( 'gpp_srwf_journey_host_manifest' );
if ( ! is_array( $manifest ) || empty( $manifest['form_id'] ) || empty( $manifest['users']['operator']['id'] ) || empty( $manifest['users']['negative_control']['id'] ) ) {
    throw new RuntimeException( 'Journey host manifest is unavailable for split-assignee control.' );
}

$form_id = (int) $manifest['form_id'];
$operator_id = (int) $manifest['users']['operator']['id'];
$negative_id = (int) $manifest['users']['negative_control']['id'];
$api = new Gravity_Flow_API( $form_id );

$correction_id = $api->add_step(
    array(
        'step_name' => 'SRWF Split Correction',
        'step_type' => 'user_input',
        'type' => 'select',
        'assignees' => array( 'user_id|' . $negative_id ),
        'assignee_policy' => 'all',
        'editable_fields' => array( '1' ),
        'default_status' => 'hidden',
    )
);
$review_id = $api->add_step(
    array(
        'step_name' => 'SRWF Split Review',
        'step_type' => 'approval',
        'type' => 'select',
        'assignees' => array( 'user_id|' . $operator_id ),
        'assignee_policy' => 'all',
        'confirmation_prompt' => '1',
        'revertEnable' => '1',
        'revertValue' => (string) $correction_id,
    )
);
if ( ! $correction_id || ! $review_id || is_wp_error( $correction_id ) || is_wp_error( $review_id ) ) {
    throw new RuntimeException( 'Unable to create split-assignee workflow steps.' );
}

$entry_id = GFAPI::add_entry(
    array(
        'form_id' => $form_id,
        'created_by' => $operator_id,
        '1' => 'SPLIT-SEED',
        '2' => 'Journey',
        '3' => 'Split Assignee',
        '4' => 'JRN-PROD-SPLIT',
    )
);
if ( ! $entry_id || is_wp_error( $entry_id ) ) {
    throw new RuntimeException( 'Unable to create split-assignee entry.' );
}
$entry_id = (int) $entry_id;
$api->process_workflow( $entry_id );
$entry = GFAPI::get_entry( $entry_id );
$sent = $api->send_to_step( $entry, (int) $review_id );
if ( false === $sent || is_wp_error( $sent ) ) {
    throw new RuntimeException( 'Unable to seed split-assignee entry at Review.' );
}

$result = array(
    'entry_id' => $entry_id,
    'review_id' => (int) $review_id,
    'correction_id' => (int) $correction_id,
    'review_assignee' => 'user_id|' . $operator_id,
    'correction_assignee' => 'user_id|' . $negative_id,
    'topology_mutation_scope' => 'shared_form_until_end_of_run',
    'topology_cleanup' => false,
);
update_option( 'gpp_srwf_journey_split_assignee_manifest', $result, false );
echo wp_json_encode( $result, JSON_UNESCAPED_SLASHES ) . "\n";
