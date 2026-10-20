<?php
// Read-only host and active binding witness in the installed-ZIP release runtime.
// Never creates or edits GPP lifecycle state.
defined( 'ABSPATH' ) || exit( 1 );

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\BoundHostValueReader;

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
// GFAPI is the raw host authority; the same existing GPP date presentation
// provider is the formatter. No parallel calendar or timestamp semantics.
$date_source = array( 'type' => 'gravity_forms.entry_meta', 'meta_key' => 'date_created' );
$host_date_raw = (string) ( $entry['date_created'] ?? '' );
$host_date_display = ( new BoundHostValueReader() )->readDisplay( $date_source, $form, $entry );
if ( '' === $host_date_raw || ! is_string( $host_date_display ) || '' === trim( $host_date_display ) ) {
    throw new RuntimeException( 'Native creation date or existing date provider unavailable.' );
}
$choice_field = GFAPI::get_field( $form, $choice_id );
$alternate_id = (string) $fixture['fields']['alternate_choice']['id'];
$alternate_field = GFAPI::get_field( $form, $alternate_id );
if ( ! is_object( $choice_field ) || ! is_object( $alternate_field ) ) {
    throw new RuntimeException( 'Synthetic native choice sources unavailable.' );
}
$personal_sentinels = array(
    'first_name' => (string) ( $entry[ $first_id ] ?? '' ),
    'last_name' => (string) ( $entry[ $last_id ] ?? '' ),
    'choice_raw' => (string) ( $entry[ $choice_id ] ?? '' ),
    'choice_display' => trim( wp_strip_all_tags( (string) $choice_field->get_value_entry_detail( $entry[ $choice_id ], $entry, true, 'text' ) ) ),
    'alternate_raw' => (string) ( $entry[ $alternate_id ] ?? '' ),
    'alternate_display' => trim( wp_strip_all_tags( (string) $alternate_field->get_value_entry_detail( $entry[ $alternate_id ], $entry, true, 'text' ) ) ),
);
if ( count( array_unique( array_values( $personal_sentinels ) ) ) !== count( $personal_sentinels ) ) {
    throw new RuntimeException( 'Native personal sentinels are not distinct.' );
}
foreach ( $personal_sentinels as $value ) {
    if ( ! is_string( $value ) || strlen( $value ) < 12 ) {
        throw new RuntimeException( 'Native personal sentinel missing/too short.' );
    }
}
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
    'native_choice_display' => $personal_sentinels['choice_display'],
    'native_created_at' => $host_date_raw,
    'native_created_display' => $host_date_display,
    'date_source' => $date_source,
    'date_display_provenance' => 'gfapi_date_created_via_existing_bound_host_value_reader',
    'personal_sentinels' => $personal_sentinels,
    'binding_identity' => $activation,
    'binding_source_refs' => $sources,
    'phone_source_exists' => null !== $phone && is_object( GFAPI::get_field( $form, $phone ) ),
);
if ( (int) $result['native_step_id'] !== (int) $fixture['native_authority']['approval_step_id']
    || ! is_array( $result['native_editable_fields'] ) || $result['native_editable_fields'] !== array()
    || $result['native_first_raw'] !== $fixture['expected_first_name_value']
    || $result['native_last_raw'] !== $fixture['expected_last_name_value']
    || $result['native_created_at'] !== $fixture['expected_native_created_at']
    || $result['native_choice_raw'] !== $fixture['expected_choice']['host_raw_value']
    || $result['native_choice_display'] !== $fixture['expected_choice']['host_display_value']
    || $personal_sentinels['alternate_raw'] !== $fixture['expected_alternate_choice']['host_raw_value']
    || $personal_sentinels['alternate_display'] !== $fixture['expected_alternate_choice']['host_display_value'] ) {
    throw new RuntimeException( 'Host truth does not support connected Entry Detail Review.' );
}
file_put_contents( $dir . '/connected-entry-host-' . $stage . '.json',
    wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo 'GPP_CONNECTED_ENTRY_HOST_WITNESS_PASS stage=' . $stage . PHP_EOL;
