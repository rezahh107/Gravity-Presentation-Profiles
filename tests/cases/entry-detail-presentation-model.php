<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationModel;
use GravityPresentationProfiles\SRWF\GravityFlow\OperationsBindingManagementPolicy;

Autoloader::register();

$package = json_decode( file_get_contents( __DIR__ . '/../../profiles/srwf/operations/operations-package-v1.json' ), true );
$legacy_package = json_decode( file_get_contents( __DIR__ . '/../fixtures/wu09-visual-package.json' ), true );
$profile = ( new VisualProfileResolver( $package ) )->resolve( 'gravity_flow.entry_detail' );

function ed_required_slots( $package ) {
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

function ed_source_for_slot( $slot, &$field_id ) {
    if ( 'entry.created_at' === $slot ) return array( 'type' => 'gravity_forms.entry_meta', 'meta_key' => 'date_created' );
    if ( 'workflow.current_step' === $slot ) return array( 'type' => 'gravity_flow.state', 'state_key' => 'current_step' );
    if ( 'workflow.status' === $slot ) return array( 'type' => 'gravity_flow.state', 'state_key' => 'status' );
    return array( 'type' => 'gravity_forms.field', 'field_id' => $field_id++ );
}

function ed_binding( $id, $installation, $form_id, $package, $field_start ) {
    $bindings = array();
    $field_id = $field_start;

    foreach ( $package['semantic_slots'] as $slot ) {
        $key = $slot['semantic_slot_key'];
        $kind = OperationsBindingManagementPolicy::entryDetailReadinessKind( $key );

        if ( OperationsBindingManagementPolicy::ENTRY_DETAIL_DIRECT_SOURCE === $kind
            || OperationsBindingManagementPolicy::ENTRY_DETAIL_STABLE_HOST_SOURCE === $kind ) {
            $bindings[] = array(
                'semantic_slot_key' => $key,
                'state' => 'PROVEN',
                'source_ref' => ed_source_for_slot( $key, $field_id ),
                'evidence_refs' => array( 'fixture:entry-detail:source' ),
            );
            continue;
        }

        // Deliberately seed a bogus direct full-name field. The model must never
        // consume it; canonical first/last components remain authoritative.
        if ( 'student.full_name' === $key ) {
            $bindings[] = array(
                'semantic_slot_key' => $key,
                'state' => 'PROVEN',
                'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 9999 ),
                'evidence_refs' => array( 'fixture:entry-detail:must-not-consume' ),
            );
            continue;
        }

        $bindings[] = array(
            'semantic_slot_key' => $key,
            'state' => 'UNBOUND',
            'source_ref' => null,
            'evidence_refs' => array(),
        );
    }

    return array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.1.0',
        'binding_set_id' => $id,
        'binding_set_version' => '1.0.0',
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => $installation ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => $form_id ),
            'entry_source_ref' => null,
            'surfaces' => array( 'gravity_flow.entry_detail', 'print.dossier' ),
        ),
        'provenance' => array( 'producer' => 'Entry Detail model test', 'evidence_refs' => array( 'fixture:entry-detail' ) ),
        'bindings' => $bindings,
        // This stale permission claim is intentional falsification input. It
        // must have no effect on semantic readiness or live request eligibility.
        'runtime_claims' => array(
            array(
                'semantic_slot_key' => 'workflow.approve_action',
                'claim' => 'action_permission',
                'evidence_state' => 'PROVEN',
                'evidence_refs' => array( 'fixture:stale-action-permission' ),
            ),
            array(
                'semantic_slot_key' => 'workflow.reject_action',
                'claim' => 'action_permission',
                'evidence_state' => 'PROVEN',
                'evidence_refs' => array( 'fixture:stale-action-permission' ),
            ),
        ),
    );
}

function ed_set_binding_state( $binding, $slot, $state ) {
    foreach ( $binding['bindings'] as &$row ) {
        if ( $row['semantic_slot_key'] === $slot ) {
            $row['state'] = $state;
            $row['source_ref'] = 'PROVEN' === $state ? $row['source_ref'] : null;
            $row['evidence_refs'] = array();
        }
    }
    unset( $row );
    return $binding;
}

