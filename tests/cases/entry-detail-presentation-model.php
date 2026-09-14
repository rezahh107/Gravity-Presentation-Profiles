<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationModel;

Autoloader::register();

$package = json_decode( file_get_contents( __DIR__ . '/../fixtures/wu09-visual-package.json' ), true );
$profile = ( new VisualProfileResolver( $package ) )->resolve( 'gravity_flow.entry_detail' );

function wu18_required_slots( $package ) {
    $required = array();
    foreach ( $package['semantic_slots'] as $slot ) {
        foreach ( $slot['surface_usage'] as $usage ) {
            if ( 'gravity_flow.entry_detail' === $usage['surface'] && true === $usage['required'] ) {
                $required[] = $slot['semantic_slot_key'];
            }
        }
    }
    return $required;
}

function wu18_source_for_slot( $slot, &$field_id ) {
    if ( 'workflow.current_step' === $slot ) return array( 'type' => 'gravity_flow.state', 'state_key' => 'current_step' );
    if ( 'workflow.status' === $slot ) return array( 'type' => 'gravity_flow.state', 'state_key' => 'status' );
    if ( 'workflow.instructions' === $slot ) return array( 'type' => 'gravity_flow.region', 'region_key' => 'instructions' );
    if ( 'navigation.backlink' === $slot ) return array( 'type' => 'gravity_flow.region', 'region_key' => 'backlink' );
    return array( 'type' => 'gravity_forms.field', 'field_id' => $field_id++ );
}

function wu18_binding( $id, $installation, $form_id, $package, $field_start ) {
    $proven = array( 'fixture:wu18:semantic', 'fixture:wu18:pinned-runtime' );
    $bindings = array();
    $claims = array();
    $field_id = $field_start;

    foreach ( wu18_required_slots( $package ) as $slot ) {
        $bindings[] = array(
            'semantic_slot_key' => $slot,
            'state' => 'PROVEN',
            'source_ref' => wu18_source_for_slot( $slot, $field_id ),
            'evidence_refs' => $proven,
        );
        $claims[] = array(
            'semantic_slot_key' => $slot,
            'claim' => 'availability',
            'evidence_state' => 'navigation.backlink' === $slot ? 'NOT_PROVEN' : 'PROVEN',
            'evidence_refs' => $proven,
        );
    }
    $claims[] = array(
        'semantic_slot_key' => 'student.mobile',
        'claim' => 'editability',
        'evidence_state' => 'PROVEN',
        'evidence_refs' => $proven,
    );

    return array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.0.0',
        'binding_set_id' => $id,
        'binding_set_version' => '1.0.0',
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => $installation ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => $form_id ),
            'entry_source_ref' => null,
            'surfaces' => array( 'gravity_flow.entry_detail' ),
        ),
        'provenance' => array( 'producer' => 'WU18 model test', 'evidence_refs' => $proven ),
        'bindings' => $bindings,
        'runtime_claims' => $claims,
    );
}

function wu18_set_binding_state( $binding, $slot, $state ) {
    foreach ( $binding['bindings'] as &$row ) {
        if ( $row['semantic_slot_key'] === $slot ) {
            $row['state'] = $state;
            $row['source_ref'] = 'PROVEN' === $state ? $row['source_ref'] : null;
            $row['evidence_refs'] = array( 'fixture:wu18:negative' );
        }
    }
    unset( $row );
    return $binding;
}

$alpha = wu18_binding( 'wu18.alpha', 'fixture-installation', 101, $package, 20 );
$beta = wu18_binding( 'wu18.beta', 'fixture-installation', 202, $package, 40 );
$model = new EntryDetailPresentationModel( $profile, array( $alpha, $beta ), $package['semantic_slots'] );
$alpha_entry = array( 'id' => 1001, 'form_id' => 101 );
$beta_entry = array( 'id' => 2001, 'form_id' => 202 );

gpp_assert_same( 'shared.entry_detail.v1', $model->profileId(), 'One shared Entry Detail profile remains fixed across forms.' );
gpp_assert_same( wu18_required_slots( $package ), $model->requiredSemanticSlotKeys(), 'Required Entry Detail semantics come from the package contract.' );
gpp_assert_true( $model->isPresentationReady( $alpha_entry ), 'Alpha mapping is presentation-ready.' );
gpp_assert_true( $model->isPresentationReady( $beta_entry ), 'Beta mapping is presentation-ready with different environment field IDs.' );
$alpha_name = $model->resolve( $alpha_entry, 'student.full_name' );
$beta_name = $model->resolve( $beta_entry, 'student.full_name' );
gpp_assert_true( $alpha_name['source_ref']['field_id'] !== $beta_name['source_ref']['field_id'], 'Shared profile does not hardcode one form field identity.' );
gpp_assert_true( $model->runtimeClaimIsProven( $alpha_entry, 'student.mobile', 'editability' ), 'Independent editability evidence can be represented without changing profile identity.' );
gpp_assert_true( ! $model->isAvailable( $alpha_entry, 'navigation.backlink' ), 'A PROVEN semantic region mapping does not imply current runtime availability.' );

$broken = wu18_set_binding_state( $alpha, 'student.national_id', 'NOT_PROVEN' );
$broken_model = new EntryDetailPresentationModel( $profile, array( $broken ), $package['semantic_slots'] );
gpp_assert_true( ! $broken_model->isPresentationReady( $alpha_entry ), 'NOT_PROVEN required binding fails the enhanced dossier closed.' );
$broken_result = $broken_model->resolve( $alpha_entry, 'student.national_id' );
gpp_assert_same( 'NOT_PROVEN', $broken_result['state'], 'Required binding failure remains explicit, not substituted.' );

$ambiguous_model = new EntryDetailPresentationModel(
    $profile,
    array( $alpha, wu18_binding( 'wu18.alpha.other-install', 'other-installation', 101, $package, 60 ) ),
    $package['semantic_slots']
);
$ambiguous = $ambiguous_model->resolve( $alpha_entry, 'student.full_name' );
gpp_assert_true( ! $ambiguous['resolved'], 'Ambiguous active installation fails closed.' );
gpp_assert_same( 'missing_or_ambiguous_active_environment', $ambiguous['reason'], 'Ambiguous environment failure is explicit.' );

echo "ENTRY_DETAIL_PRESENTATION_MODEL_PASS\n";
