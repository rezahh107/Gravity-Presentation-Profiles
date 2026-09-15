<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Diagnostics\RuntimeIncidentStore;
use GravityPresentationProfiles\GravityForms\BindingHealthService;

$action = getenv( 'GPP_DIAGNOSTICS_CONTROL' );
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! is_array( $manifest ) || empty( $manifest['forms'][1]['form_id'] ) ) {
    throw new RuntimeException( 'WU21 fixture manifest is unavailable for Diagnostics admin evidence.' );
}
$form_id = (int) $manifest['forms'][1]['form_id'];
$backup_option = 'gpp_diagnostics_admin_form_backup';

function gpp_diag_json( $value ) {
    echo wp_json_encode( $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
}

if ( 'reset-diagnostics' === $action ) {
    RuntimeIncidentStore::forWordPress()->reset();
    gpp_diag_json( array( 'status' => 'reset' ) );
    return;
}

if ( 'stale-on' === $action ) {
    if ( false !== get_option( $backup_option, false ) ) {
        throw new RuntimeException( 'Diagnostics stale-form backup already exists.' );
    }
    $form = GFAPI::get_form( $form_id );
    if ( ! is_array( $form ) ) {
        throw new RuntimeException( 'Diagnostics synthetic form is unavailable.' );
    }
    $form_title = isset( $form['title'] ) && is_string( $form['title'] ) ? trim( $form['title'] ) : '';
    if ( '' === $form_title ) {
        throw new RuntimeException( 'Diagnostics synthetic form title is unavailable.' );
    }
    update_option( $backup_option, $form, false );

    $fields = array();
    foreach ( $form['fields'] as $field ) {
        if ( is_object( $field ) && isset( $field->id ) && 11 === (int) $field->id ) {
            continue;
        }
        $fields[] = $field;
    }
    if ( ! class_exists( 'GF_Fields' ) ) {
        throw new RuntimeException( 'Gravity Forms field factory is unavailable.' );
    }
    $replacement = GF_Fields::create(
        array(
            'type' => 'text',
            'id' => 12,
            'label' => 'Synthetic Replacement National ID',
            'isRequired' => true,
        )
    );
    if ( ! is_object( $replacement ) ) {
        throw new RuntimeException( 'Unable to create the synthetic replacement field.' );
    }
    $fields[] = $replacement;
    $form['fields'] = $fields;
    $updated = GFAPI::update_form( $form );
    if ( is_wp_error( $updated ) || false === $updated ) {
        throw new RuntimeException( is_wp_error( $updated ) ? $updated->get_error_message() : 'Gravity Forms rejected the synthetic drift mutation.' );
    }

    $facts = BindingHealthService::forWordPress()->diagnosticFacts();
    $status = null;
    foreach ( $facts['contexts'] as $context ) {
        if ( (int) $context['form_id'] !== $form_id ) {
            continue;
        }
        foreach ( $context['facts'] as $fact ) {
            if ( 'student.national_id' === $fact['semantic_slot_key'] ) {
                $status = $fact['status'];
                break 2;
            }
        }
    }
    if ( 'stale_source_missing' !== $status ) {
        throw new RuntimeException( 'Synthetic schema drift did not produce the existing stale binding-health fact.' );
    }

    gpp_diag_json(
        array(
            'status' => 'stale',
            'form_id' => $form_id,
            'form_title' => $form_title,
            'replacement_field_id' => 12,
            'binding_health' => $status,
        )
    );
    return;
}

if ( 'stale-off' === $action ) {
    $backup = get_option( $backup_option, false );
    if ( ! is_array( $backup ) ) {
        throw new RuntimeException( 'Diagnostics stale-form backup is missing.' );
    }
    $updated = GFAPI::update_form( $backup );
    if ( is_wp_error( $updated ) || false === $updated ) {
        throw new RuntimeException( is_wp_error( $updated ) ? $updated->get_error_message() : 'Unable to restore the synthetic form.' );
    }
    delete_option( $backup_option );
    gpp_diag_json( array( 'status' => 'restored', 'form_id' => $form_id ) );
    return;
}

if ( 'health' === $action ) {
    gpp_diag_json( BindingHealthService::forWordPress()->diagnosticFacts() );
    return;
}

throw new RuntimeException( 'Unknown GPP_DIAGNOSTICS_CONTROL action.' );