function ed_capabilities( $print_ready = true ) {
    return array(
        'entry.created_at' => true,
        'workflow.current_step' => true,
        'workflow.status' => true,
        'workflow.instructions' => true,
        'workflow.approve_action' => true,
        'workflow.reject_action' => true,
        'workflow.timeline' => true,
        'navigation.backlink' => true,
        'print.utility' => $print_ready,
    );
}

$alpha = ed_binding( 'entry-detail.alpha', 'fixture-installation', 101, $package, 20 );
$beta = ed_binding( 'entry-detail.beta', 'fixture-installation', 202, $package, 80 );
$model = new EntryDetailPresentationModel( $profile, array( $alpha, $beta ), $package['semantic_slots'] );
$alpha_entry = array( 'id' => 1001, 'form_id' => 101 );
$beta_entry = array( 'id' => 2001, 'form_id' => 202 );

gpp_assert_same( 'srwf.operations.entry-detail.v1', $model->profileId(), 'Current qualification uses the shipped Operations Entry Detail profile.' );
gpp_assert_same( ed_required_slots( $package ), $model->requiredSemanticSlotKeys(), 'Required Entry Detail semantics remain health/completeness authority from the current Operations Package.' );
gpp_assert_true( in_array( 'workflow.approve_action', $model->requiredSemanticSlotKeys(), true ), 'Approve remains required for completeness where the request is actionable.' );
gpp_assert_true( in_array( 'workflow.reject_action', $model->requiredSemanticSlotKeys(), true ), 'Reject remains required for completeness where the request is actionable.' );
gpp_assert_true( in_array( 'print.utility', $model->requiredSemanticSlotKeys(), true ), 'Print utility requiredness remains visible as package completeness metadata.' );

gpp_assert_true( $model->isPresentationReady( $alpha_entry, ed_capabilities() ), 'Current Operations package is structurally ready with one unambiguous binding context.' );
gpp_assert_true( $model->isPresentationReady( $beta_entry, ed_capabilities() ), 'A second environment can use different direct field IDs with the same current profile.' );

$derived = $model->derivedDecision( $alpha_entry, 'student.full_name' );
gpp_assert_true( $derived['ready'], 'Full name derives from independently PROVEN canonical components.' );
gpp_assert_same(
    array( 'student.first_name', 'student.last_name' ),
    array_keys( $derived['component_source_refs'] ),
    'Derived full name consumes only canonical first/last sources.'
);
$direct_name = $model->resolve( $alpha_entry, 'student.full_name' );
gpp_assert_true( ! $direct_name['resolved'], 'A direct full-name field can never become Entry Detail authority.' );
gpp_assert_same( 'derived_slot_requires_derivation', $direct_name['reason'], 'Derived full name rejects independent source resolution.' );

$missing_first = ed_set_binding_state( $alpha, 'student.first_name', 'UNBOUND' );
$missing_first_model = new EntryDetailPresentationModel( $profile, array( $missing_first ), $package['semantic_slots'] );
$missing_first_decision = $missing_first_model->presentationReadiness( $alpha_entry, ed_capabilities() );
gpp_assert_true( $missing_first_decision['ready'], 'An unmapped required data component must not kill structurally admitted Entry Detail.' );
$missing_first_derived = $missing_first_model->derivedDecision( $alpha_entry, 'student.full_name' );
gpp_assert_true( ! $missing_first_derived['ready'], 'Derived full name still reports its unresolved component independently.' );
gpp_assert_same( 'student.first_name', $missing_first_derived['semantic_slot_key'], 'Derived degradation identifies the unresolved first-name component.' );

