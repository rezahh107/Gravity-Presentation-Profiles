<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationModel;

Autoloader::register();

$package = json_decode( file_get_contents( __DIR__ . '/../fixtures/wu09-visual-package.json' ), true );
$profile = ( new VisualProfileResolver( $package ) )->resolve( 'gravity_flow.entry_detail' );

function wu18_required_from_package( $package ) {
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

function wu18_binding( $id, $installation, $form_id, $base_field ) {
    $proven = array( 'fixture:wu18:semantic', 'fixture:wu18:runtime' );
    $negative = array( 'fixture:wu18:negative' );
    $field_slots = array(
        'student.photo',
        'student.first_name',
        'student.last_name',
        'student.full_name',
        'student.father_name',
        'student.national_id',
        'student.birth_date_jalali',
        'student.gender',
        'student.mobile',
        'student.home_phone',
        'student.father_mobile',
        'student.mother_mobile',
        'education.level',
        'education.grade_group',
        'education.graduation_status',
        'school.name',
        'registration.center',
        'documents.report_card',
        'review.status',
        'review.reason',
        'finance.status',
        'finance.tuition_amount',
        'finance.discount_amount',
        'finance.discount_title',
        'finance.net_payable_amount',
    );

    $bindings = array();
    $field_id = $base_field;
    foreach ( $field_slots as $slot_key ) {
        $bindings[] = array(
            'semantic_slot_key' => $slot_key,
            'state' => 'PROVEN',
            'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => $field_id++ ),
            'evidence_refs' => $proven,
        );
    }

    $bindings[] = array( 'semantic_slot_key' => 'entry.created_at', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.entry_meta', 'meta_key' => 'date_created' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.current_step', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.state', 'state_key' => 'current_step' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.instructions', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.region', 'region_key' => 'instructions' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.approve_action', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.action', 'action_key' => 'approve' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.reject_action', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.action', 'action_key' => 'reject' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.timeline', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.region', 'region_key' => 'timeline' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.status', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.state', 'state_key' => 'status' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'navigation.backlink', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.region', 'region_key' => 'backlink' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'print.utility', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => $negative );

    $claims = array();
    foreach ( $bindings as $binding ) {
        $claims[] = array(
            'semantic_slot_key' => $binding['semantic_slot_key'],
            'claim' => 'availability',
            'evidence_state' => 'PROVEN' === $binding['state'] ? 'PROVEN' : 'NOT_PROVEN',
            'evidence_refs' => 'PROVEN' === $binding['state'] ? $proven : $negative,
        );
    }
    foreach ( array( 'workflow.approve_action', 'workflow.reject_action' ) as $slot_key ) {
        $claims[] = array(
            'semantic_slot_key' => $slot_key,
            'claim' => 'action_permission',
            'evidence_state' => 'PROVEN',
            'evidence_refs' => $proven,
        );
    }
    $claims[] = array(
        'semantic_slot_key' => 'student.mobile',
        'claim' => 'editability',
        'evidence_state' => 'NOT_PROVEN',
        'evidence_refs' => $negative,
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

function wu18_change_binding( $binding_set, $slot_key, $state, $source_ref ) {
    foreach ( $binding_set['bindings'] as &$binding ) {
        if ( $slot_key === $binding['semantic_slot_key'] ) {
            $binding['state'] = $state;
            $binding['source_ref'] = $source_ref;
            $binding['evidence_refs'] = 'PROVEN' === $state ? array( 'fixture:wu18:semantic' ) : array( 'fixture:wu18:negative' );
        }
    }
    unset( $binding );
    foreach ( $binding_set['runtime_claims'] as &$claim ) {
        if ( $slot_key === $claim['semantic_slot_key'] && 'availability' === $claim['claim'] ) {
            $claim['evidence_state'] = 'PROVEN' === $state ? 'PROVEN' : 'NOT_PROVEN';
            $claim['evidence_refs'] = 'PROVEN' === $state ? array( 'fixture:wu18:runtime' ) : array( 'fixture:wu18:negative' );
        }
    }
    unset( $claim );
    return $binding_set;
}

$alpha = wu18_binding( 'wu18.alpha', 'fixture-installation', 101, 1 );
$beta = wu18_binding( 'wu18.beta', 'fixture-installation', 202, 101 );
$model = new EntryDetailPresentationModel( $profile, array( $alpha, $beta ), $package['semantic_slots'] );

$alpha_entry = array( 'id' => 1001, 'form_id' => 101 );
$beta_entry = array( 'id' => 2001, 'form_id' => 202 );

gpp_assert_same( 'shared.entry_detail.v1', $model->profileId(), 'One shared Entry Detail profile remains fixed across forms.' );
gpp_assert_same( wu18_required_from_package( $package ), $model->requiredSemanticSlotKeys(), 'Entry Detail required slots come from the active package contract.' );
gpp_assert_true( $model->isPresentationReady( $alpha_entry ), 'Fully bound Alpha Entry Detail is presentation-ready.' );
gpp_assert_true( $model->isPresentationReady( $beta_entry ), 'A second form can reuse the same shared profile with its own bindings.' );

gpp_assert_same( 4, $model->resolve( $alpha_entry, 'student.full_name' )['source_ref']['field_id'], 'Alpha full name is resolved from its local field binding.' );
gpp_assert_same( 104, $model->resolve( $beta_entry, 'student.full_name' )['source_ref']['field_id'], 'Beta full name is resolved from a different local field binding.' );

gpp_assert_true( $model->resolve( $alpha_entry, 'student.mobile' )['resolved'], 'A PROVEN semantic source can resolve normally.' );
gpp_assert_true( ! $model->runtimeClaimIsProven( $alpha_entry, 'student.mobile', 'editability' ), 'A PROVEN semantic source alone never proves editability.' );
gpp_assert_true( $model->runtimeClaimIsProven( $alpha_entry, 'workflow.approve_action', 'action_permission' ), 'Approval permission remains an independent runtime claim.' );

$missing_required = wu18_change_binding( $alpha, 'student.national_id', 'NOT_PROVEN', null );
$missing_model = new EntryDetailPresentationModel( $profile, array( $missing_required ), $package['semantic_slots'] );
gpp_assert_true( ! $missing_model->isPresentationReady( $alpha_entry ), 'NOT_PROVEN required dossier data fails closed.' );

$wrong_action = wu18_change_binding(
    $alpha,
    'workflow.approve_action',
    'PROVEN',
    array( 'type' => 'gravity_flow.action', 'action_key' => 'reject' )
);
$wrong_action_model = new EntryDetailPresentationModel( $profile, array( $wrong_action ), $package['semantic_slots'] );
$wrong_action_result = $wrong_action_model->resolve( $alpha_entry, 'workflow.approve_action' );
gpp_assert_true( ! $wrong_action_result['resolved'], 'A semantically wrong but structurally valid action source fails closed.' );
gpp_assert_same( 'source_adapter_not_admitted', $wrong_action_result['reason'], 'Wrong action source is rejected at the slot adapter boundary.' );

$ambiguous = new EntryDetailPresentationModel(
    $profile,
    array( $alpha, wu18_binding( 'wu18.alpha.other', 'other-installation', 101, 201 ) ),
    $package['semantic_slots']
);
$ambiguous_result = $ambiguous->resolve( $alpha_entry, 'student.full_name' );
gpp_assert_true( ! $ambiguous_result['resolved'], 'Ambiguous active installation identity fails closed.' );
gpp_assert_same( 'missing_or_ambiguous_active_environment', $ambiguous_result['reason'], 'Ambiguous environment failure is explicit.' );

echo "ENTRY_DETAIL_PRESENTATION_MODEL_PASS\n";
