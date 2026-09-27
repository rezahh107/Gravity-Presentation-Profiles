<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\EntryDetailSetupService;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

$manifest = get_option( 'gpp_srwf_journey_host_manifest' );
if ( ! is_array( $manifest ) || empty( $manifest['form_id'] ) || empty( $manifest['entries'] )
    || empty( $manifest['steps']['review_id'] ) || empty( $manifest['users']['operator']['id'] ) ) {
    throw new RuntimeException( 'Journey host manifest is unavailable.' );
}

$form_id = (int) $manifest['form_id'];
$form = GFAPI::get_form( $form_id );
if ( ! is_array( $form ) ) {
    throw new RuntimeException( 'Journey form is unavailable.' );
}

$identity_fields = array(
    'first_name' => 2,
    'last_name' => 3,
    'national_id' => 4,
);
$existing_ids = array();
foreach ( $form['fields'] as $field ) {
    if ( is_object( $field ) && isset( $field->id ) ) {
        $existing_ids[] = (int) $field->id;
    }
}
foreach ( array(
    array( 'id' => $identity_fields['first_name'], 'label' => 'Journey First Name' ),
    array( 'id' => $identity_fields['last_name'], 'label' => 'Journey Last Name' ),
    array( 'id' => $identity_fields['national_id'], 'label' => 'Journey National ID' ),
) as $definition ) {
    if ( in_array( (int) $definition['id'], $existing_ids, true ) ) {
        continue;
    }
    $form['fields'][] = GF_Fields::create(
        array(
            'type' => 'text',
            'id' => (int) $definition['id'],
            'label' => $definition['label'],
            'isRequired' => false,
        )
    );
}
$result = GFAPI::update_form( $form );
if ( is_wp_error( $result ) || true !== $result ) {
    throw new RuntimeException( 'Unable to extend the synthetic journey form with identity fields.' );
}

function gpp_srwf_journey_seed_identity( $entry_id, $label, $identity_fields ) {
    $entry_id = (int) $entry_id;
    $suffix = strtoupper( preg_replace( '/[^A-Z0-9]+/i', '-', (string) $label ) );
    foreach ( array(
        $identity_fields['first_name'] => 'Journey',
        $identity_fields['last_name'] => ucfirst( str_replace( '_', ' ', (string) $label ) ),
        $identity_fields['national_id'] => 'JRN-PROD-' . $suffix . '-' . $entry_id,
    ) as $field_id => $value ) {
        $updated = GFAPI::update_entry_field( $entry_id, (string) $field_id, $value );
        if ( is_wp_error( $updated ) || false === $updated ) {
            throw new RuntimeException( 'Unable to seed synthetic journey identity field.' );
        }
    }
}

foreach ( $manifest['entries'] as $label => $entry_id ) {
    gpp_srwf_journey_seed_identity( (int) $entry_id, $label, $identity_fields );
}

$operations = OperationsSetupService::forWordPress();
$operations_setup = $operations->initialize( array( 'form_id' => $form_id ) );
if ( OperationsSetupService::STATUS_COMPLETED !== $operations_setup['status'] ) {
    throw new RuntimeException( 'Operations production setup did not complete: ' . wp_json_encode( $operations_setup ) );
}

$entry_setup = EntryDetailSetupService::forWordPress();
$setup = $entry_setup->initialize( array( 'form_id' => $form_id ) );
if ( EntryDetailSetupService::STATUS_COMPLETED !== $setup['status'] ) {
    throw new RuntimeException( 'Entry Detail production setup did not complete: ' . wp_json_encode( $setup ) );
}

$repair = BindingRepairService::forWordPress();
$context = $operations->bindingContext( $form_id );
$lifecycle = new BindingSetLifecycle(
    new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
    new EvidenceReferenceGate( array() )
);

