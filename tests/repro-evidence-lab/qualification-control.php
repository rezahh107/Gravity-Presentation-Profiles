<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationAdapter;

$action = getenv( 'GPP_QUAL_CONTROL' );
$manifest = get_option( 'gpp_wu19_fixture_manifest' );
if ( ! is_string( $action ) || '' === $action || ! is_array( $manifest ) ) {
    throw new RuntimeException( 'Qualification control requires action and WU19 manifest.' );
}

function gppq_json( $value ) {
    echo wp_json_encode( $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
}
function gppq_binding_lifecycle() {
    return new BindingSetLifecycle(
        new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
        new EvidenceReferenceGate(
            array(
                'wu21:synthetic-fixture', 'wu21:reproducible-simulation', 'wu21:fail-closed-negative-control',
                'wu18:synthetic-fixture', 'wu18:pinned-runtime', 'wu18:negative-control',
                'wu19:synthetic-fixture', 'wu19:pinned-runtime', 'wu19:negative-control',
                'qualification:stateful-core-spine', 'qualification:negative-control'
            )
        )
    );
}
function gppq_reset_caches() {
    EntryDetailPresentationAdapter::resetRuntimeCache();
    PrintDossierPresentationAdapter::resetRuntimeCache();
}
function gppq_backup_binding_state( $key ) {
    $option = 'gpp_qualification_' . $key . '_binding_backup';
    if ( false !== get_option( $option, false ) ) throw new RuntimeException( 'Qualification binding backup already exists: ' . $key );
    $state = get_option( BindingSetLifecycle::OPTION_NAME );
    if ( ! is_array( $state ) ) throw new RuntimeException( 'Binding lifecycle state unavailable.' );
    update_option( $option, $state, false );
    return $state;
}
function gppq_restore_binding_state( $key ) {
    $option = 'gpp_qualification_' . $key . '_binding_backup';
    $state = get_option( $option, false );
    if ( ! is_array( $state ) ) throw new RuntimeException( 'Qualification binding backup missing: ' . $key );
    update_option( BindingSetLifecycle::OPTION_NAME, $state, false );
    delete_option( $option );
    gppq_reset_caches();
}
function gppq_active_general_artifact( $surface, $form_id ) {
    $state = get_option( BindingSetLifecycle::OPTION_NAME );
    if ( ! is_array( $state ) ) throw new RuntimeException( 'Binding lifecycle state unavailable.' );
    foreach ( $state['activations'] as $context_key => $identity ) {
        $id = $identity['binding_set_id']; $version = $identity['binding_set_version'];
        if ( empty( $state['installed'][ $id ][ $version ]['artifact'] ) ) continue;
        $artifact = $state['installed'][ $id ][ $version ]['artifact'];
        $context = $artifact['context'];
        if ( (string) $context['form_source_ref']['form_id'] !== (string) $form_id ) continue;
        if ( ! in_array( $surface, $context['surfaces'], true ) ) continue;
        if ( null !== $context['entry_source_ref'] ) continue;
        return $artifact;
    }
    throw new RuntimeException( 'Active general binding artifact unavailable for ' . $surface );
}
function gppq_set_binding_source( &$artifact, $slot, $field_id, $state = 'PROVEN' ) {
    foreach ( $artifact['bindings'] as &$binding ) {
        if ( $slot !== $binding['semantic_slot_key'] ) continue;
        $binding['state'] = $state;
        $binding['source_ref'] = 'PROVEN' === $state ? array( 'type' => 'gravity_forms.field', 'field_id' => (int) $field_id ) : null;
        $binding['evidence_refs'] = array( 'PROVEN' === $state ? 'qualification:stateful-core-spine' : 'qualification:negative-control' );
    }
    unset( $binding );
}
function gppq_set_claim_state( &$artifact, $slot, $claim_name, $state ) {
    foreach ( $artifact['runtime_claims'] as &$claim ) {
        if ( $slot === $claim['semantic_slot_key'] && $claim_name === $claim['claim'] ) {
            $claim['evidence_state'] = $state;
            $claim['evidence_refs'] = array( 'PROVEN' === $state ? 'qualification:stateful-core-spine' : 'qualification:negative-control' );
        }
    }
    unset( $claim );
}
function gppq_activate_clone( $source, $id, $version, $entry_id = null ) {
    $artifact = $source;
    $artifact['binding_set_id'] = $id;
    $artifact['binding_set_version'] = $version;
    $artifact['context']['entry_source_ref'] = null === $entry_id ? null : array( 'type' => 'gravity_forms.entry', 'entry_id' => (int) $entry_id );
    $artifact['provenance'] = array( 'producer' => 'Stateful Core Spine Qualification', 'evidence_refs' => array( 'qualification:stateful-core-spine' ) );
    $lifecycle = gppq_binding_lifecycle();
    $lifecycle->import( $artifact );
    $lifecycle->activate( array( 'context' => $artifact['context'], 'binding_set_id' => $id, 'binding_set_version' => $version ) );
    gppq_reset_caches();
    return $artifact;
}
function gppq_add_text_field( $form_id, $label, $value, $entry_id, $minimum_id = 0 ) {
    $form = GFAPI::get_form( $form_id );
    if ( ! is_array( $form ) ) throw new RuntimeException( 'Synthetic form unavailable.' );
    $max = 0;
    foreach ( $form['fields'] as $field ) $max = max( $max, (int) $field->id );
    $id = max( $max + 1, (int) $minimum_id + 1 );
    $form['fields'][] = array( 'id' => $id, 'label' => $label, 'type' => 'text', 'isRequired' => false );
    $result = GFAPI::update_form( $form );
    if ( is_wp_error( $result ) ) throw new RuntimeException( $result->get_error_message() );
    $result = GFAPI::update_entry_field( $entry_id, $id, $value );
    if ( is_wp_error( $result ) ) throw new RuntimeException( $result->get_error_message() );
    return $id;
}
function gppq_backup_form( $key, $form_id, $entry_id, $field_id ) {
    $option = 'gpp_qualification_' . $key . '_form_backup';
    if ( false !== get_option( $option, false ) ) throw new RuntimeException( 'Qualification form backup already exists: ' . $key );
    $form = GFAPI::get_form( $form_id ); $entry = GFAPI::get_entry( $entry_id );
    if ( ! is_array( $form ) || is_wp_error( $entry ) ) throw new RuntimeException( 'Unable to backup synthetic form/entry.' );
    update_option( $option, array( 'form' => $form, 'entry_id' => (int) $entry_id, 'field_id' => (int) $field_id, 'value' => isset( $entry[ (string) $field_id ] ) ? $entry[ (string) $field_id ] : '' ), false );
}
function gppq_restore_form( $key ) {
    $option = 'gpp_qualification_' . $key . '_form_backup';
    $backup = get_option( $option, false );
    if ( ! is_array( $backup ) || ! is_array( $backup['form'] ) ) throw new RuntimeException( 'Qualification form backup missing: ' . $key );
    $result = GFAPI::update_form( $backup['form'] );
    if ( is_wp_error( $result ) ) throw new RuntimeException( $result->get_error_message() );
    $result = GFAPI::update_entry_field( $backup['entry_id'], $backup['field_id'], $backup['value'] );
    if ( is_wp_error( $result ) ) throw new RuntimeException( $result->get_error_message() );
    delete_option( $option );
}

$alpha = $manifest['alpha'];
$form_id = (int) $alpha['form_id'];
$entry_id = (int) $alpha['entry_id'];
$national_id_field = (int) $alpha['fields']['student.national_id'];

if ( 'schema-drift-on' === $action ) {
    gppq_backup_binding_state( 'schema_drift' );
    gppq_backup_form( 'schema_drift', $form_id, $entry_id, $national_id_field );
    $form = GFAPI::get_form( $form_id );
    $form['fields'] = array_values( array_filter( $form['fields'], static function ( $field ) use ( $national_id_field ) { return (int) $field->id !== $national_id_field; } ) );
    $result = GFAPI::update_form( $form );
    if ( is_wp_error( $result ) ) throw new RuntimeException( $result->get_error_message() );
    GFAPI::update_entry_field( $entry_id, $national_id_field, '' );
    $replacement_value = 'SYN-REPLACEMENT-NATIONAL-ID';
    $replacement_id = gppq_add_text_field( $form_id, 'Synthetic National ID Replacement', $replacement_value, $entry_id, $national_id_field );
    if ( $replacement_id === $national_id_field ) throw new RuntimeException( 'Schema-drift control reused the removed field identifier.' );
    update_option( 'gpp_qualification_schema_drift_replacement', array( 'field_id' => $replacement_id, 'value' => $replacement_value ), false );
    gppq_reset_caches();
    gppq_json( array( 'state' => 'drifted', 'removed_field_id' => $national_id_field, 'replacement_field_id' => $replacement_id, 'replacement_value' => $replacement_value ) ); return;
}
if ( 'schema-drift-repair' === $action ) {
    $replacement = get_option( 'gpp_qualification_schema_drift_replacement', false );
    if ( ! is_array( $replacement ) ) throw new RuntimeException( 'Schema-drift replacement missing.' );
    foreach ( array( 'gravity_flow.entry_detail' => 'qual.schema.entry.v2', 'print.dossier' => 'qual.schema.print.v2' ) as $surface => $id ) {
        $artifact = gppq_active_general_artifact( $surface, $form_id );
        gppq_set_binding_source( $artifact, 'student.national_id', (int) $replacement['field_id'] );
        gppq_activate_clone( $artifact, $id, '2.0.0' );
    }
    gppq_json( array( 'state' => 'repaired', 'replacement_field_id' => (int) $replacement['field_id'], 'replacement_value' => $replacement['value'] ) ); return;
}
if ( 'schema-drift-off' === $action ) {
    gppq_restore_form( 'schema_drift' ); gppq_restore_binding_state( 'schema_drift' );
    delete_option( 'gpp_qualification_schema_drift_replacement' );
    gppq_json( array( 'state' => 'restored' ) ); return;
}

if ( 'ambiguity-on' === $action ) {
    gppq_backup_binding_state( 'ambiguity' );
    gppq_backup_form( 'ambiguity', $form_id, $entry_id, $national_id_field );
    $override_value = 'SYN-EXACT-ENTRY-NATIONAL-ID';
    $override_id = gppq_add_text_field( $form_id, 'Synthetic Exact Entry National ID', $override_value, $entry_id );
    foreach ( array( 'gravity_flow.entry_detail' => 'qual.ambiguity.entry.exact', 'print.dossier' => 'qual.ambiguity.print.exact' ) as $surface => $id ) {
        $artifact = gppq_active_general_artifact( $surface, $form_id );
        gppq_set_binding_source( $artifact, 'student.national_id', $override_id );
        gppq_activate_clone( $artifact, $id, '1.0.0', $entry_id );
    }
    update_option( 'gpp_qualification_ambiguity_value', $override_value, false );
    gppq_json( array( 'state' => 'overlap_active', 'override_value' => $override_value, 'override_field_id' => $override_id ) ); return;
}
if ( 'ambiguity-off' === $action ) {
    gppq_restore_form( 'ambiguity' ); gppq_restore_binding_state( 'ambiguity' ); delete_option( 'gpp_qualification_ambiguity_value' );
    gppq_json( array( 'state' => 'restored' ) ); return;
}

if ( 'degradation-on' === $action ) {
    gppq_backup_binding_state( 'degradation' );
    foreach ( array( 'gravity_flow.entry_detail' => 'qual.degraded.entry.exact', 'print.dossier' => 'qual.degraded.print.exact' ) as $surface => $id ) {
        $artifact = gppq_active_general_artifact( $surface, $form_id );
        gppq_set_binding_source( $artifact, 'student.national_id', 0, 'NOT_PROVEN' );
        if ( 'gravity_flow.entry_detail' === $surface ) gppq_set_claim_state( $artifact, 'student.national_id', 'availability', 'NOT_PROVEN' );
        gppq_activate_clone( $artifact, $id, '1.0.0', $entry_id );
    }
    gppq_json( array( 'state' => 'national_id_not_proven' ) ); return;
}
if ( 'degradation-off' === $action ) {
    gppq_restore_binding_state( 'degradation' ); gppq_json( array( 'state' => 'restored' ) ); return;
}

if ( 'lifecycle-deactivate' === $action ) {
    gppq_backup_binding_state( 'lifecycle' );
    $lifecycle = gppq_binding_lifecycle();
    $deactivated = array();
    foreach ( array( 'gravity_flow.entry_detail', 'print.dossier' ) as $surface ) {
        $artifact = gppq_active_general_artifact( $surface, $form_id );
        $lifecycle->deactivate( array( 'context' => $artifact['context'] ) );
        $deactivated[] = $surface;
    }
    gppq_reset_caches();
    gppq_json( array( 'state' => 'deactivated', 'surfaces' => $deactivated ) ); return;
}
if ( 'lifecycle-replace' === $action ) {
    $backup = get_option( 'gpp_qualification_lifecycle_binding_backup', false );
    if ( ! is_array( $backup ) ) throw new RuntimeException( 'Lifecycle backup unavailable.' );
    $source_by_surface = array();
    foreach ( $backup['activations'] as $context_key => $identity ) {
        $record = $backup['installed'][ $identity['binding_set_id'] ][ $identity['binding_set_version'] ];
        $artifact = $record['artifact'];
        if ( (string) $artifact['context']['form_source_ref']['form_id'] !== (string) $form_id || null !== $artifact['context']['entry_source_ref'] ) continue;
        foreach ( array( 'gravity_flow.entry_detail', 'print.dossier' ) as $surface ) if ( in_array( $surface, $artifact['context']['surfaces'], true ) ) $source_by_surface[ $surface ] = $artifact;
    }
    foreach ( array( 'gravity_flow.entry_detail' => 'qual.lifecycle.entry.v2', 'print.dossier' => 'qual.lifecycle.print.v2' ) as $surface => $id ) {
        if ( empty( $source_by_surface[ $surface ] ) ) throw new RuntimeException( 'Lifecycle source artifact missing for ' . $surface );
        gppq_activate_clone( $source_by_surface[ $surface ], $id, '2.0.0' );
    }
    gppq_json( array( 'state' => 'replacement_active', 'binding_ids' => array( 'qual.lifecycle.entry.v2', 'qual.lifecycle.print.v2' ) ) ); return;
}
if ( 'lifecycle-off' === $action ) {
    gppq_restore_binding_state( 'lifecycle' ); gppq_json( array( 'state' => 'restored' ) ); return;
}

throw new RuntimeException( 'Unknown qualification control action: ' . $action );