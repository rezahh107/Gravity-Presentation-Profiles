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

function wu19_binding( $id, $form_id, $phone_state = 'UNBOUND', $phone_mapping = 'NOT_PROVEN' ) {
    $proven = array( 'fixture:wu19:semantic', 'fixture:wu19:print-mapping' );
    $negative = array( 'fixture:wu19:negative' );
    $bindings = array(
        array( 'semantic_slot_key' => 'student.full_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 1 ), 'evidence_refs' => $proven ),
        array( 'semantic_slot_key' => 'student.gender', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 2 ), 'evidence_refs' => $proven ),
        array( 'semantic_slot_key' => 'print.phone_2', 'state' => $phone_state, 'source_ref' => 'PROVEN' === $phone_state ? array( 'type' => 'gravity_forms.field', 'field_id' => 3 ) : null, 'evidence_refs' => 'PROVEN' === $phone_state ? $proven : $negative ),
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
        'binding_set_version' => '1.0.0',
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'wu19-installation' ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => $form_id ),
            'entry_source_ref' => null,
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
gpp_assert_true( $model->fieldDecision( $entry, 'student.full_name' )['populate'], 'Same-meaning canonical text may populate from its PROVEN semantic binding.' );
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

$ambiguous = new PrintDossierPresentationModel( $profile, array( wu19_binding( 'wu19.a', 303 ), wu19_binding( 'wu19.b', 303 ) ), $package['semantic_slots'] );
gpp_assert_same( 'binding_context_ambiguous', $ambiguous->bindingContextStatus( array( 'id' => 3001, 'form_id' => 303 ) ), 'Ambiguous active print environment fails the whole dossier closed.' );
gpp_assert_same( 'binding_context_missing', $model->bindingContextStatus( array( 'id' => 9001, 'form_id' => 999 ) ), 'Missing print environment context fails the whole dossier closed.' );

echo "PRINT_DOSSIER_PRESENTATION_MODEL_PASS\n";
