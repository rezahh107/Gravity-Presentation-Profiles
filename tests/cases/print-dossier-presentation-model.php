<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationModel;

Autoloader::register();

$package = json_decode( file_get_contents( __DIR__ . '/../fixtures/wu09-visual-package.json' ), true );
$profile = ( new VisualProfileResolver( $package ) )->resolve( 'print.dossier' );

function wu19_binding( $id, $form_id, $phone_state = 'UNBOUND', $phone_mapping = 'NOT_PROVEN', $version = '1.0.0', $entry_id = null, $phone_field_id = 3 ) {
    $proven = array( 'fixture:wu19:semantic', 'fixture:wu19:print-mapping' );
    $negative = array( 'fixture:wu19:negative' );
    $bindings = array(
        // student.full_name is a presentation derivation from these two
        // canonical components; it deliberately carries no host source itself.
        array( 'semantic_slot_key' => 'student.first_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 1 ), 'evidence_refs' => $proven ),
        array( 'semantic_slot_key' => 'student.last_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 2 ), 'evidence_refs' => $proven ),
        array( 'semantic_slot_key' => 'student.full_name', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => $negative ),
        array( 'semantic_slot_key' => 'student.gender', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 5 ), 'evidence_refs' => $proven ),
        array( 'semantic_slot_key' => 'print.phone_2', 'state' => $phone_state, 'source_ref' => 'PROVEN' === $phone_state ? array( 'type' => 'gravity_forms.field', 'field_id' => $phone_field_id ) : null, 'evidence_refs' => 'PROVEN' === $phone_state ? $proven : $negative ),
        array( 'semantic_slot_key' => 'print.financial_date', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => $negative ),
    );
    $claims = array(
        array( 'semantic_slot_key' => 'student.gender', 'claim' => 'print_mapping', 'evidence_state' => 'PROVEN', 'evidence_refs' => $proven ),
        array( 'semantic_slot_key' => 'print.phone_2', 'claim' => 'print_mapping', 'evidence_state' => $phone_mapping, 'evidence_refs' => 'PROVEN' === $phone_mapping ? $proven : $negative ),
    );
    return array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.0.0',
        'binding_set_id' => $id,
        'binding_set_version' => $version,
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'wu19-installation' ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => $form_id ),
            'entry_source_ref' => null === $entry_id ? null : array( 'type' => 'gravity_forms.entry', 'entry_id' => $entry_id ),
            'surfaces' => array( 'print.dossier' ),
        ),
        'provenance' => array( 'producer' => 'WU19 model test', 'evidence_refs' => $proven ),
        'bindings' => $bindings,
        'runtime_claims' => $claims,
    );
}

$binding = wu19_binding( 'wu19.alpha', 101 );
EnvironmentBindingSet::validate( $binding );
$model = new PrintDossierPresentationModel( $profile, array( $binding ), $package['semantic_slots'] );
$entry = array( 'id' => 1001, 'form_id' => 101 );

gpp_assert_same( 'shared.print.v1', $model->profileId(), 'One shared print visual profile remains independent of target form identity.' );
gpp_assert_same( 'ready', $model->bindingContextStatus( $entry ), 'A unique active print binding context is structurally ready.' );
$direct_full_name = $model->fieldDecision( $entry, 'student.full_name' );
gpp_assert_true( ! $direct_full_name['populate'], 'A derived presentation slot is never read as a direct host source.' );
gpp_assert_same( 'derived_slot_requires_derivation', $direct_full_name['reason'], 'Direct reads of a derived slot are refused explicitly.' );
$derived_full_name = $model->derivedDecision( $entry, 'student.full_name' );
gpp_assert_true( $derived_full_name['populate'], 'Full name derives from separately bound first and last name components.' );
gpp_assert_same( 2, count( $derived_full_name['component_source_refs'] ), 'Both canonical name components contribute to the derivation.' );
gpp_assert_same( 1, $derived_full_name['component_source_refs'][0]['field_id'], 'First name resolves from its own explicit host field.' );
gpp_assert_same( 2, $derived_full_name['component_source_refs'][1]['field_id'], 'Last name resolves from its own explicit host field.' );
gpp_assert_true( $model->fieldDecision( $entry, 'student.gender' )['populate'], 'Option source requires and receives independent PROVEN print_mapping evidence.' );
$phone = $model->fieldDecision( $entry, 'print.phone_2' );
gpp_assert_true( ! $phone['populate'], 'UNBOUND historical Phone 2 remains blank.' );
gpp_assert_same( 'binding_not_proven', $phone['reason'], 'Phone 2 blank reason is explicit and never falls back.' );
$financial = $model->fieldDecision( $entry, 'print.financial_date' );
gpp_assert_true( ! $financial['populate'], 'UNBOUND financial date remains blank rather than using entry.created_at.' );

