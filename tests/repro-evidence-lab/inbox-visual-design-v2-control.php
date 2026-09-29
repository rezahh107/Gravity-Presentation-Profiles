<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$action = getenv( 'IVD2_CONTROL' );
$config = get_option( 'gpp_inbox_visual_design_v2_qualification' );
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! is_array( $config ) || ! is_array( $manifest ) ) {
    throw new RuntimeException( 'Inbox V2 qualification fixture is unavailable.' );
}

function gpp_ivd2_process_entry( $form_id, $entry_id ) {
    $api = new Gravity_Flow_API( (int) $form_id );
    $api->process_workflow( (int) $entry_id );
    $entry = GFAPI::get_entry( (int) $entry_id );
    if ( is_wp_error( $entry ) ) {
        throw new RuntimeException( $entry->get_error_message() );
    }
    $step = $api->get_current_step( $entry );
    if ( ! $step ) {
        throw new RuntimeException( 'Synthetic Inbox V2 entry did not reach an active workflow step.' );
    }
    return $step;
}

function gpp_ivd2_alpha_form( $manifest ) {
    if ( empty( $manifest['forms'][0] ) ) {
        throw new RuntimeException( 'Alpha fixture metadata missing.' );
    }
    return $manifest['forms'][0];
}

if ( 'q1-update' === $action ) {
    $result = GFAPI::update_entry_field( (int) $config['entry_a'], (int) $config['probe_field_id'], 'IVD2_RAW_A_UPDATED' );
    if ( is_wp_error( $result ) || false === $result ) {
        throw new RuntimeException( is_wp_error( $result ) ? $result->get_error_message() : 'Q1 update failed.' );
    }
    echo (int) $config['entry_a'];
    return;
}

if ( 'q1-add' === $action || 'q4-add' === $action ) {
    $form = gpp_ivd2_alpha_form( $manifest );
    $is_q1 = 'q1-add' === $action;
    $entry = array(
        'form_id' => (int) $form['form_id'],
        'created_by' => (int) $manifest['operator']['id'],
        (string) $form['first_name_field_id'] => $is_q1 ? 'IVD2 Added' : 'IVD2 Page Two',
        (string) $form['last_name_field_id'] => 'Synthetic Student',
        (string) $form['national_id_field_id'] => $is_q1 ? 'SYN-IVD2-Q1-ADD' : 'SYN-IVD2-Q4-ADD',
        (string) $form['grade_group_field_id'] => 'پایه آزمایشی',
        (string) $form['school_field_id'] => 'مدرسه آزمایشی IVD2',
    );
    if ( $is_q1 ) {
        $entry[ (string) $config['probe_field_id'] ] = 'IVD2_RAW_NEW';
    }
    $id = GFAPI::add_entry( $entry );
    if ( is_wp_error( $id ) ) {
        throw new RuntimeException( $id->get_error_message() );
    }
    GFAPI::update_entry_property( $id, 'date_created', $is_q1 ? '2026-01-04 00:00:00' : '2026-01-05 00:00:00' );
    gpp_ivd2_process_entry( $form['form_id'], $id );
    update_option( $is_q1 ? 'gpp_ivd2_q1_added_entry' : 'gpp_ivd2_q4_added_entry', (int) $id, false );
    echo (int) $id;
    return;
}

if ( 'q1-remove' === $action || 'q4-remove' === $action ) {
    $option = 'q1-remove' === $action ? 'gpp_ivd2_q1_added_entry' : 'gpp_ivd2_q4_added_entry';
    $id = (int) get_option( $option );
    if ( $id ) {
        GFAPI::delete_entry( $id );
        delete_option( $option );
    }
    echo $id;
    return;
}

if ( 'q1-disable' === $action ) {
    $config['q1_enabled'] = false;
    update_option( 'gpp_inbox_visual_design_v2_qualification', $config, false );
    echo 'disabled';
    return;
}

if ( 'q4-update' === $action ) {
    $target_id = (int) getenv( 'IVD2_ENTRY_ID' );
    if ( ! $target_id ) {
        throw new RuntimeException( 'IVD2_ENTRY_ID is required for q4-update.' );
    }
    $entry = GFAPI::get_entry( $target_id );
    if ( is_wp_error( $entry ) ) {
        throw new RuntimeException( $entry->get_error_message() );
    }
    $field_id = null;
    foreach ( $manifest['forms'] as $form ) {
        if ( (int) $form['form_id'] === (int) $entry['form_id'] ) {
            $field_id = (int) $form['school_field_id'];
            break;
        }
    }
    if ( ! $field_id ) {
        throw new RuntimeException( 'Unable to resolve synthetic school field for Q4 update.' );
    }
    $token = 'IVD2_Q4_UPDATED_' . $target_id;
    $result = GFAPI::update_entry_field( $target_id, $field_id, $token );
    if ( is_wp_error( $result ) || false === $result ) {
        throw new RuntimeException( is_wp_error( $result ) ? $result->get_error_message() : 'Q4 update failed.' );
    }
    echo $token;
    return;
}

throw new RuntimeException( 'Unknown IVD2_CONTROL action.' );
