<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationModel;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxRuntimeEvidence;
use GravityPresentationProfiles\SRWF\GravityFlow\PersianDateFormatter;

Autoloader::register();

function pr4_inbox_profile() {
    return array(
        'surface' => 'gravity_flow.inbox',
        'profile_id' => 'srwf.operations.inbox.v1',
        'semantic_slots' => array(
            'student.photo',
            'student.full_name',
            'student.national_id',
            'education.grade_group',
            'school.name',
            'entry.created_at',
            'workflow.current_step',
            'workflow.due_at',
        ),
    );
}

function pr4_inbox_declarations() {
    $required = array(
        'student.photo',
        'student.full_name',
        'student.national_id',
        'education.grade_group',
        'school.name',
        'entry.created_at',
        'workflow.current_step',
    );
    $all = array_merge( $required, array( 'student.first_name', 'student.last_name', 'workflow.due_at' ) );
    $result = array();
    foreach ( $all as $slot ) {
        $usage = array();
        if ( in_array( $slot, $required, true ) || 'workflow.due_at' === $slot ) {
            $usage[] = array(
                'surface' => 'gravity_flow.inbox',
                'required' => in_array( $slot, $required, true ),
            );
        } else {
            $usage[] = array( 'surface' => 'print.dossier', 'required' => true );
        }
        $result[] = array(
            'semantic_slot_key' => $slot,
            'meaning' => $slot,
            'surface_usage' => $usage,
        );
    }
    return $result;
}

function pr4_binding_set( $version = '1.0.0', $installation = 'fixture-installation', $form_id = 101 ) {
    $bindings = array(
        array( 'semantic_slot_key' => 'student.photo', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 2 ), 'evidence_refs' => array( 'fixture:binding' ) ),
        array( 'semantic_slot_key' => 'student.first_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 1 ), 'evidence_refs' => array( 'fixture:binding' ) ),
        array( 'semantic_slot_key' => 'student.last_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 4 ), 'evidence_refs' => array( 'fixture:binding' ) ),
        array( 'semantic_slot_key' => 'student.full_name', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => array() ),
        array( 'semantic_slot_key' => 'student.national_id', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 3 ), 'evidence_refs' => array( 'fixture:binding' ) ),
        array( 'semantic_slot_key' => 'education.grade_group', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 5 ), 'evidence_refs' => array( 'fixture:binding' ) ),
        array( 'semantic_slot_key' => 'school.name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 6 ), 'evidence_refs' => array( 'fixture:binding' ) ),
        array( 'semantic_slot_key' => 'entry.created_at', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.entry_meta', 'meta_key' => 'date_created' ), 'evidence_refs' => array( 'fixture:host' ) ),
        array( 'semantic_slot_key' => 'workflow.current_step', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.state', 'state_key' => 'current_step' ), 'evidence_refs' => array( 'fixture:host' ) ),
        array( 'semantic_slot_key' => 'workflow.due_at', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => array() ),
    );
    $artifact = array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.1.0',
        'binding_set_id' => 'pr4.inbox.fixture',
        'binding_set_version' => $version,
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => $installation ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => $form_id ),
            'entry_source_ref' => null,
            'surfaces' => array( 'gravity_flow.inbox', 'gravity_flow.entry_detail', 'print.dossier' ),
        ),
        'provenance' => array( 'producer' => 'PR4 model test', 'evidence_refs' => array( 'fixture:binding' ) ),
        'bindings' => $bindings,
        'runtime_claims' => array(),
    );

    foreach ( $bindings as $binding ) {
        if ( 'PROVEN' !== $binding['state'] || 'student.full_name' === $binding['semantic_slot_key'] ) {
            continue;
        }
        if ( 'workflow.due_at' === $binding['semantic_slot_key'] ) {
            continue;
        }
        $artifact['runtime_claims'][] = array(
            'semantic_slot_key' => $binding['semantic_slot_key'],
            'claim' => 'availability',
            'evidence_state' => 'PROVEN',
            'evidence_refs' => array( InboxRuntimeEvidence::availabilityRef( $artifact, $binding['semantic_slot_key'], $binding['source_ref'] ) ),
        );
    }

    return $artifact;
}

$profile = pr4_inbox_profile();
$declarations = pr4_inbox_declarations();
$binding = pr4_binding_set();
$model = new InboxPresentationModel( $profile, array( $binding ), $declarations );
$entry = array( 'id' => 1001, 'form_id' => 101 );

$required = $model->requiredSemanticSlotKeys();
gpp_assert_true( in_array( 'student.full_name', $required, true ), 'Derived full name remains a required Inbox presentation semantic.' );
gpp_assert_true( ! in_array( 'workflow.due_at', $required, true ), 'Owner-resolved optional Due must not be part of mandatory Inbox readiness.' );
gpp_assert_true( in_array( 'student.first_name', $model->requiredSourceSemanticSlotKeys(), true ), 'Full-name readiness expands to authoritative first-name source.' );
gpp_assert_true( in_array( 'student.last_name', $model->requiredSourceSemanticSlotKeys(), true ), 'Full-name readiness expands to authoritative last-name source.' );

