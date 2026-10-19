<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;

$artifact_dir = getenv( 'GPP_BEHAVIOR_ARTIFACT_DIR' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir ) {
    fwrite( STDERR, "GPP_BEHAVIOR_ARTIFACT_DIR is required.\n" );
    exit( 1 );
}
wp_mkdir_p( $artifact_dir );

if ( ! class_exists( 'GFAPI' ) || ! class_exists( 'GFFormsModel' ) || ! class_exists( 'GF_Fields' ) || ! class_exists( 'Gravity_Flow_API' ) ) {
    fwrite( STDERR, "Admitted Gravity Forms / Gravity Flow runtime APIs are unavailable.\n" );
    exit( 1 );
}

if ( null !== get_option( VisualPackageLifecycle::OPTION_NAME, null ) || null !== get_option( BindingSetLifecycle::OPTION_NAME, null ) ) {
    fwrite( STDERR, "Behavioral host fixture requires clean GPP lifecycle state.\n" );
    exit( 1 );
}

$form_id = GFAPI::add_form(
    array(
        'title' => 'GPP Behavioral Reachability Form',
        'description' => 'Synthetic non-PII form for exact-artifact behavioral qualification.',
        'labelPlacement' => 'top_label',
        'fields' => array(),
        'button' => array( 'type' => 'text', 'text' => 'Submit' ),
    )
);
if ( is_wp_error( $form_id ) ) {
    throw new RuntimeException( $form_id->get_error_message() );
}
$form_id = (int) $form_id;
$form    = GFAPI::get_form( $form_id );
if ( ! is_array( $form ) ) {
    throw new RuntimeException( 'Synthetic Gravity Forms form could not be reloaded.' );
}

$add_field = static function ( array &$form, $type, $label, array $extra = array() ) {
    $next_id = (int) GFFormsModel::get_next_field_id( $form['fields'] );
    $field   = GF_Fields::create( array_merge( array( 'type' => $type ), $extra ) );
    if ( ! is_object( $field ) ) {
        throw new RuntimeException( 'Gravity Forms could not create synthetic field ' . $label );
    }
    $field->id         = $next_id;
    $field->label      = $label;
    $field->isRequired = true;
    $form['fields'][]  = $field;
    return $next_id;
};

$first_name_id = $add_field( $form, 'text', 'Behavioral First Name' );
$last_name_id  = $add_field( $form, 'text', 'Behavioral Last Name' );
$choice_id     = $add_field(
    $form,
    'radio',
    'Behavioral Choice',
    array(
        'choices' => array(
            array( 'text' => 'Synthetic Female', 'value' => 'source-value-f-91' ),
            array( 'text' => 'Synthetic Male', 'value' => 'source-value-m-26' ),
        ),
    )
);
$alternate_choice_id = $add_field(
    $form,
    'radio',
    'Behavioral Alternate Choice',
    array(
        'choices' => array(
            array( 'text' => 'Synthetic Female', 'value' => 'source-value-f-91' ),
            array( 'text' => 'Synthetic Male', 'value' => 'source-value-m-26' ),
        ),
    )
);

$updated = GFAPI::update_form( $form );
if ( is_wp_error( $updated ) ) {
    throw new RuntimeException( $updated->get_error_message() );
}

$form = GFAPI::get_form( $form_id );
if ( ! is_array( $form ) ) {
    throw new RuntimeException( 'Synthetic form disappeared after update.' );
}
foreach ( array( $first_name_id, $last_name_id, $choice_id, $alternate_choice_id ) as $field_id ) {
    $field = GFAPI::get_field( $form, $field_id );
    if ( ! is_object( $field ) ) {
        throw new RuntimeException( 'Host-assigned synthetic field could not be resolved: ' . $field_id );
    }
}

$choice_field = GFAPI::get_field( $form, $choice_id );
if ( ! is_object( $choice_field ) || count( (array) $choice_field->choices ) !== 2 ) {
    throw new RuntimeException( 'Host-backed selectable choices are unavailable.' );
}
$selected_choice = $choice_field->choices[0];
$raw_choice      = (string) $selected_choice['value'];
$display_choice  = (string) $selected_choice['text'];
if ( '' === $raw_choice || '' === $display_choice || $raw_choice === $display_choice ) {
    throw new RuntimeException( 'Synthetic choice must retain distinct raw and display meanings.' );
}

