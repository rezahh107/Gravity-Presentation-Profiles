<?php
// Read-only host and active binding witness in the installed-ZIP release runtime.
// Never creates or edits GPP lifecycle state.
defined( 'ABSPATH' ) || exit( 1 );

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;

$dir = getenv( 'GPP_BEHAVIOR_ARTIFACT_DIR' );
$stage = getenv( 'GPP_BEHAVIOR_ENTRY_STAGE' );
if ( ! is_string( $dir ) || ! in_array( $stage, array( 'initial', 'empty', 'stale', 'requalified' ), true ) ) {
    throw new RuntimeException( 'Invalid connected Entry Detail observer arguments.' );
}
$fixture = json_decode( (string) file_get_contents( $dir . '/behavioral-host-fixture.json' ), true );
if ( ! is_array( $fixture ) ) throw new RuntimeException( 'Missing synthetic host manifest.' );
$form_id = (int) $fixture['form_id'];
$form = GFAPI::get_form( $form_id );
$entry = GFAPI::get_entry( (int) $fixture['entry_id'] );
$api = new Gravity_Flow_API( $form_id );
$step = $api->get_current_step( $entry );
if ( ! is_array( $form ) || ! is_array( $entry ) || ! $step || 'approval' !== $step->get_type() ) {
    throw new RuntimeException( 'Native host Approval is missing.' );
}
$bindings = new BindingSetLifecycle(
    new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
    new EvidenceReferenceGate( array() )
);
$activation = $bindings->resolve( OperationsSetupService::forWordPress()->bindingContext( $form_id ) );
if ( ! is_array( $activation ) ) throw new RuntimeException( 'Missing product-created active binding.' );
$snapshot = $bindings->snapshot();
$artifact = $snapshot['installed'][ $activation['binding_set_id'] ][ $activation['binding_set_version'] ]['artifact'] ?? null;
if ( ! is_array( $artifact ) ) throw new RuntimeException( 'Active immutable binding artifact is missing.' );
$sources = array();
foreach ( $artifact['bindings'] as $binding ) {
    $sources[ $binding['semantic_slot_key'] ] = array(
        'state' => $binding['state'],
        'source_ref' => $binding['source_ref'] ?? null,
    );
}
$first_id = (string) $fixture['fields']['first_name']['id'];
$last_id = (string) $fixture['fields']['last_name']['id'];
$choice_id = (string) $fixture['fields']['choice']['id'];
$phone = $sources['student.home_phone']['source_ref']['field_id'] ?? null;
$result = array(
    'stage' => $stage,
    'form_id' => $form_id,
    'entry_id' => (int) $entry['id'],
    'native_step_id' => (int) $step->get_id(),
    'native_step_type' => $step->get_type(),
    'native_step_name' => $step->get_name(),
    'native_status' => $api->get_status( $entry ),
    'native_editable_fields' => method_exists( $step, 'get_editable_fields' ) ? $step->get_editable_fields() : null,
    'native_first_raw' => (string) ( $entry[ $first_id ] ?? '' ),
    'native_last_raw' => (string) ( $entry[ $last_id ] ?? '' ),
    'native_choice_raw' => (string) ( $entry[ $choice_id ] ?? '' ),
    'native_choice_display' => GFAPI::get_field( $form, $choice_id )->get_value_entry_detail( $entry[ $choice_id ], $choice_id, true, 'text', 'screen' ),
    'native_created_at' => (string) ( $entry['date_created'] ?? '' ),
    'binding_identity' => $activation,
    'binding_source_refs' => $sources,
    'phone_source_exists' => null !== $phone && is_object( GFAPI::get_field( $form, $phone ) ),
);
if ( (int) $result['native_step_id'] !== (int) $fixture['native_authority']['approval_step_id']
    || ! is_array( $result['native_editable_fields'] ) || $result['native_editable_fields'] !== array()
    || $result['native_first_raw'] !== $fixture['expected_first_name_value']
    || $result['native_last_raw'] !== $fixture['expected_last_name_value'] ) {
    throw new RuntimeException( 'Host truth does not support connected Entry Detail Review.' );
}
file_put_contents( $dir . '/connected-entry-host-' . $stage . '.json',
    wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo 'GPP_CONNECTED_ENTRY_HOST_WITNESS_PASS stage=' . $stage . PHP_EOL;