$missing_last = ed_set_binding_state( $alpha, 'student.last_name', 'UNBOUND' );
$missing_last_model = new EntryDetailPresentationModel( $profile, array( $missing_last ), $package['semantic_slots'] );
$missing_last_decision = $missing_last_model->presentationReadiness( $alpha_entry, ed_capabilities() );
gpp_assert_true( $missing_last_decision['ready'], 'A second required data component can degrade without invalidating the page shell.' );
$missing_last_derived = $missing_last_model->derivedDecision( $alpha_entry, 'student.full_name' );
gpp_assert_true( ! $missing_last_derived['ready'], 'Bogus direct full-name authority cannot substitute for an unresolved last-name component.' );
gpp_assert_same( 'student.last_name', $missing_last_derived['semantic_slot_key'], 'Derived degradation identifies the unresolved last-name component.' );

$print_unready = $model->presentationReadiness( $alpha_entry, ed_capabilities( false ) );
gpp_assert_true( $print_unready['ready'], 'Unavailable Print capability is region-degraded and must not kill Entry Detail.' );
$print_source = $model->resolve( $alpha_entry, 'print.utility' );
gpp_assert_true( ! $print_source['resolved'] && null === $print_source['source_ref'], 'No direct host source is fabricated for print.utility.' );

$approve_source = $model->resolve( $alpha_entry, 'workflow.approve_action' );
gpp_assert_true( ! $approve_source['resolved'] && null === $approve_source['source_ref'], 'Approve request eligibility is not a persisted source binding.' );
gpp_assert_true( ! $model->runtimeClaimIsProven( $alpha_entry, 'workflow.approve_action', 'action_permission' ), 'Persisted action_permission=PROVEN cannot be consumed as Entry Detail eligibility.' );

$broken = ed_set_binding_state( $alpha, 'student.national_id', 'NOT_PROVEN' );
$broken_model = new EntryDetailPresentationModel( $profile, array( $broken ), $package['semantic_slots'] );
$broken_decision = $broken_model->presentationReadiness( $alpha_entry, ed_capabilities() );
gpp_assert_true( $broken_decision['ready'], 'NOT_PROVEN required direct data binding degrades its slot instead of killing the dossier shell.' );
$broken_slot = $broken_model->resolve( $alpha_entry, 'student.national_id' );
gpp_assert_true( ! $broken_slot['resolved'], 'The degraded direct semantic remains unresolved and must not fabricate a value.' );

$ambiguous_model = new EntryDetailPresentationModel(
    $profile,
    array( $alpha, ed_binding( 'entry-detail.alpha.other-install', 'other-installation', 101, $package, 140 ) ),
    $package['semantic_slots']
);
$ambiguous = $ambiguous_model->presentationReadiness( $alpha_entry, ed_capabilities() );
gpp_assert_true( ! $ambiguous['ready'], 'Ambiguous active EnvironmentBindingSet identity remains page-fatal.' );
gpp_assert_same( 'missing_or_ambiguous_active_environment', $ambiguous['reason'], 'Ambiguous environment failure is explicit.' );

$invalid = $model->presentationReadiness( array( 'id' => 0, 'form_id' => 101 ), ed_capabilities() );
gpp_assert_true( ! $invalid['ready'], 'Invalid entry context remains page-fatal.' );
gpp_assert_same( 'invalid_entry_context', $invalid['reason'], 'Invalid host payload failure remains explicit.' );

// Legacy-fixture falsification: this control is intentionally acceptable to the
// old WU09 contract but invalid under the current Operations Package.
$legacy_required = ed_required_slots( $legacy_package );
gpp_assert_true( ! in_array( 'workflow.approve_action', $legacy_required, true ), 'Legacy fixture keeps Approve optional and is unsuitable as current proof.' );
gpp_assert_true( ! in_array( 'workflow.reject_action', $legacy_required, true ), 'Legacy fixture keeps Reject optional and is unsuitable as current proof.' );
gpp_assert_true( in_array( 'workflow.approve_action', ed_required_slots( $package ), true ), 'Current Operations contract materially differs from legacy requiredness.' );

echo "ENTRY_DETAIL_PRESENTATION_MODEL_PASS\n";