$admin = get_user_by( 'login', 'release_admin' );
if ( ! $admin || ! user_can( $admin, 'manage_options' ) ) {
    throw new RuntimeException( 'Release administrator account is missing.' );
}
$viewer_id = wp_insert_user(
    array(
        'user_login' => 'release_viewer',
        'user_pass' => 'gpp-synthetic-viewer-2026',
        'user_email' => 'release.viewer@example.invalid',
        'role' => 'subscriber',
    )
);
if ( is_wp_error( $viewer_id ) ) {
    throw new RuntimeException( $viewer_id->get_error_message() );
}
if ( ! $viewer_id || user_can( $viewer_id, 'manage_options' ) || user_can( $viewer_id, 'gravityflow_inbox' ) ) {
    throw new RuntimeException( 'Unauthorized viewer lacks a clean native subscriber role.' );
}

$flow_api = new Gravity_Flow_API( $form_id );
$step_id = $flow_api->add_step(
    array(
        'step_name' => 'Behavioral Native Approval',
        'step_type' => 'approval',
        'description' => 'Synthetic Gravity Flow workflow authority.',
        'type' => 'select',
        'assignees' => array( 'user_id|' . (int) $admin->ID ),
        'assignee_policy' => 'all',
        'instructions' => 'Synthetic review.',
    )
);
if ( ! $step_id || is_wp_error( $step_id ) ) {
    throw new RuntimeException( 'Native Gravity Flow approval step could not be created.' );
}

$synthetic_first = 'Reachability Ada';
$entry_id = GFAPI::add_entry(
    array(
        'form_id' => $form_id,
        (string) $first_name_id => $synthetic_first,
        (string) $last_name_id => 'Synthetic',
        (string) $choice_id => $raw_choice,
        (string) $alternate_choice_id => $raw_choice,
        'created_by' => (int) $admin->ID,
    )
);
if ( is_wp_error( $entry_id ) ) {
    throw new RuntimeException( $entry_id->get_error_message() );
}

$second_entry_id = GFAPI::add_entry(
    array(
        'form_id' => $form_id,
        'created_by' => (int) $admin->ID,
        (string) $first_name_id => 'Secondary',
        (string) $last_name_id => 'Synthetic',
        (string) $choice_id => (string) $choice_field->choices[1]['value'],
    )
);
if ( is_wp_error( $second_entry_id ) ) {
    throw new RuntimeException( $second_entry_id->get_error_message() );
}
$flow_api->process_workflow( $second_entry_id );
if ( ! $flow_api->get_current_step( GFAPI::get_entry( $second_entry_id ) ) ) {
    throw new RuntimeException( 'Second entry did not enter the native Flow step.' );
}

$flow_api->process_workflow( $entry_id );
$current = $flow_api->get_current_step( GFAPI::get_entry( $entry_id ) );
if ( ! $current || 'approval' !== $current->get_type() || (int) $current->get_id() !== (int) $step_id ) {
    throw new RuntimeException( 'Entry did not enter the authentic native Flow approval step.' );
}

if ( null !== get_option( VisualPackageLifecycle::OPTION_NAME, null ) || null !== get_option( BindingSetLifecycle::OPTION_NAME, null ) ) {
    fwrite( STDERR, "Creating host test data unexpectedly mutated GPP lifecycle state.\n" );
    exit( 1 );
}

$manifest = array(
    'schema_version' => '1.0.0',
    'data_class' => 'SYNTHETIC_NON_PII',
    'form_id' => $form_id,
    'form_title' => $form['title'],
    'entry_id' => (int) $entry_id,
    'second_entry_id' => (int) $second_entry_id,
    'fields' => array(
        'first_name' => array( 'id' => $first_name_id, 'label' => 'Behavioral First Name', 'type' => 'text' ),
        'last_name' => array( 'id' => $last_name_id, 'label' => 'Behavioral Last Name', 'type' => 'text' ),
        'choice' => array( 'id' => $choice_id, 'label' => 'Behavioral Choice', 'type' => 'radio' ),
        'alternate_choice' => array( 'id' => $alternate_choice_id, 'label' => 'Behavioral Alternate Choice', 'type' => 'radio' ),
    ),
    'expected_first_name_value' => $synthetic_first,
    'expected_last_name_value' => 'Synthetic',
    'expected_choice' => array(
        'host_raw_value' => $raw_choice,
        'host_display_value' => $display_choice,
        'canonical_option' => 'female',
        'canonical_print_label' => 'زن',
    ),
    'native_authority' => array(
        'approval_step_id' => (int) $step_id,
        'assigned_user_id' => (int) $admin->ID,
        'unauthorized_viewer_id' => (int) $viewer_id,
    ),
);
file_put_contents(
    $artifact_dir . '/behavioral-host-fixture.json',
    wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n"
);

echo 'GPP_BEHAVIORAL_HOST_FIXTURE_PASS form=' . $form_id . ' first_name_field=' . $first_name_id . ' entry=' . (int) $entry_id . PHP_EOL;
