<?php
// Deliberately retire one synthetic host field: GPP must show stale mapping,
// not populate an inferred replacement or mutate its binding state here.
defined( 'ABSPATH' ) || exit( 1 );
$dir = getenv( 'GPP_BEHAVIOR_ARTIFACT_DIR' );
$fixture = json_decode( (string) file_get_contents( $dir . '/behavioral-host-fixture.json' ), true );
if ( ! is_array( $fixture ) ) throw new RuntimeException( 'Missing synthetic fixture.' );
$form = GFAPI::get_form( (int) $fixture['form_id'] );
$removed_id = (string) $fixture['fields']['empty_phone']['id'];
$replacement_id = (string) $fixture['fields']['replacement_empty_phone']['id'];
if ( ! is_array( $form ) || ! is_object( GFAPI::get_field( $form, $removed_id ) )
    || ! is_object( GFAPI::get_field( $form, $replacement_id ) ) ) {
    throw new RuntimeException( 'Both native phone fields must exist before source retirement.' );
}
$form['fields'] = array_values( array_filter( $form['fields'], static function ( $field ) use ( $removed_id ) {
    return (string) $field->id !== $removed_id;
} ) );
$updated = GFAPI::update_form( $form );
if ( is_wp_error( $updated ) ) throw new RuntimeException( $updated->get_error_message() );
// GFAPI may retain a request-local form cache. A separate WP-CLI process
// and the authentic browser request must prove the persisted removal; never
// infer persistent source health from this mutation request's cached form.
echo 'GPP_CONNECTED_ENTRY_HOST_SOURCE_CHANGE_PASS retired_field=' . $removed_id . PHP_EOL;