gpp_assert_true( $model->isPresentationReady( $entry ), 'All required source-bound semantics make the row presentation-ready even with Due unresolved.' );
$derived = $model->derivedDecision( $entry, 'student.full_name' );
gpp_assert_true( $derived['ready'], 'Full-name derivation resolves only through both canonical component slots.' );
gpp_assert_same( 1, $derived['component_source_refs']['student.first_name']['field_id'], 'First-name source comes from the active binding set.' );
gpp_assert_same( 4, $derived['component_source_refs']['student.last_name']['field_id'], 'Last-name source comes from the active binding set.' );
$direct_full_name = $model->resolve( $entry, 'student.full_name' );
gpp_assert_true( ! $direct_full_name['resolved'], 'Derived full name cannot resolve as an independent host field.' );
gpp_assert_same( 'derived_slot_requires_derivation', $direct_full_name['reason'], 'Direct full-name resolution fails at the derivation boundary.' );

$due = $model->resolve( $entry, 'workflow.due_at' );
gpp_assert_true( ! $due['resolved'], 'Unbound optional Due remains absent.' );
gpp_assert_true( $model->isPresentationReady( $entry ), 'Absent optional Due does not block Card Mode.' );

$missing_component = $binding;
foreach ( $missing_component['runtime_claims'] as &$claim ) {
    if ( 'student.last_name' === $claim['semantic_slot_key'] && 'availability' === $claim['claim'] ) {
        $claim['evidence_state'] = 'NOT_PROVEN';
        $claim['evidence_refs'] = array();
    }
}
unset( $claim );
$missing_model = new InboxPresentationModel( $profile, array( $missing_component ), $declarations );
$missing_decision = $missing_model->presentationReadiness( $entry );
gpp_assert_true( ! $missing_decision['ready'], 'Missing required full-name component proof makes the row unready.' );
gpp_assert_same( 'derivation_component_unresolved', $missing_decision['reason'], 'Derivation dependency failure is explicit.' );

// Copying old PROVEN availability into a later immutable binding version is
// stale by definition: exact version/source evidence must be re-qualified.
$stale = $binding;
$stale['binding_set_version'] = '1.0.1';
$stale_model = new InboxPresentationModel( $profile, array( $stale ), $declarations );
$stale_decision = $stale_model->presentationReadiness( $entry );
gpp_assert_true( ! $stale_decision['ready'], 'Availability proof from a previous binding version must not survive version drift.' );
gpp_assert_same( 'availability_not_proven', $stale_decision['reason'], 'Stale version-bound evidence fails explicitly.' );

$unsupported_due = $binding;
foreach ( $unsupported_due['bindings'] as &$item ) {
    if ( 'workflow.due_at' === $item['semantic_slot_key'] ) {
        $item['state'] = 'PROVEN';
        $item['source_ref'] = array( 'type' => 'gravity_flow.state', 'state_key' => 'due_at' );
        $item['evidence_refs'] = array( 'fixture:due-candidate' );
    }
}
unset( $item );
$unsupported_due['runtime_claims'][] = array(
    'semantic_slot_key' => 'workflow.due_at',
    'claim' => 'availability',
    'evidence_state' => 'PROVEN',
    'evidence_refs' => array( InboxRuntimeEvidence::availabilityRef( $unsupported_due, 'workflow.due_at', array( 'type' => 'gravity_flow.state', 'state_key' => 'due_at' ) ) ),
);
$unsupported_due_model = new InboxPresentationModel( $profile, array( $unsupported_due ), $declarations );
$due_result = $unsupported_due_model->resolve( $entry, 'workflow.due_at' );
gpp_assert_true( ! $due_result['resolved'], 'An unadmitted Due adapter stays fail-closed even when someone marks it PROVEN.' );
gpp_assert_same( 'source_adapter_not_admitted', $due_result['reason'], 'Unsupported Due source is explicit.' );
gpp_assert_true( $unsupported_due_model->isPresentationReady( $entry ), 'Unsupported optional Due still cannot disable an otherwise-ready row.' );

$ambiguous = pr4_binding_set( '1.0.0', 'other-installation', 101 );
$ambiguous_model = new InboxPresentationModel( $profile, array( $binding, $ambiguous ), $declarations );
$ambiguous_decision = $ambiguous_model->presentationReadiness( $entry );
gpp_assert_true( ! $ambiguous_decision['ready'], 'Ambiguous active environment fails closed.' );

gpp_assert_same( '2025-03-21 00:00:00', PersianDateFormatter::formatDateTime( '2025-03-21 00:00:00' ), 'Without the optional provider, system-date presentation remains native.' );
gpp_assert_same( '۰۰۱۲۳۴۵۶۷۸۹', PersianDateFormatter::persianDigits( '00123456789' ), 'Persian digit conversion remains presentation-only.' );

echo "INBOX_PRESENTATION_MODEL_PASS\n";
