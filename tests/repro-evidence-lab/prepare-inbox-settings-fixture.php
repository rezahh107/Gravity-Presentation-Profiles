<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! $artifact_dir ) {
    throw new RuntimeException( 'WU21_ARTIFACT_DIR is required.' );
}

$existing = get_option( 'gpp_wu21_inbox_settings_fixture' );
if ( is_array( $existing ) && ! empty( $existing['form_id'] ) ) {
    file_put_contents(
        $artifact_dir . '/inbox-settings-fixture.json',
        wp_json_encode( $existing, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
    );
    echo "WU21 Inbox settings fixture already exists.\n";
    return;
}

if ( ! class_exists( 'GFAPI' ) ) {
    throw new RuntimeException( 'Gravity Forms API is unavailable.' );
}

$form = array(
    'title' => 'WU21 Inbox Settings Probe',
    'description' => 'Synthetic non-PII form used only to prove the real GPP Gravity Forms settings mutation seam.',
    'labelPlacement' => 'top_label',
    'fields' => array(
        array( 'id' => 1, 'label' => 'Probe First Name', 'type' => 'text' ),
        array( 'id' => 2, 'label' => 'Probe Last Name', 'type' => 'text' ),
        array( 'id' => 3, 'label' => 'Probe Photo', 'type' => 'fileupload' ),
        array( 'id' => 4, 'label' => 'Probe National ID', 'type' => 'text' ),
        array( 'id' => 5, 'label' => 'Probe Grade / Group', 'type' => 'text' ),
        array( 'id' => 6, 'label' => 'Probe School', 'type' => 'text' ),
    ),
    'button' => array( 'type' => 'text', 'text' => 'Submit' ),
);
$form_id = GFAPI::add_form( $form );
if ( is_wp_error( $form_id ) ) {
    throw new RuntimeException( $form_id->get_error_message() );
}
$form_id = (int) $form_id;

$operations = OperationsSetupService::forWordPress();
$setup = $operations->initialize( array( 'form_id' => $form_id ) );
if ( OperationsSetupService::STATUS_COMPLETED !== $setup['status'] ) {
    throw new RuntimeException( 'Print operations setup did not complete for the Inbox settings probe form.' );
}

$repair = BindingRepairService::forWordPress();
$mapping = array(
    'student.photo' => 3,
    'student.first_name' => 1,
    'student.last_name' => 2,
    'student.national_id' => 4,
    'education.grade_group' => 5,
    'school.name' => 6,
);

foreach ( $mapping as $slot => $field_id ) {
    $lifecycle = new BindingSetLifecycle(
        new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
        new EvidenceReferenceGate( array() )
    );
    $context = $operations->bindingContext( $form_id );
    $active = $lifecycle->resolve( $context );
    if ( ! is_array( $active ) ) {
        throw new RuntimeException( 'Probe binding context is missing before mapping ' . $slot );
    }
    $result = $repair->repairField(
        array(
            'context_key' => $lifecycle->contextKey( $context ),
            'binding_set_id' => $active['binding_set_id'],
            'binding_set_version' => $active['binding_set_version'],
            'semantic_slot_key' => $slot,
            'field_id' => (string) $field_id,
        )
    );
    if ( ! in_array( $result['status'], array( 'REPAIRED_AND_ACTIVATED', 'UNCHANGED' ), true ) ) {
        throw new RuntimeException( 'Probe mapping did not complete for ' . $slot );
    }
}

$lifecycle = new BindingSetLifecycle(
    new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
    new EvidenceReferenceGate( array() )
);
$context = $operations->bindingContext( $form_id );
$active = $lifecycle->resolve( $context );
$snapshot = $lifecycle->snapshot();
$artifact = $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ]['artifact'];
$bindings = array();
foreach ( $artifact['bindings'] as $binding ) {
    $bindings[ $binding['semantic_slot_key'] ] = $binding;
}
if ( 'UNBOUND' !== $bindings['entry.created_at']['state'] || 'UNBOUND' !== $bindings['workflow.current_step']['state'] ) {
    throw new RuntimeException( 'Probe host-managed Inbox sources must be unqualified before the browser settings action.' );
}

$fixture = array(
    'schema_version' => '1.0.0',
    'data_class' => 'SYNTHETIC_NON_PII',
    'form_id' => $form_id,
    'form_title' => 'WU21 Inbox Settings Probe',
    'mapped_fields' => $mapping,
    'binding_set_id' => $active['binding_set_id'],
    'initial_binding_version' => $active['binding_set_version'],
    'precondition' => array(
        'entry.created_at' => 'UNBOUND',
        'workflow.current_step' => 'UNBOUND',
    ),
);
update_option( 'gpp_wu21_inbox_settings_fixture', $fixture, false );
file_put_contents(
    $artifact_dir . '/inbox-settings-fixture.json',
    wp_json_encode( $fixture, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);
echo wp_json_encode( $fixture, JSON_UNESCAPED_SLASHES ) . "\n";
