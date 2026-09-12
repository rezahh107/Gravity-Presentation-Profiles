<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}
$action = getenv( 'WU21_CONTROL' );
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! is_array( $manifest ) ) {
    throw new RuntimeException( 'WU21 fixture manifest is unavailable.' );
}
$form = $manifest['forms'][0];
if ( 'add' === $action ) {
    $entry = array(
        'form_id' => (int) $form['form_id'],
        'created_by' => (int) $manifest['operator']['id'],
        (string) $form['name_field_id'] => 'WU21 Refresh Student',
    );
    $id = GFAPI::add_entry( $entry );
    if ( is_wp_error( $id ) ) {
        throw new RuntimeException( $id->get_error_message() );
    }
    GFAPI::update_entry_property( $id, 'date_created', '2026-01-02 00:00:00' );
    $api = new Gravity_Flow_API( (int) $form['form_id'] );
    $api->process_workflow( $id );
    update_option( 'gpp_wu21_refresh_entry_id', (int) $id, false );
    echo (int) $id;
    return;
}
if ( 'remove' === $action ) {
    $id = (int) get_option( 'gpp_wu21_refresh_entry_id' );
    if ( $id ) {
        GFAPI::delete_entry( $id );
        delete_option( 'gpp_wu21_refresh_entry_id' );
    }
    echo $id;
    return;
}
throw new RuntimeException( 'Unknown WU21_CONTROL action.' );
