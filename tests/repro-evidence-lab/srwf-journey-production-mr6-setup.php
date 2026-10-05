<?php
/**
 * Qualification-only MR-6 extension of the existing synthetic Journey fixture.
 *
 * This does not invent a second product setup path. It uses the same shipped
 * Operations binding repair and Inbox setup services an administrator uses, then
 * records only synthetic IDs/status for the connected forward-host acceptance.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\InboxSetupService;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation;

$manifest = get_option( 'gpp_srwf_journey_host_manifest' );
if ( ! is_array( $manifest ) || empty( $manifest['form_id'] ) || empty( $manifest['production_presentation'] ) ) {
    throw new RuntimeException( 'MR-6 requires the existing production Journey fixture.' );
}

$form_id = (int) $manifest['form_id'];
$form = GFAPI::get_form( $form_id );
if ( ! is_array( $form ) ) {
    throw new RuntimeException( 'MR-6 Journey form is unavailable.' );
}

$mr6_fields = array(
    'photo' => 6,
    'grade_group' => 7,
    'school' => 8,
);
$existing_ids = array();
foreach ( $form['fields'] as $field ) {
    if ( is_object( $field ) && isset( $field->id ) ) {
        $existing_ids[] = (int) $field->id;
    }
}

foreach ( array(
    array( 'id' => $mr6_fields['photo'], 'label' => 'MR6 Student Photo', 'type' => 'fileupload' ),
    array( 'id' => $mr6_fields['grade_group'], 'label' => 'MR6 Grade Group', 'type' => 'text' ),
    array( 'id' => $mr6_fields['school'], 'label' => 'MR6 School', 'type' => 'text' ),
) as $definition ) {
    if ( in_array( (int) $definition['id'], $existing_ids, true ) ) {
        continue;
    }
    $form['fields'][] = GF_Fields::create(
        array(
            'type' => $definition['type'],
            'id' => (int) $definition['id'],
            'label' => $definition['label'],
            'isRequired' => false,
        )
    );
}

$updated = GFAPI::update_form( $form );
if ( is_wp_error( $updated ) || true !== $updated ) {
    throw new RuntimeException( 'MR-6 could not extend the synthetic Journey form for Inbox qualification.' );
}

$operations = OperationsSetupService::forWordPress();
$operations_setup = $operations->initialize( array( 'form_id' => $form_id ) );
if ( OperationsSetupService::STATUS_COMPLETED !== $operations_setup['status'] ) {
    throw new RuntimeException( 'MR-6 operations setup is not reusable: ' . wp_json_encode( $operations_setup ) );
}

$repair = BindingRepairService::forWordPress();
$lifecycle = new BindingSetLifecycle(
    new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
    new EvidenceReferenceGate( array() )
);
$context = $operations->bindingContext( $form_id );

foreach ( array(
    'student.photo' => $mr6_fields['photo'],
    'education.grade_group' => $mr6_fields['grade_group'],
    'school.name' => $mr6_fields['school'],
) as $slot => $field_id ) {
    $active = $lifecycle->resolve( $context );
    if ( ! is_array( $active ) ) {
        throw new RuntimeException( 'MR-6 active operations binding context disappeared.' );
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
        throw new RuntimeException( 'MR-6 Inbox semantic mapping did not activate for ' . $slot . ': ' . wp_json_encode( $result ) );
    }
}

$inbox_setup = InboxSetupService::forWordPress()->initialize( array( 'form_id' => $form_id ) );
if ( InboxSetupService::STATUS_COMPLETED !== $inbox_setup['status'] ) {
    throw new RuntimeException( 'MR-6 Inbox production setup did not complete: ' . wp_json_encode( $inbox_setup ) );
}
if ( empty( $inbox_setup['steps']['runtime_readiness']['outcome'] )
    || ! in_array( $inbox_setup['steps']['runtime_readiness']['outcome'], array( 'qualified', 'already_qualified' ), true ) ) {
    throw new RuntimeException( 'MR-6 Inbox runtime readiness was not established: ' . wp_json_encode( $inbox_setup ) );
}

$rtl_source = __DIR__ . '/srwf-journey-production-mr6-rtl-host-control.php';
$rtl_target = trailingslashit( WPMU_PLUGIN_DIR ) . 'gpp-srwf-journey-production-mr6-rtl-host-control.php';
wp_mkdir_p( WPMU_PLUGIN_DIR );
if ( ! is_readable( $rtl_source ) || ! copy( $rtl_source, $rtl_target ) ) {
    throw new RuntimeException( 'MR-6 could not install its qualification-only forward-host RTL control.' );
}

$manifest['mr6'] = array(
    'schema_version' => '1.0.0',
    'fields' => $mr6_fields,
    'operations_setup_status' => $operations_setup['status'],
    'inbox_setup_status' => $inbox_setup['status'],
    'inbox_runtime_readiness' => $inbox_setup['steps']['runtime_readiness']['outcome'],
    'rtl_host_control_enabled' => true,
    'rtl_host_control' => basename( $rtl_target ),
);
update_option( 'gpp_srwf_journey_host_manifest', $manifest, false );

InboxPresentationAdapter::resetRuntimeCache();
InboxTableHeaderPresentation::resetRuntimeCache();

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( is_string( $artifact_dir ) && '' !== $artifact_dir ) {
    file_put_contents(
        rtrim( $artifact_dir, '/\\' ) . '/srwf-journey-production-mr6-setup.json',
        wp_json_encode( $manifest['mr6'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
    );
}

echo "SRWF_JOURNEY_PRODUCTION_MR6_SETUP_PASS\n";