foreach ( array(
    'student.first_name' => $identity_fields['first_name'],
    'student.last_name' => $identity_fields['last_name'],
    'student.national_id' => $identity_fields['national_id'],
) as $slot => $field_id ) {
    $active = $lifecycle->resolve( $context );
    if ( ! is_array( $active ) ) {
        throw new RuntimeException( 'Active Entry Detail binding context disappeared.' );
    }
    $repair_result = $repair->repairField(
        array(
            'context_key' => $lifecycle->contextKey( $context ),
            'binding_set_id' => $active['binding_set_id'],
            'binding_set_version' => $active['binding_set_version'],
            'semantic_slot_key' => $slot,
            'field_id' => (string) $field_id,
        )
    );
    if ( ! in_array( $repair_result['status'], array( 'REPAIRED_AND_ACTIVATED', 'UNCHANGED' ), true ) ) {
        throw new RuntimeException( 'Journey identity mapping did not activate for ' . $slot . ': ' . wp_json_encode( $repair_result ) );
    }
}

function gpp_srwf_journey_create_review_entry( $form_id, $review_id, $operator_id, $label, $identity_fields ) {
    $entry_id = GFAPI::add_entry(
        array(
            'form_id' => (int) $form_id,
            'created_by' => (int) $operator_id,
            '1' => 'PRODUCTION-' . strtoupper( (string) $label ),
        )
    );
    if ( is_wp_error( $entry_id ) || ! $entry_id ) {
        throw new RuntimeException( is_wp_error( $entry_id ) ? $entry_id->get_error_message() : 'Unable to create production journey evidence entry.' );
    }
    $entry_id = (int) $entry_id;
    gpp_srwf_journey_seed_identity( $entry_id, 'production_' . $label, $identity_fields );

    $api = new Gravity_Flow_API( (int) $form_id );
    $api->process_workflow( $entry_id );
    $entry = GFAPI::get_entry( $entry_id );
    $sent = $api->send_to_step( $entry, (int) $review_id );
    if ( false === $sent || is_wp_error( $sent ) ) {
        throw new RuntimeException( is_wp_error( $sent ) ? $sent->get_error_message() : 'Unable to seed production journey entry at Review.' );
    }

    $fresh = GFAPI::get_entry( $entry_id );
    $step = ( new Gravity_Flow_API( (int) $form_id ) )->get_current_step( $fresh );
    if ( ! $step || 'approval' !== $step->get_type() || (int) $step->get_id() !== (int) $review_id ) {
        throw new RuntimeException( 'Production journey entry did not reach the native Review step.' );
    }
    return $entry_id;
}

$production_entries = isset( $manifest['production_presentation']['entries'] ) && is_array( $manifest['production_presentation']['entries'] )
    ? $manifest['production_presentation']['entries']
    : array();
$required_labels = array( 'review', 'cancel', 'approve', 'reject', 'revert', 'ambiguous' );
$valid_existing = true;
foreach ( $required_labels as $label ) {
    if ( empty( $production_entries[ $label ] ) || ! is_array( GFAPI::get_entry( (int) $production_entries[ $label ] ) ) ) {
        $valid_existing = false;
        break;
    }
}
if ( ! $valid_existing ) {
    $production_entries = array();
    foreach ( $required_labels as $label ) {
        $production_entries[ $label ] = gpp_srwf_journey_create_review_entry(
            $form_id,
            (int) $manifest['steps']['review_id'],
            (int) $manifest['users']['operator']['id'],
            $label,
            $identity_fields
        );
    }
}

EntryDetailPresentationAdapter::resetRuntimeCache();
$manifest['production_presentation'] = array(
    'operations_setup_status' => $operations_setup['status'],
    'entry_detail_setup_status' => $setup['status'],
    'profile_id' => $setup['entry_detail_profile']['profile_id'],
    'identity_fields' => $identity_fields,
    'entries' => $production_entries,
);
update_option( 'gpp_srwf_journey_host_manifest', $manifest, false );

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( is_string( $artifact_dir ) && '' !== $artifact_dir ) {
    file_put_contents(
        rtrim( $artifact_dir, '/\\' ) . '/srwf-journey-production-setup.json',
        wp_json_encode( $manifest['production_presentation'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
    );
}

echo "SRWF_JOURNEY_PRODUCTION_SETUP_PASS\n";