$mapping_missing = wu19_binding( 'wu19.mapping-missing', 202, 'PROVEN', 'NOT_PROVEN' );
$mapping_model = new PrintDossierPresentationModel( $profile, array( $mapping_missing ), $package['semantic_slots'] );
$phone_mapping = $mapping_model->fieldDecision( array( 'id' => 2001, 'form_id' => 202 ), 'print.phone_2' );
gpp_assert_true( ! $phone_mapping['populate'], 'Structurally PROVEN print-specific binding does not populate without print_mapping proof.' );
gpp_assert_same( 'print_mapping_not_proven', $phone_mapping['reason'], 'print_mapping failure remains a distinct decision.' );

$overlap_entry = array( 'id' => 4001, 'form_id' => 404 );
$general_mapping_proven = wu19_binding( 'wu19.overlap', 404, 'PROVEN', 'PROVEN', '1.0.0', null, 31 );
$selected_mapping_not_proven = wu19_binding( 'wu19.overlap', 404, 'PROVEN', 'NOT_PROVEN', '2.0.0', 4001, 32 );
EnvironmentBindingSet::validate( $general_mapping_proven );
EnvironmentBindingSet::validate( $selected_mapping_not_proven );

foreach ( array(
    array( $general_mapping_proven, $selected_mapping_not_proven ),
    array( $selected_mapping_not_proven, $general_mapping_proven ),
) as $ordered_overlap ) {
    $overlap_model = new PrintDossierPresentationModel( $profile, $ordered_overlap, $package['semantic_slots'] );
    $selected_resolution = $overlap_model->resolve( $overlap_entry, 'print.phone_2' );
    gpp_assert_true( $selected_resolution['resolved'], 'Entry-specific semantic binding must be selected normally over the general overlap.' );
    gpp_assert_same( 'wu19.overlap', $selected_resolution['binding_set_id'], 'Selected overlap must preserve binding_set_id.' );
    gpp_assert_same( '2.0.0', $selected_resolution['binding_set_version'], 'Selected overlap must preserve the exact selected binding_set_version.' );
    gpp_assert_same( 32, $selected_resolution['source_ref']['field_id'], 'Selected semantic source must come from the entry-specific artifact.' );

    $overlap_decision = $overlap_model->fieldDecision( $overlap_entry, 'print.phone_2' );
    gpp_assert_true( ! $overlap_decision['populate'], 'General-version print_mapping proof must not authorize the selected entry-specific source.' );
    gpp_assert_same( 'print_mapping_not_proven', $overlap_decision['reason'], 'Cross-version proof borrowing must fail closed regardless of input order.' );
}

$general_mapping_not_proven = wu19_binding( 'wu19.overlap-positive', 405, 'PROVEN', 'NOT_PROVEN', '1.0.0', null, 41 );
$selected_mapping_proven = wu19_binding( 'wu19.overlap-positive', 405, 'PROVEN', 'PROVEN', '2.0.0', 5001, 42 );
EnvironmentBindingSet::validate( $general_mapping_not_proven );
EnvironmentBindingSet::validate( $selected_mapping_proven );
$positive_entry = array( 'id' => 5001, 'form_id' => 405 );
$positive_model = new PrintDossierPresentationModel( $profile, array( $general_mapping_not_proven, $selected_mapping_proven ), $package['semantic_slots'] );
$positive_resolution = $positive_model->resolve( $positive_entry, 'print.phone_2' );
gpp_assert_same( '2.0.0', $positive_resolution['binding_set_version'], 'Positive control must select the entry-specific binding version.' );
$positive_decision = $positive_model->fieldDecision( $positive_entry, 'print.phone_2' );
gpp_assert_true( $positive_decision['populate'], 'Selected entry-specific PROVEN print_mapping must authorize its own source even when the general version is NOT_PROVEN.' );
gpp_assert_same( 42, $positive_decision['source_ref']['field_id'], 'Positive control must populate from the selected entry-specific source.' );

$ambiguous = new PrintDossierPresentationModel( $profile, array( wu19_binding( 'wu19.a', 303 ), wu19_binding( 'wu19.b', 303 ) ), $package['semantic_slots'] );
gpp_assert_same( 'binding_context_ambiguous', $ambiguous->bindingContextStatus( array( 'id' => 3001, 'form_id' => 303 ) ), 'Ambiguous active print environment fails the whole dossier closed.' );
gpp_assert_same( 'binding_context_missing', $model->bindingContextStatus( array( 'id' => 9001, 'form_id' => 999 ) ), 'Missing print environment context fails the whole dossier closed.' );

echo "PRINT_DOSSIER_PRESENTATION_MODEL_PASS\n";
